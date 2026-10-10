import uuid
from datetime import datetime, timedelta, timezone
from datetime import date as date_cls

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import AuditLog, User, UserSession, PatientProfile
from .security import token_hash

COOKIE = "nutriplan_session"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def today() -> date_cls:
    return datetime.now(config.APP_TZ).date()


def client_ip(request: Request) -> str:
    # behind Traefik the real client address is the LAST entry (earlier ones are client-supplied)
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[-1].strip()[:64]
    return (request.client.host if request.client else "")[:64]


def audit(db: Session, user: User | None, action: str, entity: str = "", detail: str = "",
          request: Request | None = None, username: str = "", commit: bool = True):
    db.add(AuditLog(
        user_id=user.id if user else None,
        username=(user.username if user else username)[:64],
        role=user.role if user else "",
        action=action, entity=entity[:64], detail=detail[:2000],
        ip=client_ip(request) if request else "",
    ))
    if commit:
        db.commit()


def current_session(request: Request, db: Session) -> UserSession | None:
    tok = request.cookies.get(COOKIE)
    if not tok:
        return None
    s = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash(tok)))
    if not s or s.expires_at < datetime.now(timezone.utc):
        return None
    return s


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    s = current_session(request, db)
    if not s:
        raise HTTPException(401, "not_authenticated")
    user = db.get(User, s.user_id)
    if not user or not user.active:
        raise HTTPException(401, "not_authenticated")
    now = datetime.now(timezone.utc)
    # aggiornamento "last seen" (al massimo ogni 30 s) e rinnovo scorrevole della sessione
    if (now - s.last_seen_at).total_seconds() > 30:
        s.last_seen_at = now
        s.expires_at = now + timedelta(days=config.SESSION_DAYS)
        db.commit()
    request.state.user = user
    request.state.session = s
    return user


def active_user(request: Request, user: User = Depends(current_user)) -> User:
    """Utente autenticato che non deve cambiare la password."""
    if user.must_change_password:
        raise HTTPException(403, "password_change_required")
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(active_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "forbidden")
        return user
    return dep


doctor_user = require_roles("doctor")
admin_user = require_roles("admin")


def parse_uuid(v: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise HTTPException(404, "not_found")


def patient_access(db: Session, user: User, pid: str, doctor_only: bool = False) -> User:
    """Restituisce il paziente se l'utente ha diritto di accedervi.

    Medico: solo i propri pazienti. Paziente: solo se stesso (e solo se doctor_only=False).
    L'admin non accede mai ai dati clinici."""
    p = db.get(User, parse_uuid(pid))
    if not p or p.role != "patient":
        raise HTTPException(404, "not_found")
    if user.role == "doctor" and p.doctor_id == user.id:
        return p
    if user.role == "patient" and p.id == user.id and not doctor_only:
        return p
    raise HTTPException(404, "not_found")


def profile_of(db: Session, p: User) -> PatientProfile:
    pr = db.get(PatientProfile, p.id)
    if not pr:
        pr = PatientProfile(patient_id=p.id, doctor_id=p.doctor_id, custom=[])
        db.add(pr)
        db.flush()
    return pr
