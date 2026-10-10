import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { ChartCanvas, cssVar } from "../../components/ChartCanvas";
import { Empty, Field, Spinner } from "../../components/Common";
import { useDialogs } from "../../components/Dialogs";
import { Icon } from "../../components/Icon";
import { useI18n } from "../../i18n";
import { usePageTitle } from "../../layout/Title";
import { D, fmtBytes, fmtNum } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import type { AdminOverview, AdminUser, AppLogRow, AuditRow, MetricRow } from "../../types";

type SeriesDef = { key: string; label: string; c: number };

function Series({ rows, defs, type = "line", max }: { rows: { label: string; [k: string]: number | string }[]; defs: SeriesDef[]; type?: "line" | "bar"; max?: number }) {
  const { t } = useI18n();
  if (!rows.length) return <Empty>{t("no_data")}</Empty>;
  return (
    <ChartCanvas small deps={[rows]} build={() => ({
      type,
      data: {
        labels: rows.map((r) => r.label),
        datasets: defs.map((d) => ({
          label: d.label, data: rows.map((r) => r[d.key] as number), borderColor: cssVar(`--c${d.c}`), backgroundColor: cssVar(`--c${d.c}`),
          tension: 0.25, pointRadius: 0, borderWidth: 2, fill: false,
        })),
      },
      options: { scales: { y: { beginAtZero: true, max } }, plugins: { legend: { display: defs.length > 1 } }, interaction: { intersect: false, mode: "index" } },
    })} />
  );
}

export function DashboardPage() {
  const { t, locale } = useI18n();
  usePageTitle(t("nav_overview"));
  const { toast } = useDialogs();
  const [hours, setHours] = useState(24);
  const [tick, setTick] = useState(0);
  const data = useAsync(async () => {
    const [ov, m] = await Promise.all([api.get<AdminOverview>("/api/admin/overview"), api.get<MetricRow[]>(`/api/admin/metrics?hours=${hours}`)]);
    return { ov, m };
  }, [hours, tick]);
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible" && !document.querySelector(".overlay")) setTick((x) => x + 1); }, 20000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (data.data && data.data.ov.pending_doctors && !notified) {
      setNotified(true);
      toast(t("pending_doctors", { n: data.data.ov.pending_doctors }));
    }
  }, [data.data, notified, toast, t]);

  if (!data.data) return <Spinner />;
  const { ov, m } = data.data;
  const s = ov.system;
  const up = s.uptime_s;
  const upTxt = up > 86400 ? `${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h` : `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m`;
  const fmtLabel = (ts: string) => new Date(ts).toLocaleString(locale,
    hours > 24 ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  const rows = m.map((x) => ({ ...x, label: fmtLabel(x.ts) }));
  const Stat = ({ v, k }: { v: string; k: string }) => <div className="stat"><div className="v">{v}</div><div className="k">{k}</div></div>;
  return (
    <div>
      <div className="grid c4 mb">
        <Stat v={String(ov.online_count)} k={t("online_now")} />
        <Stat v={`${fmtNum(s.cpu, locale, 0)}%`} k="CPU" />
        <Stat v={`${fmtNum(s.mem, locale, 0)}%`} k={`${t("memory")} (${fmtBytes(s.mem_used)} / ${fmtBytes(s.mem_total)})`} />
        <Stat v={fmtNum(s.load1, locale, 2)} k={`${t("load")} (${s.cpus} CPU)`} />
        <Stat v={`${fmtNum(s.disk, locale, 0)}%`} k={t("disk")} />
        <Stat v={ov.db_size ? fmtBytes(ov.db_size) : "–"} k={t("db_size")} />
        <Stat v={String(ov.logins_today)} k={t("logins_today")} />
        <Stat v={String(ov.actions_today)} k={t("actions_today")} />
        <Stat v={upTxt} k={t("uptime")} />
        <Stat v={fmtBytes(s.proc_mem)} k={t("process_memory")} />
        <Stat v={`${ov.users.by_role.doctor ?? 0} / ${ov.users.by_role.patient ?? 0}`} k={t("doctors_patients")} />
        <Stat v={`v${ov.version}`} k={t("version")} />
      </div>
      <div className="row mb">
        <span className="muted">{t("period")}:</span>
        <div className="seg">
          {([[6, "6h"], [24, "24h"], [72, "3d"], [168, "7d"]] as const).map(([n, l]) => (
            <button key={n} className={hours === n ? "on" : ""} onClick={() => setHours(n)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="grid c2 mb">
        <div className="card"><h3>CPU / {t("memory")} (%)</h3><Series rows={rows} max={100} defs={[{ key: "cpu", label: "CPU %", c: 3 }, { key: "mem", label: `${t("memory")} %`, c: 2 }]} /></div>
        <div className="card"><h3>{t("online_users")}</h3><Series rows={rows} defs={[{ key: "online", label: t("online_users"), c: 1 }]} /></div>
        <div className="card"><h3>{t("requests")}</h3><Series rows={rows} defs={[{ key: "requests", label: t("requests"), c: 5 }, { key: "errors", label: t("errors"), c: 4 }]} /></div>
        <div className="card"><h3>{t("load")}</h3><Series rows={rows} defs={[{ key: "load1", label: t("load"), c: 6 }]} /></div>
      </div>
      <div className="card">
        <h3>{t("connected_users")}</h3>
        {ov.online.length === 0 ? <Empty>{t("nobody_online")}</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr>{["user", "role", "last_seen", "ip"].map((k) => <th key={k}>{t("col_" + k)}</th>)}</tr></thead>
            <tbody>{ov.online.map((o) => (
              <tr key={o.username}><td><b>{o.username}</b><div className="small muted">{o.full_name}</div></td><td>{t("role_" + o.role)}</td>
                <td>{D.dt(o.last_seen, locale)}</td><td>{o.ip}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

/** Moves some or all patients of a doctor to another doctor (admin). */
function MovePatientsForm({ source, doctors, preselect, close }: {
  source: AdminUser; doctors: AdminUser[]; preselect?: string[]; close: (v?: { moved: number; to: string }) => void;
}) {
  const { t } = useI18n();
  const { run, toast } = useDialogs();
  const targets = doctors.filter((d) => d.id !== source.id && d.active);
  const list = useAsync(() => api.get<{ id: string; username: string; full_name: string; active: boolean }[]>(
    `/api/admin/doctors/${source.id}/patients`), [source.id]);
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [sel, setSel] = useState<Set<string> | null>(preselect ? new Set(preselect) : null);
  if (!list.data) return <Spinner />;
  const all = list.data;
  const chosen = sel ?? new Set(all.map((p) => p.id));       // null = everyone
  const toggle = (id: string) => { const n = new Set(chosen); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const allSelected = chosen.size === all.length;
  const dest = targets.find((d) => d.id === target);
  const submit = async () => {
    if (!target) return toast(t("move_need_target"), true);
    if (chosen.size === 0) return toast(t("move_need_patients"), true);
    const r = await run(() => api.post<{ moved: number; to: string }>("/api/admin/move-patients", {
      from_doctor_id: source.id, to_doctor_id: target, patient_ids: allSelected ? null : Array.from(chosen) }));
    if (r) close(r);
  };
  return (
    <>
      <p className="muted">{t("move_from")}: <b>{source.full_name || source.username}</b></p>
      {targets.length === 0 ? <div className="alert warn">{t("move_need_target")}</div> : (
        <div className="col">
          <Field label={t("move_to")}>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.username} (@{d.username})</option>)}
            </select>
          </Field>
          <div>
            <label className="row" style={{ fontWeight: 600 }}>
              <input type="checkbox" checked={allSelected} onChange={(e) => setSel(e.target.checked ? null : new Set())} />
              {t("move_all", { n: all.length })}
            </label>
            <div className="table-wrap" style={{ maxHeight: 260, overflow: "auto", marginTop: ".4rem" }}>
              <table><tbody>
                {all.map((p) => (
                  <tr key={p.id}><td style={{ width: 36 }}><input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} /></td>
                    <td>{p.full_name} <span className="small muted">@{p.username}</span>
                      {!p.active && <span className="chip danger" style={{ marginLeft: ".4rem" }}>{t("disabled")}</span>}</td></tr>
                ))}
              </tbody></table>
            </div>
          </div>
          <p className="small muted">{t("move_help")}</p>
        </div>
      )}
      <div className="actions">
        <button className="btn" onClick={() => close()}>{t("cancel")}</button>
        <button className="btn primary" disabled={!dest || chosen.size === 0} onClick={() => void submit()}>
          {t("move_btn", { n: chosen.size })}
        </button>
      </div>
    </>
  );
}

function NewDoctorForm({ close }: { close: (v?: { username: string; temporary_password: string }) => void }) {
  const { t } = useI18n();
  const { run } = useDialogs();
  const [f, setF] = useState({ username: "", full_name: "", email: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="col">
        <Field label={t("username")} req><input type="text" maxLength={32} autoCapitalize="none" value={f.username} onChange={set("username")} /></Field>
        <Field label={t("full_name")} req><input type="text" value={f.full_name} onChange={set("full_name")} /></Field>
        <Field label={t("email")}><input type="email" value={f.email} onChange={set("email")} /></Field>
        <p className="small muted">{t("new_doctor_help")}</p>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => close()}>{t("cancel")}</button>
        <button className="btn primary" onClick={async () => {
          const r = await run(() => api.post<{ username: string; temporary_password: string }>("/api/admin/doctors", f));
          if (r) close(r);
        }}>{t("create")}</button>
      </div>
    </>
  );
}

export function UsersPage() {
  const { t, locale } = useI18n();
  usePageTitle(t("nav_users"));
  const { run, confirm, open, showSecret, toast } = useDialogs();
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const id = setTimeout(() => setDq(q), 250); return () => clearTimeout(id); }, [q]);
  const users = useAsync(() => api.get<AdminUser[]>(`/api/admin/users?role=${role}&q=${encodeURIComponent(dq)}`), [role, dq]);
  const docs = useAsync(() => api.get<AdminUser[]>("/api/admin/users?role=doctor"), []);

  const move = async (source: AdminUser, preselect?: string[]) => {
    const r = await open<{ moved: number; to: string }>(t("move_title"),
      (close) => <MovePatientsForm source={source} doctors={docs.data ?? []} preselect={preselect} close={close} />, { wide: true, sticky: true });
    if (r) { toast(t("move_done", { n: r.moved, to: r.to })); await Promise.all([users.reload(), docs.reload()]); }
  };

  const create = async () => {
    const r = await open<{ username: string; temporary_password: string }>(t("new_doctor"), (close) => <NewDoctorForm close={close} />);
    if (!r) return;
    await showSecret(t("doctor_created"), t("give_credentials", { user: r.username }), r.temporary_password);
    await users.reload();
  };

  return (
    <div>
      <div className="row spread mb">
        <h2 style={{ margin: 0 }}>{t("users")}</h2>
        <div className="row">
          <input type="text" placeholder={t("search")} style={{ maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ maxWidth: 180 }} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">{t("all_roles")}</option><option value="doctor">{t("role_doctor")}</option><option value="patient">{t("role_patient")}</option>
          </select>
          <button className="btn primary" onClick={() => void create()}><Icon name="plus" />{t("new_doctor")}</button>
        </div>
      </div>
      {!users.data ? <Spinner /> : users.data.length === 0 ? <div className="card"><Empty>{t("no_data")}</Empty></div> : (
        <div className="table-wrap"><table>
          <thead><tr>{["user", "role", "doctor", "status", "last_login", ""].map((k) => <th key={k}>{k ? t("col_" + k) : ""}</th>)}</tr></thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id}>
                <td><b>{u.username}</b><div className="small muted">{u.full_name}{u.email ? ` · ${u.email}` : ""}</div></td>
                <td>{t("role_" + u.role)}{u.role === "doctor" && <span className="small muted"> ({t("patients_count", { n: u.patients })})</span>}</td>
                <td>{u.doctor || "–"}</td>
                <td><span className={`chip ${u.active ? "ok" : "danger"}`}>{u.active ? t("active") : t("disabled")}</span>
                  {u.must_change_password && <span className="chip warn" style={{ marginLeft: ".3rem" }}>{t("pw_pending")}</span>}</td>
                <td className="small muted">{u.last_login_at ? D.dt(u.last_login_at, locale) : t("never")}</td>
                <td className="right nowrap">
                  {u.role === "doctor" && u.patients > 0 && (
                    <><button className="btn sm" onClick={() => void move(u)}><Icon name="users" />{t("move_patients")}</button>{" "}</>
                  )}
                  {u.role === "patient" && u.doctor_id && docs.data && docs.data.length > 1 && (
                    <><button className="btn sm" onClick={() => {
                      const src = docs.data!.find((d) => d.id === u.doctor_id);
                      if (src) void move(src, [u.id]);
                    }}><Icon name="swap" />{t("move_patient")}</button>{" "}</>
                  )}
                  <button className="btn sm" onClick={async () => {
                    await run(() => api.post(`/api/admin/users/${u.id}/active`, { active: !u.active }), t("saved"));
                    await users.reload();
                  }}>{u.active ? t("disable_account") : t("enable_account")}</button>{" "}
                  <button className="btn sm" onClick={async () => {
                    if (!(await confirm(t("confirm_reset_pw", { name: u.username })))) return;
                    const r = await run(() => api.post<{ username: string; temporary_password: string }>(`/api/admin/users/${u.id}/reset-password`));
                    if (r) await showSecret(t("password_reset"), t("give_credentials", { user: r.username }), r.temporary_password);
                  }}><Icon name="key" />{t("reset_password")}</button>{" "}
                  <button className="btn sm danger" onClick={async () => {
                    const msg = u.role === "doctor" ? t("confirm_delete_doctor", { name: u.username, n: u.patients }) : t("confirm_delete_user", { name: u.username });
                    if (!(await confirm(msg, { danger: true, ok: t("delete") }))) return;
                    if (await run(() => api.del(`/api/admin/users/${u.id}`), t("deleted"))) await users.reload();
                  }}><Icon name="trash" />{t("delete")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

export function LogsPage() {
  const { t, locale } = useI18n();
  usePageTitle(t("nav_logs"));
  const { tab = "activity" } = useParams();
  const tabs: [string, string][] = [["activity", "log_activity"], ["app", "log_app"], ["usage", "log_usage"]];
  return (
    <div>
      <div className="tabs">
        {tabs.map(([k, l]) => <Link key={k} className={k === tab ? "active" : ""} to={`/admin/logs/${k}`}>{t(l)}</Link>)}
      </div>
      {tab === "usage" ? <UsageTab locale={locale} /> : <LogTable app={tab === "app"} />}
    </div>
  );
}

function UsageTab({ locale }: { locale: string }) {
  const { t } = useI18n();
  const u = useAsync(() => api.get<{ date: string; actions: number; users: number; logins: number }[]>("/api/admin/usage?days=30"), []);
  if (!u.data) return <Spinner />;
  const rows = u.data.map((r) => ({ ...r, label: D.fmt(r.date, locale, { day: "2-digit", month: "2-digit" }) }));
  return (
    <div className="grid c2">
      <div className="card"><h3>{t("actions_per_day")}</h3><Series rows={rows} type="bar" defs={[{ key: "actions", label: t("actions"), c: 1 }]} /></div>
      <div className="card"><h3>{t("users_logins_per_day")}</h3>
        <Series rows={rows} defs={[{ key: "users", label: t("active_users"), c: 3 }, { key: "logins", label: t("logins"), c: 2 }]} /></div>
    </div>
  );
}

function LogTable({ app }: { app: boolean }) {
  const { t, locale } = useI18n();
  const limit = 50;
  const [off, setOff] = useState(0);
  const [f, setF] = useState({ username: "", action: "", q: "", date_from: "", date_to: "", level: "" });
  type Page = { total: number; items: (AppLogRow | AuditRow)[] };
  const data = useAsync((): Promise<Page> => {
    if (app) return api.get<Page>(`/api/admin/applog?limit=${limit}&offset=${off}&level=${f.level}`);
    const qs = `limit=${limit}&offset=${off}&username=${encodeURIComponent(f.username)}&action=${f.action}&q=${encodeURIComponent(f.q)}`
      + (f.date_from ? `&date_from=${f.date_from}` : "") + (f.date_to ? `&date_to=${f.date_to}` : "");
    return api.get<Page>(`/api/admin/audit?${qs}`);
  }, [app, off, JSON.stringify(f)]);
  const setFilter = (k: keyof typeof f, v: string) => { setOff(0); setF({ ...f, [k]: v }); };
  const d = data.data;
  const colW = { maxWidth: 170 };
  return (
    <div>
      <div className="row mb">
        {app ? (
          <select style={{ maxWidth: 160 }} value={f.level} onChange={(e) => setFilter("level", e.target.value)}>
            {[["", t("all_levels")], ["WARNING", "WARNING"], ["ERROR", "ERROR"], ["CRITICAL", "CRITICAL"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <>
            <input type="text" placeholder={t("col_user")} style={colW} value={f.username} onChange={(e) => setFilter("username", e.target.value)} />
            <input type="text" placeholder={t("col_action")} style={colW} value={f.action} onChange={(e) => setFilter("action", e.target.value)} />
            <input type="text" placeholder={t("col_detail")} style={colW} value={f.q} onChange={(e) => setFilter("q", e.target.value)} />
            <input type="date" aria-label={t("date_from")} style={colW} value={f.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
            <input type="date" aria-label={t("date_to")} style={colW} value={f.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
          </>
        )}
      </div>
      {!d ? <Spinner /> : (
        <>
          <div className="small muted mb">{t("results_n", { n: d.total })}</div>
          {d.items.length === 0 ? <div className="card"><Empty>{t("no_data")}</Empty></div> : (
            <div className="table-wrap"><table>
              <thead><tr>{(app ? ["ts", "level", "logger", "message"] : ["ts", "user", "role", "action", "detail", "ip"]).map((k) => <th key={k}>{t("col_" + k)}</th>)}</tr></thead>
              <tbody>
                {app ? (d.items as AppLogRow[]).map((x) => (
                  <tr key={x.id}><td className="nowrap small">{D.dt(x.ts, locale)}</td>
                    <td><span className={`chip ${x.level === "ERROR" || x.level === "CRITICAL" ? "danger" : "warn"}`}>{x.level}</span></td>
                    <td className="small">{x.logger}</td><td style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{x.message}</td></tr>
                )) : (d.items as AuditRow[]).map((x) => (
                  <tr key={x.id}><td className="nowrap small">{D.dt(x.ts, locale)}</td><td><b>{x.username || "–"}</b></td>
                    <td>{x.role ? t("role_" + x.role) : ""}</td><td><span className="chip">{x.action}</span></td>
                    <td style={{ wordBreak: "break-word" }}>{x.detail}</td><td className="small">{x.ip}</td></tr>
                ))}
              </tbody>
            </table></div>
          )}
          <div className="row mt">
            <button className="btn sm" disabled={off === 0} onClick={() => setOff(Math.max(0, off - limit))}><Icon name="back" />{t("prev")}</button>
            <span className="small">{`${d.total ? off + 1 : 0}–${Math.min(off + limit, d.total)} / ${d.total}`}</span>
            <button className="btn sm" disabled={off + limit >= d.total} onClick={() => setOff(off + limit)}>{t("next")}<Icon name="next" /></button>
          </div>
        </>
      )}
    </div>
  );
}
