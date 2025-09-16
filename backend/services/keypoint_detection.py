import os
import uuid
import cv2
import numpy as np
import json
import traceback
import time
import math
from ultralytics import YOLO
from pathlib import Path
from PIL import Image
import torch
from config import db
from models import KeypointDetection, Keypoint

class KeypointDetectionService:
    def __init__(self, app=None):
        self.app = app
        self.model = None
        self.upload_folder = os.path.join(os.getcwd(), 'uploads')
        self.results_folder = os.path.join(os.getcwd(), 'results')

        # Ensure directories exist
        os.makedirs(self.upload_folder, exist_ok=True)
        os.makedirs(self.results_folder, exist_ok=True)

        if app:
            self.init_app(app)

    def init_app(self, app):
        self.app = app
        # Load YOLO model - use a path to your trained model
        try:
            model_path = app.config.get('YOLO_MODEL_PATH', 'models/keypoint/best.pt')
            self.model = YOLO(model_path, task='pose')
            app.logger.info(f"YOLO keypoint model loaded from: {model_path}")
        except Exception as e:
            app.logger.error(f"Error loading YOLO keypoint model: {str(e)}")
            # Fallback to a default model if available
            try:
                self.model = YOLO('yolov11n-pose.pt')  # Use a standard model as fallback
                app.logger.info("Loaded fallback YOLO model")
            except:
                app.logger.error("Could not load any YOLO model")

    def save_image(self, image_file):
        """Save uploaded image to disk and return the path"""
        filename = f"{uuid.uuid4().hex}.jpg"
        file_path = os.path.join(self.upload_folder, filename)
        image_file.save(file_path)
        return file_path

    def detect_keypoints(self, image_path, user_id, segmentation_data=None, roi_results=None):
        """Process image with YOLO and detect keypoints"""
        try:
            # Check if model is loaded
            if self.model is None:
                self.app.logger.error("YOLO model not loaded")
                raise ValueError("Model not initialized")

            # Load image
            image = Image.open(image_path)

            # Run inference
            results = self.model(image, verbose=False)

            # Generate unique filename for results
            result_filename = f"{uuid.uuid4().hex}_result.jpg"
            result_path = os.path.join(self.results_folder, result_filename)

            # Plot results
            result_image = results[0].plot()
            cv2.imwrite(result_path, result_image)

            # Get keypoints and confidence
            keypoints_data = []
            confidence_score = 0.5  # Default confidence
            overall_confidence = 0.0
            keypoints_count = 0

            # Load category names from the notes.json
            category_names = self._get_category_names()

            # Process keypoints if detected
            if hasattr(results[0], 'keypoints') and results[0].keypoints is not None:
                # Debug info
                self.app.logger.info(f"Keypoints object type: {type(results[0].keypoints)}")

                # Get tensor shape info for debugging
                kpts_tensor = results[0].keypoints.data
                self.app.logger.info(f"Keypoints tensor shape: {kpts_tensor.shape}")

                if len(results[0].keypoints.data) > 0:
                    # Get keypoints from first detection
                    kpts = results[0].keypoints.data[0]

                    # Debug info
                    self.app.logger.info(f"Single keypoint set shape: {kpts.shape}")

                    # Convert keypoints to dict for easier access
                    keypoints_dict = {}

                    # Check keypoint structure
                    if len(kpts.shape) == 2:
                        # Format is [num_keypoints, 2] (x, y) without confidence
                        self.app.logger.info("Keypoint format: [num_keypoints, 2] (x, y coordinates only)")

                        # Use a default confidence of 0.8 for detected points
                        model_confidence = float(results[0].boxes.conf[0]) if hasattr(results[0], 'boxes') and len(results[0].boxes) > 0 else 0.7
                        
                        default_confidence = min(0.7, max(0.5, model_confidence))
                        
                        overall_confidence = default_confidence
                        keypoints_count = len(kpts)

                        # Store keypoint data with default confidence
                        for i, kp in enumerate(kpts):
                            if i < len(category_names):
                                label = category_names[i]
                            else:
                                label = f"point_{i}"

                            keypoints_data.append({
                                "label": label,
                                "x": float(kp[0]),
                                "y": float(kp[1]),
                                "confidence": default_confidence
                            })

                            # Add to keypoints dict
                            keypoints_dict[label] = {
                                "x": float(kp[0]),
                                "y": float(kp[1]),
                                "confidence": default_confidence
                            }

                    elif len(kpts.shape) >= 2 and kpts.shape[1] >= 3:
                        # Format is [num_keypoints, 3] (x, y, conf)
                        self.app.logger.info("Keypoint format: [num_keypoints, 3] (x, y, confidence)")

                        # Calculate overall confidence
                        confidence_sum = 0.0

                        # Store keypoint data with proper labels
                        for i, kp in enumerate(kpts):
                            conf = float(kp[2]) if len(kp) > 2 else 0.0
                            if conf > 0.2:  # Include points with reasonable confidence
                                label = category_names.get(i, f"point_{i}")
                                keypoints_data.append({
                                    "label": label,
                                    "x": float(kp[0]),
                                    "y": float(kp[1]),
                                    "confidence": float(kp[2])
                                })

                                # Add to keypoints dict
                                keypoints_dict[label] = {
                                    "x": float(kp[0]),
                                    "y": float(kp[1]),
                                    "confidence": conf
                                }

                                confidence_sum += conf
                                keypoints_count += 1

                        # Calculate average confidence
                        if keypoints_count > 0:
                            overall_confidence = confidence_sum / keypoints_count
                            expected_keypoints = len(category_names)
                            if expected_keypoints > 0:
                                completeness_factor = min(1.0, keypoints_count / expected_keypoints)
                                confidence_score = confidence_score * (0.7 + 0.3 * completeness_factor)
                            
                            critical_points = ["m1", "m2", "r13", "c13"] 
                            missing_critical = any(point not in keypoints_dict for point in critical_points)
                            if missing_critical:
                                confidence_score = confidence_score * 0.8
                        else:
                            confidence_score = 0.3

                    # Check confidence and keypoints coverage
                    required_points = ["m1", "m2", "r11", "r12", "r13", "r14", "r15",
                                      "r21", "r22", "r23", "r24", "r25",
                                      "c11", "c12", "c13", "c14", "c15",
                                      "c21", "c22", "c23", "c24", "c25",
                                      "mb16", "mb26"]

                    # Check which side has more keypoints (left or right)
                    left_points = [p for p in required_points if p.startswith(("r2", "c2")) and p in keypoints_dict]
                    right_points = [p for p in required_points if p.startswith(("r1", "c1")) and p in keypoints_dict]

                    side = "right" if len(right_points) >= len(left_points) else "left"
                    self.app.logger.info(f"Analyzing {side} side based on keypoint availability")

                    # Set the key points based on the side
                    if side == "right":
                        side_required_points = ["m1", "m2", "r11", "r12", "r13", "r14", "r15",
                                              "c11", "c12", "c13", "c14", "c15", "mb16"]
                    else:
                        side_required_points = ["m1", "m2", "r21", "r22", "r23", "r24", "r25",
                                              "c21", "c22", "c23", "c24", "c25", "mb26"]

                    required_points_count = len(side_required_points)
                    found_points_count = len([p for p in side_required_points if p in keypoints_dict])
                    coverage_ratio = found_points_count / required_points_count

                    # Perform dental analysis (pass actual image width for segmentation-side checks)
                    try:
                        img_width = int(results[0].orig_shape[1])
                    except Exception:
                        img_width = 1000
                    analysis_results = self.perform_dental_analysis(keypoints_dict, segmentation_data, side=side, img_width=img_width)

                    # Add confidence and coverage information to analysis results
                    analysis_results["confidence"] = {
                        "overall_confidence": overall_confidence,
                        "keypoints_detected": f"{found_points_count}/{required_points_count}",
                        "coverage_ratio": coverage_ratio
                    }

                    if overall_confidence < 0.4:
                        analysis_results["warning"] = "Low confidence detection. Results may not be accurate."

                    if coverage_ratio < 0.7:
                        analysis_results["warning"] = f"Only {found_points_count} of {required_points_count} required keypoints were detected with sufficient confidence."

                    # Special case checks
                    if analysis_results["sector_analysis"].get("impaction_type") == "Palatally impact" and analysis_results["sector_analysis"].get("sector") == 4:
                        analysis_results["note"] = "Palatally impacted canines in sector 4 typically require surgical intervention."

                    # Create a detection ID
                    detection_id = str(int(time.time() * 1000))

                    segmentation_path = None
                    if segmentation_data and "result_image" in segmentation_data:
                        segmentation_path = os.path.join(self.results_folder, segmentation_data["result_image"])

                    # Create new detection record in database
                    new_detection = KeypointDetection(
                        id=detection_id,
                        user_id=user_id,
                        image_path=image_path,
                        result_path=result_path,
                        confidence_score=float(overall_confidence),
                        prediction_result=analysis_results["prediction_result"],
                        analysis_json=json.dumps(analysis_results),
                        segmentation_path=segmentation_path
                    )

                    # Add to database session
                    db.session.add(new_detection)

                    # Add keypoints to database
                    for keypoint in keypoints_data:
                        new_keypoint = Keypoint(
                            detection_id=detection_id,
                            label=keypoint["label"],
                            x_coord=keypoint["x"],
                            y_coord=keypoint["y"],
                            confidence=keypoint["confidence"]
                        )
                        db.session.add(new_keypoint)

                    # Commit to database
                    db.session.commit()

                    return {
                        "status": "success",
                        "detection_id": detection_id,
                        "original_image": os.path.basename(image_path),
                        "result_image": os.path.basename(result_path),
                        "keypoints": keypoints_data,
                        "confidence_score": overall_confidence,
                        "prediction": analysis_results["prediction_result"],
                        "analysis": analysis_results
                    }

            impacted_canine_sides = []
            if segmentation_data and "segmentations" in segmentation_data:
                # If we have side information from segmentation
                if "left_teeth" in segmentation_data and "right_teeth" in segmentation_data:
                    # Check left side
                    for tooth in segmentation_data["left_teeth"]:
                        if tooth["class_name"] == "Impacted canine":
                            if "left" not in impacted_canine_sides:
                                impacted_canine_sides.append("left")
                            break

                    # Check right side
                    for tooth in segmentation_data["right_teeth"]:
                        if tooth["class_name"] == "Impacted canine":
                            if "right" not in impacted_canine_sides:
                                impacted_canine_sides.append("right")
                            break
                else:
                    # If we don't have side groups, check individual teeth
                    for seg in segmentation_data["segmentations"]:
                        if seg["class_name"] == "Impacted canine":
                            if "side" in seg:
                                # Use side from segmentation if available
                                if seg["side"] not in impacted_canine_sides:
                                    impacted_canine_sides.append(seg["side"])
                            else:
                                # Calculate side based on position
                                center_x = (seg["bbox"][0] + seg["bbox"][2]) / 2
                                img_width = results[0].orig_shape[1]
                                side = "left" if center_x < img_width / 2 else "right"
                                if side not in impacted_canine_sides:
                                    impacted_canine_sides.append(side)

            # If no impacted canines detected in segmentation, use keypoint availability
            if not impacted_canine_sides:
                # Check which side has more keypoints (left or right)
                left_points = [p for p in required_points if p.startswith(("r2", "c2")) and p in keypoints_dict]
                right_points = [p for p in required_points if p.startswith(("r1", "c1")) and p in keypoints_dict]

                if len(right_points) >= len(left_points):
                    impacted_canine_sides.append("right")
                else:
                    impacted_canine_sides.append("left")

            # Perform analysis for each side with an impacted canine
            combined_analysis = {}
            for side in impacted_canine_sides:
                analysis_results = self.perform_dental_analysis(keypoints_dict, segmentation_data, side)
                combined_analysis[side] = analysis_results

            # Determine overall prediction from all analyses
            final_prediction = "normal"
            for side, analysis in combined_analysis.items():
                if analysis["prediction_result"] == "severely impacted":
                    final_prediction = "severely impacted"
                    break
                elif analysis["prediction_result"] == "impacted" and final_prediction != "severely impacted":
                    final_prediction = "impacted"

            combined_results = {
                "side_analyses": combined_analysis,
                "prediction_result": final_prediction
            }

            # Create a single record for the overall detection
            # If we get here, no keypoints were detected or there was an issue
            detection_id = str(int(time.time() * 1000))

            error_analysis = {
                "error": "No valid keypoints detected",
                "prediction_result": "unknown"
            }

            # Create new detection record in database with error information
            new_detection = KeypointDetection(
                id=detection_id,
                user_id=user_id,
                image_path=image_path,
                result_path=result_path,
                confidence_score=float(overall_confidence),
                prediction_result=final_prediction,
                analysis_json=json.dumps(combined_results),
                segmentation_path=segmentation_path if segmentation_data and "result_image" in segmentation_data else None
            )

            db.session.add(new_detection)
            # Add keypoints to database
            for keypoint in keypoints_data:
                new_keypoint = Keypoint(
                    detection_id=detection_id,
                    label=keypoint["label"],
                    x_coord=keypoint["x"],
                    y_coord=keypoint["y"],
                    confidence=keypoint["confidence"]
                )
                db.session.add(new_keypoint)

            db.session.commit()

            return {
                "status": "success",
                "detection_id": detection_id,
                "original_image": os.path.basename(image_path),
                "result_image": os.path.basename(result_path),
                "keypoints": keypoints_data,
                "confidence_score": overall_confidence,
                "prediction": final_prediction,
                "analysis": combined_results
            }

        except Exception as e:
            db.session.rollback()
            self.app.logger.error(f"Error in keypoint detection: {str(e)}")
            self.app.logger.error(traceback.format_exc())
            raise

    def perform_dental_analysis(self, keypoints_dict, segmentation_data=None, side="right", img_width=1000):
        """
        Perform comprehensive dental analysis based on the criteria provided
        """
        try:
            analysis_results = {
                "sector_analysis": {},
                "canine_assessment": {},
                "angle_measurements": {},
                "prediction_result": "unknown",
                "side": side
            }

            # Check if we have enough keypoints for analysis
            required_points = ["m1", "m2", "r11", "r12", "r13", "r14", "r15",
                              "r21", "r22", "r23", "r24", "r25",
                              "c11", "c12", "c13", "c14", "c15",
                              "c21", "c22", "c23", "c24", "c25",
                              "mb16", "mb26"]

            # Set the key points based on the side
            if side == "right":
                canine_root = "r13"
                canine_crown = "c13"
                lateral_incisor_root = "r12"
                lateral_incisor_crown = "c12"
                central_incisor_root = "r11"
                central_incisor_crown = "c11"
                first_premolar_root = "r14"
                first_premolar_crown = "c14"
                second_premolar_root = "r15"
                second_premolar_crown = "c15"
                molar_buccal = "mb16"
            else: # left side
                canine_root = "r23"
                canine_crown = "c23"
                lateral_incisor_root = "r22"
                lateral_incisor_crown = "c22"
                central_incisor_root = "r21"
                central_incisor_crown = "c21"
                first_premolar_root = "r24"
                first_premolar_crown = "c24"
                second_premolar_root = "r25"
                second_premolar_crown = "c25"
                molar_buccal = "mb26"

            # Check if we have the minimal required points
            minimal_points = [canine_root, canine_crown, lateral_incisor_root, lateral_incisor_crown,
                                central_incisor_root, central_incisor_crown, first_premolar_root,
                                first_premolar_crown, "m1", "m2"]

            missing_points = [p for p in minimal_points if p not in keypoints_dict]
            if missing_points:
                self.app.logger.warning(f"Missing key points for analysis on {side} side: {missing_points}")
                analysis_results["error"] = f"Missing required keypoints: {', '.join(missing_points)}"
                analysis_results["prediction_result"] = "unknown"
                return analysis_results

            # Extract midline keypoints
            m1 = keypoints_dict["m1"]
            m2 = keypoints_dict["m2"]

            # 1. Create midline
            midline_start = (m1["x"], m1["y"])
            midline_end = (m2["x"], m2["y"])

            # Save midline data for visualization
            analysis_results["midline"] = {
                "start": {"x": m1["x"], "y": m1["y"]},
                "end": {"x": m2["x"], "y": m2["y"]}
            }

            # 2. สร้างเส้นแบ่ง sector ตามสเปค (ต้องมี 4 เส้น: L1-L4)
            # L1: midpoint(r11,r12) -> midpoint(c11,c12)
            L1_start = self._midpoint(
                keypoints_dict[central_incisor_root]["x"], keypoints_dict[central_incisor_root]["y"],
                keypoints_dict[lateral_incisor_root]["x"], keypoints_dict[lateral_incisor_root]["y"]
            )
            L1_end = self._midpoint(
                keypoints_dict[central_incisor_crown]["x"], keypoints_dict[central_incisor_crown]["y"],
                keypoints_dict[lateral_incisor_crown]["x"], keypoints_dict[lateral_incisor_crown]["y"]
            )

            # L2: midpoint(r12,r13) -> midpoint(c12,c13)
            L2_start = self._midpoint(
                keypoints_dict[lateral_incisor_root]["x"], keypoints_dict[lateral_incisor_root]["y"],
                keypoints_dict[canine_root]["x"], keypoints_dict[canine_root]["y"]
            )
            L2_end = self._midpoint(
                keypoints_dict[lateral_incisor_crown]["x"], keypoints_dict[lateral_incisor_crown]["y"],
                keypoints_dict[canine_crown]["x"], keypoints_dict[canine_crown]["y"]
            )

            # L3: midpoint(r13,r14) -> midpoint(c13,c14)
            L3_start = self._midpoint(
                keypoints_dict[canine_root]["x"], keypoints_dict[canine_root]["y"],
                keypoints_dict[first_premolar_root]["x"], keypoints_dict[first_premolar_root]["y"]
            )
            L3_end = self._midpoint(
                keypoints_dict[canine_crown]["x"], keypoints_dict[canine_crown]["y"],
                keypoints_dict[first_premolar_crown]["x"], keypoints_dict[first_premolar_crown]["y"]
            )

            # L4: midpoint(r14,r15) -> midpoint(c14,c15) (สำรองถ้ามีจุด r15,c15) ไม่ใช้งานใน sector boundary ถ้าไม่มีข้อมูล
            L4_start = None
            L4_end = None
            if second_premolar_root in keypoints_dict and second_premolar_crown in keypoints_dict:
                L4_start = self._midpoint(
                    keypoints_dict[first_premolar_root]["x"], keypoints_dict[first_premolar_root]["y"],
                    keypoints_dict[second_premolar_root]["x"], keypoints_dict[second_premolar_root]["y"]
                )
                L4_end = self._midpoint(
                    keypoints_dict[first_premolar_crown]["x"], keypoints_dict[first_premolar_crown]["y"],
                    keypoints_dict[second_premolar_crown]["x"], keypoints_dict[second_premolar_crown]["y"]
                )

            # บันทึกข้อมูลเส้นทั้งหมดเพื่อ visualization
            sector_lines_payload = {
                "L1": {"start": {"x": L1_start[0], "y": L1_start[1]}, "end": {"x": L1_end[0], "y": L1_end[1]}},
                "L2": {"start": {"x": L2_start[0], "y": L2_start[1]}, "end": {"x": L2_end[0], "y": L2_end[1]}},
                "L3": {"start": {"x": L3_start[0], "y": L3_start[1]}, "end": {"x": L3_end[0], "y": L3_end[1]}}
            }
            if L4_start and L4_end:
                sector_lines_payload["L4"] = {"start": {"x": L4_start[0], "y": L4_start[1]}, "end": {"x": L4_end[0], "y": L4_end[1]}}
            analysis_results["sector_lines"] = sector_lines_payload

            canine_root_point = (keypoints_dict[canine_root]["x"], keypoints_dict[canine_root]["y"])

            # คำนวณ sector โดยใช้ interval ของค่า x (เฉลี่ยของแต่ละเส้น) ตามสเปค: sector2 = ระหว่าง L1-L2, sector3 = L2-L3, sector4 = L3-L4
            interval_lines = [(L1_start, L1_end), (L2_start, L2_end), (L3_start, L3_end)]
            if L4_start and L4_end:
                interval_lines.append((L4_start, L4_end))

            sector = self._determine_sector_by_intervals(canine_root_point, interval_lines)

            impaction_type = "unknown"
            if sector == 2:
                impaction_type = "Buccally impact"
            elif sector == 3:
                impaction_type = "Mid-alveolar"
            elif sector == 4:
                impaction_type = "Palatally impact"

            analysis_results["sector_analysis"] = {"sector": sector, "impaction_type": impaction_type}

            # Canine Assessment - using segmentation data if available
            canine_assessment = {
                "overlap": "unknown",
                "vertical_height": "unknown",
                "root_position": "unknown",
                "eruption_difficulty": "unknown"
            }

            # We'll compute flags and set eruption_difficulty once at the end to avoid cascading flips
            overlap_flag = False
            vertical_flag = False

            # Check for overlap using segmentation data
            # 4.1 Check for overlap using segmentation data
            if segmentation_data and "segmentations" in segmentation_data:
                canine_mask = None
                lateral_incisor_mask = None

                # Find the relevant masks based on side
                for seg in segmentation_data["segmentations"]:
                    if seg["class_name"] == "Impacted canine":
                        seg_center_x = (seg["bbox"][0] + seg["bbox"][2]) / 2

                        # ใช้ img_width ที่รับมาเป็นพารามิเตอร์
                        # Check if this is the canine on the side we're analyzing
                        if (side == "right" and seg_center_x >= img_width/2) or \
                            (side == "left" and seg_center_x < img_width/2):
                            canine_mask = seg

                    elif seg["class_name"] == "Lateral incisor":
                        seg_center_x = (seg["bbox"][0] + seg["bbox"][2]) / 2

                        # Check if this is the lateral incisor on the side we're analyzing
                        if (side == "right" and seg_center_x >= img_width/2) or \
                            (side == "left" and seg_center_x < img_width/2):
                            lateral_incisor_mask = seg

                if canine_mask and lateral_incisor_mask:
                    # Check for overlap
                    canine_bbox = canine_mask["bbox"]
                    lateral_bbox = lateral_incisor_mask["bbox"]

                    overlap = self._check_bbox_overlap(canine_bbox, lateral_bbox)
                    canine_assessment["overlap"] = "Yes" if overlap > 0 else "No"
                    overlap_flag = overlap > 0

            # 4.2 Vertical height assessment
            canine_crown_y = keypoints_dict[canine_crown]["y"]
            lateral_root_y = keypoints_dict[lateral_incisor_root]["y"]
            lateral_crown_y = keypoints_dict[lateral_incisor_crown]["y"]

            # Calculate the midpoint of the lateral incisor root
            lateral_midpoint_y = (lateral_crown_y + lateral_root_y) / 2

            if canine_crown_y < lateral_midpoint_y:
                canine_assessment["vertical_height"] = "Beyond half of root"
                vertical_flag = True
            else:
                canine_assessment["vertical_height"] = "Within half of root"
                vertical_flag = False

            # 4.3 Root position assessment (horizontal alignment of root tip vs crown tip)
            canine_root_x = keypoints_dict[canine_root]["x"]
            canine_crown_x = keypoints_dict[canine_crown]["x"]

            # Consider "Above canine position" if root is roughly vertically aligned with crown (small horizontal offset)
            root_flag = False
            if abs(canine_root_x - canine_crown_x) < 10:  # within ~10px horizontally
                canine_assessment["root_position"] = "Above canine position"
                root_flag = False
            else:
                canine_assessment["root_position"] = "Other position"
                root_flag = True

            # Now set eruption_difficulty from the 3 factors (overlap, vertical, root position)
            if overlap_flag or vertical_flag or root_flag:
                canine_assessment["eruption_difficulty"] = "Unfavorable"
            else:
                canine_assessment["eruption_difficulty"] = "Favorable"

            analysis_results["canine_assessment"] = canine_assessment

            # 5. Angle measurements
            angle_measurements = {}

            # Set up occlusal plane if possible
            if molar_buccal in keypoints_dict:
                occlusal_plane = [
                    (m2["x"], m2["y"]),
                    (keypoints_dict[molar_buccal]["x"], keypoints_dict[molar_buccal]["y"])
                ]

                # Save occlusal plane for visualization
                analysis_results["occlusal_plane"] = {
                    "start": {"x": m2["x"], "y": m2["y"]},
                    "end": {"x": keypoints_dict[molar_buccal]["x"], "y": keypoints_dict[molar_buccal]["y"]}
                }

                # Canine long axis
                canine_axis = [
                    (keypoints_dict[canine_root]["x"], keypoints_dict[canine_root]["y"]),
                    (keypoints_dict[canine_crown]["x"], keypoints_dict[canine_crown]["y"])
                ]

                # Save canine axis for visualization
                analysis_results["canine_axis"] = {
                    "start": {"x": keypoints_dict[canine_root]["x"], "y": keypoints_dict[canine_root]["y"]},
                    "end": {"x": keypoints_dict[canine_crown]["x"], "y": keypoints_dict[canine_crown]["y"]}
                }

                # Lateral incisor long axis
                lateral_axis = [
                    (keypoints_dict[lateral_incisor_root]["x"], keypoints_dict[lateral_incisor_root]["y"]),
                    (keypoints_dict[lateral_incisor_crown]["x"], keypoints_dict[lateral_incisor_crown]["y"])
                ]

                # Save lateral incisor axis for visualization
                analysis_results["lateral_axis"] = {
                    "start": {"x": keypoints_dict[lateral_incisor_root]["x"], "y": keypoints_dict[lateral_incisor_root]["y"]},
                    "end": {"x": keypoints_dict[lateral_incisor_crown]["x"], "y": keypoints_dict[lateral_incisor_crown]["y"]}
                }

                # Midline axis
                midline_axis = [midline_start, midline_end]

                # Calculate angles
                angle_with_midline = self._calculate_angle(canine_axis, midline_axis)
                angle_with_lateral = self._calculate_angle(canine_axis, lateral_axis)
                angle_with_occlusal = self._calculate_angle(canine_axis, occlusal_plane)

                angle_measurements["angle_with_midline"] = {
                    "value": angle_with_midline,
                    "difficulty": "Unfavorable" if angle_with_midline > 31 else "Favorable"
                }

                angle_measurements["angle_with_lateral"] = {
                    "value": angle_with_lateral,
                    "difficulty": "Unfavorable" if angle_with_lateral > 51.47 else "Favorable"
                }

                angle_measurements["angle_with_occlusal"] = {
                    "value": angle_with_occlusal,
                    "difficulty": "Unfavorable" if angle_with_occlusal > 132 else "Favorable"
                }

                # Calculate distances
                # Distance from canine crown to occlusal plane
                distance_to_occlusal = self._point_to_line_distance(
                    (keypoints_dict[canine_crown]["x"], keypoints_dict[canine_crown]["y"]),
                    occlusal_plane[0], occlusal_plane[1]
                )

                # Distance from canine crown to midline
                distance_to_midline = self._point_to_line_distance(
                    (keypoints_dict[canine_crown]["x"], keypoints_dict[canine_crown]["y"]),
                    midline_axis[0], midline_axis[1]
                )

                angle_measurements["distance_to_occlusal"] = distance_to_occlusal
                angle_measurements["distance_to_midline"] = distance_to_midline

            analysis_results["angle_measurements"] = angle_measurements

            # 6. Final determination of impaction
            # ปรับ logic: นับปัจจัยที่เป็น Unfavorable และให้น้ำหนัก sector4 > sector3 > sector2
            difficult_factors = 0

            if impaction_type == "Palatally impact":
                difficult_factors += 2
            # Note: do not add score for Mid-alveolar alone to avoid false positives
            # Buccally (sector2) ไม่เพิ่มคะแนนโดยตรงตามสเปค (อาจถือว่าใกล้เคียงปกติที่สุดใน impaction)

            # Canine assessment: add 1 for each unfavorable factor among overlap, vertical depth, and root position
            if overlap_flag:
                difficult_factors += 1
            if vertical_flag:
                difficult_factors += 1
            if root_flag:
                difficult_factors += 1

            # Angle measurements: ใช้ label Unfavorable
            for ang_key in ["angle_with_midline", "angle_with_lateral", "angle_with_occlusal"]:
                if ang_key in angle_measurements and angle_measurements[ang_key].get("difficulty") == "Unfavorable":
                    difficult_factors += 1

            # Threshold สำหรับสรุปผล
            if difficult_factors >= 4:
                prediction = "severely impacted"
            elif difficult_factors >= 2:
                prediction = "impacted"
            else:
                prediction = "normal"

            analysis_results["difficult_factors"] = difficult_factors
            analysis_results["prediction_result"] = prediction

            # ลบการเรียก perform_dental_analysis ซ้ำออก
            # analysis_results = self.perform_dental_analysis(...)

            return analysis_results

        except Exception as e:
            self.app.logger.error(f"Error in dental analysis: {str(e)}")
            self.app.logger.error(traceback.format_exc())
            return {
                "error": f"Analysis failed: {str(e)}",
                "prediction_result": "unknown",
                "side": side
            }

    def _midpoint(self, x1, y1, x2, y2):
        """Calculate the midpoint between two points"""
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    def _determine_sector(self, point, sector2_line, sector3_line, sector4_line):
        """Determine which sector a point falls into"""
        # Convert lines to standard form (Ax + By + C = 0)
        line2 = self._line_from_points(sector2_line[0], sector2_line[1])
        line3 = self._line_from_points(sector3_line[0], sector3_line[1])
        line4 = self._line_from_points(sector4_line[0], sector4_line[1])

        # Check which side of each line the point falls on
        side2 = self._point_side_of_line(point, line2)
        side3 = self._point_side_of_line(point, line3)
        side4 = self._point_side_of_line(point, line4)

        # Determine sector
        if side2 >= 0 and side3 < 0:
            return 2  # Sector 2
        elif side3 >= 0 and side4 < 0:
            return 3  # Sector 3
        elif side4 >= 0:
            return 4  # Sector 4
        else:
            return 1  # Sector 1 (outside the defined sectors)

    def _determine_sector_by_intervals(self, point, lines):
        """
        Determine sector using ordered vertical/oblique divider lines (L1, L2, L3, L4 (optional)).
        lines: list of tuples [(p_start, p_end), ...] in anatomical order from mesial (incisor) to distal (premolar).
        Sector definition (ตามสเปคผู้ใช้):
            Sector 2: between L1 and L2
            Sector 3: between L2 and L3
            Sector 4: between L3 and L4 (ถ้ามี L4; ถ้าไม่มีและอยู่ distal กว่า L3 ให้จัดเป็น 4 เฉพาะเมื่อเกิน L3)
        We project canine root point onto x by using average x of line endpoints (assumes panoramic image roughly left-right).
        """
        if len(lines) < 3:
            return 1  # ไม่พอสำหรับนิยาม sector 2-4

        # คำนวณตำแหน่งค่า x ของแต่ละเส้น (ใช่ค่าเฉลี่ย x ของปลายทั้งสอง)
        line_x = []
        for (p1, p2) in lines:
            line_x.append((p1[0] + p2[0]) / 2.0)

        # จัดเรียงตามค่า x (จาก mesial -> distal) เผื่อ keypoint สลับลำดับ
        sorted_pairs = sorted(zip(line_x, lines), key=lambda t: t[0])
        line_x = [p[0] for p in sorted_pairs]

        px = point[0]

        # ถ้า point อยู่ก่อน L1 หรือระหว่างก่อน mis-order ถือว่า sector 1
        if px < line_x[0]:
            return 1

        # Sector 2: L1 <= x < L2
        if line_x[0] <= px < line_x[1]:
            return 2
        # Sector 3: L2 <= x < L3
        if line_x[1] <= px < line_x[2]:
            return 3

        # Sector 4 needs L4 ถ้ามี
        if len(line_x) >= 4:
            if line_x[2] <= px < line_x[3]:
                return 4
            if px >= line_x[3]:
                return 4  # distal กว่า L4 จัดเป็น 4
        else:
            # ไม่มี L4: ถ้าเกิน L3 ให้ถือเป็น sector 4 ตามสเปค simplified
            if px >= line_x[2]:
                return 4

        return 1

    def _line_from_points(self, p1, p2):
        """Convert two points to a line in standard form (Ax + By + C = 0)"""
        A = p2[1] - p1[1]
        B = p1[0] - p2[0]
        C = p2[0] * p1[1] - p1[0] * p2[1]
        return (A, B, C)

    def _point_side_of_line(self, point, line):
        """Determine which side of a line a point is on"""
        A, B, C = line
        return A * point[0] + B * point[1] + C

    def _calculate_angle(self, line1, line2):
        """Calculate the angle between two lines in degrees"""
        # Convert to vectors
        vector1 = (line1[1][0] - line1[0][0], line1[1][1] - line1[0][1])
        vector2 = (line2[1][0] - line2[0][0], line2[1][1] - line2[0][1])

        # Calculate dot product
        dot_product = vector1[0] * vector2[0] + vector1[1] * vector2[1]

        # Calculate magnitudes
        mag1 = math.sqrt(vector1[0] ** 2 + vector1[1] ** 2)
        mag2 = math.sqrt(vector2[0] ** 2 + vector2[1] ** 2)

        # Calculate angle in radians
        cos_angle = dot_product / (mag1 * mag2)
        # Clamp to [-1, 1] to avoid domain error with acos
        cos_angle = max(-1, min(1, cos_angle))
        angle_rad = math.acos(cos_angle)

        # Convert to degrees
        angle_deg = math.degrees(angle_rad)

        return angle_deg

    def _point_to_line_distance(self, point, line_point1, line_point2):
        """Calculate the perpendicular distance from a point to a line"""
        x0, y0 = point
        x1, y1 = line_point1
        x2, y2 = line_point2

        # Calculate line length
        line_length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

        # Calculate distance
        if line_length == 0:
            return math.sqrt((x0 - x1) ** 2 + (y0 - y1) ** 2)

        # Calculate perpendicular distance
        distance = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1) / line_length

        return distance

    def _check_bbox_overlap(self, bbox1, bbox2):
        """Calculate the overlap area between two bounding boxes"""
        # Unpack bounding boxes
        x1_min, y1_min, x1_max, y1_max = bbox1
        x2_min, y2_min, x2_max, y2_max = bbox2

        # Calculate overlap dimensions
        x_overlap = max(0, min(x1_max, x2_max) - max(x1_min, x2_min))
        y_overlap = max(0, min(y1_max, y2_max) - max(y1_min, y2_min))

        # Calculate overlap area
        overlap_area = x_overlap * y_overlap

        return overlap_area

    def _get_category_names(self):
        """Load category names from notes.json or use defaults"""
        try:
            notes_path = os.path.join(os.getcwd(), 'models/keypoint/notes.json')
            if os.path.exists(notes_path):
                with open(notes_path, 'r') as f:
                    notes = json.load(f)
                    return {cat['id']: cat['name'] for cat in notes.get('categories', [])}

            # Fallback to hardcoded values from your notes.json
            return {
                0: "c11", 1: "c12", 2: "c13", 3: "c14", 4: "c15",
                5: "c21", 6: "c22", 7: "c23", 8: "c24", 9: "c25",
                10: "m1", 11: "m2", 12: "mb16", 13: "mb26",
                14: "r11", 15: "r12", 16: "r13", 17: "r14", 18: "r15",
                19: "r21", 20: "r22", 21: "r23", 22: "r24", 23: "r25"
            }
        except Exception as e:
            self.app.logger.error(f"Error loading category names: {str(e)}")
            # Return basic numbered categories as fallback
            return {i: f"point_{i}" for i in range(24)}

    def get_detection_by_id(self, detection_id):
        """Retrieve a specific detection by ID from database"""
        try:
            # ดึงข้อมูลจากฐานข้อมูล
            detection = KeypointDetection.query.get(detection_id)

            if not detection:
                self.app.logger.error(f"Detection with ID {detection_id} not found")
                return None

            # สร้าง dictionary จากข้อมูลที่ได้
            result = detection.to_dict()

            # ดึง keypoints สำหรับ detection นี้
            keypoints = Keypoint.query.filter_by(detection_id=detection_id).all()
            keypoints_data = []

            for kp in keypoints:
                keypoints_data.append({
                    "label": kp.label,
                    "x": kp.x_coord,
                    "y": kp.y_coord,
                    "confidence": kp.confidence
                })

            result["keypoints"] = keypoints_data

            # แปลงข้อมูล analysis_json เป็น dictionary (ถ้ามี)
            if hasattr(detection, 'analysis_json') and detection.analysis_json:
                try:
                    result["analysis"] = json.loads(detection.analysis_json)
                except:
                    result["analysis"] = None

            # เพิ่มข้อมูล segmentation ถ้ามี
            if hasattr(detection, 'segmentation_path') and detection.segmentation_path:
                result["segmentation"] = {
                    "result_image": os.path.basename(detection.segmentation_path)
                }

            return result

        except Exception as e:
            self.app.logger.error(f"Error retrieving detection: {str(e)}")
            self.app.logger.error(traceback.format_exc())
            return None

    def get_user_history(self, user_id):
        """Get detection history for a specific user from database"""
        try:
            # Get all detections for the user, ordered by creation date (newest first)
            detections = KeypointDetection.query.filter_by(user_id=user_id).order_by(KeypointDetection.created_at.desc()).all()

            # Convert to dictionaries and format for frontend
            results = []
            for detection in detections:
                detection_dict = {
                    'id': detection.id,
                    'user_id': detection.user_id,
                    'image_path': detection.image_path,
                    'result_path': detection.result_path,
                    'confidence_score': detection.confidence_score,
                    'prediction_result': detection.prediction_result,
                    'created_at': detection.created_at.isoformat()
                }

                # Add analysis data if available
                if hasattr(detection, 'analysis_json') and detection.analysis_json:
                    try:
                        detection_dict['analysis'] = json.loads(detection.analysis_json)
                    except:
                        detection_dict['analysis'] = None

                results.append(detection_dict)

            return results

        except Exception as e:
            self.app.logger.error(f"Error retrieving user history: {str(e)}")
            return []
