import re
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import (active_user, audit, doctor_user, patient_access, profile_of, today, parse_uuid)
from ..models import (Diet, MealLog, PatientDocument, PatientProfile, User, UserSession, Visit, Weight)
from ..security import CONTACT_FIELDS, clean_contact, hash_password, image_mime, one_shot_password
from ..services import day as daysvc
from .auth import USERNAME_RE

router = APIRouter(prefix="/api/patients", tags=["patients"])

PROFILE_FIELDS = ["birth_date", "sex", "height_cm", "goal_weight_kg", "address", "tax_code",
                  "occupation", "activity_level", "allergies", "intolerances", "pathologies",
                  "medications", "family_history", "notes", "custom"]


class CustomField(BaseModel):
    label: str = Field(max_length=80)
    value: str = Field(default="", max_length=500)


class ProfileIn(BaseModel):
    birth_date: date | None = None
    sex: str = Field(default="", max_length=10)
    height_cm: float | None = Field(default=None, ge=30, le=260)
    goal_weight_kg: float | None = Field(default=None, ge=20, le=400)
    address: str = Field(default="", max_length=255)
    tax_code: str = Field(default="", max_length=32)
    occupation: str = Field(default="", max_length=120)
    activity_level: str = Field(default="", max_length=60)
    allergies: str = ""
    intolerances: str = ""
    pathologies: str = ""
    medications: str = ""
    family_history: str = ""
    notes: str = ""
    custom: list[CustomField] = []


class PatientIn(ProfileIn):
    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=120)
    whatsapp: str = Field(default="", max_length=120)
    telegram: str = Field(default="", max_length=120)
    instagram: str = Field(default="", max_length=200)
    facebook: str = Field(default="", max_length=200)
    website: str = Field(default="", max_length=200)
    username: str | None = None
    password: str | None = Field(default=None, max_length=200)


def patient_dict(db: Session, p: User, full: bool = True) -> dict:
    pr = profile_of(db, p)
    d = {"id": str(p.id), "username": p.username, "full_name": p.full_name, "email": p.email,
         "active": p.active, "has_photo": bool(pr.photo_mime), "must_change_password": p.must_change_password,
         "created_at": p.created_at.isoformat() if p.created_at else None,
         "last_login_at": p.last_login_at.isoformat() if p.last_login_at else None}
    for f in PROFILE_FIELDS:
        v = getattr(pr, f)
        d[f] = v.isoformat() if isinstance(v, date) else v
    for f in CONTACT_FIELDS:
        d[f] = getattr(p, f)
    return d


def _apply_contacts(u: User, data: PatientIn):
    for f in CONTACT_FIELDS:
        try:
            setattr(u, f, clean_contact(f, getattr(data, f)))
        except ValueError:
            raise HTTPException(400, "invalid_contact")


def _apply_profile(pr: PatientProfile, data: ProfileIn):
    for f in PROFILE_FIELDS:
        v = getattr(data, f)
        if f == "custom":
            v = [c.model_dump() for c in data.custom if c.label.strip()]
        setattr(pr, f, v)


# ------------------------------------------------------------------ elenco / creazione (medico)
@router.get("")
def list_patients(user: User = Depends(doctor_user), db: Session = Depends(get_db)):
    t = today()
    out = []
    for p in db.scalars(select(User).where(User.role == "patient", User.doctor_id == user.id)
                        .order_by(User.full_name)):
        prog = daysvc.progress(db, p, t - timedelta(days=6), t)
        lastw = db.scalar(select(Weight).where(Weight.patient_id == p.id).order_by(Weight.date.desc()).limit(1))
        miss = daysvc.missing_days(db, p, t - timedelta(days=1), window_days=30)
        diet = daysvc.effective_diet(db, p.id, t)
        out.append({"id": str(p.id), "username": p.username, "full_name": p.full_name, "active": p.active,
                    "has_photo": bool(profile_of(db, p).photo_mime),
                    "allergies": profile_of(db, p).allergies, "intolerances": profile_of(db, p).intolerances,
                    "pathologies": profile_of(db, p).pathologies,
                    "must_change_password": p.must_change_password,
                    "last_login_at": p.last_login_at.isoformat() if p.last_login_at else None,
                    "diet": diet.name if diet else None,
                    "last_weight": float(lastw.kg) if lastw else None,
                    "last_weight_date": lastw.date.isoformat() if lastw else None,
                    "adherence_7d": prog["summary"]["avg_adherence"],
                    "off_plan_7d": prog["summary"]["off_plan"],
                    "missing_days": len(miss)})
    return out


@router.post("")
def create_patient(body: PatientIn, request: Request, user: User = Depends(doctor_user),
                   db: Session = Depends(get_db)):
    uname = (body.username or "").strip().lower()
    if not uname:  # username derivato dal nome
        base = re.sub(r"[^a-z0-9]+", ".", body.full_name.lower()).strip(".")[:24] or "paziente"
        uname, n = base, 1
        while db.scalar(select(User.id).where(User.username == uname)):
            n += 1
            uname = f"{base}{n}"
    if not USERNAME_RE.match(uname):
        raise HTTPException(400, "invalid_username")
    if db.scalar(select(User.id).where(User.username == uname)):
        raise HTTPException(409, "username_taken")
    temp = body.password or one_shot_password()
    p = User(username=uname, password_hash=hash_password(temp), role="patient", full_name=body.full_name.strip(),
             email=body.email.strip(), doctor_id=user.id, must_change_password=True, lang=user.lang)
    db.add(p)
    db.flush()
    pr = PatientProfile(patient_id=p.id, doctor_id=user.id, custom=[])
    db.add(pr)
    _apply_profile(pr, body)
    _apply_contacts(p, body)
    audit(db, user, "patient_create", "patient", f"{uname}", request)
    return {**patient_dict(db, p), "temporary_password": temp}


# ------------------------------------------------------------------ scheda
@router.get("/{pid}")
def get_patient(pid: str, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    d = patient_dict(db, p)
    if user.role == "patient":  # il paziente non vede le note riservate del medico
        d["notes"] = ""
    return d


@router.put("/{pid}")
def update_patient(pid: str, body: PatientIn, request: Request, user: User = Depends(doctor_user),
                   db: Session = Depends(get_db)):
    p = patient_access(db, user, pid, doctor_only=True)
    p.full_name, p.email = body.full_name.strip(), body.email.strip()
    _apply_contacts(p, body)
    _apply_profile(profile_of(db, p), body)
    audit(db, user, "patient_update", "patient", p.username, request)
    return patient_dict(db, p)


class HealthIn(BaseModel):
    allergies: str = Field(default="", max_length=3000)
    intolerances: str = Field(default="", max_length=3000)
    pathologies: str = Field(default="", max_length=3000)


@router.put("/{pid}/health")
def report_health(pid: str, body: HealthIn, request: Request, user: User = Depends(active_user),
                  db: Session = Depends(get_db)):
    """The patient reports their own allergies / intolerances / conditions (the doctor is warned when
    preparing the diet). Doctors edit the same fields from the full patient record."""
    if user.role != "patient":
        raise HTTPException(403, "forbidden")
    p = patient_access(db, user, pid)
    pr = profile_of(db, p)
    pr.allergies, pr.intolerances, pr.pathologies = body.allergies.strip(), body.intolerances.strip(), body.pathologies.strip()
    audit(db, user, "health_report", "patient", p.username, request)
    return {"allergies": pr.allergies, "intolerances": pr.intolerances, "pathologies": pr.pathologies}


@router.delete("/{pid}")
def delete_patient(pid: str, request: Request, user: User = Depends(doctor_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid, doctor_only=True)
    name = p.username
    db.delete(p)
    audit(db, user, "patient_delete", "patient", name, request)
    return {"ok": True}


@router.post("/{pid}/reset-password")
def reset_password(pid: str, request: Request, user: User = Depends(doctor_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid, doctor_only=True)
    temp = one_shot_password()
    p.password_hash = hash_password(temp)
    p.must_change_password = True
    db.execute(delete(UserSession).where(UserSession.user_id == p.id))
    audit(db, user, "patient_reset_password", "patient", p.username, request)
    return {"temporary_password": temp, "username": p.username}


class ActiveIn(BaseModel):
    active: bool


@router.post("/{pid}/active")
def set_active(pid: str, body: ActiveIn, request: Request, user: User = Depends(doctor_user),
               db: Session = Depends(get_db)):
    p = patient_access(db, user, pid, doctor_only=True)
    p.active = body.active
    if not body.active:
        db.execute(delete(UserSession).where(UserSession.user_id == p.id))
    audit(db, user, "patient_activate" if body.active else "patient_deactivate", "patient", p.username, request)
    return {"active": p.active}


# ------------------------------------------------------------------ diete assegnate
@router.get("/{pid}/diets")
def patient_diets(pid: str, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    ds = db.scalars(select(Diet).where(Diet.patient_id == p.id)
                    .order_by(Diet.start_date.desc().nullslast(), Diet.created_at.desc()))
    t = today()
    return [{"id": str(d.id), "name": d.name, "status": d.status,
             "start_date": d.start_date.isoformat() if d.start_date else None,
             "end_date": d.end_date.isoformat() if d.end_date else None,
             "current": d.status == "active" and (d.start_date is None or d.start_date <= t)
             and (d.end_date is None or d.end_date >= t)} for d in ds]


# ------------------------------------------------------------------ diario
@router.get("/{pid}/day/{d}")
def get_day(pid: str, d: date, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    return daysvc.build_day(db, p, d)


class SubIn(BaseModel):
    item_id: str
    member_id: str


class ExtraIn(BaseModel):
    item_id: str
    count: int = Field(default=1, ge=1, le=20)


class QtyIn(BaseModel):
    item_id: str
    qty: float = Field(gt=0, le=100000)


class LogIn(BaseModel):
    status: str = Field(pattern="^(done|off_plan|skipped)$")
    option_id: str | None = None
    substitutions: list[SubIn] = []
    extras: list[ExtraIn] = []
    quantities: list[QtyIn] = []  # actual quantity eaten for foods whose amount differs from the plan
    free_text: str = Field(default="", max_length=2000)
    note: str = Field(default="", max_length=2000)


@router.put("/{pid}/day/{d}/meals/{meal_id}")
def put_log(pid: str, d: date, meal_id: str, body: LogIn, request: Request,
            user: User = Depends(active_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(403, "forbidden")
    p = patient_access(db, user, pid)
    if d > today() + timedelta(days=1):
        raise HTTPException(400, "future_date")
    day = daysvc.build_day(db, p, d)
    meal = next((m for m in day["meals"] if m["id"] == meal_id), None)
    if not meal:
        raise HTTPException(404, "meal_not_found")
    opt_id, label, subs, extras, adjustments = None, "", [], [], []
    free = body.free_text.strip()
    if body.status == "off_plan" and not free:
        raise HTTPException(400, "free_text_required")
    if body.status == "done" and meal["kind"] == "extras":
        items = {i["id"]: i for o in meal["options"] for i in o["items"]}
        for e in body.extras:
            it = items.get(e.item_id)
            if not it:
                raise HTTPException(400, "invalid_item")
            extras.append({"item_id": it["id"], "name": it["name"], "qty_text": it["display"], "count": e.count})
        if not extras and not free:
            raise HTTPException(400, "nothing_selected")
    elif body.status == "done":
        choices = [o for o in meal["options"] if o["kind"] == "choice"]
        opt = next((o for o in choices if o["id"] == body.option_id), None)
        if body.option_id and not opt:
            raise HTTPException(400, "invalid_option")
        if not opt and len(choices) == 1:
            opt = choices[0]
        if not opt and choices:
            raise HTTPException(400, "option_required")
        parts = []
        if opt:
            opt_id = opt["id"]
            parts.append(opt["summary"])
        parts += [o["summary"] for o in meal["options"] if o["kind"] == "addon"]
        label = " + ".join(x for x in parts if x)
        pool = {}
        for o in meal["options"]:
            if o["kind"] == "addon" or (opt and o["id"] == opt["id"]):
                for it in o["items"]:
                    pool[it["id"]] = it
        for s in body.substitutions:
            it = pool.get(s.item_id)
            sub = next((x for x in it["substitutes"] if x["id"] == s.member_id), None) if it else None
            if not sub:
                raise HTTPException(400, "invalid_substitution")
            subs.append({"item_id": it["id"], "item_name": it["name"], "item_qty": it["display"],
                         "member_id": sub["id"], "name": sub["name"], "qty_text": sub["qty_text"]})
        substituted = {x["item_id"] for x in subs}
        for qn in body.quantities:
            it = pool.get(qn.item_id)
            if not it or it["qty"] is None:
                raise HTTPException(400, "invalid_item")
            if qn.item_id in substituted or abs(qn.qty - it["qty"]) < 1e-9:
                continue
            if qn.qty > it["qty"] * 10:
                raise HTTPException(400, "invalid_quantity")
            adjustments.append({"item_id": it["id"], "item_name": it["name"], "unit": it["unit"],
                                "planned": it["qty"], "actual": qn.qty})
    lg = db.scalar(select(MealLog).where(MealLog.patient_id == p.id, MealLog.date == d,
                                         MealLog.meal_id == uuid.UUID(meal_id)))
    if not lg:
        lg = MealLog(patient_id=p.id, doctor_id=p.doctor_id, date=d, meal_id=uuid.UUID(meal_id))
        db.add(lg)
    lg.diet_id = uuid.UUID(day["diet"]["id"])
    lg.meal_name = meal["name"]
    lg.status, lg.option_id, lg.option_label = body.status, uuid.UUID(opt_id) if opt_id else None, label
    lg.substitutions, lg.extras, lg.free_text, lg.note = subs, extras, free, body.note.strip()
    lg.adjustments = adjustments
    lg.updated_at = datetime.now(timezone.utc)
    audit(db, user, "log_meal", "meal_log", f"{d} {meal['name']} [{body.status}]", request)
    return daysvc.build_day(db, p, d)


@router.delete("/{pid}/day/{d}/meals/{meal_id}")
def delete_log(pid: str, d: date, meal_id: str, request: Request, user: User = Depends(active_user),
               db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(403, "forbidden")
    p = patient_access(db, user, pid)
    db.execute(delete(MealLog).where(MealLog.patient_id == p.id, MealLog.date == d,
                                     MealLog.meal_id == parse_uuid(meal_id)))
    audit(db, user, "unlog_meal", "meal_log", f"{d}", request)
    return daysvc.build_day(db, p, d)


@router.get("/{pid}/warnings")
def warnings(pid: str, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    days = daysvc.missing_days(db, p, today() - timedelta(days=1))
    return {"count": len(days), "days": days}


@router.get("/{pid}/progress")
def get_progress(pid: str, date_from: date | None = None, date_to: date | None = None,
                 user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    b = date_to or today()
    a = date_from or (b - timedelta(days=89))
    if a > b or (b - a).days > 1100:
        raise HTTPException(400, "invalid_range")
    pr = profile_of(db, p)
    out = daysvc.progress(db, p, a, b)
    out["goal_weight"] = pr.goal_weight_kg
    out["height_cm"] = pr.height_cm
    return out


# ------------------------------------------------------------------ peso
class WeightIn(BaseModel):
    kg: float = Field(ge=20, le=400)
    note: str = Field(default="", max_length=255)


@router.get("/{pid}/weights")
def list_weights(pid: str, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    return [{"date": w.date.isoformat(), "kg": float(w.kg), "note": w.note} for w in db.scalars(
        select(Weight).where(Weight.patient_id == p.id).order_by(Weight.date))]


@router.put("/{pid}/weights/{d}")
def put_weight(pid: str, d: date, body: WeightIn, request: Request, user: User = Depends(active_user),
               db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    if d > today() + timedelta(days=1):
        raise HTTPException(400, "future_date")
    w = db.scalar(select(Weight).where(Weight.patient_id == p.id, Weight.date == d))
    if not w:
        w = Weight(patient_id=p.id, doctor_id=p.doctor_id, date=d)
        db.add(w)
    w.kg, w.note = round(body.kg, 2), body.note.strip()
    audit(db, user, "weight_set", "weight", f"{d} {body.kg}", request)
    return {"date": d.isoformat(), "kg": body.kg, "note": w.note}


@router.delete("/{pid}/weights/{d}")
def delete_weight(pid: str, d: date, request: Request, user: User = Depends(active_user),
                  db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    db.execute(delete(Weight).where(Weight.patient_id == p.id, Weight.date == d))
    audit(db, user, "weight_delete", "weight", f"{d}", request)
    return {"ok": True}


# ------------------------------------------------------------------ documenti
SAFE_INLINE = {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"}


def _doc_dict(x: PatientDocument) -> dict:
    return {"id": str(x.id), "kind": x.kind, "title": x.title, "filename": x.filename, "mime": x.mime,
            "size": x.size, "notes": x.notes, "visible_to_patient": x.visible_to_patient,
            "uploaded_by": x.uploaded_by,
            "visit_id": str(x.visit_id) if x.visit_id else None,
            "created_at": x.created_at.isoformat()}


@router.get("/{pid}/documents")
def list_documents(pid: str, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    q = select(PatientDocument).where(PatientDocument.patient_id == p.id).order_by(PatientDocument.created_at.desc())
    if user.role == "patient":
        q = q.where(PatientDocument.visible_to_patient.is_(True) | (PatientDocument.uploaded_by == "patient"))
    return [_doc_dict(x) for x in db.scalars(q)]


@router.post("/{pid}/documents")
def upload_document(pid: str, request: Request, file: UploadFile = File(...),
                          kind: str = Form("document"), title: str = Form(""), notes: str = Form(""),
                          visible_to_patient: bool = Form(False), visit_id: str = Form(""),
                          user: User = Depends(active_user), db: Session = Depends(get_db)):
    """Il medico carica per il paziente; il paziente puo' caricare i propri documenti (visibili al medico)."""
    p = patient_access(db, user, pid)
    by_patient = user.role == "patient"
    vid = None
    if visit_id and not by_patient:
        v = db.get(Visit, parse_uuid(visit_id))
        if not v or v.patient_id != p.id:
            raise HTTPException(400, "invalid_visit")
        vid, visible_to_patient = v.id, True  # gli allegati di una visita sono visibili al paziente
    if by_patient:
        visible_to_patient, kind = True, (kind if kind in ("document", "photo") else "document")
    data = file.file.read(config.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, "file_too_large")
    if not data:
        raise HTTPException(400, "empty_file")
    if kind not in ("document", "photo", "recipe"):
        kind = "document"
    fname = re.sub(r"[^\w.\- ]", "_", (file.filename or "file"))[:200]
    doc = PatientDocument(patient_id=p.id, doctor_id=p.doctor_id, kind=kind,
                          uploaded_by="patient" if by_patient else "doctor", visit_id=vid, title=(title or fname)[:200],
                          filename=fname, mime=(file.content_type or "application/octet-stream")[:120],
                          size=len(data), notes=notes, visible_to_patient=visible_to_patient, data=data)
    db.add(doc)
    db.flush()
    audit(db, user, "document_upload", "document", f"{p.username}: {fname}", request)
    return _doc_dict(doc)


@router.get("/{pid}/documents/{doc_id}/download")
def download_document(pid: str, doc_id: str, inline: bool = False, user: User = Depends(active_user),
                      db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    x = db.get(PatientDocument, parse_uuid(doc_id))
    if not x or x.patient_id != p.id or (user.role == "patient" and not (x.visible_to_patient or x.uploaded_by == "patient")):
        raise HTTPException(404, "not_found")
    safe = x.mime in SAFE_INLINE
    disp = "inline" if (inline and safe) else "attachment"
    from urllib.parse import quote
    return Response(bytes(x.data), media_type=x.mime if safe else "application/octet-stream", headers={
        "Content-Disposition": f"{disp}; filename*=UTF-8''{quote(x.filename)}",
        "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox"})


class DocUpd(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    notes: str | None = None
    kind: str | None = Field(default=None, pattern="^(document|photo|recipe)$")
    visible_to_patient: bool | None = None


@router.patch("/{pid}/documents/{doc_id}")
def update_document(pid: str, doc_id: str, body: DocUpd, user: User = Depends(doctor_user),
                    db: Session = Depends(get_db)):
    p = patient_access(db, user, pid, doctor_only=True)
    x = db.get(PatientDocument, parse_uuid(doc_id))
    if not x or x.patient_id != p.id:
        raise HTTPException(404, "not_found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(x, k, v)
    db.commit()
    return _doc_dict(x)


@router.delete("/{pid}/documents/{doc_id}")
def delete_document(pid: str, doc_id: str, request: Request, user: User = Depends(active_user),
                    db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    x = db.get(PatientDocument, parse_uuid(doc_id))
    if not x or x.patient_id != p.id:
        raise HTTPException(404, "not_found")
    if user.role == "patient" and x.uploaded_by != "patient":
        raise HTTPException(403, "forbidden")
    db.delete(x)
    audit(db, user, "document_delete", "document", x.filename, request)
    return {"ok": True}


# ------------------------------------------------------------------ foto profilo
IMG_MAGIC = [(b"\xff\xd8\xff", "image/jpeg"), (b"\x89PNG\r\n\x1a\n", "image/png"), (b"RIFF", "image/webp")]
MAX_PHOTO = 3 * 1024 * 1024


@router.put("/{pid}/photo")
def put_photo(pid: str, request: Request, file: UploadFile = File(...), user: User = Depends(active_user),
              db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    data = file.file.read(MAX_PHOTO + 1)
    if len(data) > MAX_PHOTO:
        raise HTTPException(413, "file_too_large")
    mime = image_mime(data)
    if not mime:
        raise HTTPException(400, "invalid_image")
    pr = profile_of(db, p)
    pr.photo, pr.photo_mime = data, mime
    audit(db, user, "photo_set", "patient", p.username, request)
    return {"has_photo": True}


@router.get("/{pid}/photo")
def get_photo(pid: str, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    pr = profile_of(db, p)
    if not pr.photo_mime or not pr.photo:
        raise HTTPException(404, "not_found")
    return Response(bytes(pr.photo), media_type=pr.photo_mime, headers={
        "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"})


@router.delete("/{pid}/photo")
def delete_photo(pid: str, request: Request, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p = patient_access(db, user, pid)
    pr = profile_of(db, p)
    pr.photo, pr.photo_mime = None, ""
    audit(db, user, "photo_delete", "patient", p.username, request)
    return {"has_photo": False}


# ------------------------------------------------------------------ visite
class MeasureIn(BaseModel):
    label: str = Field(max_length=80)
    value: float
    unit: str = Field(default="cm", max_length=10)


class VisitIn(BaseModel):
    date: date
    weight_kg: float | None = Field(default=None, ge=20, le=400)
    waist_cm: float | None = Field(default=None, ge=0, le=300)
    leg_length_cm: float | None = Field(default=None, ge=0, le=300)
    calf_cm: float | None = Field(default=None, ge=0, le=300)
    biceps_cm: float | None = Field(default=None, ge=0, le=300)
    extra: list[MeasureIn] = Field(default=[], max_length=20)
    notes: str = Field(default="", max_length=5000)


VISIT_FIELDS = ["weight_kg", "waist_cm", "leg_length_cm", "calf_cm", "biceps_cm"]


def _visit_dict(v: Visit, docs: list) -> dict:
    d = {"id": str(v.id), "date": v.date.isoformat(), "notes": v.notes, "extra": v.extra or [],
         "attachments": [_doc_dict(x) for x in docs]}
    for f in VISIT_FIELDS:
        d[f] = getattr(v, f)
    return d


def _own_visit(db: Session, p: User, vid: str) -> Visit:
    v = db.get(Visit, parse_uuid(vid))
    if not v or v.patient_id != p.id:
        raise HTTPException(404, "not_found")
    return v


@router.get("/{pid}/visits")
def list_visits(pid: str, user: User = Depends(active_user), db: Session = Depends(get_db)):
    """Visibili sia al medico sia al paziente (il paziente le vede in sola lettura)."""
    p = patient_access(db, user, pid)
    visits = list(db.scalars(select(Visit).where(Visit.patient_id == p.id)
                             .order_by(Visit.date.desc(), Visit.created_at.desc())))
    docs: dict = {}
    if visits:
        for x in db.scalars(select(PatientDocument).where(
                PatientDocument.visit_id.in_([v.id for v in visits])).order_by(PatientDocument.created_at)):
            docs.setdefault(x.visit_id, []).append(x)
    return [_visit_dict(v, docs.get(v.id, [])) for v in visits]


@router.post("/{pid}/visits")
def create_visit(pid: str, body: VisitIn, request: Request, user: User = Depends(doctor_user),
                 db: Session = Depends(get_db)):
    p = patient_access(db, user, pid, doctor_only=True)
    v = Visit(doctor_id=user.id, patient_id=p.id, date=body.date, notes=body.notes,
              extra=[m.model_dump() for m in body.extra if m.label.strip()],
              **{f: getattr(body, f) for f in VISIT_FIELDS})
    db.add(v)
    db.flush()
    audit(db, user, "visit_create", "visit", f"{p.username} {body.date}", request)
    return _visit_dict(v, [])


@router.put("/{pid}/visits/{vid}")
def update_visit(pid: str, vid: str, body: VisitIn, request: Request, user: User = Depends(doctor_user),
                 db: Session = Depends(get_db)):
    p = patient_access(db, user, pid, doctor_only=True)
    v = _own_visit(db, p, vid)
    v.date, v.notes = body.date, body.notes
    v.extra = [m.model_dump() for m in body.extra if m.label.strip()]
    for f in VISIT_FIELDS:
        setattr(v, f, getattr(body, f))
    audit(db, user, "visit_update", "visit", f"{p.username} {body.date}", request)
    docs = db.scalars(select(PatientDocument).where(PatientDocument.visit_id == v.id)).all()
    return _visit_dict(v, list(docs))


@router.delete("/{pid}/visits/{vid}")
def delete_visit(pid: str, vid: str, request: Request, user: User = Depends(doctor_user),
                 db: Session = Depends(get_db)):
    p = patient_access(db, user, pid, doctor_only=True)
    v = _own_visit(db, p, vid)
    db.execute(delete(PatientDocument).where(PatientDocument.visit_id == v.id))
    db.delete(v)
    audit(db, user, "visit_delete", "visit", f"{p.username} {v.date}", request)
    return {"ok": True}
