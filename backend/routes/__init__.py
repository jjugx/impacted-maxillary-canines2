def init_app(app):
    # Import and register blueprints here
    from routes.main import main_bp
    from routes.auth import auth_bp
    from routes.user import user_bp
    from routes.prediction import prediction_bp
    from routes.admin import admin_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(prediction_bp)
    app.register_blueprint(admin_bp)
    pass
