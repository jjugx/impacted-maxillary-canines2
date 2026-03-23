from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
import traceback
from PIL import Image

from services import keypoint_service, segmentation_service, roi_service, dental_analysis_service
from config import db
from models.keypoint import KeypointDetection, CorrectedKeypoint
import json

prediction_bp = Blueprint('prediction', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@prediction_bp.route('/analyze', methods=['POST'])
@jwt_required()
def analyze_image():
    user_id = get_jwt_identity()

    # Check if the post request has the file part
    if 'image' not in request.files:
        return jsonify({
            'status': 'error',
            'message': 'No image provided'
        }), 400

    file = request.files['image']

    # If user does not select file, browser also submits an empty part without filename
    if file.filename == '':
        return jsonify({
            'status': 'error',
            'message': 'No selected file'
        }), 400

    if file and allowed_file(file.filename):
        try:
            # Check file size
            file_content = file.read()
            file.seek(0)  # Reset file pointer to beginning after reading

            # Check if file is too large (e.g., > 10MB)
            if len(file_content) > 10 * 1024 * 1024:
                return jsonify({
                    'status': 'error',
                    'message': 'File is too large. Maximum size is 10MB.'
                }), 400

            # Check if file is valid image
            try:
                img = Image.open(file)
                img.verify()  # Verify it's an image
                file.seek(0)  # Reset file pointer

                # Check image dimensions
                img = Image.open(file)
                if img.width < 200 or img.height < 200:
                    return jsonify({
                        'status': 'error',
                        'message': 'Image is too small. Minimum dimensions are 200x200 pixels.'
                    }), 400
                file.seek(0)  # Reset file pointer again
            except Exception as e:
                current_app.logger.error(f"Image validation error: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': 'Uploaded file is not a valid image.'
                }), 400

            # Save the uploaded image
            image_path = keypoint_service.save_image(file)

            # First, get segmentation results
            segmentation_results = segmentation_service.get_tooth_segmentation(image_path)

            # Then, get keypoint detection results with segmentation data
            keypoint_results = keypoint_service.detect_keypoints(
                image_path,
                user_id,
                segmentation_data=segmentation_results
            )

            # Prepare keypoints dict for ROI fallback (if any were detected)
            keypoints_dict = None
            try:
                if keypoint_results and isinstance(keypoint_results, dict):
                    kpts = keypoint_results.get("keypoints") or []
                    if kpts:
                        keypoints_dict = {kp["label"]: {"x": kp["x"], "y": kp["y"]} for kp in kpts}
            except Exception:
                keypoints_dict = None

            # Run ROI classifier to decide impacted vs normal at side-level
            roi_threshold = float(current_app.config.get('ROI_THRESHOLD', 0.15))
            roi_results = roi_service.predict_from_image(
                image_path=image_path,
                segmentation_data=segmentation_results,
                keypoints_dict=keypoints_dict,
                threshold=roi_threshold,
            )

            # Detailed dental analysis with ROI gating and measurements
            dental_results = None
            try:
                if keypoints_dict:
                    dental_results = dental_analysis_service.analyze(
                        image_path=image_path,
                        segmentation_data=segmentation_results,
                        keypoints=keypoints_dict,
                    )
            except Exception as _:
                current_app.logger.warning("Dental analysis failed; continuing without it")

            # Build eruption summary (overall) if dental results available
            eruption_summary = None
            if isinstance(dental_results, dict):
                right_es = dental_results.get('right', {}).get('eruption_summary') if dental_results.get('right') else None
                left_es = dental_results.get('left', {}).get('eruption_summary') if dental_results.get('left') else None
                overall_status = None
                overall_label_th = None
                overall_label_en = None
                reasons = []
                # Decision: if any side can_erupt is False -> cannot; else if any True -> can; else uncertain
                side_values = [s for s in [right_es, left_es] if s]
                if side_values:
                    if any(s.get('can_erupt') is False for s in side_values):
                        overall_status = False
                        overall_label_th = 'ขึ้นไม่ได้'
                        overall_label_en = 'Cannot erupt'
                    elif any(s.get('can_erupt') is True for s in side_values):
                        overall_status = True
                        overall_label_th = 'ขึ้นได้'
                        overall_label_en = 'Can erupt'
                    else:
                        overall_status = None
                        overall_label_th = 'ไม่ทราบ'
                        overall_label_en = 'Uncertain'
                    for s in side_values:
                        reasons.extend(s.get('reasons') or [])
                eruption_summary = {
                    'right': right_es,
                    'left': left_es,
                    'overall': {
                        'can_erupt': overall_status,
                        'label_th': overall_label_th,
                        'label_en': overall_label_en,
                        'reasons': reasons
                    }
                }

            # Final decision: ROI decides Normal vs Impacted; keep severe-impacted override from keypoints
            final_prediction = roi_results.get("prediction_result")
            kp_pred = None
            if keypoint_results and isinstance(keypoint_results, dict):
                kp_pred = keypoint_results.get("prediction") or (keypoint_results.get("analysis") or {}).get("prediction_result")
            if isinstance(kp_pred, str) and "severely" in kp_pred.lower():
                final_prediction = kp_pred

            # Persist final prediction and ROI results to the detection record for consistency with /detection fetch
            try:
                detection_id = keypoint_results.get("detection_id") if isinstance(keypoint_results, dict) else None
                if detection_id:
                    det = KeypointDetection.query.get(detection_id)
                    if det:
                        det.prediction_result = final_prediction
                        # Merge ROI results into analysis_json under key 'roi'
                        analysis = {}
                        if det.analysis_json:
                            try:
                                analysis = json.loads(det.analysis_json)
                            except Exception:
                                analysis = {}
                        analysis["roi"] = roi_results
                        if dental_results is not None:
                            analysis["dental_analysis"] = dental_results
                        if eruption_summary is not None:
                            analysis["eruption_summary"] = eruption_summary
                        # Also mirror ROI-driven final decision into analysis for consumers using this field
                        analysis["prediction_result"] = final_prediction
                        det.analysis_json = json.dumps(analysis)
                        db.session.commit()
            except Exception as _:
                current_app.logger.warning("Failed to persist ROI results to detection record")

            # Update in-memory detection payload so clients relying on detection.analysis/prediction see the ROI-based final decision
            if isinstance(keypoint_results, dict):
                try:
                    keypoint_results["prediction"] = final_prediction
                    if isinstance(keypoint_results.get("analysis"), dict):
                        keypoint_results["analysis"]["prediction_result"] = final_prediction
                        keypoint_results["analysis"]["roi"] = roi_results
                except Exception:
                    pass

            # Combine results
            combined_results = {
                'status': 'success',
                'message': 'Image processed successfully',
                'detection': keypoint_results,
                'segmentation': segmentation_results,
                'roi': roi_results,
                'dental_analysis': dental_results,
                'eruption_summary': eruption_summary,
                'final_prediction': final_prediction
            }

            return jsonify(combined_results)

        except Exception as e:
            current_app.logger.error(f"Error processing image: {str(e)}")
            current_app.logger.error(traceback.format_exc())

            # Provide more detailed error message when possible
            error_message = 'Error processing image. The AI model may have difficulty analyzing this X-ray.'

            if 'No valid keypoints detected' in str(e):
                error_message = 'Could not detect dental keypoints in this image. Please try with a clearer X-ray.'
            elif 'Model not initialized' in str(e):
                error_message = 'AI model initialization error. Please contact support.'
            elif 'out of memory' in str(e).lower():
                error_message = 'Server memory error. The image may be too large or complex.'

            return jsonify({
                'status': 'error',
                'message': error_message,
                'details': str(e)
            }), 500

    return jsonify({
        'status': 'error',
        'message': 'Invalid file format. Allowed formats: png, jpg, jpeg'
    }), 400

@prediction_bp.route('/detection/<detection_id>', methods=['GET'])
@jwt_required()
def get_detection(detection_id):
    user_id = get_jwt_identity()

    try:
        # Get detection details
        detection = keypoint_service.get_detection_by_id(detection_id)

        if not detection:
            return jsonify({
                'status': 'error',
                'message': 'Detection not found'
            }), 404

        # Check if the detection belongs to the user
        if str(detection['user_id']) != str(user_id):
            return jsonify({
                'status': 'error',
                'message': 'Unauthorized access to detection'
            }), 403

        return jsonify({
            'status': 'success',
            'detection': detection
        })

    except Exception as e:
        current_app.logger.error(f"Error retrieving detection: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error retrieving detection: {str(e)}'
        }), 500

@prediction_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    user_id = get_jwt_identity()

    try:
        # Get detection history for the user
        history = keypoint_service.get_user_history(user_id)

        return jsonify({
            'status': 'success',
            'history': history
        })

    except Exception as e:
        current_app.logger.error(f"Error retrieving history: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error retrieving history: {str(e)}'
        }), 500

@prediction_bp.route('/uploads/<filename>', methods=['GET'])
def uploaded_file(filename):
    return send_from_directory(os.path.join(current_app.root_path, 'uploads'), filename)

@prediction_bp.route('/results/<filename>', methods=['GET'])
def result_file(filename):
    return send_from_directory(os.path.join(current_app.root_path, 'results'), filename)

@prediction_bp.route('/detection/<detection_id>/keypoints/preview', methods=['POST'])
@jwt_required()
def preview_keypoints_analysis(detection_id):
    """
    Preview analysis with updated keypoints WITHOUT saving to database
    Expected request body:
    {
        "keypoints": [
            {"label": "m1", "x": 100.5, "y": 200.3, "confidence": 0.9},
            ...
        ]
    }
    """
    user_id = get_jwt_identity()

    try:
        # Get detection to verify ownership
        detection = KeypointDetection.query.get(detection_id)
        if not detection:
            return jsonify({
                'status': 'error',
                'message': 'Detection not found'
            }), 404

        # Check if the detection belongs to the user
        if str(detection.user_id) != str(user_id):
            return jsonify({
                'status': 'error',
                'message': 'Unauthorized access to detection'
            }), 403

        # Get keypoints from request
        data = request.get_json()
        if not data or 'keypoints' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Keypoints data is required'
            }), 400

        updated_keypoints = data['keypoints']
        if not isinstance(updated_keypoints, list) or len(updated_keypoints) == 0:
            return jsonify({
                'status': 'error',
                'message': 'Keypoints must be a non-empty list'
            }), 400

        # Validate keypoint structure
        for kp in updated_keypoints:
            if not all(key in kp for key in ['label', 'x', 'y']):
                return jsonify({
                    'status': 'error',
                    'message': 'Each keypoint must have label, x, and y fields'
                }), 400

        # Preview analysis with updated keypoints (without saving)
        result = keypoint_service.preview_analysis_with_keypoints(detection_id, updated_keypoints)

        return jsonify({
            'status': 'success',
            'message': 'Analysis preview calculated',
            **result
        })

    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 404
    except Exception as e:
        current_app.logger.error(f"Error previewing keypoints: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error previewing keypoints: {str(e)}'
        }), 500

@prediction_bp.route('/detection/<detection_id>/keypoints', methods=['PUT'])
@jwt_required()
def update_keypoints_and_recalculate(detection_id):
    """
    Update keypoints and recalculate analysis
    Expected request body:
    {
        "keypoints": [
            {"label": "m1", "x": 100.5, "y": 200.3, "confidence": 0.9},
            ...
        ]
    }
    """
    user_id = get_jwt_identity()

    try:
        # Get detection to verify ownership
        detection = KeypointDetection.query.get(detection_id)
        if not detection:
            return jsonify({
                'status': 'error',
                'message': 'Detection not found'
            }), 404

        # Check if the detection belongs to the user
        if str(detection.user_id) != str(user_id):
            return jsonify({
                'status': 'error',
                'message': 'Unauthorized access to detection'
            }), 403

        # Check if already corrected (only allow one correction)
        existing_corrected = CorrectedKeypoint.query.filter_by(detection_id=detection_id).first()
        if existing_corrected:
            return jsonify({
                'status': 'error',
                'message': 'This detection has already been corrected. Only one correction is allowed per detection.'
            }), 400

        # Get keypoints from request
        data = request.get_json()
        if not data or 'keypoints' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Keypoints data is required'
            }), 400

        updated_keypoints = data['keypoints']
        if not isinstance(updated_keypoints, list) or len(updated_keypoints) == 0:
            return jsonify({
                'status': 'error',
                'message': 'Keypoints must be a non-empty list'
            }), 400

        # Validate keypoint structure
        for kp in updated_keypoints:
            if not all(key in kp for key in ['label', 'x', 'y']):
                return jsonify({
                    'status': 'error',
                    'message': 'Each keypoint must have label, x, and y fields'
                }), 400

        # Recalculate analysis with updated keypoints (also saves to corrected_keypoints table)
        result = keypoint_service.recalculate_analysis_with_keypoints(detection_id, updated_keypoints, user_id=user_id)

        return jsonify({
            'status': 'success',
            'message': 'Keypoints updated and analysis recalculated',
            **result
        })

    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 404
    except Exception as e:
        current_app.logger.error(f"Error updating keypoints: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error updating keypoints: {str(e)}'
        }), 500
