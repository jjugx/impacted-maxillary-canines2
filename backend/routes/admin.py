from flask import Blueprint, request, jsonify, current_app, send_from_directory, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
import json
import traceback
import zipfile
import io
from datetime import datetime
from config import db
from models import CorrectedImage, User

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/admin/images', methods=['GET'])
@jwt_required()
def get_corrected_images():
    """
    Get all corrected images (admin only)
    Query params:
    - page: page number (default: 1)
    - per_page: items per page (default: 20)
    """
    user_id = get_jwt_identity()
    
    try:
        # Check if user is admin
        user = User.query.get(user_id)
        if not user or user.role != 'admin':
            return jsonify({
                'status': 'error',
                'message': 'Unauthorized. Admin access required.'
            }), 403
        
        # Get pagination params
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # Query corrected images with pagination
        pagination = CorrectedImage.query.order_by(
            CorrectedImage.corrected_at.desc()
        ).paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        # Format response
        images = [img.to_dict() for img in pagination.items]
        
        return jsonify({
            'status': 'success',
            'images': images,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Error retrieving corrected images: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error retrieving corrected images: {str(e)}'
        }), 500

@admin_bp.route('/admin/images/<int:image_id>', methods=['GET'])
@jwt_required()
def get_corrected_image(image_id):
    """Get a specific corrected image by ID"""
    user_id = get_jwt_identity()
    
    try:
        # Check if user is admin
        user = User.query.get(user_id)
        if not user or user.role != 'admin':
            return jsonify({
                'status': 'error',
                'message': 'Unauthorized. Admin access required.'
            }), 403
        
        corrected_image = CorrectedImage.query.get(image_id)
        if not corrected_image:
            return jsonify({
                'status': 'error',
                'message': 'Corrected image not found'
            }), 404
        
        return jsonify({
            'status': 'success',
            'image': corrected_image.to_dict()
        })
        
    except Exception as e:
        current_app.logger.error(f"Error retrieving corrected image: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error retrieving corrected image: {str(e)}'
        }), 500

@admin_bp.route('/admin/images/<int:image_id>/export', methods=['GET'])
@jwt_required()
def export_corrected_image(image_id):
    """
    Export corrected image data as ZIP file
    Includes original image and JSON data with keypoints (no corrected result image)
    """
    user_id = get_jwt_identity()
    
    try:
        # Check if user is admin
        user = User.query.get(user_id)
        if not user or user.role != 'admin':
            return jsonify({
                'status': 'error',
                'message': 'Unauthorized. Admin access required.'
            }), 403
        
        corrected_image = CorrectedImage.query.get(image_id)
        if not corrected_image:
            return jsonify({
                'status': 'error',
                'message': 'Corrected image not found'
            }), 404
        
        # Always export as ZIP
        return _export_as_zip(corrected_image, image_id)
        
    except Exception as e:
        current_app.logger.error(f"Error exporting corrected image: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error exporting corrected image: {str(e)}'
        }), 500

def _export_as_zip(corrected_image, image_id):
    """Helper function to export corrected image as ZIP file with original image and JSON (no corrected result image)"""
    try:
        # Create in-memory ZIP file
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add original image if exists (only original, not corrected result)
            original_filename_in_zip = None
            if corrected_image.original_image_path and os.path.exists(corrected_image.original_image_path):
                original_filename = os.path.basename(corrected_image.original_image_path)
                original_filename_in_zip = f'image_{original_filename}'
                zip_file.write(corrected_image.original_image_path, original_filename_in_zip)
            
            # Create JSON data with keypoints and metadata
            keypoints_data = json.loads(corrected_image.keypoints_json) if corrected_image.keypoints_json else []
            export_data = {
                'id': corrected_image.id,
                'detection_id': corrected_image.detection_id,
                'user_id': corrected_image.user_id,
                'keypoints': keypoints_data,
                'corrected_at': corrected_image.corrected_at.isoformat() if corrected_image.corrected_at else None,
                'notes': corrected_image.notes,
                'export_metadata': {
                    'export_date': datetime.utcnow().isoformat(),
                    'format': 'zip',
                    'version': '1.0',
                    'description': 'Corrected image data with keypoints for training/development',
                    'image_file': original_filename_in_zip,
                    'structure': {
                        'image': 'image_*.jpg (original image)',
                        'data': 'data.json (keypoints and metadata)'
                    }
                }
            }
            
            # Add JSON file to ZIP
            json_str = json.dumps(export_data, indent=2, ensure_ascii=False)
            zip_file.writestr('data.json', json_str.encode('utf-8'))
        
        # Prepare response
        zip_buffer.seek(0)
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'corrected_image_{image_id}.zip'
        )
        
    except Exception as e:
        current_app.logger.error(f"Error creating ZIP export: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        raise

@admin_bp.route('/admin/images/export-all', methods=['GET'])
@jwt_required()
def export_all_corrected_images():
    """
    Export all corrected images as ZIP file
    Includes original images and JSON data with keypoints (no corrected result images)
    """
    user_id = get_jwt_identity()
    
    try:
        # Check if user is admin
        user = User.query.get(user_id)
        if not user or user.role != 'admin':
            return jsonify({
                'status': 'error',
                'message': 'Unauthorized. Admin access required.'
            }), 403
        
        # Always export as ZIP
        return _export_all_as_zip()
        
    except Exception as e:
        current_app.logger.error(f"Error exporting all corrected images: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error exporting corrected images: {str(e)}'
        }), 500

def _export_all_as_zip():
    """Helper function to export all corrected images as ZIP file (only original images, no corrected result images)"""
    try:
        # Get all corrected images
        corrected_images = CorrectedImage.query.order_by(
            CorrectedImage.corrected_at.desc()
        ).all()
        
        # Create in-memory ZIP file
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add all original images and create JSON for each
            image_data_list = []
            
            for img in corrected_images:
                image_entry = {
                    'id': img.id,
                    'detection_id': img.detection_id,
                    'user_id': img.user_id,
                    'keypoints': json.loads(img.keypoints_json) if img.keypoints_json else [],
                    'corrected_at': img.corrected_at.isoformat() if img.corrected_at else None,
                    'notes': img.notes
                }
                
                # Add original image only (no corrected result image)
                if img.original_image_path and os.path.exists(img.original_image_path):
                    original_filename = os.path.basename(img.original_image_path)
                    zip_path = f'images/{img.id}/image_{original_filename}'
                    zip_file.write(img.original_image_path, zip_path)
                    image_entry['image_file'] = zip_path
                
                image_data_list.append(image_entry)
            
            # Create main JSON file with all data
            export_data = {
                'export_date': datetime.utcnow().isoformat(),
                'format': 'zip',
                'total_images': len(corrected_images),
                'version': '1.0',
                'description': 'All corrected images data with keypoints for training/development - original images only',
                'structure': {
                    'images': 'images/{id}/image_*.jpg (original images only)',
                    'data': 'data.json (all keypoints and metadata)'
                },
                'images': image_data_list
            }
            
            # Add main JSON file to ZIP
            json_str = json.dumps(export_data, indent=2, ensure_ascii=False)
            zip_file.writestr('data.json', json_str.encode('utf-8'))
        
        # Prepare response
        zip_buffer.seek(0)
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'all_corrected_images_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.zip'
        )
        
    except Exception as e:
        current_app.logger.error(f"Error creating ZIP export for all images: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        raise

@admin_bp.route('/admin/images/<int:image_id>', methods=['DELETE'])
@jwt_required()
def delete_corrected_image(image_id):
    """Delete a corrected image"""
    user_id = get_jwt_identity()
    
    try:
        # Check if user is admin
        user = User.query.get(user_id)
        if not user or user.role != 'admin':
            return jsonify({
                'status': 'error',
                'message': 'Unauthorized. Admin access required.'
            }), 403
        
        corrected_image = CorrectedImage.query.get(image_id)
        if not corrected_image:
            return jsonify({
                'status': 'error',
                'message': 'Corrected image not found'
            }), 404
        
        # Delete associated image files if they exist
        try:
            if corrected_image.original_image_path and os.path.exists(corrected_image.original_image_path):
                os.remove(corrected_image.original_image_path)
            if corrected_image.corrected_result_path and os.path.exists(corrected_image.corrected_result_path):
                os.remove(corrected_image.corrected_result_path)
        except Exception as e:
            current_app.logger.warning(f"Error deleting image files: {str(e)}")
        
        # Delete database record
        db.session.delete(corrected_image)
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'Corrected image deleted successfully'
        })
        
    except Exception as e:
        current_app.logger.error(f"Error deleting corrected image: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({
            'status': 'error',
            'message': f'Error deleting corrected image: {str(e)}'
        }), 500

@admin_bp.route('/admin/corrected-images/<filename>', methods=['GET'])
@jwt_required(optional=True)
def get_corrected_image_file(filename):
    """
    Serve corrected image files with optional token-based authentication
    Token can be provided via Authorization header or token query parameter
    If token is provided, user must be admin. If no token, still allow but verify file exists in database.
    """
    try:
        # Get user_id from JWT token if available
        user_id = None
        try:
            user_id = get_jwt_identity()
        except Exception:
            # No token or invalid token - will check via query parameter
            pass
        
        # If no token in header, try query parameter
        if not user_id:
            token = request.args.get('token')
            if token:
                try:
                    from flask_jwt_extended import decode_token
                    decoded = decode_token(token)
                    user_id = decoded.get('sub')
                except Exception:
                    # Token invalid or expired
                    current_app.logger.warning(f"Invalid token provided for image access: {filename}")
        
        # Verify file exists and is in correct directory
        corrected_images_folder = os.path.join(os.getcwd(), 'corrected_images')
        file_path = os.path.join(corrected_images_folder, filename)
        
        # Security check: ensure file is within corrected_images folder (prevent path traversal)
        if not os.path.abspath(file_path).startswith(os.path.abspath(corrected_images_folder)):
            return jsonify({
                'status': 'error',
                'message': 'Invalid file path'
            }), 403
        
        # Check if file exists
        if not os.path.exists(file_path):
            return jsonify({
                'status': 'error',
                'message': 'File not found'
            }), 404
        
        # If token provided, verify user is admin
        if user_id:
            try:
                user = User.query.get(user_id)
                if not user or user.role != 'admin':
                    return jsonify({
                        'status': 'error',
                        'message': 'Unauthorized. Admin access required.'
                    }), 403
            except Exception as e:
                current_app.logger.error(f"Error verifying user: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': 'Error verifying authentication'
                }), 500
        else:
            # No token provided - verify file exists in database for security
            # This ensures only legitimate corrected images are served
            try:
                corrected_image = CorrectedImage.query.filter(
                    CorrectedImage.original_image_path.like(f'%{filename}') |
                    CorrectedImage.corrected_result_path.like(f'%{filename}')
                ).first()
                
                # If not found in database, deny access for security
                if not corrected_image:
                    current_app.logger.warning(f"Unauthorized access attempt to image not in database: {filename}")
                    return jsonify({
                        'status': 'error',
                        'message': 'Unauthorized. File not found in database.'
                    }), 403
            except Exception as e:
                current_app.logger.error(f"Error checking database for image: {str(e)}")
                # If database check fails, deny access for security
                return jsonify({
                    'status': 'error',
                    'message': 'Error verifying file access'
                }), 500
        
        return send_from_directory(corrected_images_folder, filename)
        
    except Exception as e:
        current_app.logger.error(f"Error serving corrected image file: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error serving file: {str(e)}'
        }), 500
