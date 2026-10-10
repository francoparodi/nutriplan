from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import active_user, audit, patient_access, today
from ..models import User
from ..services import reports

router = APIRouter(prefix="/api/patients", tags=["reports"])


def _data(db, user, pid, date_from, date_to, lang):
    p = patient_access(db, user, pid)
    b = date_to or today()
    a = date_from or (b - timedelta(days=29))
    if a > b or (b - a).days > 732:
        raise HTTPException(400, "invalid_range")
    doc = db.get(User, p.doctor_id)
    lang = lang if lang in ("it", "en") else user.lang
    return p, reports.collect(db, p, a, b, lang), (doc.full_name if doc else ""), a, b


@router.get("/{pid}/report.pdf")
def report_pdf(pid: str, request: Request, date_from: date | None = None, date_to: date | None = None,
               lang: str | None = None, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p, data, dn, a, b = _data(db, user, pid, date_from, date_to, lang)
    out = reports.report_pdf(data, dn)
    audit(db, user, "report_pdf", "report", f"{p.username} {a}..{b}", request)
    return Response(out, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="nutriplan_{p.username}_{a}_{b}.pdf"'})


@router.get("/{pid}/report.xlsx")
def report_xlsx(pid: str, request: Request, date_from: date | None = None, date_to: date | None = None,
                lang: str | None = None, user: User = Depends(active_user), db: Session = Depends(get_db)):
    p, data, dn, a, b = _data(db, user, pid, date_from, date_to, lang)
    out = reports.report_xlsx(data, dn)
    audit(db, user, "report_xlsx", "report", f"{p.username} {a}..{b}", request)
    return Response(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={
        "Content-Disposition": f'attachment; filename="nutriplan_{p.username}_{a}_{b}.xlsx"'})
