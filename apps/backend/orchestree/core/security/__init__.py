try:
    from app.core.security.web_integrity import verify_web_integrity, WebIntegrityError
except ImportError:
    verify_web_integrity = None
    WebIntegrityError = Exception

__all__ = ["verify_web_integrity", "WebIntegrityError"]

