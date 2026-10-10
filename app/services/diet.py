"""Lettura/scrittura del documento "dieta" (gruppi, pasti, alternative, alimenti)."""
import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from ..models import (Diet, DietGroup, DietGroupMember, DietMeal, DietOption, DietItem, User)


# ------------------------------------------------------------------ schemi di input
class MemberIn(BaseModel):
    id: str | None = None
    name: str = Field(max_length=200)
    qty: float | None = None
    unit: str = Field(default="g", max_length=20)
    qty_text: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=255)
    max_per_week: int | None = None


class GroupIn(BaseModel):
    id: str | None = None
    name: str = Field(max_length=200)
    ref_qty: float | None = None
    ref_unit: str = Field(default="g", max_length=20)
    note: str = ""
    members: list[MemberIn] = []


class ItemIn(BaseModel):
    id: str | None = None
    name: str = Field(max_length=200)
    qty: float | None = None
    unit: str = Field(default="g", max_length=20)
    qty_text: str = Field(default="", max_length=120)
    group_id: str | None = None
    note: str = Field(default="", max_length=255)
    max_per_week: int | None = None


class OptionIn(BaseModel):
    id: str | None = None
    label: str = Field(default="", max_length=60)
    course: str = Field(default="", max_length=20)
    kind: str = Field(default="choice", pattern="^(choice|addon)$")
    max_per_week: int | None = None
    note: str = Field(default="", max_length=255)
    items: list[ItemIn] = []


class MealIn(BaseModel):
    id: str | None = None
    name: str = Field(max_length=120)
    time: str = Field(default="", max_length=5)
    kind: str = Field(default="meal", pattern="^(meal|extras)$")
    required: bool = True
    same_as_meal_id: str | None = None
    note: str = ""
    options: list[OptionIn] = []


class ConvIn(BaseModel):
    name: str = Field(max_length=120)
    raw: str = Field(default="", max_length=60)      # weight/quantity when raw (e.g. "120 g")
    cooked: str = Field(default="", max_length=60)   # equivalent weight when cooked (e.g. "300 g")


class DietIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    notes: str = ""
    conversion: list[ConvIn] = []
    patient_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str = Field(default="active", pattern="^(active|paused|archived)$")
    groups: list[GroupIn] = []
    meals: list[MealIn] = []


# ------------------------------------------------------------------ utilita'
def fmt_num(v: float | None) -> str:
    if v is None:
        return ""
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return s


def qty_display(qty, unit, qty_text="") -> str:
    parts = []
    if qty is not None:
        parts.append(f"{fmt_num(qty)} {unit}".strip())
    if qty_text:
        parts.append(qty_text)
    return " ".join(parts)


def _uuid_or_none(v):
    if not v:
        return None
    try:
        return uuid.UUID(str(v))
    except ValueError:
        return None


# ------------------------------------------------------------------ lettura
def diet_to_dict(db: Session, diet: Diet) -> dict:
    groups = db.scalars(select(DietGroup).where(DietGroup.diet_id == diet.id)
                        .order_by(DietGroup.position)).all()
    members = db.scalars(select(DietGroupMember).where(
        DietGroupMember.group_id.in_([g.id for g in groups]) if groups else False)
        .order_by(DietGroupMember.position)).all() if groups else []
    meals = db.scalars(select(DietMeal).where(DietMeal.diet_id == diet.id)
                       .order_by(DietMeal.position)).all()
    options = db.scalars(select(DietOption).where(
        DietOption.meal_id.in_([m.id for m in meals])).order_by(DietOption.position)).all() if meals else []
    items = db.scalars(select(DietItem).where(
        DietItem.option_id.in_([o.id for o in options])).order_by(DietItem.position)).all() if options else []

    by_group, by_opt, by_meal = {}, {}, {}
    for m in members:
        by_group.setdefault(m.group_id, []).append({
            "id": str(m.id), "name": m.name, "qty": m.qty, "unit": m.unit,
            "qty_text": m.qty_text, "note": m.note, "max_per_week": m.max_per_week})
    for i in items:
        by_opt.setdefault(i.option_id, []).append({
            "id": str(i.id), "name": i.name, "qty": i.qty, "unit": i.unit, "qty_text": i.qty_text,
            "group_id": str(i.group_id) if i.group_id else None, "note": i.note,
            "max_per_week": i.max_per_week})
    for o in options:
        by_meal.setdefault(o.meal_id, []).append({
            "id": str(o.id), "label": o.label, "course": o.course, "kind": o.kind,
            "max_per_week": o.max_per_week, "note": o.note, "items": by_opt.get(o.id, [])})
    return {
        "id": str(diet.id), "name": diet.name, "description": diet.description, "notes": diet.notes,
        "conversion": diet.conversion or [],
        "patient_id": str(diet.patient_id) if diet.patient_id else None,
        "start_date": diet.start_date.isoformat() if diet.start_date else None,
        "end_date": diet.end_date.isoformat() if diet.end_date else None,
        "status": diet.status,
        "updated_at": diet.updated_at.isoformat() if diet.updated_at else None,
        "groups": [{"id": str(g.id), "name": g.name, "ref_qty": g.ref_qty, "ref_unit": g.ref_unit,
                    "note": g.note, "members": by_group.get(g.id, [])} for g in groups],
        "meals": [{"id": str(m.id), "name": m.name, "time": m.time, "kind": m.kind,
                   "required": m.required,
                   "same_as_meal_id": str(m.same_as_meal_id) if m.same_as_meal_id else None,
                   "note": m.note, "options": by_meal.get(m.id, [])} for m in meals],
    }


# ------------------------------------------------------------------ scrittura
def _check_patient(db: Session, doctor: User, pid: str | None):
    if not pid:
        return None
    p = db.get(User, _uuid_or_none(pid) or uuid.uuid4())
    if not p or p.role != "patient" or p.doctor_id != doctor.id:
        raise HTTPException(400, "invalid_patient")
    return p.id


def _free_id(db: Session, model, wanted, owned: set, used: set) -> uuid.UUID:
    """Usa l'id proposto dal client se e' nuovo oppure gia' di questa dieta; altrimenti ne genera uno."""
    u = _uuid_or_none(wanted)
    if u and u not in used and (u in owned or db.get(model, u) is None):
        used.add(u)
        return u
    while True:
        n = uuid.uuid4()
        if n not in used:
            used.add(n)
            return n


def save_diet(db: Session, doctor: User, diet: Diet, data: DietIn) -> Diet:
    """Applica il documento: aggiorna le righe esistenti (stesso id), crea le nuove, elimina le mancanti."""
    diet.name, diet.description, diet.notes = data.name.strip(), data.description, data.notes
    diet.conversion = [c.model_dump() for c in data.conversion]
    diet.patient_id = _check_patient(db, doctor, data.patient_id)
    diet.start_date, diet.end_date, diet.status = data.start_date, data.end_date, data.status
    if diet.start_date and diet.end_date and diet.end_date < diet.start_date:
        raise HTTPException(400, "invalid_dates")
    diet.updated_at = datetime.now(timezone.utc)
    db.flush()
    did, docid = diet.id, doctor.id

    ex_groups = {g.id: g for g in db.scalars(select(DietGroup).where(DietGroup.diet_id == did))}
    ex_members = {m.id: m for m in db.scalars(select(DietGroupMember).where(
        DietGroupMember.group_id.in_(list(ex_groups))))} if ex_groups else {}
    ex_meals = {m.id: m for m in db.scalars(select(DietMeal).where(DietMeal.diet_id == did))}
    ex_opts = {o.id: o for o in db.scalars(select(DietOption).where(
        DietOption.meal_id.in_(list(ex_meals))))} if ex_meals else {}
    ex_items = {i.id: i for i in db.scalars(select(DietItem).where(
        DietItem.option_id.in_(list(ex_opts))))} if ex_opts else {}

    used: set = set()
    gmap, mmap = {}, {}  # id client -> id server
    keep = {"g": set(), "gm": set(), "m": set(), "o": set(), "i": set()}

    # gruppi
    for gi, g in enumerate(data.groups):
        gid = _free_id(db, DietGroup, g.id, set(ex_groups), used)
        if g.id:
            gmap[g.id] = gid
        row = ex_groups.get(gid)
        if not row:
            row = DietGroup(id=gid, diet_id=did, doctor_id=docid)
            db.add(row)
        row.position, row.name, row.ref_qty, row.ref_unit, row.note = gi, g.name, g.ref_qty, g.ref_unit, g.note
        keep["g"].add(gid)
        db.flush()
        for mi, m in enumerate(g.members):
            mid = _free_id(db, DietGroupMember, m.id, set(ex_members), used)
            mrow = ex_members.get(mid)
            if not mrow:
                mrow = DietGroupMember(id=mid, group_id=gid, doctor_id=docid)
                db.add(mrow)
            mrow.group_id, mrow.position, mrow.name = gid, mi, m.name
            mrow.qty, mrow.unit, mrow.qty_text, mrow.note, mrow.max_per_week = (
                m.qty, m.unit, m.qty_text, m.note, m.max_per_week)
            keep["gm"].add(mid)

    # pasti: prima assegno gli id (servono per i riferimenti "come a pranzo")
    meal_ids = []
    for m in data.meals:
        mid = _free_id(db, DietMeal, m.id, set(ex_meals), used)
        if m.id:
            mmap[m.id] = mid
        meal_ids.append(mid)
    for mi, (m, mid) in enumerate(zip(data.meals, meal_ids)):
        row = ex_meals.get(mid)
        if not row:
            row = DietMeal(id=mid, diet_id=did, doctor_id=docid)
            db.add(row)
        same = mmap.get(m.same_as_meal_id) if m.same_as_meal_id else None
        if same == mid:
            same = None
        row.position, row.name, row.time, row.kind = mi, m.name, m.time, m.kind
        row.required = m.required and m.kind == "meal"
        row.same_as_meal_id, row.note = same, m.note
        keep["m"].add(mid)
        db.flush()
        for oi, o in enumerate(m.options):
            oid = _free_id(db, DietOption, o.id, set(ex_opts), used)
            orow = ex_opts.get(oid)
            if not orow:
                orow = DietOption(id=oid, meal_id=mid, doctor_id=docid)
                db.add(orow)
            orow.meal_id, orow.position, orow.label, orow.course = mid, oi, o.label, o.course
            orow.kind, orow.max_per_week, orow.note = o.kind, o.max_per_week, o.note
            keep["o"].add(oid)
            db.flush()
            for ii, it in enumerate(o.items):
                iid = _free_id(db, DietItem, it.id, set(ex_items), used)
                irow = ex_items.get(iid)
                if not irow:
                    irow = DietItem(id=iid, option_id=oid, doctor_id=docid)
                    db.add(irow)
                irow.option_id, irow.position, irow.name = oid, ii, it.name
                irow.qty, irow.unit, irow.qty_text, irow.note = it.qty, it.unit, it.qty_text, it.note
                irow.max_per_week = it.max_per_week
                irow.group_id = gmap.get(it.group_id) if it.group_id else None
                keep["i"].add(iid)

    db.flush()
    # eliminazione di cio' che non e' piu' nel documento
    for ex, k, model in ((ex_items, "i", DietItem), (ex_opts, "o", DietOption),
                         (ex_meals, "m", DietMeal), (ex_members, "gm", DietGroupMember),
                         (ex_groups, "g", DietGroup)):
        gone = [i for i in ex if i not in keep[k]]
        if gone:
            db.execute(delete(model).where(model.id.in_(gone)))
    db.flush()
    return diet


def reid_document(doc: dict) -> dict:
    """Copia profonda del documento con tutti gli id sostituiti da nuovi (riferimenti coerenti)."""
    mp: dict[str, str] = {}

    def nid(old):
        if old is None:
            return None
        if old not in mp:
            mp[old] = str(uuid.uuid4())
        return mp[old]

    out = {k: v for k, v in doc.items() if k not in ("id", "updated_at")}
    out["groups"] = [{**g, "id": nid(g["id"]),
                      "members": [{**m, "id": nid(m["id"])} for m in g["members"]]}
                     for g in doc["groups"]]
    out["meals"] = [{**m, "id": nid(m["id"]), "same_as_meal_id": nid(m["same_as_meal_id"]),
                     "options": [{**o, "id": nid(o["id"]),
                                  "items": [{**i, "id": nid(i["id"]), "group_id": nid(i["group_id"])}
                                            for i in o["items"]]}
                                 for o in m["options"]]}
                    for m in doc["meals"]]
    return out
