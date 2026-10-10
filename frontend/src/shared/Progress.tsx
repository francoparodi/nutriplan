import { useState } from "react";
import { api } from "../api";
import { useDialogs } from "../components/Dialogs";
import { Icon } from "../components/Icon";
import { ChartCanvas, cssVar } from "../components/ChartCanvas";
import { Empty, Field, Spinner } from "../components/Common";
import { useI18n } from "../i18n";
import { D, fmtNum } from "../lib/dates";
import { useAsync } from "../lib/useAsync";
import type { DayStat, Progress, Visit } from "../types";

export function WeightChart({ weights, goal }: { weights: Progress["weights"]; goal: number | null }) {
  const { t, locale } = useI18n();
  if (!weights.length) return <Empty>{t("no_weights")}</Empty>;
  return (
    <ChartCanvas deps={[weights, goal, locale]} build={() => ({
      type: "line",
      data: {
        labels: weights.map((w) => D.fmt(w.date, locale, { day: "2-digit", month: "2-digit" })),
        datasets: [
          { label: t("weight_kg"), data: weights.map((w) => w.kg), borderColor: cssVar("--c1"), backgroundColor: cssVar("--c1"),
            tension: 0.25, pointRadius: weights.length > 60 ? 1.5 : 4, fill: false },
          ...(goal ? [{ label: t("goal_weight"), data: weights.map(() => goal), borderColor: cssVar("--c2"),
            borderDash: [6, 5], pointRadius: 0, fill: false }] : []),
        ],
      },
      options: { scales: { y: { title: { display: true, text: "kg" } } }, plugins: { legend: { display: !!goal } } },
    })} />
  );
}

function AdherenceChart({ days }: { days: DayStat[] }) {
  const { t, locale } = useI18n();
  const rows = days.filter((d) => d.required > 0 || d.done || d.off_plan || d.skipped);
  if (!rows.length) return <Empty>{t("no_data")}</Empty>;
  const today = D.today();
  return (
    <ChartCanvas deps={[days, locale]} build={() => ({
      type: "bar",
      data: {
        labels: rows.map((d) => D.fmt(d.date, locale, { day: "2-digit", month: "2-digit" })),
        datasets: [
          { type: "bar", label: t("st_done"), data: rows.map((d) => d.done), backgroundColor: cssVar("--c1"), stack: "s", yAxisID: "y" },
          { type: "bar", label: t("st_off_plan"), data: rows.map((d) => d.off_plan), backgroundColor: cssVar("--c2"), stack: "s", yAxisID: "y" },
          { type: "bar", label: t("st_skipped"), data: rows.map((d) => d.skipped), backgroundColor: cssVar("--c6"), stack: "s", yAxisID: "y" },
          { type: "bar", label: t("st_missing"), data: rows.map((d) => (d.date < today ? d.missing : 0)), backgroundColor: cssVar("--c4"), stack: "s", yAxisID: "y" },
          { type: "line", label: t("adherence_pct"), data: rows.map((d) => d.adherence), borderColor: cssVar("--c3"),
            backgroundColor: cssVar("--c3"), yAxisID: "y1", tension: 0.25, pointRadius: 2, spanGaps: true },
        ],
      },
      options: {
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: t("meals") } },
          y1: { position: "right", min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: "%" } },
        },
      },
    })} />
  );
}

const MEASURES: [keyof Visit, string, number][] = [["waist_cm", "waist_cm", 1], ["leg_length_cm", "leg_length_cm", 2], ["calf_cm", "calf_cm", 3], ["biceps_cm", "biceps_cm", 5]];

function MeasurementsChart({ visits }: { visits: Visit[] }) {
  const { t, locale } = useI18n();
  const rows = visits.slice().reverse();
  const defs = MEASURES.filter(([k]) => rows.some((r) => r[k] !== null && r[k] !== undefined));
  if (!rows.length || !defs.length) return null;
  return (
    <div className="card mt">
      <h3>{t("measurements_trend")}</h3>
      <ChartCanvas small deps={[visits, locale]} build={() => ({
        type: "line",
        data: {
          labels: rows.map((r) => D.fmt(r.date, locale, { day: "2-digit", month: "2-digit" })),
          datasets: defs.map(([k, l, c]) => ({
            label: t(l), data: rows.map((r) => r[k] as number | null), borderColor: cssVar(`--c${c}`), backgroundColor: cssVar(`--c${c}`),
            tension: 0.25, pointRadius: 4, borderWidth: 2, fill: false, spanGaps: true,
          })),
        },
        options: { scales: { y: { beginAtZero: false } }, interaction: { intersect: false, mode: "index" } },
      })} />
    </div>
  );
}

export function ReportCard({ patientId }: { patientId: string }) {
  const { t, lang } = useI18n();
  const { run, toast } = useDialogs();
  const [from, setFrom] = useState(D.add(D.today(), -29));
  const [to, setTo] = useState(D.today());
  const dl = async (kind: "pdf" | "xlsx") => {
    if (!from || !to || from > to) return toast(t("err_invalid_range"), true);
    await run(() => api.download(`/api/patients/${patientId}/report.${kind}?date_from=${from}&date_to=${to}&lang=${lang}`, `report.${kind}`));
  };
  return (
    <div className="card">
      <h2>{t("report")}</h2>
      <p className="muted">{t("report_intro")}</p>
      <div className="form-grid">
        <Field label={t("date_from")}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t("date_to")}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="row mt">
        {[7, 30, 90, 365].map((n) => (
          <button key={n} className="btn sm" onClick={() => { setTo(D.today()); setFrom(D.add(D.today(), -n + 1)); }}>{t("last_n_days", { n })}</button>
        ))}
      </div>
      <div className="row mt">
        <button className="btn primary" onClick={() => void dl("pdf")}><Icon name="download" />PDF</button>
        <button className="btn primary" onClick={() => void dl("xlsx")}><Icon name="download" />Excel</button>
      </div>
    </div>
  );
}

const Stat = ({ v, k }: { v: string; k: string }) => <div className="stat"><div className="v">{v}</div><div className="k">{k}</div></div>;

/** Progress page: summary, weight and adherence charts, measurements trend and the report download. */
export function ProgressView({ patientId }: { patientId: string }) {
  const { t, locale } = useI18n();
  const [days, setDays] = useState(90);
  const data = useAsync(async () => {
    const b = D.today(), a = D.add(b, -days + 1);
    const [p, visits] = await Promise.all([
      api.get<Progress>(`/api/patients/${patientId}/progress?date_from=${a}&date_to=${b}`),
      api.get<Visit[]>(`/api/patients/${patientId}/visits`),
    ]);
    return { p, visits: visits.filter((v) => v.date >= a && v.date <= b) };
  }, [patientId, days]);
  if (!data.data) return <Spinner />;
  const { p, visits } = data.data;
  const s = p.summary;
  const n = (v: number | null, d = 1) => fmtNum(v, locale, d);
  return (
    <div>
      <div className="row mb">
        <span className="muted">{t("period")}:</span>
        <div className="seg">
          {([[30, "d30"], [90, "d90"], [180, "d180"], [365, "d365"]] as const).map(([k, l]) => (
            <button key={k} className={days === k ? "on" : ""} onClick={() => setDays(k)}>{t(l)}</button>
          ))}
        </div>
      </div>
      <div className="grid c4 mb">
        <Stat v={s.avg_adherence === null ? "–" : `${n(s.avg_adherence, 0)}%`} k={t("avg_adherence")} />
        <Stat v={n(s.last_weight)} k={`${t("last_weight")} (kg)`} />
        <Stat v={s.delta_weight === null ? "–" : `${s.delta_weight > 0 ? "+" : ""}${n(s.delta_weight)}`} k={`${t("weight_change")} (kg)`} />
        <Stat v={String(s.off_plan)} k={t("off_plan_meals")} />
        <Stat v={String(s.missing)} k={t("missing_meals")} />
        <Stat v={String(s.subs)} k={t("substitutions_used")} />
        <Stat v={String(s.adjusted)} k={t("meals_qty_modified")} />
      </div>
      <div className="card mb"><h3>{t("weight_trend")}</h3><WeightChart weights={p.weights} goal={p.goal_weight} /></div>
      <div className="card mb"><h3>{t("adherence")}</h3><AdherenceChart days={p.days} /></div>
      <MeasurementsChart visits={visits} />
      <div className="mt"><ReportCard patientId={patientId} /></div>
    </div>
  );
}
