import { useRef, useState } from "react";
import { api } from "../api";
import { useAuth, useUser } from "../auth";
import { Avatar, Field, Markdown, Spinner } from "../components/Common";
import { useDialogs } from "../components/Dialogs";
import { Icon } from "../components/Icon";
import { useI18n } from "../i18n";
import { resizeImage } from "../lib/dates";
import { useAsync } from "../lib/useAsync";
import { usePageTitle } from "../layout/Title";
import { VisitsView } from "../shared/Visits";
import { ContactFields, ContactLinks } from "../components/Contacts";
import type { Contacts, Patient, User } from "../types";

export function ProfilePage() {
  const { t } = useI18n();
  usePageTitle(t("nav_profile"));
  const user = useUser();
  const { patchUser } = useAuth();
  const { run, toast } = useDialogs();
  const [email, setEmail] = useState(user.email ?? "");
  const [name, setName] = useState(user.full_name ?? "");
  const [cur, setCur] = useState(""), [n1, setN1] = useState(""), [n2, setN2] = useState("");
  const [contacts, setContacts] = useState<Contacts>(user.contacts);
  const [bust, setBust] = useState(0);
  const [health, setHealth] = useState({ allergies: "", intolerances: "", pathologies: "" });
  const healthLoad = useAsync(async () => {
    if (user.role !== "patient") return null;
    const p = await api.get<Patient>(`/api/patients/${user.id}`);
    setHealth({ allergies: p.allergies, intolerances: p.intolerances, pathologies: p.pathologies });
    return p;
  }, [user.id]);
  void healthLoad;
  const file = useRef<HTMLInputElement>(null);
  const photoBase = user.role === "doctor" ? "/api/auth/photo" : `/api/patients/${user.id}/photo`;

  const onPhoto = async (f: File) => {
    try {
      const blob = await resizeImage(f);
      const fd = new FormData();
      fd.append("file", blob, "photo.jpg");
      const r = await run(() => api.upload(photoBase, fd, "PUT"), t("saved"));
      if (r) { patchUser({ has_photo: true }); setBust(Date.now()); }
    } catch { toast(t("err_invalid_image"), true); }
  };

  return (
    <div>
      {user.role !== "admin" && (
        <div className="card mb">
          <h2>{t("my_photo")}</h2>
          <div className="row" style={{ gap: "1rem" }}>
            <Avatar id={user.id} name={user.full_name} has={user.has_photo} size={96} bust={bust} role={user.role} />
            <div className="col">
              <div className="row">
                <button className="btn primary" onClick={() => file.current?.click()}><Icon name="upload" />{t(user.has_photo ? "change_photo" : "add_photo")}</button>
                {user.has_photo && (
                  <button className="btn" onClick={async () => {
                    if (await run(() => api.del(photoBase), t("deleted"))) patchUser({ has_photo: false });
                  }}>{t("remove_photo")}</button>
                )}
              </div>
              <span className="small muted">{t(user.role === "doctor" ? "photo_help_doctor" : "photo_help")}</span>
            </div>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPhoto(f);
              e.target.value = "";
            }} />
          </div>
        </div>
      )}
      <div className="grid c2">
        <div className="card">
          <h2>{t("my_account")}</h2>
          <div className="col">
            <Field label={t("username")}><input type="text" value={user.username} disabled /></Field>
            <Field label={t("full_name")}><input type="text" value={name} disabled={user.role === "patient"} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label={t("email")}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            {user.role !== "admin" && (
              <div>
                <h3>{t("contacts")}</h3>
                <p className="small muted">{t("contacts_help")}</p>
                <ContactFields value={contacts} onChange={setContacts} />
              </div>
            )}
            {user.doctor_name && (
              <div>
                <p className="muted">{t("your_doctor")}: <b>{user.doctor_name}</b></p>
                <ContactLinks c={user.doctor_contacts} />
              </div>
            )}
            <div><button className="btn primary" onClick={async () => {
              const r = await run(() => api.put<User>("/api/auth/preferences", { email, full_name: name, ...contacts }), t("saved"));
              if (r) patchUser({ email: r.email, full_name: r.full_name, contacts: r.contacts });
            }}>{t("save")}</button></div>
          </div>
        </div>
        <div className="card">
          <h2>{t("change_password")}</h2>
          <div className="col">
            <Field label={t("current_password")}><input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
            <Field label={t("new_password")}><input type="password" autoComplete="new-password" value={n1} onChange={(e) => setN1(e.target.value)} /></Field>
            <Field label={t("repeat_password")}><input type="password" autoComplete="new-password" value={n2} onChange={(e) => setN2(e.target.value)} /></Field>
            <p className="small muted">{t("password_rules")}</p>
            <div><button className="btn primary" onClick={async () => {
              if (n1 !== n2) return toast(t("err_password_mismatch"), true);
              const r = await run(() => api.post("/api/auth/change-password", { current_password: cur, new_password: n1 }), t("password_changed"));
              if (r) { setCur(""); setN1(""); setN2(""); }
            }}>{t("change_password")}</button></div>
          </div>
        </div>
      </div>
      {user.role === "patient" && (
        <div className="card mt">
          <h2>{t("my_health")}</h2>
          <p className="small muted">{t("my_health_help")}</p>
          <div className="form-grid">
            {(["allergies", "intolerances", "pathologies"] as const).map((k) => (
              <Field key={k} label={t(k)}>
                <textarea maxLength={3000} value={health[k]} onChange={(e) => setHealth({ ...health, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div className="mt"><button className="btn primary" onClick={() =>
            void run(() => api.put(`/api/patients/${user.id}/health`, health), t("saved"))}>{t("save")}</button></div>
        </div>
      )}
      {user.role === "patient" && (
        <>
          <h2 className="mt">{t("my_visits")}</h2>
          <VisitsView patientId={user.id} canEdit={false} />
        </>
      )}
    </div>
  );
}

export function HelpPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("nav_help"));
  const user = useUser();
  const role = user.role === "patient" ? "paziente" : "medico";
  const g = useAsync(() => (user.role === "admin" ? Promise.resolve("") : api.text(`/api/guide/${role}?lang=${lang}`)), [lang, role]);
  if (user.role === "admin") return <div className="card"><h2>{t("help")}</h2><p>{t("admin_help")}</p></div>;
  if (g.data === undefined) return <Spinner />;
  return <div className="card"><Markdown src={g.data} /></div>;
}
