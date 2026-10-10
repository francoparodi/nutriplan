import { useState, type InputHTMLAttributes } from "react";
import { useI18n } from "../i18n";
import { Icon } from "./Icon";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Password field with an "eye" button that shows/hides what has been typed. */
export function PasswordInput(props: Props) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input {...props} type={show ? "text" : "password"} />
      <button type="button" className="pw-eye" tabIndex={0}
        aria-label={t(show ? "hide_password" : "show_password")} title={t(show ? "hide_password" : "show_password")}
        aria-pressed={show} onClick={() => setShow((v) => !v)}>
        <Icon name={show ? "eyeoff" : "eye"} size={20} />
      </button>
    </div>
  );
}
