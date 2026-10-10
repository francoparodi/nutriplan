"""Logica del diario giornaliero: dieta valida in una data, sostituzioni, stato dei pasti, avvisi."""
import uuid
from datetime import date, timedelta

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..deps import today as _today
from ..models import Diet, MealLog, Weight, User
from .diet import diet_to_dict, fmt_num, qty_display


def effective_diet(db: Session, patient_id, d: date) -> Diet | None:
    q = (select(Diet).where(Diet.patient_id == patient_id, Diet.status == "active")
         .order_by(Diet.start_date.desc().nullslast(), Diet.created_at.desc()))
    for diet in db.scalars(q):
        if (diet.start_date is None or diet.start_date <= d) and (diet.end_date is None or diet.end_date >= d):
            return diet
    return None


def week_bounds(d: date):
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)


def _scale(item: dict, group: dict, member: dict) -> str:
    """Quantita' del sostituto, riproporzionata se l'alimento in dieta ha una quantita' diversa dal riferimento."""
    if member["qty"] is None:
        return member["qty_text"]
    f = 1.0
    if item["qty"] and group["ref_qty"] and (item["unit"] or "").lower() == (group["ref_unit"] or "").lower():
        f = item["qty"] / group["ref_qty"]
    txt = f"{fmt_num(round(member['qty'] * f, 1))} {member['unit']}".strip()
    return f"{txt} {member['qty_text']}".strip() if member["qty_text"] else txt


def option_summary(opt: dict) -> str:
    head = " ".join(x for x in (opt.get("label"), f"({opt['course']})" if opt.get("course") else "") if x)
    body = ", ".join(f"{i['name']} {qty_display(i['qty'], i['unit'], i['qty_text'])}".strip() for i in opt["items"])
    return f"{head}: {body}" if head else body


def resolve_meals(doc: dict) -> list[dict]:
    """Risolve "come a pranzo" e calcola per ogni alimento le sostituzioni previste."""
    groups = {g["id"]: g for g in doc["groups"]}
    by_id = {m["id"]: m for m in doc["meals"]}
    out = []
    for m in doc["meals"]:
        opts = list(m["options"])
        inherited = False
        ref = by_id.get(m["same_as_meal_id"]) if m["same_as_meal_id"] else None
        if ref and ref["id"] != m["id"]:
            inherited = True
            opts = [dict(o, inherited=True) for o in ref["options"]] + opts
        res_opts = []
        for o in opts:
            items = []
            for it in o["items"]:
                g = groups.get(it["group_id"]) if it["group_id"] else None
                subs = []
                if g:
                    for mem in g["members"]:
                        subs.append({"id": mem["id"], "name": mem["name"], "qty_text": _scale(it, g, mem),
                                     "note": mem["note"], "max_per_week": mem["max_per_week"]})
                items.append({**it, "group": ({"id": g["id"], "name": g["name"], "note": g["note"]} if g else None),
                              "substitutes": subs, "display": qty_display(it["qty"], it["unit"], it["qty_text"])})
            res_opts.append({**o, "items": items, "summary": option_summary(o)})
        out.append({**m, "options": res_opts, "inherited": inherited})
    return out


def log_to_dict(l: MealLog) -> dict:
    return {"id": str(l.id), "status": l.status, "option_id": str(l.option_id) if l.option_id else None,
            "option_label": l.option_label, "substitutions": l.substitutions or [], "extras": l.extras or [], "adjustments": l.adjustments or [],
            "free_text": l.free_text, "note": l.note, "meal_name": l.meal_name,
            "updated_at": l.updated_at.isoformat() if l.updated_at else None}


def week_usage(db: Session, patient_id, d: date) -> dict:
    """Quante volte, nella settimana di d, e' stata usata ciascuna alternativa / voce 'extra' (per i limiti settimanali)."""
    a, b = week_bounds(d)
    usage: dict[str, int] = {}
    for l in db.scalars(select(MealLog).where(MealLog.patient_id == patient_id, MealLog.date >= a, MealLog.date <= b)):
        if l.status == "done" and l.option_id:
            usage[str(l.option_id)] = usage.get(str(l.option_id), 0) + 1
        for e in l.extras or []:
            usage[e.get("item_id", "")] = usage.get(e.get("item_id", ""), 0) + int(e.get("count", 1) or 1)
    return usage


def build_day(db: Session, patient: User, d: date) -> dict:
    diet = effective_diet(db, patient.id, d)
    logs = {str(l.meal_id): l for l in db.scalars(
        select(MealLog).where(MealLog.patient_id == patient.id, MealLog.date == d))}
    w = db.scalar(select(Weight).where(Weight.patient_id == patient.id, Weight.date == d))
    res = {"date": d.isoformat(), "diet": None, "meals": [], "weight": float(w.kg) if w else None,
           "weight_note": w.note if w else "", "missing": 0, "orphan_logs": []}
    used_ids = set()
    if diet:
        doc = diet_to_dict(db, diet)
        usage = week_usage(db, patient.id, d)
        res["diet"] = {"id": doc["id"], "name": doc["name"], "notes": doc["notes"]}
        for m in resolve_meals(doc):
            lg = logs.get(m["id"])
            used_ids.add(m["id"])
            for o in m["options"]:
                o["week_used"] = usage.get(o["id"], 0)
                for it in o["items"]:
                    it["week_used"] = usage.get(it["id"], 0)
            if lg:
                state = lg.status
            else:
                state = "missing" if m["required"] else "open"
            if state == "missing":
                res["missing"] += 1
            res["meals"].append({**m, "log": log_to_dict(lg) if lg else None, "state": state})
    # registrazioni di pasti non piu' presenti nella dieta (dieta modificata/eliminata): restano visibili
    for mid, lg in logs.items():
        if mid not in used_ids:
            res["orphan_logs"].append(log_to_dict(lg))
    return res


def missing_days(db: Session, patient: User, until: date, window_days: int = 120) -> list[dict]:
    """Giorni (fino a 'until' incluso) con pasti obbligatori non confermati."""
    diets = list(db.scalars(select(Diet).where(Diet.patient_id == patient.id, Diet.status == "active")))
    if not diets:
        return []
    created = patient.created_at.date() if patient.created_at else until
    first_diet = min((d.start_date or created) for d in diets)
    start = max(first_diet, until - timedelta(days=window_days))
    if start > until:
        return []
    docs = {}
    req_by_diet: dict[uuid.UUID, list[str]] = {}
    for dt in diets:
        doc = diet_to_dict(db, dt)
        docs[dt.id] = doc
        req_by_diet[dt.id] = [m["id"] for m in doc["meals"] if m["required"] and m["kind"] == "meal"]
    logged: dict[date, set] = {}
    for dte, mid in db.execute(select(MealLog.date, MealLog.meal_id).where(
            MealLog.patient_id == patient.id, MealLog.date >= start, MealLog.date <= until)):
        logged.setdefault(dte, set()).add(str(mid))
    out = []
    ordered = sorted(diets, key=lambda x: (x.start_date or date.min, x.created_at), reverse=True)
    cur = start
    while cur <= until:
        dt = next((x for x in ordered if (x.start_date or date.min) <= cur and (x.end_date is None or x.end_date >= cur)), None)
        if dt and req_by_diet[dt.id]:
            miss = [m for m in req_by_diet[dt.id] if m not in logged.get(cur, set())]
            if miss:
                out.append({"date": cur.isoformat(), "missing": len(miss), "total": len(req_by_diet[dt.id])})
        cur += timedelta(days=1)
    return out


def progress(db: Session, patient: User, a: date, b: date) -> dict:
    """Serie per i grafici + riepilogo: peso, aderenza giornaliera, fuori dieta, saltati, mancanti."""
    weights = [{"date": w.date.isoformat(), "kg": float(w.kg), "note": w.note} for w in db.scalars(
        select(Weight).where(Weight.patient_id == patient.id, Weight.date >= a, Weight.date <= b)
        .order_by(Weight.date))]
    diets = list(db.scalars(select(Diet).where(Diet.patient_id == patient.id, Diet.status == "active")))
    req = {}
    for dt in diets:
        doc = diet_to_dict(db, dt)
        req[dt.id] = [m["id"] for m in doc["meals"] if m["required"] and m["kind"] == "meal"]
    ordered = sorted(diets, key=lambda x: (x.start_date or date.min, x.created_at), reverse=True)
    logs: dict[date, list[MealLog]] = {}
    for l in db.scalars(select(MealLog).where(MealLog.patient_id == patient.id,
                                              MealLog.date >= a, MealLog.date <= b)):
        logs.setdefault(l.date, []).append(l)
    days, cur = [], a
    tot = {"done": 0, "off_plan": 0, "skipped": 0, "missing": 0, "required": 0, "subs": 0, "adjusted": 0}
    while cur <= b:
        dt = next((x for x in ordered if (x.start_date or date.min) <= cur and (x.end_date is None or x.end_date >= cur)), None)
        rq = req[dt.id] if dt else []
        ls = logs.get(cur, [])
        done = sum(1 for l in ls if l.status == "done" and str(l.meal_id) in rq)
        off = sum(1 for l in ls if l.status == "off_plan")
        sk = sum(1 for l in ls if l.status == "skipped")
        logged_req = {str(l.meal_id) for l in ls}
        miss = sum(1 for m in rq if m not in logged_req)
        subs = sum(len(l.substitutions or []) for l in ls)
        adj = sum(1 for l in ls if l.adjustments)
        if dt or ls:
            days.append({"date": cur.isoformat(), "required": len(rq), "done": done, "off_plan": off,
                         "skipped": sk, "missing": miss, "subs": subs, "adjusted": adj,
                         "adherence": round(100 * done / len(rq), 1) if rq else None})
        if dt and cur <= _today() + timedelta(days=1):
            tot["required"] += len(rq)
        tot["done"] += done; tot["off_plan"] += off; tot["skipped"] += sk; tot["subs"] += subs; tot["adjusted"] += adj
        cur += timedelta(days=1)
    tot["missing"] = sum(d["missing"] for d in days if d["date"] < _today().isoformat())
    ad = [d["adherence"] for d in days if d["adherence"] is not None and d["date"] <= _today().isoformat()]
    summary = {**tot, "avg_adherence": round(sum(ad) / len(ad), 1) if ad else None,
               "first_weight": weights[0]["kg"] if weights else None,
               "last_weight": weights[-1]["kg"] if weights else None,
               "delta_weight": round(weights[-1]["kg"] - weights[0]["kg"], 2) if len(weights) > 1 else None}
    return {"weights": weights, "days": days, "summary": summary}
