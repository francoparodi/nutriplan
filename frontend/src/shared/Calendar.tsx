import { useI18n } from "../i18n";
import { D } from "../lib/dates";
import { Icon } from "../components/Icon";
import type { DayStat } from "../types";

interface Props {
  month: string; // YYYY-MM
  days: Record<string, DayStat>;
  selected: string;
  onPick: (iso: string) => void;
  onMonth: (m: string) => void;
}

export function CalendarGrid({ month, days, selected, onPick, onMonth }: Props) {
  const { t, locale } = useI18n();
  const first = D.parse(`${month}-01`);
  const startDow = (first.getDay() + 6) % 7;
  const today = D.today();
  const start = new Date(first);
  start.setDate(1 - startDow);
  const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "short" }));
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    const iso = D.iso(d);
    const info = days[iso];
    let cls = "";
    if (info && info.required > 0) {
      if (info.missing === 0 && info.off_plan === 0) cls = "ok";
      else if (iso >= today && info.missing > 0 && info.done === 0 && info.off_plan === 0) cls = "";
      else if (info.done > 0 || info.off_plan > 0 || info.skipped > 0) cls = "part";
      else if (iso < today) cls = "bad";
    }
    const classes = [cls, d.getMonth() !== first.getMonth() ? "out" : "", iso === selected ? "sel" : "", iso === today ? "today" : ""].filter(Boolean).join(" ");
    cells.push(
      <button key={iso} type="button" className={classes} onClick={() => onPick(iso)} aria-label={D.long(iso, locale)}>
        <span className="n">{d.getDate()}</span>
        {info && info.required ? <span className="dot">{info.done}/{info.required}</span> : null}
      </button>,
    );
  }
  const shift = (n: number) => D.iso(new Date(first.getFullYear(), first.getMonth() + n, 1)).slice(0, 7);
  return (
    <div>
      <div className="row spread mb">
        <button className="iconbtn" type="button" onClick={() => onMonth(shift(-1))} aria-label={t("prev")}><Icon name="back" /></button>
        <b style={{ textTransform: "capitalize" }}>{first.toLocaleDateString(locale, { month: "long", year: "numeric" })}</b>
        <button className="iconbtn" type="button" onClick={() => onMonth(shift(1))} aria-label={t("next")}><Icon name="next" /></button>
      </div>
      <div className="cal">
        {names.map((n) => <div key={n} className="dow">{n}</div>)}
        {cells}
      </div>
      <div className="legend mt">
        <span><i style={{ background: "var(--ok-soft)" }} />{t("cal_ok")}</span>
        <span><i style={{ background: "var(--warn-soft)" }} />{t("cal_part")}</span>
        <span><i style={{ background: "var(--danger-soft)" }} />{t("cal_bad")}</span>
      </div>
    </div>
  );
}
