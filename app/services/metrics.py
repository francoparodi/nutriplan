import logging
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone

import psutil
from sqlalchemy import delete, func, select

from .. import config
from ..models import AppLog, AuditLog, Metric, UserSession

_lock = threading.Lock()
_req = {"n": 0, "err": 0}
_logbuf: deque = deque(maxlen=2000)
START = time.time()


def count_request(status: int):
    with _lock:
        _req["n"] += 1
        if status >= 500:
            _req["err"] += 1


class BufferHandler(logging.Handler):
    """Accumula i log WARNING+ in memoria; vengono scritti a database dal campionatore."""

    def emit(self, record):
        try:
            _logbuf.append((datetime.now(timezone.utc), record.levelname, record.name[:80],
                            self.format(record)[:4000]))
        except Exception:
            pass


def install_log_handler():
    h = BufferHandler(level=logging.WARNING)
    h.setFormatter(logging.Formatter("%(message)s"))
    for name in ("", "uvicorn", "uvicorn.error", "nutriplan"):
        lg = logging.getLogger(name)
        if not any(isinstance(x, BufferHandler) for x in lg.handlers):
            lg.addHandler(h)
            if name == "nutriplan":
                lg.setLevel(logging.INFO)


def system_snapshot() -> dict:
    vm = psutil.virtual_memory()
    try:
        load = psutil.getloadavg()
    except (AttributeError, OSError):
        load = (0, 0, 0)
    proc = psutil.Process()
    return {"cpu": psutil.cpu_percent(interval=None), "mem": vm.percent, "mem_total": vm.total,
            "mem_used": vm.used, "load1": load[0], "load5": load[1], "load15": load[2],
            "disk": psutil.disk_usage("/").percent, "cpus": psutil.cpu_count(),
            "proc_mem": proc.memory_info().rss, "uptime_s": int(time.time() - START)}


def online_count(db, minutes: int = config.ONLINE_WINDOW_MIN) -> int:
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return db.scalar(select(func.count(func.distinct(UserSession.user_id))).where(
        UserSession.last_seen_at >= since, UserSession.expires_at > datetime.now(timezone.utc))) or 0


def sample(SessionLocal):
    snap = system_snapshot()
    with _lock:
        n, err = _req["n"], _req["err"]
        _req["n"] = _req["err"] = 0
    with SessionLocal() as db:
        db.add(Metric(cpu=snap["cpu"], mem=snap["mem"], load1=snap["load1"], disk=snap["disk"],
                      online=online_count(db), requests=n, errors=err))
        while _logbuf:
            ts, lvl, lg, msg = _logbuf.popleft()
            db.add(AppLog(ts=ts, level=lvl, logger=lg, message=msg))
        now = datetime.now(timezone.utc)
        db.execute(delete(Metric).where(Metric.ts < now - timedelta(days=config.METRICS_RETENTION_DAYS)))
        db.execute(delete(AppLog).where(AppLog.ts < now - timedelta(days=config.LOG_RETENTION_DAYS)))
        db.execute(delete(AuditLog).where(AuditLog.ts < now - timedelta(days=config.LOG_RETENTION_DAYS)))
        db.execute(delete(UserSession).where(UserSession.expires_at < now))
        db.commit()
