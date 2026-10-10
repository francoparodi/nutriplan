import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import COOKIE, audit, client_ip, current_user, active_user, current_session
from ..models import PatientProfile, User, UserPhoto, UserSession
from ..security import (CONTACT_FIELDS, MIN_PASSWORD_LEN, clean_contact, hash_password, image_mime, new_token, throttle, token_hash,
                        verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$")
DUMMY_HASH = hash_password("dummy-password-for-timing")


def user_dict(u: User, db: Session | None = None) -> dict:
    d = {"id": str(u.id), "username": u.username, "role": u.role, "full_name": u.full_name,
         "email": u.email, "lang": u.lang, "theme": u.theme,
         "must_change_password": u.must_change_password,
         "contacts": {f: getattr(u, f) for f in CONTACT_FIELDS}}
    if u.role == "patient" and u.doctor_id and db:
        doc = db.get(User, u.doctor_id)
        d["doctor_name"] = doc.full_name or doc.username if doc else ""
        d["doctor_contacts"] = {f: getattr(doc, f) for f in CONTACT_FIELDS} if doc else {}
        pr = db.get(PatientProfile, u.id)
        d["has_photo"] = bool(pr and pr.photo_mime)
    if u.role == "doctor" and db:
        ph = db.get(UserPhoto, u.id)
        d["has_photo"] = bool(ph and ph.mime)
    return d


def check_new_password(pw: str, username: str):
    if len(pw) < MIN_PASSWORD_LEN:
        raise HTTPException(400, "password_too_short")
    if pw.lower() == username.lower():
        raise HTTPException(400, "password_same_as_username")


class LoginIn(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=200)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    uname = body.username.strip().lower()
    key = f"{client_ip(request)}|{uname}"
    if throttle.blocked(key):
        raise HTTPException(429, "too_many_attempts")
    u = db.scalar(select(User).where(User.username == uname))
    ok = verify_password(body.password, u.password_hash if u else DUMMY_HASH)
    if not u or not ok:
        throttle.fail(key)
        audit(db, None, "login_failed", "user", uname, request, username=uname[:64])
        raise HTTPException(401, "invalid_credentials")
    if not u.active:
        audit(db, u, "login_blocked", "user", "utente disattivato", request)
        raise HTTPException(403, "account_disabled")
    throttle.reset(key)
    tok = new_token()
    now = datetime.now(timezone.utc)
    db.add(UserSession(user_id=u.id, token_hash=token_hash(tok), created_at=now, last_seen_at=now,
                       expires_at=now + timedelta(days=config.SESSION_DAYS), ip=client_ip(request),
                       user_agent=request.headers.get("user-agent", "")[:255]))
    u.last_login_at = now
    # pulizia sessioni scadute di questo utente
    db.execute(delete(UserSession).where(UserSession.user_id == u.id, UserSession.expires_at < now))
    audit(db, u, "login", "user", "", request, commit=False)
    db.commit()
    response.set_cookie(COOKIE, tok, max_age=config.SESSION_DAYS * 86400, httponly=True,
                        samesite="lax", secure=config.COOKIE_SECURE, path="/")
    return user_dict(u, db)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    s = current_session(request, db)
    if s:
        u = db.get(User, s.user_id)
        db.delete(s)
        if u:
            audit(db, u, "logout", "user", "", request, commit=False)
        db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_dict(user, db)


class PwIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


@router.post("/change-password")
def change_password(body: PwIn, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "wrong_password")
    check_new_password(body.new_password, user.username)
    if body.new_password == body.current_password:
        raise HTTPException(400, "password_unchanged")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.now(timezone.utc)
    cur = request.state.session
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != cur.id))
    audit(db, user, "change_password", "user", "", request)
    return {"ok": True}


class PrefIn(BaseModel):
    lang: str | None = Field(default=None, pattern="^(it|en)$")
    theme: str | None = Field(default=None, pattern="^(light|dark)$")
    full_name: str | None = Field(default=None, max_length=160)
    email: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=120)
    whatsapp: str | None = Field(default=None, max_length=120)
    telegram: str | None = Field(default=None, max_length=120)
    instagram: str | None = Field(default=None, max_length=200)
    facebook: str | None = Field(default=None, max_length=200)
    website: str | None = Field(default=None, max_length=200)


@router.put("/preferences")
def preferences(body: PrefIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.lang:
        user.lang = body.lang
    if body.theme:
        user.theme = body.theme
    for f in CONTACT_FIELDS:
        v = getattr(body, f)
        if v is not None:
            try:
                setattr(user, f, clean_contact(f, v))
            except ValueError:
                raise HTTPException(400, "invalid_contact")
    if body.email is not None:
        user.email = body.email.strip()
    if body.full_name is not None and user.role != "patient" and body.full_name.strip():
        user.full_name = body.full_name.strip()
    db.commit()
    return user_dict(user, db)


class RegisterIn(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=200)
    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(default="", max_length=160)


@router.post("/register")
def register_doctor(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    """Registrazione di un nuovo medico: l'account resta disattivato finche' l'amministratore non lo attiva."""
    ip = client_ip(request)
    if throttle.blocked("reg|" + ip):
        raise HTTPException(429, "too_many_attempts")
    throttle.fail("reg|" + ip)
    uname = body.username.strip().lower()
    if not USERNAME_RE.match(uname):
        raise HTTPException(400, "invalid_username")
    check_new_password(body.password, uname)
    if db.scalar(select(User.id).where(User.username == uname)):
        raise HTTPException(409, "username_taken")
    u = User(username=uname, password_hash=hash_password(body.password), role="doctor",
             full_name=body.full_name.strip(), email=body.email.strip(), active=False)
    db.add(u)
    db.flush()
    audit(db, u, "register_doctor", "user", "in attesa di attivazione", request)
    return {"ok": True, "pending_activation": True}


# ---- foto profilo del medico (la foto del paziente e' gestita in /api/patients/{id}/photo)
MAX_PHOTO = 3 * 1024 * 1024


def _doctor(user: User = Depends(active_user)) -> User:
    if user.role != "doctor":
        raise HTTPException(403, "forbidden")
    return user


@router.put("/photo")
def put_photo(request: Request, file: UploadFile = File(...), user: User = Depends(_doctor),
              db: Session = Depends(get_db)):
    data = file.file.read(MAX_PHOTO + 1)
    if len(data) > MAX_PHOTO:
        raise HTTPException(413, "file_too_large")
    mime = image_mime(data)
    if not mime:
        raise HTTPException(400, "invalid_image")
    ph = db.get(UserPhoto, user.id)
    if not ph:
        ph = UserPhoto(user_id=user.id, doctor_id=user.id)
        db.add(ph)
    ph.mime, ph.data = mime, data
    audit(db, user, "photo_set", "user", user.username, request)
    return {"has_photo": True}


@router.get("/photo")
def get_photo(user: User = Depends(_doctor), db: Session = Depends(get_db)):
    ph = db.get(UserPhoto, user.id)
    if not ph or not ph.mime:
        raise HTTPException(404, "not_found")
    return Response(bytes(ph.data), media_type=ph.mime, headers={
        "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"})


@router.delete("/photo")
def delete_photo(request: Request, user: User = Depends(_doctor), db: Session = Depends(get_db)):
    ph = db.get(UserPhoto, user.id)
    if ph:
        db.delete(ph)
    audit(db, user, "photo_delete", "user", user.username, request)
    return {"has_photo": False}
