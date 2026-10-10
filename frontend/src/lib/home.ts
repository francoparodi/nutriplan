import type { Role } from "../types";

/** Landing page after login (and for unknown URLs), per role. */
export const HOME: Record<Role, string> = { patient: "/plan", doctor: "/patients", admin: "/admin" };
