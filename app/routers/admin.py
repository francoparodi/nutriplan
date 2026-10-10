from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text, cast, Date
from sqlalchemy.orm import Session

from .. import __version__, config
from ..db import get_db
from ..deps import admin_user, audit
from ..models import AppLog, AuditLog, Metric, User, UserSession
from ..security import hash_password, one_shot_password
from ..services import metrics
from .auth import USERNAME_RE, check_new_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
def overview(user: User = Depends(admin_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    since = now - timedelta(minutes=config.ONLINE_WINDOW_MIN)
    online = []
    sess = db.execute(select(UserSession, User).join(User, User.id == UserSession.user_id).where(
        UserSession.last_seen_at >= since, UserSession.expires_at > now).order_by(UserSession.last_seen_at.desc()))
    seen = set()
    for s, u in sess:
        if u.id in seen:
            continue
        seen.add(u.id)
        online.append({"username": u.username, "full_name": u.full_name, "role": u.role,
                       "last_seen": s.last_seen_at.isoformat(), "ip": s.ip})
    by_role = dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())
    inactive = dict(db.execute(select(User.role, func.count()).where(User.active.is_(False)).group_by(User.role)).all())
    midnight = datetime.combine(datetime.now(config.APP_TZ).date(), datetime.min.time(), tzinfo=config.APP_TZ)
    logins_today = db.scalar(select(func.count()).select_from(AuditLog).where(
        AuditLog.action == "login", AuditLog.ts >= midnight)) or 0
    actions_today = db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.ts >= midnight)) or 0
    try:
        dbsize = db.scalar(text("select pg_database_size(current_database())"))
    except Exception:
        dbsize = None
    return {"version": __version__, "system": metrics.system_snapshot(), "online": online,
            "online_count": len(online), "users": {"by_role": by_role, "inactive": inactive},
            "logins_today": logins_today, "actions_today": actions_today, "db_size": dbsize,
            "pending_doctors": db.scalar(select(func.count()).select_from(User).where(
                User.role == "doctor", User.active.is_(False))) or 0}


@router.get("/metrics")
def get_metrics(hours: int = 24, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    hours = max(1, min(hours, 24 * config.METRICS_RETENTION_DAYS))
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = db.scalars(select(Metric).where(Metric.ts >= since).order_by(Metric.ts)).all()
    return [{"ts": m.ts.isoformat(), "cpu": m.cpu, "mem": m.mem, "load1": m.load1, "disk": m.disk,
             "online": m.online, "requests": m.requests, "errors": m.errors} for m in rows]


@router.get("/usage")
def usage(days: int = 30, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    days = max(1, min(days, 365))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    d = cast(func.timezone(str(config.APP_TZ), AuditLog.ts), Date)
    rows = db.execute(select(d.label("d"), func.count().label("actions"),
                             func.count(func.distinct(AuditLog.user_id)).label("users"),
                             func.count().filter(AuditLog.action == "login").label("logins"))
                      .where(AuditLog.ts >= since).group_by(d).order_by(d)).all()
    return [{"date": r.d.isoformat(), "actions": r.actions, "users": r.users, "logins": r.logins} for r in rows]


@router.get("/audit")
def audit_log(limit: int = 100, offset: int = 0, username: str = "", action: str = "", q: str = "",
              date_from: date | None = None, date_to: date | None = None,
              user: User = Depends(admin_user), db: Session = Depends(get_db)):
    limit = max(1, min(limit, 500))
    cond = []
    if username:
        cond.append(AuditLog.username.ilike(f"%{username}%"))
    if action:
        cond.append(AuditLog.action == action)
    if q:
        cond.append(AuditLog.detail.ilike(f"%{q}%"))
    if date_from:
        cond.append(AuditLog.ts >= datetime.combine(date_from, datetime.min.time(), tzinfo=config.APP_TZ))
    if date_to:
        cond.append(AuditLog.ts < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=config.APP_TZ))
    total = db.scalar(select(func.count()).select_from(AuditLog).where(*cond)) or 0
    rows = db.scalars(select(AuditLog).where(*cond).order_by(AuditLog.ts.desc()).limit(limit).offset(offset))
    actions = [a for (a,) in db.execute(select(AuditLog.action).distinct().order_by(AuditLog.action))]
    return {"total": total, "actions": actions, "items": [
        {"id": r.id, "ts": r.ts.isoformat(), "username": r.username, "role": r.role, "action": r.action,
         "entity": r.entity, "detail": r.detail, "ip": r.ip} for r in rows]}


@router.get("/applog")
def app_log(limit: int = 100, offset: int = 0, level: str = "", user: User = Depends(admin_user),
            db: Session = Depends(get_db)):
    limit = max(1, min(limit, 500))
    cond = [AppLog.level == level.upper()] if level else []
    total = db.scalar(select(func.count()).select_from(AppLog).where(*cond)) or 0
    rows = db.scalars(select(AppLog).where(*cond).order_by(AppLog.ts.desc()).limit(limit).offset(offset))
    return {"total": total, "items": [{"id": r.id, "ts": r.ts.isoformat(), "level": r.level,
                                       "logger": r.logger, "message": r.message} for r in rows]}


@router.get("/users")
def users(role: str = "", q: str = "", user: User = Depends(admin_user), db: Session = Depends(get_db)):
    cond = [User.role != "admin"]
    if role in ("doctor", "patient"):
        cond.append(User.role == role)
    if q:
        cond.append(User.username.ilike(f"%{q}%") | User.full_name.ilike(f"%{q}%"))
    names = {u.id: (u.full_name or u.username) for u in db.scalars(select(User).where(User.role == "doctor"))}
    counts = dict(db.execute(select(User.doctor_id, func.count()).where(User.role == "patient")
                             .group_by(User.doctor_id)).all())
    return [{"id": str(u.id), "username": u.username, "full_name": u.full_name, "email": u.email, "role": u.role,
             "active": u.active, "doctor": names.get(u.doctor_id, ""), "patients": counts.get(u.id, 0),
             "must_change_password": u.must_change_password,
             "created_at": u.created_at.isoformat() if u.created_at else None,
             "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None}
            for u in db.scalars(select(User).where(*cond).order_by(User.role, User.full_name))]


class ActiveIn(BaseModel):
    active: bool


def _target(db, uid) -> User:
    import uuid as _u
    try:
        u = db.get(User, _u.UUID(uid))
    except ValueError:
        u = None
    if not u or u.role == "admin":
        raise HTTPException(404, "not_found")
    return u


@router.post("/users/{uid}/active")
def set_active(uid: str, body: ActiveIn, request: Request, user: User = Depends(admin_user),
               db: Session = Depends(get_db)):
    u = _target(db, uid)
    u.active = body.active
    if not body.active:
        db.execute(delete(UserSession).where(UserSession.user_id == u.id))
    audit(db, user, "user_activate" if body.active else "user_deactivate", "user", u.username, request)
    return {"active": u.active}


@router.post("/users/{uid}/reset-password")
def reset_password(uid: str, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = _target(db, uid)
    temp = one_shot_password()
    u.password_hash, u.must_change_password = hash_password(temp), True
    db.execute(delete(UserSession).where(UserSession.user_id == u.id))
    audit(db, user, "user_reset_password", "user", u.username, request)
    return {"username": u.username, "temporary_password": temp}


@router.delete("/users/{uid}")
def delete_user(uid: str, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Elimina un medico (con tutti i suoi pazienti, diete e diari) o un singolo paziente."""
    u = _target(db, uid)
    n = db.scalar(select(func.count()).select_from(User).where(User.doctor_id == u.id)) or 0
    name, role = u.username, u.role
    db.delete(u)  # le tabelle dipendenti sono eliminate a cascata dal database
    audit(db, user, "user_delete", "user", f"{role} {name}" + (f" (+{n} pazienti)" if role == "doctor" else ""), request)
    return {"ok": True, "patients_deleted": n if role == "doctor" else 0}


class DoctorIn(BaseModel):
    username: str = Field(max_length=64)
    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(default="", max_length=160)
    password: str | None = Field(default=None, max_length=200)


@router.post("/doctors")
def create_doctor(body: DoctorIn, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    uname = body.username.strip().lower()
    if not USERNAME_RE.match(uname):
        raise HTTPException(400, "invalid_username")
    if db.scalar(select(User.id).where(User.username == uname)):
        raise HTTPException(409, "username_taken")
    temp = body.password or one_shot_password()
    check_new_password(temp, uname)
    u = User(username=uname, password_hash=hash_password(temp), role="doctor", full_name=body.full_name.strip(),
             email=body.email.strip(), must_change_password=True)
    db.add(u)
    audit(db, user, "doctor_create", "user", uname, request)
    return {"id": str(u.id), "username": uname, "temporary_password": temp}
