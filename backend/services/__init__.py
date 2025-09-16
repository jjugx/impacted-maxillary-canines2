import os
import json
from typing import Any
from .keypoint_detection import KeypointDetectionService
from .segmentation import SegmentationService
from .roi_classifier import ROIClassificationService
from .dental_analysis_service import DentalAnalysisService

# Initialize services
keypoint_service = KeypointDetectionService()
segmentation_service = SegmentationService()
roi_service = ROIClassificationService()
dental_analysis_service = DentalAnalysisService()

def init_app(app: Any):
    # Set configuration for model paths
    app.config['YOLO_MODEL_PATH'] = app.config.get('YOLO_MODEL_PATH', 'models/keypoint/best.pt')
    app.config['SEGMENTATION_MODEL_PATH'] = app.config.get('SEGMENTATION_MODEL_PATH', 'models/segmentation/best.pt')
    app.config['ROI_MODEL_PATH'] = app.config.get('ROI_MODEL_PATH', 'models/segmentation/ROI/roi_canine_b0.pth')
    # ROI threshold can be overridden via env or .env
    # default to best F1 threshold (0.15) if not provided
    # Threshold priority: ROI_META_PATH.best_f1_threshold -> ROI_THRESHOLD env/config -> 0.15
    roi_thr = None
    meta_path = app.config.get('ROI_META_PATH', os.environ.get('ROI_META_PATH'))
    if meta_path and os.path.exists(meta_path):
        try:
            with open(meta_path, 'r') as f:
                meta = json.load(f)
            roi_thr = meta.get('best_f1_threshold') or meta.get('best_youden_threshold')
        except Exception:
            roi_thr = None
    if roi_thr is None:
        try:
            roi_thr = float(app.config.get('ROI_THRESHOLD', os.environ.get('ROI_THRESHOLD', 0.14)))
        except Exception:
            roi_thr = 0.14
    app.config['ROI_THRESHOLD'] = float(roi_thr)

    # Initialize keypoint detection service
    keypoint_service.init_app(app)

    # Initialize segmentation service
    segmentation_service.init_app(app)

    # Initialize ROI classifier service
    roi_service.init_app(app)

    # Initialize dental analysis service
    dental_analysis_service.init_app(app)

    # Log successful initialization
    app.logger.info("Services initialized successfully")
