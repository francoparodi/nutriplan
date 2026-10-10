"""Backup/ripristino in formato ZIP (JSON + file), per singolo medico o completo."""
import io
import json
import uuid
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import delete, insert, select, inspect as sa_inspect
from sqlalchemy import types as T
from sqlalchemy.orm import Session

from .. import __version__, config
from ..models import SCOPED_TABLES, User

ROLE_ORDER = {"admin": 0, "doctor": 1, "patient": 2}


def _cols(model):
    return list(sa_inspect(model).columns)


def _ser(v):
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return v


def _de(col, v):
    if v is None:
        return None
    t = col.type
    if isinstance(t, T.Uuid):
        return uuid.UUID(str(v))
    if isinstance(t, T.DateTime):
        return datetime.fromisoformat(v)
    if isinstance(t, T.Date):
        return date.fromisoformat(v)
    if isinstance(t, T.Numeric):
        return Decimal(str(v))
    return v


def _is_bin(col) -> bool:
    return isinstance(col.type, T.LargeBinary)


def _pk_name(model) -> str:
    return sa_inspect(model).primary_key[0].name


def export_zip(db: Session, scope: str, doctor: User | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        manifest = {"app": "nutriplan", "version": __version__, "scope": scope,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "doctor_id": str(doctor.id) if doctor else None,
                    "doctor_username": doctor.username if doctor else None, "tables": {}}
        # utenti
        q = select(User)
        if scope == "doctor":
            q = q.where(User.doctor_id == doctor.id, User.role == "patient")
        users = list(db.scalars(q))
        users.sort(key=lambda u: (ROLE_ORDER.get(u.role, 9), u.created_at))
        rows = [{c.name: _ser(getattr(u, c.key)) for c in _cols(User)} for u in users]
        z.writestr("data/users.json", json.dumps(rows, ensure_ascii=False))
        manifest["tables"]["users"] = len(rows)
        for model in SCOPED_TABLES:
            q = select(model)
            if scope == "doctor":
                q = q.where(model.doctor_id == doctor.id)
            rows = []
            pk = _pk_name(model)
            for obj in db.scalars(q):
                r = {}
                for c in _cols(model):
                    v = getattr(obj, c.key)
                    if _is_bin(c):
                        z.writestr(f"files/{model.__tablename__}/{getattr(obj, pk)}/{c.name}.bin", bytes(v or b""))
                    else:
                        r[c.name] = _ser(v)
                rows.append(r)
            z.writestr(f"data/{model.__tablename__}.json", json.dumps(rows, ensure_ascii=False))
            manifest["tables"][model.__tablename__] = len(rows)
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
    return buf.getvalue()


def _read_zip(data: bytes) -> zipfile.ZipFile:
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise HTTPException(400, "backup_invalid")
    total = sum(i.file_size for i in z.infolist())
    if total > config.MAX_BACKUP_MB * 1024 * 1024 * 4:
        raise HTTPException(400, "backup_too_large")
    return z


def restore_zip(db: Session, data: bytes, scope: str, doctor: User | None = None) -> dict:
    z = _read_zip(data)
    names = set(z.namelist())
    if "manifest.json" not in names:
        raise HTTPException(400, "backup_invalid")
    man = json.loads(z.read("manifest.json"))
    if man.get("app") != "nutriplan" or man.get("scope") != scope:
        raise HTTPException(400, "backup_wrong_scope")
    if scope == "doctor" and man.get("doctor_id") != str(doctor.id):
        raise HTTPException(400, "backup_not_yours")

    def load(table):
        n = f"data/{table}.json"
        return json.loads(z.read(n)) if n in names else []

    user_rows = load("users")
    try:
        # 1) elimina il contesto attuale
        if scope == "doctor":
            for model in reversed(SCOPED_TABLES):
                db.execute(delete(model).where(model.doctor_id == doctor.id))
            db.execute(delete(User).where(User.doctor_id == doctor.id, User.role == "patient"))
        else:
            if not any(r.get("role") == "admin" and r.get("active") for r in user_rows):
                raise HTTPException(400, "backup_no_admin")
            for model in reversed(SCOPED_TABLES):
                db.execute(delete(model))
            db.execute(delete(User))
        db.flush()
        # 2) ripristina
        counts = {}
        ucols = {c.name: c for c in _cols(User)}
        urows = []
        for r in user_rows:
            row = {k: _de(ucols[k], v) for k, v in r.items() if k in ucols}
            if scope == "doctor":
                row["role"], row["doctor_id"] = "patient", doctor.id
                row["id"] = row.get("id") or uuid.uuid4()
            urows.append(row)
        if scope == "full":
            urows.sort(key=lambda r: ROLE_ORDER.get(r.get("role"), 9))
        ids = [r["id"] for r in urows]
        if ids:
            if db.scalar(select(User.id).where(User.id.in_(ids)).limit(1)):
                raise HTTPException(409, "backup_conflict")
            names_ = [r["username"] for r in urows]
            if db.scalar(select(User.id).where(User.username.in_(names_)).limit(1)):
                raise HTTPException(409, "backup_username_conflict")
            db.execute(insert(User), urows)
        counts["users"] = len(urows)
        for model in SCOPED_TABLES:
            cols = {c.name: c for c in _cols(model)}
            pk = _pk_name(model)
            rows = []
            for r in load(model.__tablename__):
                row = {k: _de(cols[k], v) for k, v in r.items() if k in cols and not _is_bin(cols[k])}
                for cn, c in cols.items():
                    if _is_bin(c):
                        fn = f"files/{model.__tablename__}/{r[pk]}/{cn}.bin"
                        row[cn] = z.read(fn) if fn in names else b""
                if scope == "doctor":
                    row["doctor_id"] = doctor.id
                rows.append(row)
            if rows:
                pks = [r[pk] for r in rows]
                if db.scalar(select(getattr(model, pk)).where(getattr(model, pk).in_(pks)).limit(1)):
                    raise HTTPException(409, "backup_conflict")
                db.execute(insert(model), rows)
            counts[model.__tablename__] = len(rows)
        db.commit()
        return counts
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:  # dati non coerenti: nessuna modifica
        db.rollback()
        raise HTTPException(400, f"backup_invalid: {type(e).__name__}")
