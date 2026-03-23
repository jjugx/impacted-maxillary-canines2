from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

user_bp = Blueprint('user', __name__)

# Import User model and database instance
from models import User
from config import db

@user_bp.route('/user/all', methods=['GET'])
def index():
    try:
        # Query all users from the database
        users = User.query.all()

        # Convert users to a list of dictionaries
        users_data = [
            {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': user.role
            }
            for user in users
        ]

        return jsonify({
            'status': 'success',
            'users': users_data,
        })

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# Delete user endpoint
@user_bp.route('/user/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    try:
        # Get current user from JWT token
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        # Check if current user is admin
        if not current_user or current_user.role != 'admin':
            return jsonify({
                'status': 'error',
                'message': 'Access denied. Admin privileges required.'
            }), 403
        
        # Find the user to delete
        user_to_delete = User.query.get(user_id)
        
        if not user_to_delete:
            return jsonify({
                'status': 'error',
                'message': 'User not found'
            }), 404
        
        # Prevent admin from deleting themselves
        if user_to_delete.id == current_user.id:
            return jsonify({
                'status': 'error',
                'message': 'Cannot delete your own account'
            }), 400
        
        # Delete the user
        db.session.delete(user_to_delete)
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': f'User {user_to_delete.username} has been deleted successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
