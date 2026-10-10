# Nutriplan

🇬🇧 English · [🇮🇹 Italiano](README.it.md)

Web food diary for doctors/nutritionists and patients. The doctor builds meal plans (meals, alternatives, quantities, equivalent substitutions), assigns them to patients and follows their progress; the patient fills in the diary, logs the weight and can only choose the substitutions allowed by the doctor.

## Features
- **Roles**: doctor (many doctors, each with their own patients and diets), patient, technical administrator.
- **Configurable meal plans**: meals → alternatives (A, B, C… with course I/II and weekly limits) → foods; "same as lunch" meals; daily extras; **substitution groups** (Meat 200 g, Bread 70 g…) with quantities scaled to the planned amount. Copy, edit, delete, assign with validity dates; assigning over an active diet asks the doctor to replace it or put the new one on hold.
- **Patient diary**: confirm each meal (as planned / something else / skipped), substitutions, actual quantity eaten (changes are highlighted for the doctor), navigation through past days with a calendar, warnings about unconfirmed days, weight tracking.
- **Progress**: weight, adherence and body-measurement charts, for doctor and patient.
- **Full patient record** with custom fields, contacts, profile photo, visits (measurements, notes, attachments), documents, photos and recipes.
- **Meal plan PDF** (layout similar to paper plans) and **PDF/Excel reports** for any date range.
- **ZIP backup** per doctor (restore never touches other doctors' data) and full backup for the administrator.
- **Admin**: CPU/memory/disk load, connected users, activity and application logs, usage, activate/deactivate/delete users, full backup.
- Light/dark theme, Italian/English, responsive, collapsible sidebar, persistent login, one-time passwords for resets.

Sample plans transcribed from `Franco.pdf` and `Giorgia.pdf` are created with the demo data. They can also be loaded at any time by uploading the PDFs: doctors from **Diets → Import from PDF**, the administrator from **Import diets** (choosing the target doctor). The source PDFs are scans, so they are recognised by fingerprint (title/pages/hash) and the already transcribed plan is created; arbitrary PDFs are not parsed (that would need OCR).

## Quick start (development)
```bash
cp .env.example .env              # optional: every variable has a default
docker compose up -d --build
```
- Web interface: **http://localhost:5173** (Vite dev server with hot reload, proxies `/api`)
- API: http://localhost:8000 · PostgreSQL: `localhost:55432`
- Both web ports are reachable from other machines of your LAN (`http://<pc-ip>:5173`).

Demo users created on the first start (empty database):

| User | Password | Role |
|---|---|---|
| medico | medico | doctor |
| franco | franco | patient |
| giorgia | giorgia | patient |
| admin | admin123 | technical administrator |

Containers: `nutriplan-db`, `nutriplan-backend`, `nutriplan-frontend`. Database files are in `./data/postgres` (`DATA_DIR`), so they survive `docker compose down -v`; delete the folder to start from scratch.

Automated tests (they use the `nutriplan_test` database, created automatically and wiped on every run):
```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
TEST_DATABASE_URL=postgresql+psycopg://nutriplan:<POSTGRES_PASSWORD>@localhost:55432/nutriplan_test \
  .venv/bin/python -m pytest tests
```

Frontend checks without installing Node (uses a container):
```bash
docker run --rm -v "$PWD/frontend":/w -w /w node:24-alpine sh -c "npm ci && npx tsc --noEmit && npx vite build"
```

---

## Production installation (technical)

Production runs three containers behind HTTPS, started from **published Docker images**: you never copy the source code to the server.

| Container | Image | Role |
|---|---|---|
| `nutriplan-traefik` | `traefik` | HTTPS reverse proxy: Let's Encrypt certificates (issued/renewed automatically), HTTP→HTTPS redirect, HSTS. The only container exposed to the internet (80/443). |
| `nutriplan-backend-and-frontend` | `<dockerhub-user>/nutriplan-backend` | FastAPI API **and** the compiled React web interface. |
| `nutriplan-db` | `postgres:16-alpine` | PostgreSQL; reachable only from the internal Docker network. |

### A. Publish a release (on your development machine)
Requirements: Docker, `docker login` to Docker Hub, `zip` (or `python3`).

```bash
DOCKERHUB_USER=<your-dockerhub-user> ./scripts/release.sh
```
The script (`scripts/release.sh`):
1. builds the image (multi-stage: compiles the React frontend, then packages the backend) and tags it `:<version>` and `:latest` (the version comes from `app/__init__.py`);
2. pushes it to Docker Hub;
3. creates **`dist/install.zip`** with `install.sh`, the production `docker-compose.yml`, `.env.example`, `release.conf` (pins the image version) and a short `README.md`.

Options: `--version 1.2.0` (explicit tag), `--no-push` (build locally and only create the zip), `PLATFORMS=linux/amd64,linux/arm64` (multi-architecture, needs `docker buildx`).

> If the Docker Hub repository is private, run `docker login` on the server before installing.

### B. Install on the server
Requirements: Linux server with **Docker Engine + Docker Compose v2**, a DNS record of your domain pointing to the server, ports **80 and 443** open.

```bash
# copy install.zip to the server (scp, sftp…), then:
unzip install.zip
cd install
./install.sh
```
`install.sh` asks for the domain and a Let's Encrypt e-mail, generates strong random database and administrator passwords, downloads the images, starts everything and waits until the backend is healthy. At the end it prints the URL and the **administrator password** (also stored in `.env`, mode 600). For unattended installs: `NP_DOMAIN=... NP_ACME_EMAIL=... ./install.sh`.

**Local test on your own PC**: leave the domain empty (it becomes `localhost`) and open `https://localhost`; the certificate is self-signed, so accept the browser warning. The app also answers on `https://localhost` and on the server's raw IP address (e.g. `https://192.168.0.10` from another PC or phone on the LAN, self-signed certificate warning); with a real domain, use that name.

On a fresh install only the `admin` user exists: log in and create or activate doctors from the **Users** page (doctors can also self-register; their account stays disabled until the admin activates it).

### C. Update
Unzip the new `install.zip` over the existing `install` folder (your `.env` and `data/` are kept) and run `./install.sh` again: it pulls the new image and restarts the containers.

### D. Operations
```bash
cd install
docker compose --env-file .env -f docker-compose.yml logs -f backend-and-frontend     # logs
docker compose --env-file .env -f docker-compose.yml down                # stop (data is kept)
docker compose --env-file .env -f docker-compose.yml exec db pg_dump -U nutriplan nutriplan > backup.sql
```
- **Persistence**: everything (database, uploaded documents, TLS certificates) lives in `PROD_DATA_DIR` (default `install/data`), outside the containers: `down`, `down -v` and image updates never touch it. The folder is owned by the database user (uid 70): use `sudo` or `pg_dump` to copy it.
- **Backups**: besides the folder, schedule a `pg_dump` and/or use the in-app ZIP backups; keep copies off the server.
- **Security**: the installer refuses default passwords; demo data is disabled in production; the session cookie is `Secure`/`HttpOnly`/`SameSite=Lax`; Traefik reads the Docker socket read-only to discover the backend, so restrict access to the server.

### E. Running production from a source checkout (alternative)
```bash
cp .env.example .env     # set the [PROD] and [COMMON] variables
docker compose -f docker-compose-prod.yml up -d --build
```

## Configuration
A single file, **`.env.example`**, documents every variable and marks it `[COMMON]`, `[DEV]` or `[PROD]`:

| Variable | Scope | Meaning |
|---|---|---|
| `POSTGRES_PASSWORD` | common | database password (required and random in production) |
| `ADMIN_PASSWORD` | common | password of the `admin` user created on an empty database |
| `APP_TZ`, `SESSION_DAYS`, `MAX_UPLOAD_MB`, `MAX_BACKUP_MB` | common | time zone, login lifetime, upload limits |
| `DATA_DIR`, `DB_PORT`, `SEED_DEMO`, `COOKIE_SECURE` | dev | data folder, DB port, demo data, cookie flag |
| `DOMAIN`, `ACME_EMAIL`, `NUTRIPLAN_IMAGE`, `PROD_DATA_DIR`, `PROD_SEED_DEMO` | prod | public host name, Let's Encrypt e-mail, image, data folder, demo data (keep `false`) |

## Architecture
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL (`app/`). All data, including attached documents and photos, is stored in PostgreSQL; primary keys are UUIDs.
- **Frontend**: React 19 + TypeScript + Vite, React Router, Chart.js (`frontend/`). In production the build is served by FastAPI.
- **Security**: server-side sessions in `HttpOnly` cookies, anti-CSRF header, login throttling, bcrypt passwords, strict per-doctor data isolation (the admin has no access to clinical data), image/URL validation on uploads and contacts.
- Diary records keep a textual snapshot of the meal: editing or deleting a diet never alters history.

## Guides
- [Doctor guide](docs/guida-medico.en.md) · [Guida medico](docs/guida-medico.it.md)
- [Patient guide](docs/guida-paziente.en.md) · [Guida paziente](docs/guida-paziente.it.md)

The guides are also available inside the app (**Guide** menu) in the selected language.

## Notes
- Backups contain password hashes and health data: store them securely.
- Some illegible handwritten annotations of the source PDFs were not transcribed into the demo plans.
