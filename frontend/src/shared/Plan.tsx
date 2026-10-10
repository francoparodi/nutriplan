import { api } from "../api";
import { Icon } from "../components/Icon";
import { useDialogs } from "../components/Dialogs";
import { useI18n } from "../i18n";
import { D, fmtNum, qtyText } from "../lib/dates";
import type { DayOption, Diet } from "../types";
import { OptionBlock } from "./DayView";

/** Read-only rendering of a meal plan (patient "My diet" page, editor preview). */
export function PlanView({ doc }: { doc: Diet }) {
  const { t, locale } = useI18n();
  const byId = Object.fromEntries(doc.meals.map((m) => [m.id, m]));
  const notes = (doc.notes || "").split("\n").filter((x) => x.trim());
  return (
    <div>
      {doc.meals.map((m) => (
        <div key={m.id} className="card meal">
          <div className="meal-head">
            <h3>{m.name}</h3>
            {m.time && <span className="muted small">{m.time}</span>}
            {m.kind === "extras" && <span className="chip info">{t("optional")}</span>}
          </div>
          {m.note && <p className="small muted">{m.note}</p>}
          {m.same_as_meal_id && byId[m.same_as_meal_id] && <p><em>{t("same_as", { meal: byId[m.same_as_meal_id].name })}</em></p>}
          {m.options.map((o) => {
            const opt: DayOption = {
              ...o,
              summary: "",
              items: o.items.map((i) => ({ ...i, display: qtyText(i.qty, i.unit, i.qty_text, locale), group: null, substitutes: [] })),
            };
            return <OptionBlock key={o.id} o={opt} />;
          })}
        </div>
      ))}
      {doc.groups.length > 0 && (
        <div className="card">
          <h2>{t("substitutes")}</h2>
          <p className="small muted">{t("star_help")}</p>
          {doc.groups.map((g) => (
            <details key={g.id} className="mb">
              <summary><b>{g.name}{g.ref_qty ? ` ${fmtNum(g.ref_qty, locale)} ${g.ref_unit}` : ""}</b></summary>
              {g.note && <p className="small muted">{g.note}</p>}
              <table><tbody>
                {g.members.map((mm) => (
                  <tr key={mm.id}>
                    <td>{mm.name}{mm.note && <span className="small muted"> ({mm.note})</span>}
                      {mm.max_per_week ? <span className="chip warn" style={{ marginLeft: ".4rem" }}>{t("max_week", { n: mm.max_per_week })}</span> : null}</td>
                    <td className="right nowrap">{qtyText(mm.qty, mm.unit, mm.qty_text, locale)}</td>
                  </tr>
                ))}
              </tbody></table>
            </details>
          ))}
        </div>
      )}
      {notes.length > 0 && <div className="card"><h2>{t("general_notes")}</h2><ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
      {doc.conversion.length > 0 && (
        <div className="card"><h2>{t("conversion")}</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>{t("type")}</th><th>{t("raw")}</th><th>{t("cooked")}</th></tr></thead>
            <tbody>{doc.conversion.map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.raw}</td><td>{c.cooked}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

export function PlanHeader({ doc }: { doc: Diet }) {
  const { t, lang, locale } = useI18n();
  const { run } = useDialogs();
  return (
    <div className="card mb">
      <div className="row spread">
        <div>
          <h2>{doc.name}</h2>
          {doc.description && <p className="muted">{doc.description}</p>}
          {doc.start_date && (
            <p className="small muted">{t("valid_from")} {D.fmt(doc.start_date, locale)}{doc.end_date ? ` ${t("to")} ${D.fmt(doc.end_date, locale)}` : ""}</p>
          )}
        </div>
        <button className="btn primary" onClick={() => void run(() => api.download(`/api/diets/${doc.id}/pdf?lang=${lang}`, "piano.pdf"))}>
          <Icon name="download" />{t("download_pdf")}
        </button>
      </div>
    </div>
  );
}
