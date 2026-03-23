import os
from typing import Dict, Any, Optional, Tuple, List

import cv2
import numpy as np
import timm
import torch
from PIL import Image
from torchvision import transforms


class ROIClassificationService:
    """Service for classifying impacted canine using ROI classifier.

    Loads an EfficientNet-B0 model (in_chans=1) with a single sigmoid output.
    The model weights are expected at models/segmentation/ROI/roi_canine_b0.pth by default.
    """

    def __init__(self, app=None):
        self.app = app
        self.model: Optional[torch.nn.Module] = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.preproc = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485], [0.229]),
        ])

        if app is not None:
            self.init_app(app)

    def init_app(self, app):
        self.app = app
        try:
            roi_model_path = app.config.get(
                "ROI_MODEL_PATH",
                os.path.join("models", "segmentation", "ROI", "roi_canine_b0.pth"),
            )
            self._load_model(roi_model_path)
            app.logger.info(f"ROI model loaded from: {roi_model_path}")
        except Exception as e:
            if self.app:
                self.app.logger.error(f"Failed to load ROI model: {e}")

    def _load_model(self, weights_path: str):
        model = timm.create_model("efficientnet_b0", pretrained=False, in_chans=1)
        # EfficientNet-B0 has .classifier for final layer
        in_features = model.classifier.in_features
        # Match training head (Dropout + Linear)
        model.classifier = torch.nn.Sequential(
            torch.nn.Dropout(0.2),
            torch.nn.Linear(in_features, 1),
        )
        sd = torch.load(weights_path, map_location="cpu")
        # Be tolerant to small head structural differences
        try:
            model.load_state_dict(sd, strict=True)
        except Exception:
            model.load_state_dict(sd, strict=False)
        model.eval()
        model.to(self.device)
        self.model = model

    @staticmethod
    def _clamp(v: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, v))

    @staticmethod
    def _bbox_from_xyxy(xyxy: List[float], W: int, H: int) -> Tuple[int, int, int, int]:
        x1, y1, x2, y2 = xyxy
        x1 = int(max(0, min(W - 1, x1)))
        x2 = int(max(0, min(W - 1, x2)))
        y1 = int(max(0, min(H - 1, y1)))
        y2 = int(max(0, min(H - 1, y2)))
        return x1, y1, x2, y2

    @staticmethod
    def _expand_bbox(bb: Tuple[int, int, int, int], W: int, H: int, m: float = 0.10) -> Tuple[int, int, int, int]:
        x1, y1, x2, y2 = bb
        w = x2 - x1
        h = y2 - y1
        if w <= 0 or h <= 0:
            return bb
        dx = int(round(w * m))
        dy = int(round(h * m))
        x1 = max(0, x1 - dx)
        y1 = max(0, y1 - dy)
        x2 = min(W - 1, x2 + dx)
        y2 = min(H - 1, y2 + dy)
        return x1, y1, x2, y2

    @staticmethod
    def _crop_gray_with_margin(gray: np.ndarray, bb: Tuple[int, int, int, int], margin: float = 0.10) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
        H, W = gray.shape[:2]
        x1, y1, x2, y2 = bb
        w = x2 - x1
        h = y2 - y1
        if w <= 0 or h <= 0:
            return gray.copy(), (0, 0, W - 1, H - 1)
        dx = int(round(w * margin))
        dy = int(round(h * margin))
        x1 = max(0, x1 - dx)
        y1 = max(0, y1 - dy)
        x2 = min(W - 1, x2 + dx)
        y2 = min(H - 1, y2 + dy)
        return gray[y1:y2, x1:x2], (x1, y1, x2, y2)

    def _roi_prob_from_gray(self, gray_roi: np.ndarray) -> float:
        if self.model is None:
            raise RuntimeError("ROI model not initialized")
        if gray_roi.ndim == 2:
            pil_img = Image.fromarray(gray_roi)
        else:
            pil_img = Image.fromarray(cv2.cvtColor(gray_roi, cv2.COLOR_BGR2GRAY))
        x = self.preproc(pil_img).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits = self.model(x)
            prob = torch.sigmoid(logits).item()
        return float(prob)

    def _rois_from_seg(self, seg_data: Dict[str, Any], W: int, H: int) -> Dict[str, Tuple[int, int, int, int]]:
        """Derive ROI bboxes per side from segmentation output.
        Prefer class_name == 'Impacted canine'. Fallback: use Lateral incisor if impacted canine not found.
        Returns dict with keys 'left' and/or 'right'.
        """
        rois: Dict[str, Tuple[int, int, int, int]] = {}
        if not seg_data or "segmentations" not in seg_data:
            return rois

        # First pass: impacted canine
        for seg in seg_data["segmentations"]:
            name = seg.get("class_name", "")
            if name != "Impacted canine":
                continue
            bb = self._bbox_from_xyxy(seg.get("bbox", [0, 0, W - 1, H - 1]), W, H)
            side = seg.get("side")
            if not side:
                cx = (bb[0] + bb[2]) / 2
                side = "left" if cx < W / 2 else "right"
            rois[side] = self._expand_bbox(bb, W, H, m=0.12)

        # Fallback: use lateral incisor as proxy region if missing
        if not rois:
            for seg in seg_data["segmentations"]:
                name = seg.get("class_name", "")
                if name != "Lateral incisor":
                    continue
                bb = self._bbox_from_xyxy(seg.get("bbox", [0, 0, W - 1, H - 1]), W, H)
                side = seg.get("side")
                if not side:
                    cx = (bb[0] + bb[2]) / 2
                    side = "left" if cx < W / 2 else "right"
                rois[side] = self._expand_bbox(bb, W, H, m=0.25)

        return rois

    def _rois_from_keypoints(self, gray: np.ndarray, k: Dict[str, Dict[str, float]]) -> Dict[str, Tuple[int, int, int, int]]:
        H, W = gray.shape[:2]
        rois: Dict[str, Tuple[int, int, int, int]] = {}

        def bb_from_pair(tip_label: str, root_label: str) -> Optional[Tuple[int, int, int, int]]:
            if tip_label in k and root_label in k:
                tx, ty = k[tip_label]["x"], k[tip_label]["y"]
                rx, ry = k[root_label]["x"], k[root_label]["y"]
                x1 = int(max(0, min(tx, rx) - 32))
                y1 = int(max(0, min(ty, ry) - 32))
                x2 = int(min(W - 1, max(tx, rx) + 32))
                y2 = int(min(H - 1, max(ty, ry) + 32))
                return x1, y1, x2, y2
            return None

        bb_r = bb_from_pair("c13", "r13")
        bb_l = bb_from_pair("c23", "r23")
        if bb_r is not None:
            rois["right"] = self._expand_bbox(bb_r, W, H, m=0.25)
        if bb_l is not None:
            rois["left"] = self._expand_bbox(bb_l, W, H, m=0.25)
        return rois

    def predict_from_image(
        self,
        image_path: str,
        segmentation_data: Optional[Dict[str, Any]] = None,
        keypoints_dict: Optional[Dict[str, Dict[str, float]]] = None,
        threshold: float = 0.7,
    ) -> Dict[str, Any]:
        """Run ROI classification. Returns dictionary with per-side probability and impacted flag.

        Order of ROI derivation: segmentation -> keypoints -> heuristic split of image.
        """
        if self.model is None:
            raise RuntimeError("ROI model not initialized")

        img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise FileNotFoundError(f"Cannot read image: {image_path}")
        H, W = img.shape[:2]

        used_source = ""
        rois: Dict[str, Tuple[int, int, int, int]] = {}

        # Try segmentation-derived ROIs
        if segmentation_data:
            rois = self._rois_from_seg(segmentation_data, W, H)
            if rois:
                used_source = "segmentation"

        # Fallback to keypoints-derived ROIs
        if not rois and keypoints_dict:
            rois = self._rois_from_keypoints(img, keypoints_dict)
            if rois:
                used_source = "keypoints"

        # Heuristic fallback: split image into left/right central crops
        if not rois:
            used_source = "heuristic"
            w_box = int(W * 0.22)
            h_box = int(H * 0.35)
            cx_left, cx_right = int(W * 0.30), int(W * 0.70)
            cy = int(H * 0.40)
            for side, cx in ("left", cx_left), ("right", cx_right):
                x1 = max(0, cx - w_box // 2)
                x2 = min(W - 1, cx + w_box // 2)
                y1 = max(0, cy - h_box // 2)
                y2 = min(H - 1, cy + h_box // 2)
                rois[side] = (x1, y1, x2, y2)

        results: Dict[str, Any] = {
            "model": "efficientnet_b0",
            "threshold": float(threshold),
            "used_source": used_source,
            "sides": {},
        }

        impacted_sides: List[str] = []
        for side, bb in rois.items():
            gray_crop, crop_bb = self._crop_gray_with_margin(img, bb, margin=0.10)
            prob = self._roi_prob_from_gray(gray_crop)
            impacted = bool(prob >= threshold)
            results["sides"][side] = {
                "prob": float(prob),
                "impacted": impacted,
                "bbox": [int(crop_bb[0]), int(crop_bb[1]), int(crop_bb[2]), int(crop_bb[3])],
            }
            if impacted:
                impacted_sides.append(side)

        results["impacted_sides"] = impacted_sides
        results["overall_impacted"] = bool(len(impacted_sides) > 0)
        results["prediction_result"] = "impacted" if results["overall_impacted"] else "normal"
        return results
