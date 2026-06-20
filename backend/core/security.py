"""
Authentication = Firebase ID-token verification.

The frontend (Firebase JS SDK) is the source of identity; it sends the Google-
signed ID token as `Authorization: Bearer <token>`. The backend verifies it with
the Admin SDK and resolves the caller's UID/profile. This replaces the previous
local HS256 session-token scheme.
"""

from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from firebase_admin import auth as fb_auth
from services.firebase_client import verify_id_token, FirebaseUnavailable

bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> dict:
    """FastAPI dependency → returns the verified user, or raises 401/503.

    Use on any protected route:  `user: dict = Depends(get_current_user)`
    """
    token = credentials.credentials
    try:
        decoded = verify_id_token(token)
    except FirebaseUnavailable:
        raise HTTPException(status_code=503, detail="Authentication backend not configured.")
    except fb_auth.CertificateFetchError:
        # Transient: Google public-key fetch failed. Signal retry, don't 401.
        raise HTTPException(status_code=503, detail="Auth temporarily unavailable. Retry shortly.")
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except (fb_auth.RevokedIdTokenError, fb_auth.InvalidIdTokenError):
        raise HTTPException(status_code=401, detail="Invalid authentication token.")
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials.")

    return {
        "uid": decoded["uid"],
        "email": decoded.get("email"),
        "name": decoded.get("name"),
        "picture": decoded.get("picture"),
        "provider": decoded.get("firebase", {}).get("sign_in_provider"),
    }
