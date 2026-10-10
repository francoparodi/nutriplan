import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { useDialogs } from "../components/Dialogs";
import { Field, Spinner, StateChip } from "../components/Common";
import { useI18n } from "../i18n";
import { D } from "../lib/dates";
import { useAsync } from "../lib/useAsync";
import type { Day, DayItem, DayMeal, DayOption, DayStat, MealLog, Progress, Substitute, Warnings } from "../types";
import { CalendarGrid } from "./Calendar";

// ------------------------------------------------------------------ option block
interface OptCtx {
  selectable?: boolean; selected?: boolean; onSelect?: () => void; editable?: boolean;
  subs?: Record<string, string>; onSub?: (item: DayItem, member: Substitute | null) => void;
  qtys?: Record<string, string>; onQty?: (item: DayItem, value: string) => void;
}

export function OptionBlock({ o, ctx = {} }: { o: DayOption; ctx?: OptCtx }) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const sel = !!ctx.selected;
  const pick = () => ctx.onSelect?.();
  return (
    <div className={`opt${ctx.selectable ? " selectable" : ""}${sel ? " selected" : ""}`}
      onClick={ctx.selectable ? pick : undefined} role={ctx.selectable ? "radio" : undefined}
      aria-checked={ctx.selectable ? sel : undefined} tabIndex={ctx.selectable ? 0 : undefined}
      onKeyDown={ctx.selectable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } } : undefined}>
      <div className="opt-head">
        {o.label && <span className="lab">{o.label}</span>}
        {o.course && <span className="muted">({o.course})</span>}
        {o.kind === "addon" && <span className="chip info">{t("always_included")}</span>}
        {o.max_per_week ? (
          <span className={`chip${(o.week_used ?? 0) >= o.max_per_week ? " warn" : ""}`}>
            {t("week_limit", { used: o.week_used ?? 0, max: o.max_per_week })}
          </span>
        ) : null}
        {o.note && <span className="small muted">{o.note}</span>}
      </div>
      {o.items.map((it) => {
        const chosen = ctx.subs?.[it.id];
        const mem = chosen ? it.substitutes.find((s) => s.id === chosen) : undefined;
        const canSub = ctx.subs && it.substitutes.length > 0 && (sel || !ctx.selectable);
        // the patient may change the quantity actually eaten (recorded and highlighted for the doctor)
        const canQty = !!ctx.onQty && ctx.editable && it.qty !== null && !mem && (sel || !ctx.selectable);
        const qv = ctx.qtys?.[it.id];
        const changed = canQty && qv !== undefined && qv !== "" && Number(qv) !== it.qty;
        return (
          <div key={it.id}>
            <div className="item">
              <span>{it.name}{it.note && <span className="small muted"> – {it.note}</span>}</span>
              {canQty ? (
                <span className="q row" style={{ gap: ".3rem", flexWrap: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <input type="number" min="0" step="any" inputMode="decimal" aria-label={`${t("qty_eaten")}: ${it.name}`}
                    className={`qty-input${changed ? " qty-changed" : ""}`} value={qv ?? String(it.qty)}
                    onChange={(e) => ctx.onQty?.(it, e.target.value)} onBlur={(e) => { if (e.target.value === "") ctx.onQty?.(it, String(it.qty)); }} />
                  <span>{it.unit}{it.group_id ? " *" : ""}</span>
                  {changed && <span className="chip warn" title={t("qty_modified")}>{t("planned_qty")} {it.qty} {it.unit}</span>}
                </span>
              ) : (
                <span className="q">{it.display}{it.group_id ? " *" : ""}</span>
              )}
            </div>
            {canSub && mem && (
              <div className="sub-row">
                <Icon name="swap" size={16} /><span>{`${mem.name} ${mem.qty_text}`.trim()}</span>
                {ctx.editable && (
                  <button className="iconbtn" type="button" title={t("remove")}
                    onClick={(e) => { e.stopPropagation(); ctx.onSub?.(it, null); }}><Icon name="x" size={16} /></button>
                )}
              </div>
            )}
            {canSub && !mem && ctx.editable && (
              <div>
                <button className="btn sm" type="button" onClick={async (e) => {
                  e.stopPropagation();
                  const m = await dialogs.open<Substitute | null>(
                    `${t("substitutions")} – ${it.group ? it.group.name : it.name}`,
                    (close) => (
                      <>
                        <p>{t("sub_intro", { item: it.name, qty: it.display })}
                          {it.group?.note && <span className="small muted"> {it.group.note}</span>}</p>
                        <div className="col">
                          {it.substitutes.map((s) => (
                            <button key={s.id} className="btn wrap" type="button" onClick={() => close(s)}>
                              <span className="grow">{s.name}{s.note && <span className="small muted"> – {s.note}</span>}</span>
                              <b className="nowrap">{s.qty_text}</b>
                            </button>
                          ))}
                        </div>
                        <div className="actions"><button className="btn" onClick={() => close(null)}>{t("cancel")}</button></div>
                      </>
                    ), { wide: true });
                  if (m) ctx.onSub?.(it, m);
                }}><Icon name="swap" />{t("substitutions")}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ log summary
export function LogSummary({ l }: { l: MealLog }) {
  const { t } = useI18n();
  return (
    <div>
      {l.status === "done" && l.option_label && <div>{l.option_label}</div>}
      {l.status === "done" && l.substitutions.map((s, i) => (
        <div key={i} className="sub-row"><Icon name="swap" size={16} />{`${s.item_name} ${s.item_qty || ""} → ${s.name} ${s.qty_text || ""}`}</div>
      ))}
      {l.status === "done" && l.adjustments?.length > 0 && (
        <div className="adj-box">
          <span className="chip warn">{t("qty_modified")}</span>
          {l.adjustments.map((a, i) => (
            <div key={i} className="small"><b>{a.item_name}</b>: {a.planned} {a.unit} → <b>{a.actual} {a.unit}</b></div>
          ))}
        </div>
      )}
      {l.status === "done" && l.extras.map((e, i) => <div key={i}>{`${e.name} ${e.qty_text || ""} × ${e.count}`}</div>)}
      {l.free_text && <div><b>{l.status === "off_plan" ? t("eaten_instead") : t("also_eaten")}: </b>{l.free_text}</div>}
      {l.note && <div className="small muted">{l.note}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ meal card
interface Draft {
  status: "done" | "off_plan" | "skipped"; option_id: string | null;
  subs: Record<string, string>; extras: Record<string, number>; qtys: Record<string, string>; free_text: string; note: string;
}

function MealCard({ meal, editable, patientId, date, onDay }: {
  meal: DayMeal; editable: boolean; patientId: string; date: string; onDay: (d: Day) => void;
}) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const lg = meal.log;
  const choices = meal.options.filter((o) => o.kind === "choice");
  const [editing, setEditing] = useState(editable && !lg);
  const [d, setD] = useState<Draft>(() => ({
    status: lg ? lg.status : "done",
    option_id: lg ? lg.option_id : choices.length === 1 ? choices[0].id : null,
    subs: Object.fromEntries((lg?.substitutions ?? []).map((s) => [s.item_id, s.member_id])),
    extras: Object.fromEntries((lg?.extras ?? []).map((e) => [e.item_id, e.count])),
    qtys: Object.fromEntries((lg?.adjustments ?? []).map((a) => [a.item_id, String(a.actual)])),
    free_text: lg?.free_text ?? "", note: lg?.note ?? "",
  }));
  const url = `/api/patients/${patientId}/day/${date}/meals/${meal.id}`;

  const save = async () => {
    const body: Record<string, unknown> = { status: d.status, free_text: d.free_text, note: d.note };
    if (d.status === "done") {
      if (meal.kind === "extras") {
        body.extras = Object.entries(d.extras).map(([item_id, count]) => ({ item_id, count }));
      } else {
        if (choices.length > 1 && !d.option_id) return dialogs.toast(t("choose_option"), true);
        body.option_id = d.option_id;
        body.substitutions = Object.entries(d.subs).map(([item_id, member_id]) => ({ item_id, member_id }));
        // only quantities that differ from the plan, for the foods of the chosen option
        const planned = new Map(meal.options.filter((o) => o.kind === "addon" || o.id === d.option_id || choices.length === 1)
          .flatMap((o) => o.items).map((i) => [i.id, i.qty] as const));
        body.quantities = Object.entries(d.qtys)
          .filter(([id, v]) => v !== "" && planned.get(id) != null && Number(v) > 0 && Number(v) !== planned.get(id))
          .map(([item_id, v]) => ({ item_id, qty: Number(v) }));
      }
    } else if (d.status === "off_plan" && !d.free_text.trim()) return dialogs.toast(t("err_free_text_required"), true);
    const r = await dialogs.run(() => api.put<Day>(url, body), t("saved"));
    if (r) { setEditing(false); onDay(r); }
  };

  const head = (
    <div className="meal-head">
      <h3>{meal.name}</h3>
      {meal.time && <span className="muted small">{meal.time}</span>}
      <StateChip state={meal.state} />
      {lg && lg.status === "done" && lg.adjustments?.length > 0 && <span className="chip warn">{t("qty_modified")}</span>}
      {meal.inherited && <span className="small muted">{t("same_as_lunch")}</span>}
    </div>
  );

  if (!editing) {
    return (
      <div className={`card meal s-${meal.state}`}>
        {head}
        {meal.note && <p className="small muted">{meal.note}</p>}
        {lg ? (
          <>
            <LogSummary l={lg} />
            {editable && (
              <div className="row mt">
                <button className="btn sm" onClick={() => setEditing(true)}><Icon name="edit" />{t("edit")}</button>
                <button className="btn sm" onClick={async () => {
                  const r = await dialogs.run(() => api.del<Day>(url));
                  if (r) onDay(r);
                }}>{t("clear")}</button>
              </div>
            )}
          </>
        ) : meal.options.map((o) => <OptionBlock key={o.id} o={o} />)}
      </div>
    );
  }

  const seg: [Draft["status"], string, string][] = [
    ["done", meal.kind === "extras" ? "st_used" : "st_as_planned", ""],
    ["off_plan", "st_other", "warn"],
    ["skipped", "st_skipped", "mute"],
  ];
  return (
    <div className={`card meal s-${meal.state}`}>
      {head}
      {meal.note && <p className="small muted">{meal.note}</p>}
      <div className="seg">
        {seg.map(([s, k, c]) => (
          <button key={s} type="button" className={d.status === s ? `on ${c}`.trim() : ""} onClick={() => setD({ ...d, status: s })}>{t(k)}</button>
        ))}
      </div>
      {d.status === "done" && meal.kind === "extras" && meal.options.flatMap((o) => o.items).map((it) => {
        const c = d.extras[it.id] ?? 0;
        const used = it.week_used ?? 0;
        const setC = (n: number) => {
          const ex = { ...d.extras };
          if (n <= 0) delete ex[it.id]; else ex[it.id] = n;
          setD({ ...d, extras: ex });
        };
        return (
          <div key={it.id}>
            <div className="item">
              <span>{it.name} <span className="muted">{it.display}</span>
                {it.note && <span className="small muted"> – {it.note}</span>}
                {it.max_per_week ? <span className={`chip${used + c > it.max_per_week ? " warn" : ""}`} style={{ marginLeft: ".4rem" }}>
                  {t("week_limit", { used, max: it.max_per_week })}</span> : null}
              </span>
              <span className="row" style={{ gap: ".3rem" }}>
                <button className="btn sm" type="button" onClick={() => setC(c - 1)}>−</button>
                <b style={{ minWidth: "1.5rem", textAlign: "center" }}>{c}</b>
                <button className="btn sm" type="button" onClick={() => setC(c + 1)}>+</button>
              </span>
            </div>
            {it.substitutes.length > 0 && (
              <details className="small mb"><summary>{t("see_substitutes")}</summary>
                {it.substitutes.map((s) => <div key={s.id}>{s.name} – {s.qty_text}</div>)}
              </details>
            )}
          </div>
        );
      })}
      {d.status === "done" && meal.kind !== "extras" && (
        <>
          {meal.options.map((o) => (
            <OptionBlock key={o.id} o={o} ctx={{
              selectable: o.kind === "choice" && choices.length > 1,
              selected: o.kind === "addon" || d.option_id === o.id || choices.length === 1,
              editable: true, subs: d.subs,
              qtys: d.qtys,
              onQty: (it, v) => setD({ ...d, qtys: { ...d.qtys, [it.id]: v } }),
              onSelect: () => setD({ ...d, option_id: o.id, subs: {}, qtys: {} }),
              onSub: (it, m) => {
                const subs = { ...d.subs };
                if (m) subs[it.id] = m.id; else delete subs[it.id];
                const qtys = { ...d.qtys };
                delete qtys[it.id];
                setD({ ...d, subs, qtys });
              },
            }} />
          ))}
          {choices.length > 1 && !d.option_id && <p className="small muted mt">{t("choose_option")}</p>}
        </>
      )}
      {d.status === "off_plan" && (
        <div className="mt">
          <Field label={t("what_eaten")} req>
            <textarea value={d.free_text} maxLength={2000} placeholder={t("what_eaten_ph")}
              onChange={(e) => setD({ ...d, free_text: e.target.value })} />
          </Field>
        </div>
      )}
      {d.status === "done" && (
        <div className="mt">
          <Field label={t("also_eaten_opt")}>
            <input type="text" value={d.free_text} maxLength={2000} placeholder={t("also_eaten_ph")}
              onChange={(e) => setD({ ...d, free_text: e.target.value })} />
          </Field>
        </div>
      )}
      <div className="mt">
        <Field label={t("note")}>
          <input type="text" value={d.note} maxLength={2000} onChange={(e) => setD({ ...d, note: e.target.value })} />
        </Field>
      </div>
      <div className="row mt">
        <button className="btn primary" onClick={() => void save()}><Icon name="check" />{t("confirm")}</button>
        {lg && <button className="btn" onClick={() => setEditing(false)}>{t("cancel")}</button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ day view
export function DayView({ patientId, date, role, basePath }: {
  patientId: string; date: string; role: "patient" | "doctor"; basePath: string;
}) {
  const { t, locale } = useI18n();
  const dialogs = useDialogs();
  const nav = useNavigate();
  const editable = role === "patient";
  const today = D.today();
  const day = useAsync(() => api.get<Day>(`/api/patients/${patientId}/day/${date}`), [patientId, date]);
  const go = (d: string) => nav(`${basePath}/${d}`);

  const openCalendar = async () => {
    const d = await dialogs.open<string>(t("pick_date"), (close) => <CalendarModal patientId={patientId} date={date} onPick={close} />);
    if (d) go(d);
  };

  if (day.error && !day.data) return <div className="alert danger">{dialogs.errText(day.error)}</div>;
  if (!day.data) return <Spinner />;
  const dd = day.data;
  const notes = (dd.diet?.notes ?? "").split("\n").filter((x) => x.trim());
  const showNotes = () => void dialogs.open(t("general_notes"), (close) => (
    <>
      <ul>{notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <div className="actions"><button className="btn primary" onClick={() => close()}>{t("close")}</button></div>
    </>
  ));
  return (
    <div>
      {notes.length > 0 && (
        <div className="mb">
          <button className="btn sm" type="button" onClick={showNotes}><Icon name="info" />{t("general_notes")}</button>
        </div>
      )}
      <div className="row mb">
        <button className="btn daypick" type="button" onClick={() => void openCalendar()} title={t("pick_date")} aria-label={t("pick_date")}
          style={{ fontSize: "1.15rem", fontWeight: 700, textTransform: "capitalize" }}>
          <Icon name="calendar" />{D.long(date, locale)}<Icon name="down" size={18} />
        </button>
        {date === today ? <span className="chip info">{t("today")}</span>
          : <button className="btn sm" onClick={() => go(today)}>{t("today")}</button>}
      </div>
      <div>
        <div>
          {!dd.diet ? (
            <div className="card"><div className="empty">{t("no_diet_for_day")}</div></div>
          ) : (
            <>
              <div className="row mb">
                <span className="muted">{t("diet")}:</span><b>{dd.diet.name}</b>
                {dd.missing > 0 && date < today && <span className="chip danger">{t("n_missing", { n: dd.missing })}</span>}
              </div>
              {dd.meals.map((m) => (
                <MealCard key={`${m.id}:${m.log?.id ?? "none"}:${m.log?.status ?? ""}`} meal={m} editable={editable}
                  patientId={patientId} date={date} onDay={(d) => day.setData(d)} />
              ))}
              {dd.orphan_logs.length > 0 && (
                <div className="card"><h3>{t("other_records")}</h3>
                  {dd.orphan_logs.map((l) => <div key={l.id}><b>{l.meal_name}: </b><LogSummary l={l} /></div>)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarModal({ patientId, date, onPick }: { patientId: string; date: string; onPick: (d: string) => void }) {
  const { t } = useI18n();
  const [month, setMonth] = useState(date.slice(0, 7));
  const [days, setDays] = useState<Record<string, DayStat>>({});
  useEffect(() => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0);
    api.get<Progress>(`/api/patients/${patientId}/progress?date_from=${month}-01&date_to=${D.iso(last)}`)
      .then((p) => setDays(Object.fromEntries(p.days.map((d) => [d.date, d]))))
      .catch(() => setDays({}));
  }, [patientId, month]);
  return (
    <>
      <CalendarGrid month={month} days={days} selected={date} onPick={onPick} onMonth={setMonth} />
      <div className="actions"><button className="btn" onClick={() => onPick("")}>{t("close")}</button></div>
    </>
  );
}

// ------------------------------------------------------------------ warnings banner
export function WarningsBanner({ patientId, basePath, who }: { patientId: string; basePath: string; who: "patient" | "doctor" }) {
  const { t, locale } = useI18n();
  const w = useAsync(() => api.get<Warnings>(`/api/patients/${patientId}/warnings`), [patientId]);
  const [open, setOpen] = useState(false);
  if (!w.data || !w.data.count) return null;
  return (
    <div className="alert warn">
      <div className="row">
        <Icon name="alert" />
        <b>{t(who === "doctor" ? "warn_doctor" : "warn_patient", { n: w.data.count })}</b>
        <span className="grow" />
        <button className="btn sm" onClick={() => setOpen(!open)}>{t("show_days")}</button>
      </div>
      {open && (
        <div className="small mt">
          {w.data.days.slice().reverse().slice(0, 40).map((d) => (
            <Link key={d.date} className="chip warn" to={`${basePath}/${d.date}`} style={{ margin: "0 .3rem .3rem 0" }}>
              {`${D.fmt(d.date, locale, { day: "2-digit", month: "2-digit" })} (${d.missing}/${d.total})`}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
