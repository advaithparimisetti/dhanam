"""
Firestore repository for users + watchlists.

Schema (per the Phase 2 architecture):
  users/{uid}                         → profile
  watchlists/{uid}                    → { uid, updatedAt, count }
  watchlists/{uid}/items/{TICKER}     → saved stock + frozen valuation snapshot
"""

from firebase_admin import firestore
from services.firebase_client import get_db


def upsert_user(user: dict) -> dict:
    """Create-or-update the user profile on login. `user` is the decoded token dict."""
    db = get_db()
    ref = db.collection("users").document(user["uid"])
    existing = ref.get()

    payload = {
        "uid": user["uid"],
        "email": user.get("email"),
        "displayName": user.get("name"),
        "photoURL": user.get("picture"),
        "provider": user.get("provider"),
        "lastLoginAt": firestore.SERVER_TIMESTAMP,
    }
    if not existing.exists:
        payload["createdAt"] = firestore.SERVER_TIMESTAMP
        payload["plan"] = "free"

    ref.set(payload, merge=True)
    return ref.get().to_dict()          # re-read so timestamps are concrete (JSON-safe)


def get_watchlist(uid: str) -> list:
    """Return all saved items for a user, newest first."""
    db = get_db()
    items_ref = db.collection("watchlists").document(uid).collection("items")
    docs = [d.to_dict() for d in items_ref.stream()]
    # Sort in-process (avoids requiring a Firestore index / failing on null addedAt).
    docs.sort(key=lambda x: (x.get("addedAt") is not None, x.get("addedAt")), reverse=True)
    return docs


def add_to_watchlist(uid: str, item: dict) -> dict:
    """Upsert a ticker (doc id == TICKER) with its valuation snapshot, and refresh
    the parent watchlist counter."""
    db = get_db()
    wl_ref = db.collection("watchlists").document(uid)
    ticker = item["ticker"].upper()
    item_ref = wl_ref.collection("items").document(ticker)

    item_ref.set({
        "ticker": ticker,
        "exchange": item.get("exchange"),
        "currency": item.get("currency", "USD"),
        "note": item.get("note", ""),
        "snapshot": item.get("snapshot"),
        "addedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    count = sum(1 for _ in wl_ref.collection("items").stream())
    wl_ref.set({"uid": uid, "count": count, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    return item_ref.get().to_dict()


def remove_from_watchlist(uid: str, ticker: str) -> dict:
    db = get_db()
    wl_ref = db.collection("watchlists").document(uid)
    wl_ref.collection("items").document(ticker.upper()).delete()
    count = sum(1 for _ in wl_ref.collection("items").stream())
    wl_ref.set({"count": count, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    return {"removed": ticker.upper(), "count": count}
