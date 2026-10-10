import hashlib
import secrets
import string
import time
from collections import defaultdict, deque

import bcrypt

MIN_PASSWORD_LEN = 8


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def one_shot_password(n: int = 10) -> str:
    alphabet = "".join(c for c in string.ascii_letters + string.digits if c not in "0OoIl1")
    return "".join(secrets.choice(alphabet) for _ in range(n))


class LoginThrottle:
    """Blocca temporaneamente dopo troppi tentativi falliti (per utente+IP), in memoria."""

    def __init__(self, max_fail=6, window=600):
        self.max_fail, self.window = max_fail, window
        self.fails: dict[str, deque] = defaultdict(deque)

    def _prune(self, key):
        q, now = self.fails[key], time.time()
        while q and q[0] < now - self.window:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        return len(self._prune(key)) >= self.max_fail

    def fail(self, key: str):
        self._prune(key).append(time.time())

    def reset(self, key: str):
        self.fails.pop(key, None)


throttle = LoginThrottle()


_IMG_MAGIC = [(b"\xff\xd8\xff", "image/jpeg"), (b"\x89PNG\r\n\x1a\n", "image/png")]


def image_mime(data: bytes) -> str | None:
    """Tipo immagine dedotto dal contenuto (il Content-Type del client non e' affidabile)."""
    for sig, mime in _IMG_MAGIC:
        if data.startswith(sig):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


import re as _re

CONTACT_FIELDS = ("phone", "whatsapp", "telegram", "instagram", "facebook", "website")
_SCHEME = _re.compile(r"^[a-z][a-z0-9+.\-]*:", _re.I)
_HTTP = _re.compile(r"^https?://", _re.I)


def clean_contact(field: str, value: str | None) -> str:
    """Normalises an optional contact value. URL-like fields only accept http(s) links (no javascript: etc.)."""
    v = (value or "").strip()
    if not v:
        return ""
    if len(v) > 200:
        raise ValueError("too_long")
    if field in ("website", "instagram", "facebook"):
        if _SCHEME.match(v) and not _HTTP.match(v):
            raise ValueError("invalid_contact")
        if field == "website" and not _HTTP.match(v):
            v = "https://" + v
    return v
