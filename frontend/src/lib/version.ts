import { useEffect, useState } from "react";

export interface AppVersion { version: string; commit: string }

let cache: AppVersion | null = null;
let pending: Promise<AppVersion> | null = null;

function load(): Promise<AppVersion> {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch("/api/health")
    .then((r) => r.json())
    .then((j) => { cache = { version: String(j.version ?? ""), commit: String(j.commit ?? "") }; return cache; })
    .catch(() => ({ version: "", commit: "" }));
  return pending;
}

/** Release identification of the running application (git tag or commit), from /api/health. */
export function useAppVersion(): AppVersion | null {
  const [v, setV] = useState<AppVersion | null>(cache);
  useEffect(() => {
    let live = true;
    void load().then((x) => { if (live) setV(x); });
    return () => { live = false; };
  }, []);
  return v && v.version ? v : null;
}

/** "1.2.0" -> "v1.2.0"; tags that already start with "v" and commit hashes are shown as they are. */
export function versionLabel(version: string): string {
  return /^\d/.test(version) && version.includes(".") ? `v${version}` : version;
}
