import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth, useUser } from "../auth";
import { Avatar } from "../components/Common";
import { Icon } from "../components/Icon";
import { useI18n } from "../i18n";
import { usePrefs } from "../prefs";
import type { Warnings } from "../types";
import { useTitleValue } from "./Title";
import { useAppVersion, versionLabel } from "../lib/version";

interface NavItem { to: string; icon: string; label: string; badge?: number; end?: boolean }

export function setServerPref(body: Record<string, string>) {
  void api.put("/api/auth/preferences", body).catch(() => undefined);
}

export function Shell() {
  const user = useUser();
  const { logout, patchUser } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme, collapsed, setCollapsed } = usePrefs();
  const title = useTitleValue();
  const ver = useAppVersion();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [warn, setWarn] = useState(0);

  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (user.role !== "patient") return;
    api.get<Warnings>(`/api/patients/${user.id}/warnings`).then((w) => setWarn(w.count)).catch(() => undefined);
  }, [user.id, user.role, loc.pathname]);

  const items: NavItem[] =
    user.role === "patient" ? [
      { to: "/diary", icon: "book", label: "nav_diary", badge: warn },
      { to: "/weight", icon: "weight", label: "nav_weight" },
      { to: "/progress", icon: "chart", label: "nav_progress" },
      { to: "/documents", icon: "folder", label: "nav_documents" },
      { to: "/profile", icon: "user", label: "nav_profile" },
      { to: "/plan", icon: "plan", label: "nav_plan" },
      { to: "/help", icon: "help", label: "nav_help" },
    ] : user.role === "doctor" ? [
      { to: "/diets", icon: "plan", label: "nav_diets" },
      { to: "/patients", icon: "users", label: "nav_patients" },
      { to: "/profile", icon: "user", label: "nav_profile" },
      { to: "/backup", icon: "db", label: "nav_backup" },
      { to: "/help", icon: "help", label: "nav_help" },
    ] : [
      { to: "/admin", icon: "activity", label: "nav_overview", end: true },
      { to: "/admin/users", icon: "users", label: "nav_users" },
      { to: "/admin/logs", icon: "report", label: "nav_logs" },
      { to: "/admin/import", icon: "upload", label: "nav_import" },
      { to: "/admin/backup", icon: "db", label: "nav_backup" },
      { to: "/profile", icon: "user", label: "nav_profile" },
      { to: "/help", icon: "help", label: "nav_help" },
    ];

  const dark = theme === "dark";
  const toggleMenu = () => {
    if (matchMedia("(max-width: 900px)").matches) setMenuOpen((o) => !o);
    else setCollapsed(!collapsed);
  };
  const cls = ["layout", collapsed ? "collapsed" : "", menuOpen ? "menu-open" : ""].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      <aside className="sidebar">
        <div className="brand"><Icon name="logo" size={28} /><span>Nutriplan</span></div>
        <nav className="nav" aria-label="menu">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} title={t(i.label)} className={({ isActive }) => (isActive ? "active" : "")}>
              <Icon name={i.icon} /><span className="label">{t(i.label)}</span>
              {i.badge ? <span className="badge">{i.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-user">
            {user.role !== "admin" && <Avatar id={user.id} name={user.full_name} has={user.has_photo} size={36} role={user.role} />}
            <div style={{ minWidth: 0 }}><b>{user.full_name || user.username}</b><span>{t("role_" + user.role)}</span></div>
          </div>
          <button className="iconbtn" title={t("theme")} onClick={() => {
            const n = dark ? "light" : "dark";
            setTheme(n); patchUser({ theme: n }); setServerPref({ theme: n });
          }}><Icon name={dark ? "sun" : "moon"} /><span>{dark ? t("light") : t("dark")}</span></button>
          <button className="iconbtn" title={t("language")} onClick={() => {
            const n = lang === "it" ? "en" : "it";
            setLang(n); patchUser({ lang: n }); setServerPref({ lang: n });
          }}><Icon name="help" /><span>{lang === "it" ? "English" : "Italiano"}</span></button>
          <button className="iconbtn" onClick={() => void logout()}><Icon name="logout" /><span>{t("logout")}</span></button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setMenuOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="iconbtn" onClick={toggleMenu} aria-label="menu"><Icon name="menu" /></button>
          <h1 id="page-title">{title}</h1>
          {ver && <span className="app-version" title={ver.commit ? `commit ${ver.commit}` : undefined}>{versionLabel(ver.version)}</span>}
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
