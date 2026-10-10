# Nutriplan

[🇬🇧 English](README.md) · 🇮🇹 Italiano

Diario alimentare web per medici/nutrizionisti e pazienti. Il medico crea piani alimentari (pasti, alternative, quantità, sostituzioni equivalenti), li assegna ai pazienti e ne segue l'andamento; il paziente compila il diario, registra il peso e può solo scegliere le sostituzioni previste dal medico.

## Funzioni
- **Ruoli**: medico (più medici, ognuno con i propri pazienti e diete), paziente, amministratore tecnico.
- **Piani alimentari configurabili**: pasti → alternative (A, B, C… con portata I/II e limiti settimanali) → alimenti; pasti «come a pranzo»; extra giornalieri; **gruppi di sostituzione** (Carne 200 g, Pane 70 g…) con quantità riproporzionate. Copia, modifica, eliminazione, assegnazione con date di validità; assegnando una dieta a chi ne ha già una attiva, il medico sceglie se sostituirla o mettere la nuova in pausa.
- **Diario del paziente**: conferma per pasto (come da dieta / altro / saltato), sostituzioni, quantità effettivamente mangiata (le variazioni sono evidenziate al medico), navigazione a ritroso con calendario, avviso sui giorni non completati, peso.
- **Andamento**: grafici di peso, aderenza e misure corporee, per medico e paziente.
- **Scheda paziente** completa con campi personalizzati, contatti, foto profilo, visite (misure, note, allegati), documenti, foto e ricette.
- **PDF del piano** (impaginazione analoga ai piani cartacei) e **resoconti PDF/Excel** per intervallo di date.
- **Backup ZIP** per singolo medico (il ripristino non tocca i dati degli altri medici) e backup completo per l'amministratore.
- **Admin**: carico CPU/memoria/disco, utenti collegati, log di attività e di applicazione, utilizzo, attivazione/disattivazione/eliminazione utenti, backup completo.
- Tema chiaro/scuro, italiano/inglese, responsive, sidebar collassabile, login persistente, password monouso per i reset.

I piani dimostrativi trascritti da `Franco.pdf` e `Giorgia.pdf` sono creati insieme ai dati demo. Si possono anche caricare in qualsiasi momento con l'upload dei PDF: il medico da **Diete → Importa da PDF**, l'amministratore da **Importa diete** (scegliendo il medico destinatario). I PDF sono scansioni, quindi vengono riconosciuti dall'impronta (titolo/pagine/hash) e viene creato il piano già trascritto; PDF qualsiasi non vengono interpretati (servirebbe l'OCR).

## Avvio rapido (sviluppo)
```bash
cp .env.example .env              # facoltativo: ogni variabile ha un default
docker compose up -d --build
```
- Interfaccia web: **http://localhost:5173** (dev server Vite con hot reload, inoltra `/api`)
- API: http://localhost:8000 · PostgreSQL: `localhost:55432`
- Le due porte web sono raggiungibili dagli altri PC della LAN (`http://<ip-del-pc>:5173`).

Utenti dimostrativi creati al primo avvio (database vuoto):

| Utente | Password | Ruolo |
|---|---|---|
| medico | medico | medico |
| franco | franco | paziente |
| giorgia | giorgia | paziente |
| admin | admin123 | amministratore tecnico |

Container: `nutriplan-db`, `nutriplan-backend`, `nutriplan-frontend`. I file del database sono in `./data/postgres` (`DATA_DIR`), quindi sopravvivono a `docker compose down -v`; per ripartire da zero basta eliminare la cartella.

Test automatici (usano il database `nutriplan_test`, creato da soli e azzerato a ogni esecuzione):
```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
TEST_DATABASE_URL=postgresql+psycopg://nutriplan:<POSTGRES_PASSWORD>@localhost:55432/nutriplan_test \
  .venv/bin/python -m pytest tests
```

Controlli del frontend senza installare Node (usa un container):
```bash
docker run --rm -v "$PWD/frontend":/w -w /w node:24-alpine sh -c "npm ci && npx tsc --noEmit && npx vite build"
```

---

## Installazione in produzione (tecnica)

La produzione usa tre container dietro HTTPS, avviati da **immagini Docker pubblicate**: sul server non si copia mai il codice sorgente.

| Container | Immagine | Ruolo |
|---|---|---|
| `nutriplan-traefik` | `traefik` | Reverse proxy HTTPS: certificati Let's Encrypt (emessi e rinnovati automaticamente), redirect HTTP→HTTPS, HSTS. È l'unico container esposto a internet (80/443). |
| `nutriplan-backend-and-frontend` | `<utente-dockerhub>/nutriplan-backend` | API FastAPI **e** interfaccia web React compilata. |
| `nutriplan-db` | `postgres:16-alpine` | PostgreSQL; raggiungibile solo dalla rete Docker interna. |

### A. Pubblicare una release (sul PC di sviluppo)
Requisiti: Docker, `docker login` su Docker Hub, `zip` (oppure `python3`).

```bash
DOCKERHUB_USER=<tuo-utente-dockerhub> ./scripts/release.sh
```
Lo script (`scripts/release.sh`):
1. costruisce l'immagine (multi-stage: compila il frontend React e poi impacchetta il backend) e la etichetta `:<versione>` e `:latest` (la versione è in `app/__init__.py`);
2. la pubblica su Docker Hub;
3. crea **`dist/install.zip`** con `install.sh`, il `docker-compose.yml` di produzione, `.env.example`, `release.conf` (fissa la versione dell'immagine) e un breve `README.md`.

Opzioni: `--version 1.2.0` (tag esplicito), `--no-push` (build locale e solo creazione dello zip), `PLATFORMS=linux/amd64,linux/arm64` (multi-architettura, richiede `docker buildx`).

> Se il repository su Docker Hub è privato, esegui `docker login` sul server prima dell'installazione.

### B. Installare sul server
Requisiti: server Linux con **Docker Engine + Docker Compose v2**, record DNS del dominio che punta al server, porte **80 e 443** aperte.

```bash
# copia install.zip sul server (scp, sftp…), poi:
unzip install.zip
cd install
./install.sh
```
`install.sh` chiede il dominio e un'e-mail per Let's Encrypt, genera password casuali robuste per database e amministratore, scarica le immagini, avvia tutto e attende che il backend sia pronto. Alla fine stampa l'URL e la **password dell'amministratore** (salvata anche in `.env`, permessi 600). Per installazioni non interattive: `NP_DOMAIN=... NP_ACME_EMAIL=... ./install.sh`.

**Prova in locale sul proprio PC**: lascia vuoto il dominio (diventa `localhost`) e apri `https://localhost`; il certificato è autofirmato, quindi accetta l'avviso del browser. L'app risponde anche su `https://localhost` e sull'indirizzo IP del server (es. `https://192.168.0.10` da un altro PC o telefono della LAN, con l'avviso del certificato autofirmato); con un dominio vero usa quel nome.

Su una nuova installazione esiste solo l'utente `admin`: accedi e crea o attiva i medici dalla pagina **Utenti** (i medici possono anche registrarsi da soli; l'account resta disattivato finché l'admin non lo attiva).

### C. Aggiornare
Decomprimi il nuovo `install.zip` sopra la cartella `install` esistente (`.env` e `data/` vengono mantenuti) ed esegui di nuovo `./install.sh`: scarica la nuova immagine e riavvia i container.

### D. Gestione
```bash
cd install
docker compose --env-file .env -f docker-compose.yml logs -f backend-and-frontend     # log
docker compose --env-file .env -f docker-compose.yml down                # ferma (i dati restano)
docker compose --env-file .env -f docker-compose.yml exec db pg_dump -U nutriplan nutriplan > backup.sql
```
- **Persistenza**: tutto (database, documenti allegati, certificati TLS) sta in `PROD_DATA_DIR` (default `install/data`), fuori dai container: `down`, `down -v` e gli aggiornamenti delle immagini non lo toccano. La cartella appartiene all'utente del database (uid 70): per copiarla usa `sudo` o `pg_dump`.
- **Backup**: oltre alla cartella, pianifica un `pg_dump` e/o usa i backup ZIP dell'app; conserva copie fuori dal server.
- **Sicurezza**: l'installer rifiuta le password di default; i dati demo sono disattivati in produzione; il cookie di sessione è `Secure`/`HttpOnly`/`SameSite=Lax`; Traefik legge il socket Docker in sola lettura per trovare il backend, quindi proteggi l'accesso al server.

### E. Produzione da un checkout dei sorgenti (alternativa)
```bash
cp .env.example .env     # imposta le variabili [PROD] e [COMMON]
docker compose -f docker-compose-prod.yml up -d --build
```

## Configurazione
Un unico file, **`.env.example`**, documenta ogni variabile e la marca `[COMMON]`, `[DEV]` o `[PROD]`:

| Variabile | Ambito | Significato |
|---|---|---|
| `POSTGRES_PASSWORD` | comune | password del database (obbligatoria e casuale in produzione) |
| `ADMIN_PASSWORD` | comune | password dell'utente `admin` creato a database vuoto |
| `APP_TZ`, `SESSION_DAYS`, `MAX_UPLOAD_MB`, `MAX_BACKUP_MB` | comune | fuso orario, durata del login, limiti di upload |
| `DATA_DIR`, `DB_PORT`, `SEED_DEMO`, `COOKIE_SECURE` | sviluppo | cartella dati, porta DB, dati demo, flag cookie |
| `DOMAIN`, `ACME_EMAIL`, `NUTRIPLAN_IMAGE`, `PROD_DATA_DIR`, `PROD_SEED_DEMO` | produzione | dominio pubblico, e-mail Let's Encrypt, immagine, cartella dati, dati demo (lasciare `false`) |

## Architettura
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL (`app/`). Tutti i dati, compresi documenti e foto allegati, sono in PostgreSQL; chiavi primarie UUID.
- **Frontend**: React 19 + TypeScript + Vite, React Router, Chart.js (`frontend/`). In produzione la build è servita da FastAPI.
- **Sicurezza**: sessioni lato server in cookie `HttpOnly`, header anti-CSRF, blocco temporaneo dei login, password con bcrypt, isolamento rigoroso dei dati per medico (l'admin non accede ai dati clinici), validazione di immagini e URL nei caricamenti e nei contatti.
- Le registrazioni del diario conservano un'istantanea testuale del pasto: modificare o eliminare una dieta non altera lo storico.

## Guide
- [Guida medico](docs/guida-medico.it.md) · [Doctor guide](docs/guida-medico.en.md)
- [Guida paziente](docs/guida-paziente.it.md) · [Patient guide](docs/guida-paziente.en.md)

Le guide sono consultabili anche dall'app (menu **Guida**), nella lingua selezionata.

## Note
- I backup contengono gli hash delle password e dati sanitari: conservarli in modo protetto.
- Nel trascrivere i PDF alcune annotazioni a mano illeggibili non sono state riportate nei piani demo.
