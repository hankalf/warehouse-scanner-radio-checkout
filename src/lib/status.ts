// Device lifecycle statuses and the display metadata that drives the color-coded grid.

export const STATUS = {
  AVAILABLE: "AVAILABLE",
  CHECKED_OUT: "CHECKED_OUT",
  RETURNED: "RETURNED", // back from the floor, waiting for a tech to inspect & dock it
  DAMAGED: "DAMAGED",
  OUT_OF_SERVICE: "OUT_OF_SERVICE",
} as const;

export type Status = (typeof STATUS)[keyof typeof STATUS];

// Device type — what kind of handheld it is.
export const DEVICE_TYPE = {
  SCANNER: "SCANNER",
  RADIO: "RADIO",
} as const;

export type DeviceType = (typeof DEVICE_TYPE)[keyof typeof DEVICE_TYPE];

export const DEVICE_TYPES: DeviceType[] = ["SCANNER", "RADIO"];

// Scanners are silver/gray tiles; radios are blue. (Status is the ring.)
export const TYPE_META: Record<
  DeviceType,
  {
    label: string; // "Scanner"
    plural: string; // "Scanners"
    short: string; // "SCN" — fits a small tile
    es: string; // Spanish label for the kiosk
    esPlural: string;
    icon: string;
    badge: string; // small chip
    tile: string; // tile fill
    slug: string; // URL segment
  }
> = {
  SCANNER: {
    label: "Scanner",
    plural: "Scanners",
    short: "SCN",
    es: "Escáner",
    esPlural: "Escáneres",
    icon: "📟",
    badge: "bg-slate-300 text-slate-800",
    tile: "bg-slate-300 text-slate-900",
    slug: "scanner",
  },
  RADIO: {
    label: "Radio",
    plural: "Radios",
    short: "RDO",
    es: "Radio",
    esPlural: "Radios",
    icon: "📻",
    badge: "bg-blue-600 text-white",
    tile: "bg-blue-600 text-white",
    slug: "radio",
  },
};

export function normalizeType(type: string): DeviceType {
  return type === "RADIO" ? "RADIO" : "SCANNER";
}

// "scanner" / "radio" URL segments → type. Returns null for anything else.
export function typeFromSlug(slug: string): DeviceType | null {
  const s = (slug || "").toLowerCase();
  if (s === "scanner") return "SCANNER";
  if (s === "radio") return "RADIO";
  return null;
}

// "Scanner #12" — the human name for a device, used everywhere.
export function deviceLabel(type: string, number: string): string {
  return `${TYPE_META[normalizeType(type)].label} #${number}`;
}

export const ROLE = {
  // Warehouse associate / equipment operator: checks devices out and back in.
  OPERATOR: "OPERATOR",
  // Equipment tech: inspects returned devices, docks them on the charger, and
  // flags damage. (The "sanitation" step of this lifecycle.)
  TECH: "TECH",
  // Team lead on the floor: does every operator and tech job, reviews damaged
  // devices, and can VIEW the fleet list and audit log — but cannot change any
  // configuration.
  LEAD: "LEAD",
  // Shift supervisor: manages the device fleet (add/edit/remove), the kiosk
  // logo and checkout policy, and reviews damaged devices — but not employees
  // or Teams settings.
  SUPERVISOR: "SUPERVISOR",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ALL_ROLES: Role[] = ["OPERATOR", "TECH", "LEAD", "SUPERVISOR", "ADMIN"];

export const ROLE_LABEL: Record<Role, string> = {
  OPERATOR: "Operator",
  TECH: "Equipment tech",
  LEAD: "Team lead",
  SUPERVISOR: "Supervisor",
  ADMIN: "Admin",
};

// "OVERDUE" is a derived display state (a CHECKED_OUT device past its due time),
// not a stored status. We give it its own visual key.
export type DisplayState = Status | "OVERDUE";

type StatusMeta = {
  label: string;
  // Tailwind classes for the grid tile and the small legend dot.
  tile: string;
  dot: string;
  // Border color used as the status ring around kiosk bubbles.
  ring: string;
};

export const STATUS_META: Record<DisplayState, StatusMeta> = {
  AVAILABLE: {
    label: "Available",
    tile: "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600",
    dot: "bg-emerald-500",
    ring: "border-emerald-400",
  },
  CHECKED_OUT: {
    label: "Checked out",
    tile: "bg-sky-500 hover:bg-sky-600 text-white border-sky-600",
    // Bright yellow so the status stays visible on the blue/silver kiosk bubbles.
    dot: "bg-yellow-300",
    ring: "border-yellow-300",
  },
  OVERDUE: {
    label: "Overdue",
    tile: "bg-red-600 hover:bg-red-700 text-white border-red-700 animate-pulse",
    dot: "bg-red-600",
    // No animate-pulse here: it fades the whole tile and hurts legibility.
    ring: "border-red-500",
  },
  RETURNED: {
    label: "Awaiting inspection",
    tile: "bg-orange-500 hover:bg-orange-600 text-white border-orange-600",
    dot: "bg-orange-500",
    ring: "border-orange-500",
  },
  DAMAGED: {
    label: "Damaged — needs review",
    tile: "bg-rose-600 hover:bg-rose-700 text-white border-rose-700",
    dot: "bg-rose-600",
    ring: "border-rose-500",
  },
  OUT_OF_SERVICE: {
    label: "Out of service",
    tile: "bg-slate-400 hover:bg-slate-500 text-white border-slate-500",
    dot: "bg-slate-400",
    ring: "border-slate-500",
  },
};

// Order the legend / summary counts follow.
export const DISPLAY_ORDER: DisplayState[] = [
  "AVAILABLE",
  "CHECKED_OUT",
  "OVERDUE",
  "RETURNED",
  "DAMAGED",
  "OUT_OF_SERVICE",
];

export function isOverdue(status: string, dueAt: Date | null | undefined): boolean {
  return status === STATUS.CHECKED_OUT && !!dueAt && dueAt.getTime() < Date.now();
}

// The display state used for coloring, folding in the derived OVERDUE state.
export function displayState(status: string, dueAt: Date | null | undefined): DisplayState {
  if (isOverdue(status, dueAt)) return "OVERDUE";
  return status as Status;
}

export function parseRoles(roles: string): Role[] {
  return roles
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter((r): r is Role => r in ROLE);
}

// Floor capabilities a team lead holds implicitly.
const LEAD_IMPLIES: Role[] = [ROLE.OPERATOR, ROLE.TECH];

export function hasRole(roles: string, role: Role): boolean {
  const parsed = parseRoles(roles);
  // Admins can perform every function.
  if (parsed.includes(ROLE.ADMIN)) return true;
  // Leads cover the floor roles, but never admin/supervisor configuration.
  if (parsed.includes(ROLE.LEAD) && LEAD_IMPLIES.includes(role)) return true;
  return parsed.includes(role);
}

// Who may open the management surfaces (board, reports, admin panel):
// admins, supervisors, and leads (leads get a read-only admin panel).
export function canAccessAdmin(roles: string): boolean {
  const parsed = parseRoles(roles);
  return (
    parsed.includes(ROLE.ADMIN) ||
    parsed.includes(ROLE.SUPERVISOR) ||
    parsed.includes(ROLE.LEAD)
  );
}

// Who may change anything at all in the admin panel. Leads may not, so they
// get the read-only view; the finer-grained checks below apply on top.
export function canManageConfig(roles: string): boolean {
  const parsed = parseRoles(roles);
  return parsed.includes(ROLE.ADMIN) || parsed.includes(ROLE.SUPERVISOR);
}

// Devices: add, edit, remove, and change type.
export function canManageDevices(roles: string): boolean {
  return canManageConfig(roles);
}

// Employees: add, edit, deactivate, remove, bulk upload. Admin only.
export function canManageWorkers(roles: string): boolean {
  return parseRoles(roles).includes(ROLE.ADMIN);
}

// Teams notification settings. Admin only.
export function canManageTeams(roles: string): boolean {
  return parseRoles(roles).includes(ROLE.ADMIN);
}

// Kiosk logo, checkout policy, and the read-only system readout.
export function canManageBranding(roles: string): boolean {
  return canManageConfig(roles);
}

// Who may put a DAMAGED device back into service after reviewing it.
export function canReturnDamaged(roles: string): boolean {
  const parsed = parseRoles(roles);
  return (
    parsed.includes(ROLE.ADMIN) ||
    parsed.includes(ROLE.SUPERVISOR) ||
    parsed.includes(ROLE.LEAD)
  );
}

// Who may retire a device (out of service) or restore one to the fleet.
export function canRetireDevices(roles: string): boolean {
  return canAccessAdmin(roles);
}

// The capabilities a worker effectively has — admins get every function.
// Used for client-side button gating so the UI matches `hasRole`.
export function effectiveRoles(roles: string): Role[] {
  const parsed = parseRoles(roles);
  if (parsed.includes(ROLE.ADMIN)) {
    return [ROLE.OPERATOR, ROLE.TECH, ROLE.LEAD, ROLE.SUPERVISOR, ROLE.ADMIN];
  }
  if (parsed.includes(ROLE.LEAD)) {
    return [...new Set([...LEAD_IMPLIES, ...parsed])];
  }
  return parsed;
}

// Human labels for audit actions.
export const ACTION_LABEL: Record<string, string> = {
  CHECKOUT: "Checked out",
  RETURN: "Returned (awaiting inspection)",
  INSPECT: "Inspected & returned to service",
  DAMAGE: "Flagged damaged",
  REVIEW_RETURN: "Returned to service (reviewed)",
  RETIRE: "Retired",
  RESTORE: "Restored",
  ADD: "Added to fleet",
  RETYPE: "Type changed",
  EDIT: "Edited",
};
