from config import db
from datetime import datetime
import json
import os

class KeypointDetection(db.Model):
    __tablename__ = 'keypoint_detections'

    id = db.Column(db.String(50), primary_key=True)  # Changed to String for timestamp-based IDs
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    image_path = db.Column(db.String(255), nullable=False)
    result_path = db.Column(db.String(255), nullable=True)
    confidence_score = db.Column(db.Float, nullable=True)
    prediction_result = db.Column(db.String(50), nullable=True)
    analysis_json = db.Column(db.Text, nullable=True)  # Added field for storing analysis results as JSON
    keypoints = db.relationship('Keypoint', backref='detection', lazy=True, cascade="all, delete-orphan")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    segmentation_path = db.Column(db.String(255), nullable=True)

    def __repr__(self):
        return f'<KeypointDetection {self.id}>'

    def to_dict(self):
        result = {
            'id': self.id,
            'user_id': self.user_id,
            'image_path': os.path.basename(self.image_path) if self.image_path else None,
            'result_path': os.path.basename(self.result_path) if self.result_path else None,
            'confidence_score': self.confidence_score,
            'prediction_result': self.prediction_result,
            'keypoints': [keypoint.to_dict() for keypoint in self.keypoints],
            'created_at': self.created_at.isoformat()
        }

        if self.segmentation_path:
            result['segmentation_path'] = os.path.basename(self.segmentation_path)

        # Add analysis if available
        if hasattr(self, 'analysis_json') and self.analysis_json:
            try:
                result['analysis'] = json.loads(self.analysis_json)
            except:
                result['analysis'] = None

        return result

class Keypoint(db.Model):
    __tablename__ = 'keypoints'

    id = db.Column(db.Integer, primary_key=True)
    detection_id = db.Column(db.String(50), db.ForeignKey('keypoint_detections.id'), nullable=False)
    label = db.Column(db.String(50), nullable=False)
    x_coord = db.Column(db.Float, nullable=False)
    y_coord = db.Column(db.Float, nullable=False)
    confidence = db.Column(db.Float, nullable=False)

    def __repr__(self):
        return f'<Keypoint {self.label} at ({self.x_coord}, {self.y_coord})>'

    def to_dict(self):
        return {
            'id': self.id,
            'label': self.label,
            'x': self.x_coord,
            'y': self.y_coord,
            'confidence': self.confidence
        }


class CorrectedKeypoint(db.Model):
    __tablename__ = 'corrected_keypoints'

    id = db.Column(db.Integer, primary_key=True)
    detection_id = db.Column(db.String(50), db.ForeignKey('keypoint_detections.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    label = db.Column(db.String(50), nullable=False)
    x_coord = db.Column(db.Float, nullable=False)  # Corrected value
    y_coord = db.Column(db.Float, nullable=False)  # Corrected value
    confidence = db.Column(db.Float, nullable=False, default=1.0)  # Manual correction = high confidence
    original_x = db.Column(db.Float, nullable=True)  # Original AI prediction value
    original_y = db.Column(db.Float, nullable=True)  # Original AI prediction value
    original_confidence = db.Column(db.Float, nullable=True)  # Original AI confidence
    corrected_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationship to access detection
    detection = db.relationship('KeypointDetection', backref='corrected_keypoints', lazy=True)

    def __repr__(self):
        return f'<CorrectedKeypoint {self.label} at ({self.x_coord}, {self.y_coord})>'

    def to_dict(self):
        result = {
            'id': self.id,
            'detection_id': self.detection_id,
            'user_id': self.user_id,
            'label': self.label,
            'x': self.x_coord,
            'y': self.y_coord,
            'confidence': self.confidence,
            'original_x': self.original_x,
            'original_y': self.original_y,
            'original_confidence': self.original_confidence,
            'corrected_at': self.corrected_at.isoformat() if self.corrected_at else None
        }
        # Add image_path from detection relationship if available
        if hasattr(self, 'detection') and self.detection and self.detection.image_path:
            result['image_path'] = os.path.basename(self.detection.image_path)
        return result


class CorrectedImage(db.Model):
    """
    Model for storing corrected images with their keypoints for training/development purposes
    """
    __tablename__ = 'corrected_images'

    id = db.Column(db.Integer, primary_key=True)
    detection_id = db.Column(db.String(50), db.ForeignKey('keypoint_detections.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Store original image path (copy)
    original_image_path = db.Column(db.String(255), nullable=False)
    # Store corrected result image path
    corrected_result_path = db.Column(db.String(255), nullable=True)
    
    # Store all keypoints (original + corrected) as JSON
    keypoints_json = db.Column(db.Text, nullable=False)  # JSON array of keypoints
    
    # Metadata
    corrected_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    notes = db.Column(db.Text, nullable=True)  # Optional notes
    
    # Relationships
    detection = db.relationship('KeypointDetection', backref='corrected_images', lazy=True)
    
    def __repr__(self):
        return f'<CorrectedImage {self.id} for detection {self.detection_id}>'
    
    def to_dict(self):
        result = {
            'id': self.id,
            'detection_id': self.detection_id,
            'user_id': self.user_id,
            'original_image_path': os.path.basename(self.original_image_path) if self.original_image_path else None,
            'corrected_result_path': os.path.basename(self.corrected_result_path) if self.corrected_result_path else None,
            'keypoints': json.loads(self.keypoints_json) if self.keypoints_json else [],
            'corrected_at': self.corrected_at.isoformat() if self.corrected_at else None,
            'notes': self.notes
        }
        return result
    
    def to_export_dict(self, include_images_base64=False):
        """
        Export format for JSON export - includes full paths and all data
        If include_images_base64=True, images will be encoded as base64 for portability
        """
        result = {
            'id': self.id,
            'detection_id': self.detection_id,
            'user_id': self.user_id,
            'original_image_path': self.original_image_path,
            'corrected_result_path': self.corrected_result_path,
            'keypoints': json.loads(self.keypoints_json) if self.keypoints_json else [],
            'corrected_at': self.corrected_at.isoformat() if self.corrected_at else None,
            'notes': self.notes
        }
        
        # Include base64 encoded images if requested (for portability)
        if include_images_base64:
            import base64
            # Encode original image
            if self.original_image_path and os.path.exists(self.original_image_path):
                try:
                    with open(self.original_image_path, 'rb') as f:
                        image_data = f.read()
                        image_base64 = base64.b64encode(image_data).decode('utf-8')
                        # Determine MIME type from file extension
                        ext = os.path.splitext(self.original_image_path)[1].lower()
                        mime_type = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else 'image/png' if ext == '.png' else 'image/jpeg'
                        result['original_image_base64'] = f'data:{mime_type};base64,{image_base64}'
                        result['original_image_filename'] = os.path.basename(self.original_image_path)
                except Exception as e:
                    result['original_image_error'] = f'Failed to encode image: {str(e)}'
            
            # Encode corrected result image
            if self.corrected_result_path and os.path.exists(self.corrected_result_path):
                try:
                    with open(self.corrected_result_path, 'rb') as f:
                        image_data = f.read()
                        image_base64 = base64.b64encode(image_data).decode('utf-8')
                        # Determine MIME type from file extension
                        ext = os.path.splitext(self.corrected_result_path)[1].lower()
                        mime_type = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else 'image/png' if ext == '.png' else 'image/jpeg'
                        result['corrected_result_image_base64'] = f'data:{mime_type};base64,{image_base64}'
                        result['corrected_result_image_filename'] = os.path.basename(self.corrected_result_path)
                except Exception as e:
                    result['corrected_result_image_error'] = f'Failed to encode image: {str(e)}'
        
        return result