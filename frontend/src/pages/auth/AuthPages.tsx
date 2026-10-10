import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HOME } from "../../lib/home";
import { useAppVersion, versionLabel } from "../../lib/version";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Field } from "../../components/Common";
import { useDialogs } from "../../components/Dialogs";
import { Icon } from "../../components/Icon";
import { useI18n } from "../../i18n";
import { usePrefs } from "../../prefs";
import { PasswordInput } from "../../components/PasswordInput";

function AuthVersion() {
  const v = useAppVersion();
  if (!v) return null;
  return <p className="auth-version" title={v.commit ? `commit ${v.commit}` : undefined}>Nutriplan {versionLabel(v.version)}</p>;
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = usePrefs();
  const { open } = useDialogs();
  const about = () => void open(t("about_title"), (close) => (
    <>
      <p>{t("about_p1")}</p>
      <p>{t("about_p2")}</p>
      <ul>
        {["about_li1", "about_li2", "about_li3", "about_li4"].map((k) => <li key={k}>{t(k)}</li>)}
      </ul>
      <p className="small muted">{t("about_p3")}</p>
      <div className="actions"><button className="btn primary" onClick={() => close()}>{t("close")}</button></div>
    </>
  ));
  return (
    <>
      <div className="auth-top">
        <button className="btn sm" aria-label={t("about_title")} title={t("about_title")} onClick={about}><Icon name="info" size={18} /></button>
        <button className="btn sm" aria-label="language" onClick={() => setLang(lang === "it" ? "en" : "it")}>{lang === "it" ? "EN" : "IT"}</button>
        <button className="btn sm" aria-label={t("theme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
        </button>
      </div>
      <div className="auth-wrap"><div className="auth-card">
        <div className="logo"><Icon name="logo" size={34} />Nutriplan</div>
        {children}
        <AuthVersion />
      </div></div>
    </>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const { login, sessionExpired } = useAuth();
  const { errText } = useDialogs();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { const user = await login(u, p); nav(HOME[user.role], { replace: true }); } catch (ex) { setErr(errText(ex)); setP(""); } finally { setBusy(false); }
  };
  return (
    <AuthFrame>
      <div className="card">
        <form onSubmit={submit}>
          <div className="col">
            {sessionExpired && <div className="alert warn">{t("session_expired")}</div>}
            <Field label={t("username")}><input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
              required autoFocus value={u} onChange={(e) => setU(e.target.value)} /></Field>
            <Field label={t("password")}><PasswordInput autoComplete="current-password" required
              value={p} onChange={(e) => setP(e.target.value)} /></Field>
            {err && <div className="alert danger">{err}</div>}
            <button className="btn primary" type="submit" disabled={busy}>{t("login")}</button>
          </div>
        </form>
        <p className="small muted center mt">{t("forgot_password_help")}</p>
      </div>
      <p className="center small mt"><Link to="/register">{t("doctor_register_link")}</Link></p>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { t } = useI18n();
  const { run, toast } = useDialogs();
  const [f, setF] = useState({ full_name: "", username: "", email: "", password: "", password2: "" });
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    if (f.password !== f.password2) return toast(t("err_password_mismatch"), true);
    const r = await run(() => api.post("/api/auth/register", { username: f.username, full_name: f.full_name, email: f.email, password: f.password }));
    if (r) setSent(true);
  };
  return (
    <AuthFrame>
      <div className="card">
        {sent ? (
          <>
            <h2>{t("registration_sent")}</h2>
            <p>{t("registration_pending_help")}</p>
            <Link className="btn primary" to="/login">{t("back_to_login")}</Link>
          </>
        ) : (
          <>
            <h2 className="center">{t("doctor_register_title")}</h2>
            <div className="col">
              <Field label={t("full_name")} req><input type="text" value={f.full_name} onChange={set("full_name")} /></Field>
              <Field label={t("username")} req><input type="text" autoCapitalize="none" maxLength={32} value={f.username} onChange={set("username")} /></Field>
              <Field label={t("email")}><input type="email" value={f.email} onChange={set("email")} /></Field>
              <Field label={t("password")} req><PasswordInput autoComplete="new-password" value={f.password} onChange={set("password")} /></Field>
              <Field label={t("repeat_password")} req><PasswordInput autoComplete="new-password" value={f.password2} onChange={set("password2")} /></Field>
              <p className="small muted">{t("password_rules")}</p>
              <button className="btn primary" onClick={() => void submit()}>{t("register")}</button>
              <Link className="center" to="/login">{t("back_to_login")}</Link>
            </div>
          </>
        )}
      </div>
    </AuthFrame>
  );
}

/** Shown after a login with a one-time (temporary) password: the user must pick a personal one. */
export function ForcedPasswordPage() {
  const { t } = useI18n();
  const { patchUser, logout } = useAuth();
  const { run, toast } = useDialogs();
  const nav = useNavigate();
  const [cur, setCur] = useState(""), [n1, setN1] = useState(""), [n2, setN2] = useState("");
  const submit = async () => {
    if (n1 !== n2) return toast(t("err_password_mismatch"), true);
    const r = await run(() => api.post("/api/auth/change-password", { current_password: cur, new_password: n1 }), t("password_changed"));
    if (r) { patchUser({ must_change_password: false }); nav("/", { replace: true }); }
  };
  return (
    <AuthFrame>
      <div className="card">
        <h2>{t("must_change_title")}</h2>
        <p className="muted">{t("must_change_help")}</p>
        <div className="col">
          <Field label={t("temporary_password")}><PasswordInput autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label={t("new_password")}><PasswordInput autoComplete="new-password" value={n1} onChange={(e) => setN1(e.target.value)} /></Field>
          <Field label={t("repeat_password")}><PasswordInput autoComplete="new-password" value={n2} onChange={(e) => setN2(e.target.value)} /></Field>
          <p className="small muted">{t("password_rules")}</p>
          <button className="btn primary" onClick={() => void submit()}>{t("change_password")}</button>
          <button className="btn" onClick={() => void logout()}>{t("logout")}</button>
        </div>
      </div>
    </AuthFrame>
  );
}

