import { useEffect, useRef } from "react";
import { Chart, registerables, type ChartConfiguration } from "chart.js";
import { usePrefs } from "../prefs";

Chart.register(...registerables);

export const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Chart.js wrapper; the chart is rebuilt when the theme changes so it picks up the CSS variables. */
export function ChartCanvas({ build, deps, small }: { build: () => ChartConfiguration; deps: unknown[]; small?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { theme } = usePrefs();
  useEffect(() => {
    if (!ref.current) return;
    Chart.defaults.color = cssVar("--muted");
    Chart.defaults.borderColor = cssVar("--border");
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const cfg = build();
    cfg.options = { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, ...(cfg.options ?? {}) };
    const chart = new Chart(ref.current, cfg);
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ...deps]);
  return <div className={`chartbox${small ? " sm" : ""}`}><canvas ref={ref} /></div>;
}
