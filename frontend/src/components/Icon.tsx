import { ICONS } from "./icons-data";

export type IconName = keyof typeof ICONS | string;

export function Icon({ name, size }: { name: IconName; size?: number }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={ICONS[name] ?? ICONS.help} />
    </svg>
  );
}
