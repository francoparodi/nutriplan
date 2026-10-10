import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, config
from .db import SessionLocal, engine
from .routers import admin, auth, backup, diets, patients, reports
from .seed import init_db
from .services import metrics

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("nutriplan")
ROOT = Path(__file__).resolve().parent
# Built React frontend (frontend/ -> vite build). Override with STATIC_DIR when serving it from elsewhere.
STATIC = Path(os.getenv("STATIC_DIR", str(ROOT / "static")))
DOCS = ROOT.parent / "docs"


async def _sampler():
    import psutil
    psutil.cpu_percent(interval=None)
    while True:
        await asyncio.sleep(config.METRICS_INTERVAL_S)
        try:
            await asyncio.to_thread(metrics.sample, SessionLocal)
        except Exception:
            log.exception("campionamento metriche fallito")


@asynccontextmanager
async def lifespan(app: FastAPI):
    metrics.install_log_handler()
    init_db(engine, SessionLocal)
    task = asyncio.create_task(_sampler())
    log.info("Nutriplan %s avviato", __version__)
    yield
    task.cancel()


app = FastAPI(title="Nutriplan", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None,
              openapi_url=None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if (request.url.path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH", "DELETE")
            and request.headers.get("x-requested-with") != "nutriplan"):
        return JSONResponse({"detail": "csrf"}, status_code=403)
    try:
        resp = await call_next(request)
    except Exception:
        log.exception("Errore non gestito su %s %s", request.method, request.url.path)
        metrics.count_request(500)
        return JSONResponse({"detail": "server_error"}, status_code=500)
    if request.url.path.startswith("/api/"):
        metrics.count_request(resp.status_code)
        resp.headers.setdefault("Cache-Control", "no-store")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
        "frame-ancestors 'none'; object-src 'self'; base-uri 'self'; form-action 'self'")
    return resp


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse({"detail": "validation_error",
                         "errors": [{"loc": list(e["loc"])[1:], "msg": e["msg"]} for e in exc.errors()]},
                        status_code=422)


for r in (auth.router, admin.router, patients.router, diets.router, reports.router, backup.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": __version__}


@app.get("/api/guide/{role}")
def guide(role: str, lang: str = "it"):
    if role not in ("medico", "paziente") or lang not in ("it", "en"):
        raise HTTPException(404, "not_found")
    f = DOCS / f"guida-{role}.{lang}.md"
    if not f.exists():
        raise HTTPException(404, "not_found")
    return PlainTextResponse(f.read_text(encoding="utf-8"))


if STATIC.is_dir():
    app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")


@app.exception_handler(404)
async def spa_fallback(request: Request, exc):
    """Client-side routes (React Router) fall back to index.html; unknown API paths stay JSON 404."""
    index = STATIC / "index.html"
    if request.url.path.startswith("/api/") or not index.exists():
        return JSONResponse({"detail": getattr(exc, "detail", "not_found")}, status_code=404)
    return FileResponse(index)
