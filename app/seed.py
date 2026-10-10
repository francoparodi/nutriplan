import logging
import uuid

from sqlalchemy import select, func, text
from sqlalchemy.orm import Session

from . import config
from .deps import today
from .models import Base, Diet, PatientProfile, User
from .security import hash_password
from .services.diet import save_diet

log = logging.getLogger("nutriplan.seed")


def _user(db: Session, username, pw, role, full_name, doctor_id=None, email=""):
    u = User(id=uuid.uuid4(), username=username, password_hash=hash_password(pw), role=role,
             full_name=full_name, doctor_id=doctor_id, email=email)
    db.add(u)
    db.flush()
    return u


def seed_demo(db: Session):
    from .seed_data import franco, giorgia
    doc = _user(db, "medico", "medico", "doctor", "Dott. Medico", email="medico@example.org")
    for username, name, fn in (("franco", "Franco Parodi", franco), ("giorgia", "Giorgia Bernardi", giorgia)):
        p = _user(db, username, username, "patient", name, doctor_id=doc.id)
        db.add(PatientProfile(patient_id=p.id, doctor_id=doc.id, custom=[]))
        diet = Diet(id=uuid.uuid4(), doctor_id=doc.id, name="tmp", start_date=today())
        db.add(diet)
        db.flush()
        data = fn()
        data.patient_id = str(p.id)
        data.start_date = today()
        save_diet(db, doc, diet, data)
    db.commit()
    log.info("Dati dimostrativi creati (admin, medico, franco, giorgia)")


def init_db(engine, SessionLocal):
    Base.metadata.create_all(engine)
    # migrazioni leggere per database creati con versioni precedenti
    with engine.begin() as c:
        c.execute(text("ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS "
                       "uploaded_by VARCHAR(10) NOT NULL DEFAULT 'doctor'"))
        c.execute(text("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS photo_mime VARCHAR(60) NOT NULL DEFAULT ''"))
        c.execute(text("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS photo BYTEA"))
        c.execute(text("ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS visit_id UUID"))
        for col, n in (("phone", 120), ("whatsapp", 120), ("telegram", 120), ("instagram", 200), ("facebook", 200), ("website", 200)):
            c.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} VARCHAR({n}) NOT NULL DEFAULT ''"))
        # patients' phone numbers entered before contacts moved to the users table
        c.execute(text("UPDATE users u SET phone = p.phone FROM patient_profiles p "
                       "WHERE p.patient_id = u.id AND u.phone = '' AND p.phone <> ''"))
        c.execute(text("ALTER TABLE meal_logs ADD COLUMN IF NOT EXISTS adjustments JSON NOT NULL DEFAULT '[]'::json"))
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(User)) == 0:
            # database vuoto: l'utente tecnico esiste sempre, i dati dimostrativi sono opzionali
            _user(db, "admin", config.ADMIN_PASSWORD, "admin", "Amministratore tecnico")
            db.commit()
            if config.SEED_DEMO:
                seed_demo(db)
