export type Role = "admin" | "doctor" | "patient";

export interface Contacts { phone: string; whatsapp: string; telegram: string; instagram: string; facebook: string; website: string }

export interface User {
  contacts: Contacts; doctor_contacts?: Contacts;
  id: string; username: string; role: Role; full_name: string; email: string;
  lang: "it" | "en"; theme: "light" | "dark"; must_change_password: boolean;
  doctor_name?: string; has_photo?: boolean;
}

// ---- diets
export interface Member { id: string; name: string; qty: number | null; unit: string; qty_text: string; note: string; max_per_week: number | null }
export interface Group { id: string; name: string; ref_qty: number | null; ref_unit: string; note: string; members: Member[] }
export interface DItem { id: string; name: string; qty: number | null; unit: string; qty_text: string; group_id: string | null; note: string; max_per_week: number | null }
export interface DOption { id: string; label: string; course: string; kind: "choice" | "addon"; max_per_week: number | null; note: string; items: DItem[] }
export interface DMeal { id: string; name: string; time: string; kind: "meal" | "extras"; required: boolean; same_as_meal_id: string | null; note: string; options: DOption[] }
export interface Diet {
  id: string; name: string; description: string; notes: string; conversion: { name: string; raw: string; cooked: string }[];
  patient_id: string | null; start_date: string | null; end_date: string | null; status: "active" | "paused" | "archived";
  groups: Group[]; meals: DMeal[];
}
export interface DietSummary {
  id: string; name: string; description: string; status: string; patient_id: string | null; patient_name: string;
  start_date: string | null; end_date: string | null; updated_at: string;
}
export interface PatientDietRow { id: string; name: string; status: string; start_date: string | null; end_date: string | null; current: boolean }

// ---- diary (resolved by the server)
export interface Substitute { id: string; name: string; qty_text: string; note: string; max_per_week: number | null }
export interface DayItem extends DItem {
  display: string; week_used?: number;
  group: { id: string; name: string; note: string } | null; substitutes: Substitute[];
}
export interface DayOption extends Omit<DOption, "items"> { items: DayItem[]; summary: string; week_used?: number; inherited?: boolean }
export interface MealLog {
  id: string; status: "done" | "off_plan" | "skipped"; option_id: string | null; option_label: string;
  substitutions: { item_id: string; item_name: string; item_qty: string; member_id: string; name: string; qty_text: string }[];
  extras: { item_id: string; name: string; qty_text: string; count: number }[];
  adjustments: { item_id: string; item_name: string; unit: string; planned: number; actual: number }[];
  free_text: string; note: string; meal_name: string;
}
export type MealState = "done" | "off_plan" | "skipped" | "missing" | "open";
export interface DayMeal extends Omit<DMeal, "options"> { options: DayOption[]; log: MealLog | null; state: MealState; inherited: boolean }
export interface Day {
  date: string; diet: { id: string; name: string; notes: string } | null; meals: DayMeal[];
  weight: number | null; weight_note: string; missing: number; orphan_logs: MealLog[];
}
export interface DayStat { date: string; required: number; done: number; off_plan: number; skipped: number; missing: number; subs: number; adjusted: number; adherence: number | null }
export interface Progress {
  weights: { date: string; kg: number; note: string }[]; days: DayStat[]; goal_weight: number | null; height_cm: number | null;
  summary: {
    done: number; off_plan: number; skipped: number; missing: number; required: number; subs: number; adjusted: number;
    avg_adherence: number | null; first_weight: number | null; last_weight: number | null; delta_weight: number | null;
  };
}

// ---- patients
export interface PatientListRow {
  id: string; username: string; full_name: string; active: boolean; has_photo: boolean; must_change_password: boolean;
  last_login_at: string | null; diet: string | null; last_weight: number | null; last_weight_date: string | null;
  adherence_7d: number | null; off_plan_7d: number; missing_days: number;
  allergies: string; intolerances: string; pathologies: string;
}
export interface CustomField { label: string; value: string }
export interface Patient extends Contacts {
  id: string; username: string; full_name: string; email: string; active: boolean; has_photo: boolean;
  must_change_password: boolean; created_at: string; last_login_at: string | null;
  birth_date: string | null; sex: string; height_cm: number | null; goal_weight_kg: number | null;
  address: string; tax_code: string; occupation: string; activity_level: string; allergies: string;
  intolerances: string; pathologies: string; medications: string; family_history: string; notes: string;
  custom: CustomField[];
}
export interface Doc {
  id: string; kind: "document" | "photo" | "recipe"; title: string; filename: string; mime: string; size: number;
  notes: string; visible_to_patient: boolean; uploaded_by: "doctor" | "patient"; visit_id: string | null; created_at: string;
}
export interface Visit {
  id: string; date: string; notes: string; extra: { label: string; value: number; unit: string }[]; attachments: Doc[];
  weight_kg: number | null; waist_cm: number | null; leg_length_cm: number | null; calf_cm: number | null; biceps_cm: number | null;
}
export interface Warnings { count: number; days: { date: string; missing: number; total: number }[] }

// ---- admin
export interface AdminOverview {
  version: string; online_count: number; logins_today: number; actions_today: number; db_size: number | null; pending_doctors: number;
  system: { cpu: number; mem: number; mem_total: number; mem_used: number; load1: number; disk: number; cpus: number; proc_mem: number; uptime_s: number };
  online: { username: string; full_name: string; role: Role; last_seen: string; ip: string }[];
  users: { by_role: Record<string, number>; inactive: Record<string, number> };
}
export interface MetricRow { ts: string; cpu: number; mem: number; load1: number; disk: number; online: number; requests: number; errors: number }
export interface AdminUser {
  id: string; username: string; full_name: string; email: string; role: Role; active: boolean; doctor: string; doctor_id: string | null;
  patients: number; must_change_password: boolean; created_at: string | null; last_login_at: string | null;
}
export interface AuditRow { id: number; ts: string; username: string; role: string; action: string; entity: string; detail: string; ip: string }
export interface AppLogRow { id: number; ts: string; level: string; logger: string; message: string }
