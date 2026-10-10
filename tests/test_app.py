import io
import zipfile
from datetime import date, timedelta

import pytest

from tests.conftest import make_client


def test_login_and_roles(app_client, login):
    for u in ("franco", "giorgia", "medico", "admin"):
        c = login(u)
        assert c.get("/api/auth/me").json()["username"] == u
    bad = make_client(app_client.app)
    assert bad.post("/api/auth/login", json={"username": "franco", "password": "x"}).status_code == 401
    assert make_client(app_client.app).get("/api/auth/me").status_code == 401


def test_csrf_header_required(login, app_client):
    c = login("franco")
    c.headers.pop("X-Requested-With")
    assert c.post("/api/auth/logout").status_code == 403


def test_isolation(login):
    med, adm, fr, gi = login("medico"), login("admin"), login("franco"), login("giorgia")
    pats = med.get("/api/patients").json()
    assert {p["username"] for p in pats} == {"franco", "giorgia"}
    gid = next(p["id"] for p in pats if p["username"] == "giorgia")
    fid = next(p["id"] for p in pats if p["username"] == "franco")
    assert fr.get(f"/api/patients/{gid}").status_code == 404
    assert fr.get(f"/api/patients/{fid}").status_code == 200
    assert adm.get("/api/patients").status_code == 403
    assert adm.get(f"/api/patients/{fid}").status_code in (403, 404)
    assert fr.get("/api/patients").status_code == 403
    assert fr.get("/api/admin/overview").status_code == 403


def test_seed_diets_and_day(login):
    fr = login("franco")
    me = fr.get("/api/auth/me").json()
    d = fr.get(f"/api/patients/{me['id']}/day/{date.today()}").json()
    names = [m["name"] for m in d["meals"]]
    assert names[:5] == ["Colazione", "Metà mattina", "Pranzo", "Metà pomeriggio", "Cena"]
    pranzo = next(m for m in d["meals"] if m["name"] == "Pranzo")
    assert [o["label"] for o in pranzo["options"]] == list("ABCDEF")
    cena = next(m for m in d["meals"] if m["name"] == "Cena")
    assert len(cena["options"]) == 6  # ereditate dal pranzo
    carne = next(i for i in pranzo["options"][3]["items"] if i["name"] == "Carne")
    assert any(s["name"].startswith("Ricotta") and s["qty_text"] == "120 g" for s in carne["substitutes"])
    giorgia = login("giorgia")
    gid = giorgia.get("/api/auth/me").json()["id"]
    gd = giorgia.get(f"/api/patients/{gid}/day/{date.today()}").json()
    assert [m["name"] for m in gd["meals"]][:2] == ["Mattina", "Pranzo"]
    assert len(next(x for x in gd["diet"] and gd["meals"] if x["name"] == "Cena")["options"]) == 7


def test_logging_flow(login):
    fr = login("franco")
    pid = fr.get("/api/auth/me").json()["id"]
    day = date.today()
    d = fr.get(f"/api/patients/{pid}/day/{day}").json()
    pranzo = next(m for m in d["meals"] if m["name"] == "Pranzo")
    optD = pranzo["options"][3]
    carne = next(i for i in optD["items"] if i["name"] == "Carne")
    sub = next(s for s in carne["substitutes"] if s["name"].startswith("Ricotta"))
    r = fr.put(f"/api/patients/{pid}/day/{day}/meals/{pranzo['id']}", json={
        "status": "done", "option_id": optD["id"],
        "substitutions": [{"item_id": carne["id"], "member_id": sub["id"]}]})
    assert r.status_code == 200, r.text
    lg = next(m for m in r.json()["meals"] if m["id"] == pranzo["id"])["log"]
    assert lg["substitutions"][0]["name"].startswith("Ricotta")
    # sostituzione non prevista -> rifiutata
    bad = fr.put(f"/api/patients/{pid}/day/{day}/meals/{pranzo['id']}", json={
        "status": "done", "option_id": optD["id"],
        "substitutions": [{"item_id": carne["id"], "member_id": "00000000-0000-0000-0000-000000000000"}]})
    assert bad.status_code == 400
    # fuori dieta richiede testo
    assert fr.put(f"/api/patients/{pid}/day/{day}/meals/{pranzo['id']}",
                  json={"status": "off_plan"}).status_code == 400
    ok = fr.put(f"/api/patients/{pid}/day/{day}/meals/{pranzo['id']}",
                json={"status": "off_plan", "free_text": "Pizza"})
    assert ok.status_code == 200
    # futuro non ammesso
    assert fr.put(f"/api/patients/{pid}/day/{date.today() + timedelta(days=5)}/meals/{pranzo['id']}",
                  json={"status": "skipped"}).status_code == 400
    # peso
    assert fr.put(f"/api/patients/{pid}/weights/{day}", json={"kg": 82.4}).status_code == 200
    assert fr.get(f"/api/patients/{pid}/weights").json()[-1]["kg"] == 82.4
    prog = fr.get(f"/api/patients/{pid}/progress").json()
    assert prog["summary"]["off_plan"] >= 1
    # il medico vede ma non scrive i log
    med = login("medico")
    assert med.get(f"/api/patients/{pid}/day/{day}").status_code == 200
    assert med.put(f"/api/patients/{pid}/day/{day}/meals/{pranzo['id']}", json={"status": "skipped"}).status_code == 403


def test_patient_cannot_edit_diet(login):
    fr = login("franco")
    pid = fr.get("/api/auth/me").json()["id"]
    diets = fr.get(f"/api/patients/{pid}/diets").json()
    assert len(diets) == 1
    did = diets[0]["id"]
    doc = fr.get(f"/api/diets/{did}").json()
    assert fr.put(f"/api/diets/{did}", json=doc).status_code == 403
    assert fr.delete(f"/api/diets/{did}").status_code == 403
    assert fr.get(f"/api/diets/{did}/pdf").content[:4] == b"%PDF"


def test_diet_edit_copy_delete(login):
    med = login("medico")
    diets = med.get("/api/diets").json()
    fd = next(d for d in diets if d["patient_name"] == "Franco Parodi")
    doc = med.get(f"/api/diets/{fd['id']}").json()
    meal_ids = [m["id"] for m in doc["meals"]]
    doc["meals"][0]["options"][0]["items"][0]["qty"] = 200
    r = med.put(f"/api/diets/{fd['id']}", json=doc)
    assert r.status_code == 200
    # id preservati
    assert [m["id"] for m in r.json()["meals"]] == meal_ids
    assert r.json()["meals"][0]["options"][0]["items"][0]["qty"] == 200
    cp = med.post(f"/api/diets/{fd['id']}/copy", json={"name": "Copia test"}).json()
    assert cp["id"] != doc["id"] and cp["patient_id"] is None
    assert cp["meals"][4]["same_as_meal_id"] == cp["meals"][2]["id"]
    assert med.delete(f"/api/diets/{cp['id']}").status_code == 200
    assert med.get(f"/api/diets/{cp['id']}").status_code == 404
    # nuova dieta da zero con riferimenti simbolici
    new = med.post("/api/diets", json={"name": "Vuota", "meals": [
        {"id": "a", "name": "Pranzo", "options": [{"label": "A", "items": [{"name": "Pasta", "qty": 80, "group_id": "g"}]}]},
        {"id": "b", "name": "Cena", "same_as_meal_id": "a"}],
        "groups": [{"id": "g", "name": "Pasta", "ref_qty": 80, "members": [{"name": "Riso", "qty": 80}]}]})
    assert new.status_code == 200
    j = new.json()
    assert j["meals"][1]["same_as_meal_id"] == j["meals"][0]["id"]
    assert j["meals"][0]["options"][0]["items"][0]["group_id"] == j["groups"][0]["id"]
    med.delete(f"/api/diets/{j['id']}")


def test_one_shot_password(login, app_client):
    med = login("medico")
    created = med.post("/api/patients", json={"full_name": "Mario Rossi", "username": "mario"}).json()
    temp = created["temporary_password"]
    c = make_client(app_client.app)
    assert c.post("/api/auth/login", json={"username": "mario", "password": temp}).json()["must_change_password"]
    pid = created["id"]
    assert c.get(f"/api/patients/{pid}").status_code == 403  # bloccato finche' non cambia password
    assert c.post("/api/auth/change-password", json={"current_password": temp, "new_password": "corta"}).status_code == 400
    assert c.post("/api/auth/change-password", json={"current_password": temp, "new_password": "Nuova-pass-1"}).status_code == 200
    assert c.get(f"/api/patients/{pid}").status_code == 200
    # reset da parte del medico
    t2 = med.post(f"/api/patients/{pid}/reset-password").json()["temporary_password"]
    assert c.get(f"/api/patients/{pid}").status_code == 401  # sessioni revocate
    c2 = make_client(app_client.app)
    assert c2.post("/api/auth/login", json={"username": "mario", "password": "Nuova-pass-1"}).status_code == 401
    assert c2.post("/api/auth/login", json={"username": "mario", "password": t2}).json()["must_change_password"]


def test_doctor_registration_and_admin_activation(login, app_client):
    c = make_client(app_client.app)
    r = c.post("/api/auth/register", json={"username": "dott2", "password": "password-lunga", "full_name": "Dott Due"})
    assert r.status_code == 200
    assert c.post("/api/auth/login", json={"username": "dott2", "password": "password-lunga"}).status_code == 403
    adm = login("admin")
    u = next(x for x in adm.get("/api/admin/users?role=doctor").json() if x["username"] == "dott2")
    assert not u["active"]
    assert adm.post(f"/api/admin/users/{u['id']}/active", json={"active": True}).status_code == 200
    assert c.post("/api/auth/login", json={"username": "dott2", "password": "password-lunga"}).status_code == 200


def test_documents(login):
    med = login("medico")
    pid = med.get("/api/patients").json()[0]["id"]
    r = med.post(f"/api/patients/{pid}/documents", data={"kind": "recipe", "title": "Ricetta", "visible_to_patient": "true"},
                 files={"file": ("ricetta.txt", b"ciao", "text/plain")})
    assert r.status_code == 200, r.text
    did = r.json()["id"]
    d = med.get(f"/api/patients/{pid}/documents/{did}/download")
    assert d.content == b"ciao" and "attachment" in d.headers["content-disposition"]
    assert med.delete(f"/api/patients/{pid}/documents/{did}").status_code == 200


def test_reports(login):
    med = login("medico")
    pid = med.get("/api/patients").json()[0]["id"]
    a = (date.today() - timedelta(days=10)).isoformat()
    p = med.get(f"/api/patients/{pid}/report.pdf?date_from={a}&date_to={date.today()}")
    assert p.status_code == 200 and p.content[:4] == b"%PDF"
    x = med.get(f"/api/patients/{pid}/report.xlsx?date_from={a}&date_to={date.today()}&lang=en")
    assert x.status_code == 200 and zipfile.is_zipfile(io.BytesIO(x.content))


def test_doctor_backup_restore_isolated(login, app_client):
    adm = login("admin")
    adm.post("/api/admin/doctors", json={"username": "dott3", "full_name": "Dott Tre", "password": "password-lunga"})
    c3 = make_client(app_client.app)
    c3.post("/api/auth/login", json={"username": "dott3", "password": "password-lunga"})
    c3.post("/api/auth/change-password", json={"current_password": "password-lunga", "new_password": "altra-password-1"})
    p3 = c3.post("/api/patients", json={"full_name": "Paz Tre", "username": "paz3"}).json()
    c3.post("/api/diets", json={"name": "Dieta del dottor tre"})
    med = login("medico")
    before = {p["username"] for p in med.get("/api/patients").json()}
    bk = med.get("/api/doctor/backup")
    assert bk.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(bk.content))
    users = z.read("data/users.json").decode()
    assert "paz3" not in users and "franco" in users
    # modifico lo stato del medico, poi ripristino
    pid = next(p["id"] for p in med.get("/api/patients").json() if p["username"] == "giorgia")
    med.delete(f"/api/patients/{pid}")
    med.post("/api/patients", json={"full_name": "Extra Paz", "username": "extrapaz"})
    r = med.post("/api/doctor/restore", files={"file": ("b.zip", bk.content, "application/zip")})
    assert r.status_code == 200, r.text
    after = {p["username"] for p in med.get("/api/patients").json()}
    assert after == before
    # dati dell'altro medico intatti
    assert {p["username"] for p in c3.get("/api/patients").json()} == {"paz3"}
    assert any(d["name"] == "Dieta del dottor tre" for d in c3.get("/api/diets").json())
    # backup di un altro medico rifiutato
    bk3 = c3.get("/api/doctor/backup").content
    assert med.post("/api/doctor/restore", files={"file": ("b.zip", bk3, "application/zip")}).status_code == 400
    # il paziente ripristinato riesce a fare login con la sua password originale
    assert make_client(app_client.app).post("/api/auth/login", json={"username": "giorgia", "password": "giorgia"}).status_code == 200


def test_admin_tools(login):
    adm = login("admin")
    ov = adm.get("/api/admin/overview").json()
    assert ov["online_count"] >= 1 and "cpu" in ov["system"]
    assert adm.get("/api/admin/audit?limit=5").json()["total"] > 0
    assert adm.get("/api/admin/metrics").status_code == 200
    assert adm.get("/api/admin/usage").status_code == 200
    bk = adm.get("/api/admin/backup")
    assert bk.status_code == 200
    r = adm.post("/api/admin/restore", files={"file": ("f.zip", bk.content, "application/zip")})
    assert r.status_code == 200, r.text
    # dopo il ripristino completo le sessioni sono azzerate
    assert adm.get("/api/auth/me").status_code == 401
    c = login("franco")
    assert c.get("/api/auth/me").status_code == 200
    assert login("medico").get("/api/patients").status_code == 200


def test_deactivated_user_blocked(login, app_client):
    med = login("medico")
    pid = next(p["id"] for p in med.get("/api/patients").json() if p["username"] == "giorgia")
    gi = login("giorgia")
    med.post(f"/api/patients/{pid}/active", json={"active": False})
    assert gi.get("/api/auth/me").status_code == 401
    assert make_client(app_client.app).post("/api/auth/login", json={"username": "giorgia", "password": "giorgia"}).status_code == 403
    med.post(f"/api/patients/{pid}/active", json={"active": True})


def test_assign_conflict_replace_and_pause(login):
    med = login("medico")
    pid = next(p["id"] for p in med.get("/api/patients").json() if p["username"] == "franco")
    new = med.post("/api/diets", json={"name": "Seconda dieta"}).json()
    start = (date.today() + timedelta(days=7)).isoformat()
    r = med.post(f"/api/diets/{new['id']}/assign", json={"patient_id": pid, "start_date": start})
    assert r.status_code == 409 and r.json()["detail"] == "diet_conflict"
    # pausa: la nuova non e' attiva, la vecchia continua
    r = med.post(f"/api/diets/{new['id']}/assign", json={"patient_id": pid, "start_date": start, "resolve": "pause"})
    assert r.json()["status"] == "paused"
    diets = med.get(f"/api/patients/{pid}/diets").json()
    assert sum(1 for d in diets if d["status"] == "active") == 1
    # conferma: la vecchia termina il giorno prima
    r = med.post(f"/api/diets/{new['id']}/assign", json={"patient_id": pid, "start_date": start, "resolve": "replace"})
    assert r.json()["status"] == "active"
    old = next(d for d in med.get(f"/api/patients/{pid}/diets").json() if d["id"] != new["id"] and d["status"] == "active")
    assert old["end_date"] == (date.today() + timedelta(days=6)).isoformat()
    med.delete(f"/api/diets/{new['id']}")


def test_admin_delete_users(login, app_client):
    adm = login("admin")
    adm.post("/api/admin/doctors", json={"username": "dottdel", "full_name": "Dott Del", "password": "password-lunga"})
    c = make_client(app_client.app)
    c.post("/api/auth/login", json={"username": "dottdel", "password": "password-lunga"})
    c.post("/api/auth/change-password", json={"current_password": "password-lunga", "new_password": "altra-password-1"})
    c.post("/api/patients", json={"full_name": "Paz Del", "username": "pazdel"})
    c.post("/api/diets", json={"name": "Dieta da eliminare"})
    users = adm.get("/api/admin/users").json()
    pat = next(u for u in users if u["username"] == "pazdel")
    assert adm.delete(f"/api/admin/users/{pat['id']}").status_code == 200
    doc = next(u for u in users if u["username"] == "dottdel")
    c.post("/api/patients", json={"full_name": "Paz Del2", "username": "pazdel2"})
    r = adm.delete(f"/api/admin/users/{doc['id']}")
    assert r.status_code == 200 and r.json()["patients_deleted"] == 1
    names = {u["username"] for u in adm.get("/api/admin/users").json()}
    assert not names & {"dottdel", "pazdel", "pazdel2"} and {"medico", "franco"} <= names
    assert c.get("/api/auth/me").status_code == 401
    # l'admin non puo' eliminare se stesso
    me = adm.get("/api/auth/me").json()["id"]
    assert adm.delete(f"/api/admin/users/{me}").status_code == 404


def test_patient_upload_visible_to_doctor(login):
    fr, med = login("franco"), login("medico")
    pid = fr.get("/api/auth/me").json()["id"]
    r = fr.post(f"/api/patients/{pid}/documents", data={"kind": "photo", "title": "Analisi"},
                files={"file": ("a.png", b"\x89PNG", "image/png")})
    assert r.status_code == 200 and r.json()["uploaded_by"] == "patient"
    did = r.json()["id"]
    assert any(d["id"] == did for d in med.get(f"/api/patients/{pid}/documents").json())
    assert any(d["id"] == did for d in fr.get(f"/api/patients/{pid}/documents").json())
    # documento riservato del medico: il paziente non puo' vederlo ne' eliminarlo
    mine = med.post(f"/api/patients/{pid}/documents", data={"title": "Riservato"},
                    files={"file": ("n.txt", b"x", "text/plain")}).json()
    assert not any(d["id"] == mine["id"] for d in fr.get(f"/api/patients/{pid}/documents").json())
    assert fr.delete(f"/api/patients/{pid}/documents/{mine['id']}").status_code in (403, 404)
    assert fr.delete(f"/api/patients/{pid}/documents/{did}").status_code == 200
    med.delete(f"/api/patients/{pid}/documents/{mine['id']}")


def test_patient_photo(login, app_client):
    fr, med, gi = login("franco"), login("medico"), login("giorgia")
    pid = fr.get("/api/auth/me").json()["id"]
    assert fr.get(f"/api/patients/{pid}/photo").status_code == 404
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    bad = fr.put(f"/api/patients/{pid}/photo", files={"file": ("x.png", b"<html>nope</html>", "image/png")})
    assert bad.status_code == 400
    ok = fr.put(f"/api/patients/{pid}/photo", files={"file": ("x.png", png, "image/png")})
    assert ok.status_code == 200
    assert fr.get(f"/api/patients/{pid}/photo").content == png
    assert med.get(f"/api/patients/{pid}/photo").headers["content-type"] == "image/png"
    assert fr.get("/api/auth/me").json()["has_photo"] is True
    assert any(p["has_photo"] for p in med.get("/api/patients").json())
    assert gi.get(f"/api/patients/{pid}/photo").status_code == 404  # un altro paziente non la vede
    # sopravvive a backup e ripristino del medico
    bk = med.get("/api/doctor/backup").content
    assert med.post("/api/doctor/restore", files={"file": ("b.zip", bk, "application/zip")}).status_code == 200
    assert med.get(f"/api/patients/{pid}/photo").content == png
    fr = login("franco")  # i pazienti ripristinati devono rifare il login
    assert fr.delete(f"/api/patients/{pid}/photo").status_code == 200
    assert fr.get(f"/api/patients/{pid}/photo").status_code == 404


def test_visits(login):
    med, fr, gi = login("medico"), login("franco"), login("giorgia")
    pid = fr.get("/api/auth/me").json()["id"]
    r = med.post(f"/api/patients/{pid}/visits", json={
        "date": "2026-10-01", "weight_kg": 80.5, "waist_cm": 92, "leg_length_cm": 45, "calf_cm": 38, "biceps_cm": 32,
        "extra": [{"label": "Coscia", "value": 55, "unit": "cm"}], "notes": "Buon andamento"})
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    up = med.post(f"/api/patients/{pid}/documents", data={"kind": "photo", "visit_id": vid},
                  files={"file": ("f.png", b"\x89PNG", "image/png")})
    assert up.status_code == 200 and up.json()["visit_id"] == vid and up.json()["visible_to_patient"]
    # il paziente vede la visita con allegati, ma non puo' modificarla
    seen = fr.get(f"/api/patients/{pid}/visits").json()
    assert seen[0]["waist_cm"] == 92 and len(seen[0]["attachments"]) == 1 and seen[0]["extra"][0]["label"] == "Coscia"
    assert fr.post(f"/api/patients/{pid}/visits", json={"date": "2026-10-02"}).status_code == 403
    assert fr.put(f"/api/patients/{pid}/visits/{vid}", json={"date": "2026-10-02"}).status_code == 403
    assert fr.delete(f"/api/patients/{pid}/visits/{vid}").status_code == 403
    assert gi.get(f"/api/patients/{pid}/visits").status_code == 404
    # modifica e backup/ripristino
    assert med.put(f"/api/patients/{pid}/visits/{vid}", json={"date": "2026-10-01", "waist_cm": 90}).json()["waist_cm"] == 90
    bk = med.get("/api/doctor/backup").content
    assert med.post("/api/doctor/restore", files={"file": ("b.zip", bk, "application/zip")}).status_code == 200
    again = med.get(f"/api/patients/{pid}/visits").json()
    assert again[0]["id"] == vid and len(again[0]["attachments"]) == 1
    assert med.delete(f"/api/patients/{pid}/visits/{vid}").status_code == 200
    assert med.get(f"/api/patients/{pid}/visits").json() == []


def test_doctor_photo(login, app_client):
    med, fr = login("medico"), login("franco")
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    assert med.get("/api/auth/photo").status_code == 404
    assert fr.put("/api/auth/photo", files={"file": ("x.png", png, "image/png")}).status_code == 403
    assert med.put("/api/auth/photo", files={"file": ("x.png", b"not an image", "image/png")}).status_code == 400
    assert med.put("/api/auth/photo", files={"file": ("x.png", png, "image/png")}).status_code == 200
    assert med.get("/api/auth/photo").content == png
    assert med.get("/api/auth/me").json()["has_photo"] is True
    bk = med.get("/api/doctor/backup").content
    assert med.post("/api/doctor/restore", files={"file": ("b.zip", bk, "application/zip")}).status_code == 200
    assert med.get("/api/auth/photo").content == png
    assert med.delete("/api/auth/photo").status_code == 200
    assert med.get("/api/auth/photo").status_code == 404


def test_quantity_adjustments(login):
    fr, med = login("franco"), login("medico")
    pid = fr.get("/api/auth/me").json()["id"]
    day = date.today()
    d = fr.get(f"/api/patients/{pid}/day/{day}").json()
    pranzo = next(m for m in d["meals"] if m["name"] == "Pranzo")
    opt = pranzo["options"][0]  # A: Pasta 120 g * ...
    pasta = next(i for i in opt["items"] if i["name"] == "Pasta")
    url = f"/api/patients/{pid}/day/{day}/meals/{pranzo['id']}"
    r = fr.put(url, json={"status": "done", "option_id": opt["id"], "quantities": [
        {"item_id": pasta["id"], "qty": 150}, {"item_id": opt["items"][2]["id"], "qty": opt["items"][2]["qty"]}]})
    assert r.status_code == 200, r.text
    lg = next(m for m in r.json()["meals"] if m["id"] == pranzo["id"])["log"]
    assert lg["adjustments"] == [{"item_id": pasta["id"], "item_name": "Pasta", "unit": "g", "planned": 120, "actual": 150}]
    # quantita' non realistica o voce non presente nell'alternativa scelta -> rifiutata
    assert fr.put(url, json={"status": "done", "option_id": opt["id"], "quantities": [{"item_id": pasta["id"], "qty": 5000}]}).status_code == 400
    other = pranzo["options"][3]["items"][0]["id"]
    assert fr.put(url, json={"status": "done", "option_id": opt["id"], "quantities": [{"item_id": other, "qty": 100}]}).status_code == 400
    # evidenziata nelle analisi e nei resoconti
    prog = med.get(f"/api/patients/{pid}/progress").json()
    assert prog["summary"]["adjusted"] >= 1
    a = day.isoformat()
    pdf = med.get(f"/api/patients/{pid}/report.pdf?date_from={a}&date_to={a}")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    x = med.get(f"/api/patients/{pid}/report.xlsx?date_from={a}&date_to={a}")
    import openpyxl
    ws = openpyxl.load_workbook(io.BytesIO(x.content))["Pasti"]
    assert any(row[4].value and "150" in row[4].value for row in ws.iter_rows(min_row=2))
    fr.delete(url)


def test_contacts(login):
    med, fr = login("medico"), login("franco")
    r = fr.put("/api/auth/preferences", json={"phone": "+39 333 1234567", "whatsapp": "+393331234567",
                                              "telegram": "@franco", "instagram": "franco.p", "website": "franco.example.org"})
    assert r.status_code == 200
    me = r.json()["contacts"]
    assert me["website"] == "https://franco.example.org" and me["telegram"] == "@franco"
    assert fr.put("/api/auth/preferences", json={"website": "javascript:alert(1)"}).status_code == 400
    assert fr.put("/api/auth/preferences", json={"instagram": "data:text/html,x"}).status_code == 400
    # the doctor sees them in the patient record, and the patient sees the doctor's contacts
    pid = fr.get("/api/auth/me").json()["id"]
    assert med.get(f"/api/patients/{pid}").json()["whatsapp"] == "+393331234567"
    assert med.put("/api/auth/preferences", json={"phone": "010 123456", "facebook": "https://facebook.com/medico"}).status_code == 200
    assert fr.get("/api/auth/me").json()["doctor_contacts"]["phone"] == "010 123456"


def test_patient_reports_health_and_doctor_sees_it(login):
    fr, med, gi = login("franco"), login("medico"), login("giorgia")
    pid = fr.get("/api/auth/me").json()["id"]
    r = fr.put(f"/api/patients/{pid}/health", json={"allergies": "arachidi", "intolerances": "lattosio", "pathologies": "diabete tipo 2"})
    assert r.status_code == 200
    row = next(p for p in med.get("/api/patients").json() if p["id"] == pid)
    assert (row["allergies"], row["intolerances"], row["pathologies"]) == ("arachidi", "lattosio", "diabete tipo 2")
    assert med.get(f"/api/patients/{pid}").json()["pathologies"] == "diabete tipo 2"
    assert med.put(f"/api/patients/{pid}/health", json={}).status_code == 403   # doctors use the full record
    assert gi.put(f"/api/patients/{pid}/health", json={}).status_code == 404   # other patients cannot
    fr.put(f"/api/patients/{pid}/health", json={})


def _fake_pdf(title, pages):
    import io as _io
    from reportlab.pdfgen import canvas
    b = _io.BytesIO()
    c = canvas.Canvas(b)
    c.setTitle(title)
    for i in range(pages):
        c.drawString(72, 720, f"page {i}")
        c.showPage()
    c.save()
    return b.getvalue()


def test_import_diet_from_pdf(login, app_client):
    med, fr, adm = login("medico"), login("franco"), login("admin")
    franco = _fake_pdf("Parodi_Franco_piano_alimentare", 7)
    r = med.post("/api/diets/import-pdf", files={"file": ("qualsiasi.pdf", franco, "application/pdf")})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["patient_id"] is None and len(d["groups"]) == 9 and [m["name"] for m in d["meals"]][:3] == ["Colazione", "Metà mattina", "Pranzo"]
    giorgia = _fake_pdf("scan_0001", 6)
    r = med.post("/api/diets/import-pdf", files={"file": ("Giorgia.pdf", giorgia, "application/pdf")})  # riconosciuto dal nome file
    assert r.status_code == 200 and len(r.json()["groups"]) == 6
    # sconosciuto / non PDF / paziente
    assert med.post("/api/diets/import-pdf", files={"file": ("x.pdf", _fake_pdf("altro", 3), "application/pdf")}).status_code == 422
    assert med.post("/api/diets/import-pdf", files={"file": ("x.pdf", b"not a pdf", "application/pdf")}).status_code == 400
    assert fr.post("/api/diets/import-pdf", files={"file": ("Franco.pdf", franco, "application/pdf")}).status_code == 403
    # admin: sceglie il medico destinatario
    doc_id = next(u["id"] for u in adm.get("/api/admin/users?role=doctor").json() if u["username"] == "medico")
    r = adm.post("/api/admin/import-diet-pdf", data={"doctor_id": doc_id}, files={"file": ("Franco.pdf", franco, "application/pdf")})
    assert r.status_code == 200 and r.json()["doctor"] == "medico"
    assert adm.post("/api/admin/import-diet-pdf", data={"doctor_id": "nope"}, files={"file": ("Franco.pdf", franco, "application/pdf")}).status_code == 400
    # le diete importate sono visibili al medico come modelli
    names = [x["name"] for x in med.get("/api/diets").json() if x["patient_id"] is None]
    assert names.count("Piano alimentare - Parodi Franco") >= 2


def test_sample_pdf_download_and_roundtrip(login):
    med, adm, fr = login("medico"), login("admin"), login("franco")
    r = med.get("/api/diets/sample-pdf")
    assert r.status_code == 200 and r.content[:4] == b"%PDF" and "Franco.pdf" in r.headers["content-disposition"]
    assert adm.get("/api/diets/sample-pdf").status_code == 200
    assert fr.get("/api/diets/sample-pdf").status_code == 403
    # the example is exactly what the importer recognises
    up = med.post("/api/diets/import-pdf", files={"file": ("Franco.pdf", r.content, "application/pdf")})
    assert up.status_code == 200 and up.json()["name"] == "Piano alimentare - Parodi Franco"


def test_admin_moves_patients_between_doctors(login, app_client):
    adm, med = login("admin"), login("medico")
    adm.post("/api/admin/doctors", json={"username": "dottmove", "full_name": "Dott Move", "password": "password-lunga"})
    c2 = make_client(app_client.app)
    c2.post("/api/auth/login", json={"username": "dottmove", "password": "password-lunga"})
    c2.post("/api/auth/change-password", json={"current_password": "password-lunga", "new_password": "altra-password-1"})
    users = adm.get("/api/admin/users").json()
    d1 = next(u for u in users if u["username"] == "medico")
    d2 = next(u for u in users if u["username"] == "dottmove")
    pat = adm.get(f"/api/admin/doctors/{d1['id']}/patients").json()
    assert {p["username"] for p in pat} >= {"franco", "giorgia"}
    fr_id = next(p["id"] for p in pat if p["username"] == "franco")
    # franco has a diary entry, a weight and an assigned diet before the move
    fr = login("franco")
    fr.put(f"/api/patients/{fr_id}/weights/{date.today()}", json={"kg": 80})
    # invalid requests
    assert adm.post("/api/admin/move-patients", json={"from_doctor_id": d1["id"], "to_doctor_id": d1["id"]}).status_code == 400
    assert adm.post("/api/admin/move-patients", json={"from_doctor_id": d2["id"], "to_doctor_id": d1["id"], "patient_ids": [fr_id]}).status_code == 400
    # move only franco
    r = adm.post("/api/admin/move-patients", json={"from_doctor_id": d1["id"], "to_doctor_id": d2["id"], "patient_ids": [fr_id]})
    assert r.status_code == 200 and r.json()["moved"] == 1 and r.json()["diets"] >= 1
    assert "franco" not in {p["username"] for p in med.get("/api/patients").json()}
    assert "giorgia" in {p["username"] for p in med.get("/api/patients").json()}
    assert {p["username"] for p in c2.get("/api/patients").json()} == {"franco"}
    assert med.get(f"/api/patients/{fr_id}").status_code == 404           # the old doctor lost access
    assert c2.get(f"/api/patients/{fr_id}").status_code == 200
    assert c2.get(f"/api/patients/{fr_id}/weights").json()[-1]["kg"] == 80
    diets = c2.get("/api/diets").json()
    assert any(d["patient_id"] == fr_id for d in diets)
    did = next(d["id"] for d in diets if d["patient_id"] == fr_id)
    assert c2.get(f"/api/diets/{did}").status_code == 200                  # nested rows moved too
    assert med.get(f"/api/diets/{did}").status_code == 404
    # the patient keeps working and sees the same data
    assert login("franco").get(f"/api/patients/{fr_id}/diets").json()
    # a doctor backup of the new doctor contains the patient; the old one does not
    import io, zipfile
    z2 = zipfile.ZipFile(io.BytesIO(c2.get("/api/doctor/backup").content)).read("data/users.json").decode()
    z1 = zipfile.ZipFile(io.BytesIO(med.get("/api/doctor/backup").content)).read("data/users.json").decode()
    assert "franco" in z2 and "franco" not in z1
    # move everyone else back: "all"
    r = adm.post("/api/admin/move-patients", json={"from_doctor_id": d2["id"], "to_doctor_id": d1["id"]})
    assert r.json()["moved"] == 1
    assert {"franco", "giorgia"} <= {p["username"] for p in med.get("/api/patients").json()}


def test_conversion_raw_cooked_editable(login):
    med = login("medico")
    d = med.post("/api/diets", json={"name": "Conv", "conversion": [{"name": "Pasta", "raw": "120 g", "cooked": "300 g"},
                                                                  {"name": "Riso", "raw": "100 g"}]}).json()
    assert d["conversion"][0] == {"name": "Pasta", "raw": "120 g", "cooked": "300 g"}
    assert d["conversion"][1]["cooked"] == ""          # optional
    d["conversion"][1]["cooked"] = "250 g"
    d["conversion"].append({"name": "Gnocchi", "raw": "300 g", "cooked": "350 g"})
    r = med.put(f"/api/diets/{d['id']}", json=d).json()
    assert [c["cooked"] for c in r["conversion"]] == ["300 g", "250 g", "350 g"]
    cp = med.post(f"/api/diets/{d['id']}/copy", json={}).json()
    assert [c["cooked"] for c in cp["conversion"]] == ["300 g", "250 g", "350 g"]
    pdf = med.get(f"/api/diets/{d['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    med.delete(f"/api/diets/{d['id']}"); med.delete(f"/api/diets/{cp['id']}")


def test_version_exposed_for_login_page_and_admin(login, app_client):
    h = app_client.get("/api/health").json()      # public: used by the login page
    assert h["status"] == "ok" and h["version"] and "commit" in h
    ov = login("admin").get("/api/admin/overview").json()
    assert ov["version"] == h["version"]
