import { useRef, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { Icon } from "./Icon";

export function Field({ label, req, wide, children }: { label: ReactNode; req?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`f${wide ? " wide" : ""}`}>
      <span className={req ? "req" : undefined}>{label}</span>
      {children}
    </label>
  );
}

export function Spinner() { return <div className="spinner" />; }

export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }

export function Avatar({ id, name, has, size = 40, bust, role }: {
  id: string; name: string; has?: boolean; size?: number; bust?: number | string; role?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (has) {
    const base = role === "doctor" ? "/api/auth/photo" : `/api/patients/${id}/photo`;
    return <img className="avatar" src={`${base}?v=${bust ?? ""}`} alt={name} style={style} />;
  }
  const initials = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("");
  return <span className="avatar ph" style={style} aria-hidden="true">{initials}</span>;
}

/** Minimal markdown renderer (headings, lists, bold, italic, code) for the in-app guides. */
export function Markdown({ src }: { src: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  let para: string[] = [];
  let key = 0;
  const inline = (s: string): ReactNode[] => {
    const res: ReactNode[] = [];
    const re = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      if (m.index > last) res.push(s.slice(last, m.index));
      const tok = m[0];
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (link) {
        // only http(s) and mailto links are rendered as links
        const href = /^(https?:|mailto:)/i.test(link[2]) ? link[2] : null;
        res.push(href ? <a key={key++} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a> : link[1]);
      } else if (tok.startsWith("**")) res.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
      else if (tok.startsWith("`")) res.push(<code key={key++}>{tok.slice(1, -1)}</code>);
      else res.push(<em key={key++}>{tok.slice(1, -1)}</em>);
      last = m.index + tok.length;
    }
    if (last < s.length) res.push(s.slice(last));
    return res;
  };
  const flushPara = () => { if (para.length) { out.push(<p key={key++}>{inline(para.join(" "))}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    out.push(list.ordered ? <ol key={key++}>{list.items}</ol> : <ul key={key++}>{list.items}</ul>);
    list = null;
  };
  for (const line of src.split("\n")) {
    let m: RegExpExecArray | null;
    if (/^-{3,}\s*$/.test(line)) {
      flushPara(); flushList();
      out.push(<hr key={key++} />);
    } else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flushPara(); flushList();
      const Tag = (`h${m[1].length}`) as "h1" | "h2" | "h3";
      out.push(<Tag key={key++}>{inline(m[2])}</Tag>);
    } else if ((m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line))) {
      flushPara();
      const ordered = /^\s*\d+\./.test(line);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(<li key={key++}>{inline(m[1])}</li>);
    } else if (!line.trim()) { flushPara(); flushList(); }
    else para.push(line.trim());
  }
  flushPara(); flushList();
  return <div className="md">{out}</div>;
}

/** Translated status chip for meal states. */
export function StateChip({ state }: { state: string }) {
  const { t } = useI18n();
  const map: Record<string, [string, string]> = {
    done: ["ok", "st_done"], off_plan: ["warn", "st_off_plan"], skipped: ["", "st_skipped"],
    missing: ["danger", "st_missing"], open: ["", "st_open"],
  };
  const [c, k] = map[state] ?? ["", "st_open"];
  return <span className={`chip${c ? " " + c : ""}`}>{t(k)}</span>;
}

/** Styled file picker (replaces the browser's native "Choose file" control). */
export function FileButton({ files, onChange, multiple, accept }: {
  files: File[]; onChange: (f: File[]) => void; multiple?: boolean; accept?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const label = files.length === 0 ? t("file_none") : files.length === 1 ? files[0].name : t("files_n", { n: files.length });
  return (
    <div className="row" style={{ gap: ".6rem" }}>
      <button type="button" className="btn" onClick={() => ref.current?.click()}>
        <Icon name="upload" />{t(multiple ? "files_pick" : "file_pick")}
      </button>
      <span className="small muted" style={{ wordBreak: "break-all" }}>{label}</span>
      <input ref={ref} type="file" className="hidden" multiple={multiple} accept={accept}
        onChange={(e) => { onChange(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </div>
  );
}
