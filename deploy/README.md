# Nutriplan - installation bundle

Everything needed to run Nutriplan in production: no source code is required on
the server, the containers are downloaded from Docker Hub.

## Requirements

- Linux server with **Docker Engine** and **Docker Compose v2** (`docker compose`)
- a DNS record for your domain pointing to the server
- ports **80** and **443** open (HTTPS certificates are issued by Let's Encrypt)

## Install

```bash
unzip install.zip
cd install
./install.sh
```

`install.sh` asks for the domain and an e-mail address, generates the database
and administrator passwords, downloads the images and starts the application.
It prints the URL and the administrator password at the end (also stored in
`.env`). For unattended installs:

```bash
NP_DOMAIN=nutriplan.example.org NP_ACME_EMAIL=me@example.org ./install.sh
```

For a **local test** leave the domain empty (it becomes `localhost`) and open
`https://localhost` (self-signed certificate: accept the browser warning).

`install.sh` is always a **clean installation**. If it finds a previous
installation (`.env`, `data/` folder or Nutriplan containers) it asks you to type
`yes` and then **deletes everything** (database, documents, certificates) before
installing. For unattended use set `NP_CONFIRM_RESET=yes`.

## Data

Everything persistent (database, uploaded documents, TLS certificates) lives in
the `data/` folder next to these files. **Back it up.** It is owned by the
database user: use `sudo` to copy it, or `pg_dump` (see below).

## Update

Do **not** run `install.sh` (it resets everything). Unzip the newer `install.zip`
over this folder (`.env` and `data/` are kept), then:

```bash
sed -i "s|^NUTRIPLAN_IMAGE=.*|$(cat release.conf)|" .env
docker compose --env-file .env -f docker-compose.yml pull
docker compose --env-file .env -f docker-compose.yml up -d
```

## Everyday commands

Run them in this folder:

```bash
docker compose --env-file .env -f docker-compose.yml logs -f backend-and-frontend   # logs
docker compose --env-file .env -f docker-compose.yml down              # stop (data is kept)
docker compose --env-file .env -f docker-compose.yml exec db \
  pg_dump -U nutriplan nutriplan > backup.sql                          # SQL backup
```

## Configuration

Edit `.env`, then `docker compose --env-file .env -f docker-compose.yml up -d`. Every variable is documented in
`.env.example` and marked `[COMMON]`, `[DEV]` or `[PROD]` (only `[COMMON]` and
`[PROD]` matter here).
