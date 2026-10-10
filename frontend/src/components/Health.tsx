import { useDialogs } from "./Dialogs";
import { Icon } from "./Icon";
import { useI18n, type TFn } from "../i18n";

export interface HealthInfo { allergies?: string; intolerances?: string; pathologies?: string }

/** Non-empty allergy / intolerance / condition entries of a patient. */
export function healthEntries(h: HealthInfo | null | undefined, t: TFn): { key: string; label: string; text: string }[] {
  if (!h) return [];
  return ([["allergies", h.allergies], ["intolerances", h.intolerances], ["pathologies", h.pathologies]] as const)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => ({ key: k, label: t(k), text: v!.trim() }));
}

/** Persistent warning shown while a diet is being created or edited for a patient with allergies/conditions. */
export function HealthBanner({ name, info }: { name: string; info: HealthInfo | null | undefined }) {
  const { t } = useI18n();
  const items = healthEntries(info, t);
  if (!items.length) return null;
  return (
    <div className="alert danger" role="alert">
      <div className="row"><Icon name="alert" /><b>{t("health_warning_title", { name })}</b></div>
      <ul style={{ margin: ".4rem 0 0" }}>
        {items.map((i) => <li key={i.key}><b>{i.label}:</b> {i.text}</li>)}
      </ul>
    </div>
  );
}

/** Asks the doctor to acknowledge the patient's allergies/conditions. Resolves true if there is
 *  nothing to warn about, or if the doctor confirms. */
export function useHealthConfirm() {
  const { t } = useI18n();
  const { open } = useDialogs();
  return async (name: string, info: HealthInfo | null | undefined, okLabel?: string): Promise<boolean> => {
    const items = healthEntries(info, t);
    if (!items.length) return true;
    const r = await open<boolean>(t("health_confirm_title"), (close) => (
      <>
        <div className="alert danger">
          <b>{t("health_warning_title", { name })}</b>
          <ul style={{ margin: ".4rem 0 0" }}>{items.map((i) => <li key={i.key}><b>{i.label}:</b> {i.text}</li>)}</ul>
        </div>
        <p>{t("health_confirm_text")}</p>
        <div className="actions">
          <button className="btn" onClick={() => close(false)}>{t("cancel")}</button>
          <button className="btn primary" onClick={() => close(true)}>{okLabel ?? t("health_confirm_ok")}</button>
        </div>
      </>
    ), { sticky: true });
    return !!r;
  };
}
