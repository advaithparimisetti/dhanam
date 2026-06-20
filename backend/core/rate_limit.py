"""
Shared rate limiter (slowapi) — DDoS / spam protection for public endpoints.

Fault-tolerant by design: if slowapi is unavailable for any reason, we fall back
to a no-op limiter so the live Render server keeps serving instead of crashing on
import. Behind Render's proxy we key on the first X-Forwarded-For hop (the real
client IP) rather than the proxy address.
"""

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    def _client_key(request):
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()      # real client IP behind the proxy
        return get_remote_address(request)

    # headers_enabled stays OFF: header injection requires endpoints to expose a
    # `Response` param, which would raise on our model-returning routes. Limiting
    # still fully works (429 on exceed); we just omit the informational headers.
    limiter = Limiter(key_func=_client_key, default_limits=[])
    HAS_SLOWAPI = True

except Exception:  # pragma: no cover — missing/broken dep must not take down the API
    class _NoopLimiter:
        """Stand-in so `@limiter.limit(...)` decorators remain valid no-ops."""
        def limit(self, *args, **kwargs):
            def decorator(fn):
                return fn
            return decorator

    limiter = _NoopLimiter()
    HAS_SLOWAPI = False
