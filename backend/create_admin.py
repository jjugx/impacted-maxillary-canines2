# create_admin.py
from app import create_app
from config import db
from models import User
from werkzeug.security import generate_password_hash

app = create_app()

with app.app_context():
    admin = User(
        username="admin",
        email="admin@gmail.com",
        password=generate_password_hash("admin123", method='pbkdf2:sha256'),
        role="admin"
    )
    db.session.add(admin)
    db.session.commit()
    print("Admin user created successfully")
