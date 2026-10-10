import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import active_user, audit, doctor_user, parse_uuid
from ..models import Diet, User
from ..services.diet import DietIn, diet_to_dict, reid_document, save_diet
from ..services.planpdf import plan_pdf

router = APIRouter(prefix="/api/diets", tags=["diets"])


def _own_diet(db: Session, user: User, did: str, write: bool = False) -> Diet:
    d = db.get(Diet, parse_uuid(did))
    if not d:
        raise HTTPException(404, "not_found")
    if user.role == "doctor" and d.doctor_id == user.id:
        return d
    if user.role == "patient" and not write and d.patient_id == user.id and d.status == "active":
        return d
    raise HTTPException(404, "not_found")


def _summary(db: Session, d: Diet, names: dict) -> dict:
    return {"id": str(d.id), "name": d.name, "description": d.description, "status": d.status,
            "patient_id": str(d.patient_id) if d.patient_id else None,
            "patient_name": names.get(d.patient_id, ""),
            "start_date": d.start_date.isoformat() if d.start_date else None,
            "end_date": d.end_date.isoformat() if d.end_date else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None}


@router.get("")
def list_diets(user: User = Depends(doctor_user), db: Session = Depends(get_db)):
    names = {u.id: u.full_name for u in db.scalars(
        select(User).where(User.role == "patient", User.doctor_id == user.id))}
    return [_summary(db, d, names) for d in db.scalars(
        select(Diet).where(Diet.doctor_id == user.id).order_by(Diet.updated_at.desc()))]


@router.post("")
def create_diet(body: DietIn, request: Request, user: User = Depends(doctor_user), db: Session = Depends(get_db)):
    d = Diet(doctor_id=user.id, name=body.name)
    db.add(d)
    db.flush()
    save_diet(db, user, d, body)
    audit(db, user, "diet_create", "diet", d.name, request)
    return diet_to_dict(db, d)


@router.get("/{did}")
def get_diet(did: str, user: User = Depends(active_user), db: Session = Depends(get_db)):
    return diet_to_dict(db, _own_diet(db, user, did))


@router.put("/{did}")
def update_diet(did: str, body: DietIn, request: Request, user: User = Depends(doctor_user),
                db: Session = Depends(get_db)):
    d = _own_diet(db, user, did, write=True)
    save_diet(db, user, d, body)
    audit(db, user, "diet_update", "diet", d.name, request)
    return diet_to_dict(db, d)


def _overlaps(d: Diet, start: date | None, end: date | None) -> bool:
    a0, a1 = d.start_date or date.min, d.end_date or date.max
    b0, b1 = start or date.min, end or date.max
    return a0 <= b1 and b0 <= a1


def resolve_conflicts(db: Session, patient_id, diet_id, start, end, resolve: str | None) -> str:
    """Se il paziente ha gia' una dieta attiva nello stesso periodo serve una decisione del medico.

    resolve='replace': la dieta precedente viene disattivata (terminata il giorno prima della nuova,
    oppure archiviata se la nuova parte prima/insieme); resolve='pause': la nuova dieta viene assegnata
    ma messa in pausa. Restituisce lo stato da dare alla nuova dieta."""
    if patient_id is None:
        return "active"
    olds = [d for d in db.scalars(select(Diet).where(
        Diet.patient_id == patient_id, Diet.status == "active", Diet.id != diet_id)) if _overlaps(d, start, end)]
    if not olds:
        return "active"
    if resolve == "pause":
        return "paused"
    if resolve != "replace":
        raise HTTPException(409, "diet_conflict")
    for d in olds:
        if start and (d.start_date is None or d.start_date < start):
            d.end_date = start - timedelta(days=1)
        else:
            d.status = "archived"
    return "active"


class CopyIn(BaseModel):
    name: str | None = None
    patient_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    resolve: str | None = None


@router.post("/{did}/copy")
def copy_diet(did: str, body: CopyIn, request: Request, user: User = Depends(doctor_user),
              db: Session = Depends(get_db)):
    src = _own_diet(db, user, did, write=True)
    doc = reid_document(diet_to_dict(db, src))
    doc["name"] = (body.name or f"{src.name} (copia)")[:200]
    doc["patient_id"] = body.patient_id
    doc["start_date"], doc["end_date"] = body.start_date, body.end_date
    d = Diet(doctor_id=user.id, name=doc["name"])
    db.add(d)
    db.flush()
    pid = _patient_id(db, user, body.patient_id)
    doc["status"] = resolve_conflicts(db, pid, d.id, body.start_date, body.end_date, body.resolve)
    save_diet(db, user, d, DietIn.model_validate(doc))
    audit(db, user, "diet_copy", "diet", f"{src.name} -> {d.name}", request)
    return diet_to_dict(db, d)


class AssignIn(BaseModel):
    patient_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str = "active"
    resolve: str | None = None  # replace | pause (vedi resolve_conflicts)


def _patient_id(db, user, raw):
    if not raw:
        return None
    p = db.get(User, parse_uuid(raw))
    if not p or p.role != "patient" or p.doctor_id != user.id:
        raise HTTPException(400, "invalid_patient")
    return p.id


@router.post("/{did}/assign")
def assign_diet(did: str, body: AssignIn, request: Request, user: User = Depends(doctor_user),
                db: Session = Depends(get_db)):
    d = _own_diet(db, user, did, write=True)
    pid = _patient_id(db, user, body.patient_id)
    if body.start_date and body.end_date and body.end_date < body.start_date:
        raise HTTPException(400, "invalid_dates")
    status = body.status if body.status in ("active", "paused", "archived") else "active"
    if pid and status == "active":
        status = resolve_conflicts(db, pid, d.id, body.start_date, body.end_date, body.resolve)
    d.patient_id, d.start_date, d.end_date, d.status = pid, body.start_date, body.end_date, status
    audit(db, user, "diet_assign", "diet", f"{d.name} -> {body.patient_id}", request)
    return _summary(db, d, {})


@router.delete("/{did}")
def delete_diet(did: str, request: Request, user: User = Depends(doctor_user), db: Session = Depends(get_db)):
    d = _own_diet(db, user, did, write=True)
    name = d.name
    db.delete(d)
    audit(db, user, "diet_delete", "diet", name, request)
    return {"ok": True}


@router.get("/{did}/pdf")
def diet_pdf(did: str, lang: str = "it", user: User = Depends(active_user), db: Session = Depends(get_db)):
    d = _own_diet(db, user, did)
    doc = diet_to_dict(db, d)
    patient = db.get(User, d.patient_id) if d.patient_id else None
    doctor = db.get(User, d.doctor_id)
    data = plan_pdf(doc, patient.full_name if patient else "", doctor.full_name if doctor else "", lang)
    fn = "".join(c if c.isalnum() else "_" for c in d.name)[:60]
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fn}.pdf"'})
