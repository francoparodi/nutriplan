"""Modello dati di Nutriplan (PostgreSQL).

Tutte le chiavi primarie sono UUID, cosi' i backup per singolo medico possono essere
ripristinati senza collisioni. Le tabelle di proprieta' del medico hanno la colonna
denormalizzata ``doctor_id``: semplifica i controlli di accesso e il backup per medico.
"""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, LargeBinary,
                        Numeric, String, Text, UniqueConstraint, Uuid, JSON, Float, Index)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, deferred


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


def pk():
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


# ----------------------------------------------------------------- utenti / sessioni
class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = pk()
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(10), index=True)  # admin | doctor | patient
    full_name: Mapped[str] = mapped_column(String(160), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    # optional contact details (all roles); the patient's phone used to live in PatientProfile
    phone: Mapped[str] = mapped_column(String(120), default="")
    whatsapp: Mapped[str] = mapped_column(String(120), default="")
    telegram: Mapped[str] = mapped_column(String(120), default="")
    instagram: Mapped[str] = mapped_column(String(200), default="")
    facebook: Mapped[str] = mapped_column(String(200), default="")
    website: Mapped[str] = mapped_column(String(200), default="")
    lang: Mapped[str] = mapped_column(String(5), default="it")
    theme: Mapped[str] = mapped_column(String(10), default="light")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserSession(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str] = mapped_column(String(64), default="")
    user_agent: Mapped[str] = mapped_column(String(255), default="")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    username: Mapped[str] = mapped_column(String(64), default="")
    role: Mapped[str] = mapped_column(String(10), default="")
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity: Mapped[str] = mapped_column(String(64), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    ip: Mapped[str] = mapped_column(String(64), default="")


class AppLog(Base):
    __tablename__ = "app_logs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    level: Mapped[str] = mapped_column(String(10), index=True)
    logger: Mapped[str] = mapped_column(String(80), default="")
    message: Mapped[str] = mapped_column(Text, default="")


class Metric(Base):
    __tablename__ = "metrics"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    cpu: Mapped[float] = mapped_column(Float, default=0)
    mem: Mapped[float] = mapped_column(Float, default=0)
    load1: Mapped[float] = mapped_column(Float, default=0)
    disk: Mapped[float] = mapped_column(Float, default=0)
    online: Mapped[int] = mapped_column(Integer, default=0)
    requests: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[int] = mapped_column(Integer, default=0)


# ----------------------------------------------------------------- paziente
class PatientProfile(Base):
    __tablename__ = "patient_profiles"
    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[str] = mapped_column(String(10), default="")
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    phone: Mapped[str] = mapped_column(String(60), default="")
    address: Mapped[str] = mapped_column(String(255), default="")
    tax_code: Mapped[str] = mapped_column(String(32), default="")
    occupation: Mapped[str] = mapped_column(String(120), default="")
    activity_level: Mapped[str] = mapped_column(String(60), default="")
    allergies: Mapped[str] = mapped_column(Text, default="")
    intolerances: Mapped[str] = mapped_column(Text, default="")
    pathologies: Mapped[str] = mapped_column(Text, default="")
    medications: Mapped[str] = mapped_column(Text, default="")
    family_history: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    custom: Mapped[list] = mapped_column(JSON, default=list)  # [{label, value}]
    photo_mime: Mapped[str] = mapped_column(String(60), default="")  # "" = no profile photo
    photo: Mapped[bytes | None] = deferred(mapped_column(LargeBinary, nullable=True))


class UserPhoto(Base):
    """Foto profilo del medico (quella del paziente e' in PatientProfile)."""
    __tablename__ = "user_photos"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)  # = user_id; serve a backup e scoping
    mime: Mapped[str] = mapped_column(String(60), default="")
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary))


class Visit(Base):
    """Visita/controllo registrato dal medico: misure, note e allegati (documenti con visit_id)."""
    __tablename__ = "visits"
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)       # girovita
    leg_length_cm: Mapped[float | None] = mapped_column(Float, nullable=True)  # lunghezza muscolo gamba
    calf_cm: Mapped[float | None] = mapped_column(Float, nullable=True)        # circonferenza polpaccio
    biceps_cm: Mapped[float | None] = mapped_column(Float, nullable=True)      # circonferenza bicipite
    extra: Mapped[list] = mapped_column(JSON, default=list)                    # [{label, value, unit}]
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PatientDocument(Base):
    __tablename__ = "patient_documents"
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(12), default="document")  # document | photo | recipe
    title: Mapped[str] = mapped_column(String(200), default="")
    filename: Mapped[str] = mapped_column(String(255), default="")
    mime: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    visible_to_patient: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[str] = mapped_column(String(10), default="doctor")  # doctor | patient
    visit_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)  # allegato a una visita
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary))


class Weight(Base):
    __tablename__ = "weights"
    __table_args__ = (UniqueConstraint("patient_id", "date"),)
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    kg: Mapped[float] = mapped_column(Numeric(5, 2))
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# ----------------------------------------------------------------- dieta
class Diet(Base):
    __tablename__ = "diets"
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")  # indicazioni generali (una per riga)
    conversion: Mapped[list] = mapped_column(JSON, default=list)  # tabella crudo/cotto [{name, raw}]
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="active")  # active | archived
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class DietGroup(Base):
    """Gruppo di sostituzione (es. CARNE 200 g, PANE 70 g, FRUTTA 150 g, DOLCE...)."""
    __tablename__ = "diet_groups"
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    diet_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("diets.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(200))
    ref_qty: Mapped[float | None] = mapped_column(Float, nullable=True)
    ref_unit: Mapped[str] = mapped_column(String(20), default="g")
    note: Mapped[str] = mapped_column(Text, default="")


class DietGroupMember(Base):
    __tablename__ = "diet_group_members"
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("diet_groups.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(200))
    qty: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(20), default="g")
    qty_text: Mapped[str] = mapped_column(String(120), default="")  # testo libero (es. "90 g + 70 g")
    note: Mapped[str] = mapped_column(String(255), default="")
    max_per_week: Mapped[int | None] = mapped_column(Integer, nullable=True)


class DietMeal(Base):
    __tablename__ = "diet_meals"
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    diet_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("diets.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(120))
    time: Mapped[str] = mapped_column(String(5), default="")  # HH:MM suggerito
    kind: Mapped[str] = mapped_column(String(10), default="meal")  # meal | extras
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    same_as_meal_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)  # "come a pranzo"
    note: Mapped[str] = mapped_column(Text, default="")


class DietOption(Base):
    """Alternativa di un pasto (A, B, C...) oppure componente sempre presente ("addon")."""
    __tablename__ = "diet_options"
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    meal_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("diet_meals.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str] = mapped_column(String(60), default="")  # "A", "B"...
    course: Mapped[str] = mapped_column(String(20), default="")  # "I", "II"
    kind: Mapped[str] = mapped_column(String(10), default="choice")  # choice | addon
    max_per_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str] = mapped_column(String(255), default="")


class DietItem(Base):
    __tablename__ = "diet_items"
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    option_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("diet_options.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(200))
    qty: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(20), default="g")
    qty_text: Mapped[str] = mapped_column(String(120), default="")
    group_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)  # sostituibile (asterisco)
    note: Mapped[str] = mapped_column(String(255), default="")
    max_per_week: Mapped[int | None] = mapped_column(Integer, nullable=True)


# ----------------------------------------------------------------- diario
class MealLog(Base):
    __tablename__ = "meal_logs"
    __table_args__ = (UniqueConstraint("patient_id", "date", "meal_id"),
                      Index("ix_meal_logs_patient_date", "patient_id", "date"))
    id: Mapped[uuid.UUID] = pk()
    doctor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    diet_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    meal_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    meal_name: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(10), default="done")  # done | off_plan | skipped
    option_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    option_label: Mapped[str] = mapped_column(Text, default="")  # istantanea testuale
    substitutions: Mapped[list] = mapped_column(JSON, default=list)
    extras: Mapped[list] = mapped_column(JSON, default=list)
    # quantities changed by the patient: [{item_id, item_name, unit, planned, actual}]
    adjustments: Mapped[list] = mapped_column(JSON, default=list)
    free_text: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# Ordine di dipendenza per backup/restore (le tabelle "figlie" dopo le "madri").
SCOPED_TABLES = [
    PatientProfile, UserPhoto, Visit, PatientDocument, Weight, Diet, DietGroup, DietGroupMember,
    DietMeal, DietOption, DietItem, MealLog,
]
