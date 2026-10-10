# ---- stage 1: build the React frontend ---------------------------------------
FROM node:24-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- stage 2: API + built frontend --------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# Release identification (git tag or commit), stamped by scripts/release.sh and shown in the web interface
ARG APP_VERSION=
ARG APP_COMMIT=
ENV APP_VERSION=${APP_VERSION} APP_COMMIT=${APP_COMMIT}
WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY docs ./docs
COPY --from=frontend /frontend/dist ./app/static

# Run as an unprivileged user
RUN useradd --system --no-create-home nutriplan
USER nutriplan

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status == 200 else 1)"

# --proxy-headers: the app sits behind Traefik in production (X-Forwarded-* headers)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
