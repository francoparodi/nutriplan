import os
from zoneinfo import ZoneInfo


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://nutriplan:nutriplan@localhost:55432/nutriplan"
)
# Cookie "Secure": mettere true quando l'app e' servita via HTTPS (consigliato in produzione).
COOKIE_SECURE = _bool("COOKIE_SECURE", False)
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "180"))
APP_TZ = ZoneInfo(os.getenv("APP_TZ", "Europe/Rome"))
# Crea gli utenti/diete dimostrativi al primo avvio (database vuoto).
SEED_DEMO = _bool("SEED_DEMO", True)
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
MAX_BACKUP_MB = int(os.getenv("MAX_BACKUP_MB", "500"))
ONLINE_WINDOW_MIN = 5
METRICS_INTERVAL_S = int(os.getenv("METRICS_INTERVAL_S", "60"))
METRICS_RETENTION_DAYS = 14
LOG_RETENTION_DAYS = int(os.getenv("LOG_RETENTION_DAYS", "180"))
# Password dell'utente "admin" creato al primo avvio (cambiarla dopo il primo accesso!).
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
