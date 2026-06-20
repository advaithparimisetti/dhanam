"""
Firebase Admin bootstrap + Firestore client.

Credential resolution order (first hit wins) so the SAME code runs locally and
on Render without edits:
  1. FIREBASE_SERVICE_ACCOUNT_B64  — base64 of the service-account JSON (production)
  2. GOOGLE_APPLICATION_CREDENTIALS — filesystem path to the JSON (explicit)
  3. backend/firebase-adminsdk.json — conventional local dev file (git-ignored)

Initialization is lazy and idempotent: nothing touches the network at import
time, so the API still boots (and non-auth routes keep working) even if
credentials are absent — calls that need Firestore raise a clean 503 instead.
"""

import os
import json
import base64
import threading

import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth

_db = None
_lock = threading.Lock()


class FirebaseUnavailable(RuntimeError):
    """Raised when Firestore is requested but no credentials are configured."""


def _load_credentials():
    # 1) Base64 env (Render / Vercel-safe — JSON never lands on disk or in git)
    b64 = os.environ.get("FIREBASE_SERVICE_ACCOUNT_B64", "").strip()
    if b64:
        info = json.loads(base64.b64decode(b64).decode("utf-8"))
        return credentials.Certificate(info)

    # 2) Explicit path env
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if path and os.path.exists(path):
        return credentials.Certificate(path)

    # 3) Conventional local file at backend/firebase-adminsdk.json
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local = os.path.join(backend_dir, "firebase-adminsdk.json")
    if os.path.exists(local):
        return credentials.Certificate(local)

    return None


def init_firebase():
    """Idempotently initialize the Admin app + Firestore client. Returns the
    Firestore client, or raises FirebaseUnavailable if no credentials exist."""
    global _db
    if _db is not None:
        return _db
    with _lock:
        if _db is not None:
            return _db
        if not firebase_admin._apps:
            cred = _load_credentials()
            if cred is None:
                raise FirebaseUnavailable(
                    "Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_B64, "
                    "GOOGLE_APPLICATION_CREDENTIALS, or place firebase-adminsdk.json in backend/."
                )
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
        return _db


def get_db():
    return init_firebase()


def verify_id_token(id_token: str) -> dict:
    """Verify a Firebase-issued ID token (raises on invalid/expired)."""
    init_firebase()  # ensures the Admin app exists before auth calls
    return fb_auth.verify_id_token(id_token)
