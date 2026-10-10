import os

os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL", "postgresql+psycopg://nutriplan:nutriplan@localhost:55432/nutriplan_test")
os.environ["SEED_DEMO"] = "true"
os.environ["METRICS_INTERVAL_S"] = "3600"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

# Create the test database on the server if it does not exist yet
# (docker/db-init only runs when the PostgreSQL volume is first initialised).
_url = make_url(os.environ["DATABASE_URL"])
_admin = create_engine(_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
with _admin.connect() as _c:
    if not _c.scalar(text("select 1 from pg_database where datname = :n"), {"n": _url.database}):
        _c.execute(text(f'create database "{_url.database}"'))
_admin.dispose()

from app.db import engine
from app.models import Base


@pytest.fixture(scope="session")
def app_client():
    with engine.begin() as c:
        c.execute(text("drop schema public cascade"))
        c.execute(text("create schema public"))
    from app.main import app
    with TestClient(app) as c:
        yield c


def make_client(app):
    c = TestClient(app, headers={"X-Requested-With": "nutriplan"})
    return c


@pytest.fixture()
def login(app_client):
    app = app_client.app

    def _login(user, pw=None):
        c = make_client(app)
        r = c.post("/api/auth/login", json={"username": user, "password": pw or user if user != "admin" else (pw or "admin123")})
        assert r.status_code == 200, r.text
        return c
    return _login
