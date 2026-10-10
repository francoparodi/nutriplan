from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import admin_user, audit, doctor_user
from ..models import User
from ..services.backup import export_zip, restore_zip

router = APIRouter(prefix="/api", tags=["backup"])


def _read_upload(file: UploadFile) -> bytes:
    data = file.file.read(config.MAX_BACKUP_MB * 1024 * 1024 + 1)
    if len(data) > config.MAX_BACKUP_MB * 1024 * 1024:
        raise HTTPException(413, "file_too_large")
    return data


@router.get("/doctor/backup")
def doctor_backup(request: Request, user: User = Depends(doctor_user), db: Session = Depends(get_db)):
    data = export_zip(db, "doctor", user)
    audit(db, user, "backup_export", "backup", "medico", request)
    fn = f"nutriplan_backup_{user.username}_{datetime.now():%Y%m%d_%H%M}.zip"
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.post("/doctor/restore")
def doctor_restore(request: Request, file: UploadFile = File(...), user: User = Depends(doctor_user),
                   db: Session = Depends(get_db)):
    counts = restore_zip(db, _read_upload(file), "doctor", user)
    audit(db, user, "backup_restore", "backup", str(counts), request)
    return {"ok": True, "counts": counts}


@router.get("/admin/backup")
def admin_backup(request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    data = export_zip(db, "full")
    audit(db, user, "backup_export", "backup", "completo", request)
    fn = f"nutriplan_full_backup_{datetime.now():%Y%m%d_%H%M}.zip"
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.post("/admin/restore")
def admin_restore(request: Request, file: UploadFile = File(...), user: User = Depends(admin_user),
                  db: Session = Depends(get_db)):
    counts = restore_zip(db, _read_upload(file), "full")
    audit(db, None, "backup_restore_full", "backup", str(counts), request, username=user.username)
    return {"ok": True, "counts": counts}
