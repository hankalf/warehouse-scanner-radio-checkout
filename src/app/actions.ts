"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyPin, hashPin } from "@/lib/crypto";
import {
  getCurrentWorker,
  setCurrentWorker,
  clearCurrentWorker,
  setAdminGate,
  clearAdminGate,
} from "@/lib/session";
import {
  computeDueDate,
  clampDueHours,
  dueSettingKey,
  DEFAULT_DUE_HOURS,
  MIN_DUE_HOURS,
  MAX_DUE_HOURS,
} from "@/lib/schedule";
import { getDueHoursFor, getTeamsSettings } from "@/lib/data";
import {
  ROLE,
  STATUS,
  DEVICE_TYPES,
  hasRole,
  canAccessAdmin,
  canManageConfig,
  canManageWorkers,
  canManageTeams,
  canReturnDamaged,
  canRetireDevices,
  normalizeType,
  deviceLabel,
  TYPE_META,
  type Role,
} from "@/lib/status";

export type ActionResult = { ok: boolean; error?: string };

function ok(): ActionResult {
  return { ok: true };
}
function fail(error: string): ActionResult {
  return { ok: false, error };
}

// ---- Identity -------------------------------------------------------------

export async function login(pin: string): Promise<ActionResult> {
  const clean = (pin || "").trim();
  if (!clean) return fail("Enter your PIN.");
  const workers = await prisma.worker.findMany({ where: { active: true } });
  const match = workers.find((w) => verifyPin(clean, w.pin));
  if (!match) return fail("PIN not recognized.");
  await setCurrentWorker(match.id);
  revalidatePath("/", "layout");
  return ok();
}

export async function logout(): Promise<ActionResult> {
  await clearCurrentWorker();
  await clearAdminGate();
  revalidatePath("/", "layout");
  return ok();
}

// Verify a PIN specifically to open the admin dashboard. Sets the worker
// session (for attribution) and a short-lived admin gate.
export async function unlockAdmin(pin: string): Promise<ActionResult> {
  const clean = (pin || "").trim();
  if (!clean) return fail("Enter your PIN.");
  const workers = await prisma.worker.findMany({ where: { active: true } });
  const worker = workers.find((w) => verifyPin(clean, w.pin));
  if (!worker) return fail("PIN not recognized.");
  if (!canAccessAdmin(worker.roles)) {
    return fail("The admin panel is limited to admins, supervisors, and leads.");
  }
  await setCurrentWorker(worker.id);
  await setAdminGate(worker.id);
  revalidatePath("/", "layout");
  return ok();
}

// ---- Shared transition core ----------------------------------------------

type Auth = { ok: true; workerId: number; roles: string } | { ok: false; error: string };

async function requireWorkerWithRole(role: Role): Promise<Auth> {
  const worker = await getCurrentWorker();
  if (!worker) return { ok: false, error: "Sign in with your PIN first." };
  if (!hasRole(worker.roles, role)) {
    return { ok: false, error: `This action requires the ${role} role.` };
  }
  return { ok: true, workerId: worker.id, roles: worker.roles };
}

// Admin panel is open to admins, supervisors, and leads (leads read-only).
async function requirePanelAccess(): Promise<Auth> {
  const worker = await getCurrentWorker();
  if (!worker) return { ok: false, error: "Sign in with your PIN first." };
  if (!canAccessAdmin(worker.roles)) {
    return { ok: false, error: "The admin panel is limited to admins, supervisors, and leads." };
  }
  return { ok: true, workerId: worker.id, roles: worker.roles };
}

// Changing configuration (devices, settings) is admin/supervisor only — leads
// get a read-only admin panel.
async function requireConfigAccess(): Promise<Auth> {
  const worker = await getCurrentWorker();
  if (!worker) return { ok: false, error: "Sign in with your PIN first." };
  if (!canManageConfig(worker.roles)) {
    return {
      ok: false,
      error: "Leads have read-only access — ask a supervisor or admin to make this change.",
    };
  }
  return { ok: true, workerId: worker.id, roles: worker.roles };
}

// Employee management is admin-only.
async function requireWorkerAdmin(): Promise<Auth> {
  const worker = await getCurrentWorker();
  if (!worker) return { ok: false, error: "Sign in with your PIN first." };
  if (!canManageWorkers(worker.roles)) {
    return { ok: false, error: "Only an admin can manage employees." };
  }
  return { ok: true, workerId: worker.id, roles: worker.roles };
}

// Teams notification settings are admin-only.
async function requireTeamsAdmin(): Promise<Auth> {
  const worker = await getCurrentWorker();
  if (!worker) return { ok: false, error: "Sign in with your PIN first." };
  if (!canManageTeams(worker.roles)) {
    return { ok: false, error: "Only an admin can change Teams notification settings." };
  }
  return { ok: true, workerId: worker.id, roles: worker.roles };
}

type Actor = { workerId: number; roles: string };
type GuardContext = Actor;

type TransitionOpts = {
  action: string;
  from: string[]; // allowed source statuses
  to: string;
  role: Role;
  note?: string;
  // extra data to write onto the device
  data?: Record<string, unknown>;
  // optional extra check (e.g. "only the operator who checked it out may return it")
  guard?: (
    device: { checkedOutById: number | null; type: string; number: string },
    ctx: GuardContext
  ) => string | null;
};

// Core transition, given an already-resolved actor. Used by both the
// session-based board actions and the PIN-based kiosk actions.
async function applyTransition(
  deviceId: number,
  opts: TransitionOpts,
  actor: Actor,
  // When the caller already authorized the actor (e.g. panel access covers
  // this action), skip the single-role check.
  authorized = false
): Promise<ActionResult> {
  if (!authorized && !hasRole(actor.roles, opts.role)) {
    return fail(`This action requires the ${opts.role} role.`);
  }
  try {
    await prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({ where: { id: deviceId } });
      if (!device) throw new Error("Device not found.");
      if (!opts.from.includes(device.status)) {
        throw new Error(
          `${deviceLabel(device.type, device.number)} is "${device.status}" and cannot be ${opts.action}.`
        );
      }
      if (opts.guard) {
        const err = opts.guard(device, actor);
        if (err) throw new Error(err);
      }
      await tx.device.update({
        where: { id: deviceId },
        data: { status: opts.to, ...(opts.data ?? {}) },
      });
      await tx.deviceEvent.create({
        data: {
          deviceId,
          workerId: actor.workerId,
          action: opts.action,
          fromStatus: device.status,
          toStatus: opts.to,
          note: opts.note ?? null,
        },
      });
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Transition failed.");
  }

  revalidatePath("/", "layout");
  return ok();
}

// Session-based transition (main board): actor comes from the signed-in cookie.
async function transition(deviceId: number, opts: TransitionOpts): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(opts.role);
  if (!auth.ok) return fail(auth.error);
  return applyTransition(deviceId, opts, { workerId: auth.workerId, roles: auth.roles });
}

// Resolve a worker from a raw PIN (for the shared kiosk, which has no session).
async function actorFromPin(pin: string): Promise<Actor | null> {
  const clean = (pin || "").trim();
  if (!clean) return null;
  const workers = await prisma.worker.findMany({ where: { active: true } });
  const worker = workers.find((w) => verifyPin(clean, w.pin));
  return worker ? { workerId: worker.id, roles: worker.roles } : null;
}

// Only the operator who holds a device (or an admin) may return it, so returns
// are attributed to the right person.
const RETURN_GUARD: TransitionOpts["guard"] = (device, ctx) =>
  device.checkedOutById === ctx.workerId || hasRole(ctx.roles, ROLE.ADMIN)
    ? null
    : `${deviceLabel(device.type, device.number)} was checked out by someone else — only they (or an admin) can return it.`;

type KioskAction = "CHECKOUT" | "RETURN" | "INSPECT";

// Which role each kiosk action needs.
const ACTION_ROLE: Record<KioskAction, Role> = {
  CHECKOUT: ROLE.OPERATOR,
  RETURN: ROLE.OPERATOR,
  INSPECT: ROLE.TECH,
};

async function kioskIsLocked(): Promise<boolean> {
  const locked = await prisma.setting.findUnique({ where: { key: "kioskLocked" } });
  return locked?.value === "true";
}

// Step 1 of the kiosk flow: verify the PIN and return who this is, so the
// worker can confirm their name before the action executes. Nothing changes yet.
export async function kioskIdentify(
  deviceId: number,
  action: KioskAction,
  pin: string
): Promise<{ ok: true; name: string; dueAtMs?: number } | { ok: false; error: string }> {
  if (await kioskIsLocked()) {
    return { ok: false, error: "The kiosk is locked. Ask a supervisor to unlock it." };
  }
  const clean = (pin || "").trim();
  if (!clean) return { ok: false, error: "Enter your PIN." };
  const workers = await prisma.worker.findMany({ where: { active: true } });
  const worker = workers.find((w) => verifyPin(clean, w.pin));
  if (!worker) return { ok: false, error: "PIN not recognized." };

  // Check the role fits the action now, so a wrong-role PIN fails at this
  // step rather than after the worker confirms their name.
  const role = ACTION_ROLE[action];
  if (!hasRole(worker.roles, role)) {
    return { ok: false, error: `This action requires the ${role} role.` };
  }

  // For a checkout, tell the confirm screen when the device will be due back —
  // computed server-side so it matches exactly what checkout will stamp.
  if (action === "CHECKOUT") {
    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { type: true } });
    if (device) {
      const hours = await getDueHoursFor(normalizeType(device.type));
      return { ok: true, name: worker.name, dueAtMs: computeDueDate(hours, new Date()).getTime() };
    }
  }
  return { ok: true, name: worker.name };
}

// ---- Kiosk lock (supervisor view-only toggle) -----------------------------

async function writeKioskLocked(locked: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "kioskLocked" },
    update: { value: String(locked) },
    create: { key: "kioskLocked", value: String(locked) },
  });
  revalidatePath("/", "layout");
}

// From the Admin panel (signed-in admin/supervisor).
export async function setKioskLocked(locked: boolean): Promise<ActionResult> {
  const auth = await requireConfigAccess();
  if (!auth.ok) return fail(auth.error);
  await writeKioskLocked(locked);
  return ok();
}

// From the kiosk itself — a supervisor confirms with their PIN.
export async function setKioskLockedWithPin(
  locked: boolean,
  pin: string
): Promise<ActionResult> {
  const actor = await actorFromPin(pin);
  if (!actor) return fail("PIN not recognized.");
  if (!canAccessAdmin(actor.roles)) {
    return fail("Only an admin, supervisor, or lead can lock or unlock the kiosk.");
  }
  await writeKioskLocked(locked);
  return ok();
}

// ---- Kiosk operator actions ----------------------------------------------

// Post a live Teams alert for a kiosk action, if that alert type is enabled.
async function notifyKioskAction(
  deviceId: number,
  workerId: number,
  kind: "checkout" | "checkin" | "inspected"
): Promise<void> {
  const cfg = await getTeamsSettings();
  const wanted =
    kind === "checkout" ? cfg.notifyCheckout : kind === "checkin" ? cfg.notifyCheckin : cfg.notifyInspected;
  if (!cfg.enabled || !wanted || !cfg.webhookUrl) return;
  const [device, worker] = await Promise.all([
    prisma.device.findUnique({ where: { id: deviceId }, select: { type: true, number: true, dueAt: true } }),
    prisma.worker.findUnique({ where: { id: workerId }, select: { name: true } }),
  ]);
  if (!device) return;
  const who = worker?.name ?? "Someone";
  const label = deviceLabel(device.type, device.number);
  const icon = TYPE_META[normalizeType(device.type)].icon;
  const text =
    kind === "checkout"
      ? `${icon} ${label} checked out by ${who}${device.dueAt ? ` — due back ${device.dueAt.toLocaleString()}` : ""}.`
      : kind === "checkin"
        ? `↩️ ${label} returned by ${who} — awaiting inspection.`
        : `✅ ${label} inspected, docked & returned to service by ${who}.`;
  await postToTeams(cfg.webhookUrl, text);
}

export async function kioskAct(
  deviceId: number,
  action: "CHECKOUT" | "RETURN",
  pin: string,
  note?: string
): Promise<ActionResult> {
  if (await kioskIsLocked()) return fail("The kiosk is locked. Ask a supervisor to unlock it.");
  const actor = await actorFromPin(pin);
  if (!actor) return fail("PIN not recognized.");
  const trimmed = (note || "").trim() || undefined;

  if (action === "CHECKOUT") {
    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { type: true } });
    if (!device) return fail("Device not found.");
    const now = new Date();
    const due = computeDueDate(await getDueHoursFor(normalizeType(device.type)), now);
    const res = await applyTransition(
      deviceId,
      {
        action: "CHECKOUT",
        from: [STATUS.AVAILABLE],
        to: STATUS.CHECKED_OUT,
        role: ROLE.OPERATOR,
        data: { checkedOutById: actor.workerId, checkedOutAt: now, dueAt: due },
        note: trimmed,
      },
      actor
    );
    if (res.ok) await notifyKioskAction(deviceId, actor.workerId, "checkout");
    return res;
  }
  // RETURN
  const res = await applyTransition(
    deviceId,
    {
      action: "RETURN",
      from: [STATUS.CHECKED_OUT],
      to: STATUS.RETURNED,
      role: ROLE.OPERATOR,
      data: { checkedOutById: null, checkedOutAt: null, dueAt: null },
      note: trimmed,
      guard: RETURN_GUARD,
    },
    actor
  );
  if (res.ok) await notifyKioskAction(deviceId, actor.workerId, "checkin");
  return res;
}

export type InspectAnswers = {
  docked: boolean; // placed on the charger / in the cradle
  inspected: boolean; // screen, keys/trigger, battery, strap or clip checked
  condition: "GOOD" | "DAMAGED";
  damageReason?: string;
  damagePhoto?: string; // optional data-URL photo (downscaled client-side)
};

// Equipment-tech check-in with the 4-question inspection checklist. A "Good"
// device returns to service; a "Damaged" one is held for a supervisor.
export async function kioskInspect(
  deviceId: number,
  pin: string,
  answers: InspectAnswers
): Promise<ActionResult> {
  if (await kioskIsLocked()) return fail("The kiosk is locked. Ask a supervisor to unlock it.");
  const actor = await actorFromPin(pin);
  if (!actor) return fail("PIN not recognized.");
  if (!hasRole(actor.roles, ROLE.TECH)) {
    return fail("This action requires the TECH role.");
  }
  return applyInspection(deviceId, actor, answers);
}

// Shared by the kiosk and the management board.
async function applyInspection(
  deviceId: number,
  actor: Actor,
  answers: InspectAnswers
): Promise<ActionResult> {
  const reason = (answers.damageReason || "").trim();

  if (answers.condition === "DAMAGED") {
    if (!reason) return fail("Describe the damage before submitting.");
    const photo = (answers.damagePhoto || "").trim();
    if (photo) {
      if (!/^data:image\/(png|jpe?g|webp);base64,/.test(photo)) {
        return fail("Damage photo must be a PNG, JPG, or WEBP image.");
      }
      if (photo.length > 1_400_000) return fail("Damage photo is too large.");
    }
    const res = await applyTransition(
      deviceId,
      {
        action: "DAMAGE",
        from: [STATUS.RETURNED],
        to: STATUS.DAMAGED,
        role: ROLE.TECH,
        data: {
          damageNote: reason,
          damagePhoto: photo || null,
          checkedOutById: null,
          checkedOutAt: null,
          dueAt: null,
        },
        note: `On charger: ${answers.docked ? "Y" : "N"}, Inspected: ${answers.inspected ? "Y" : "N"}, Condition: Damaged — ${reason}`,
      },
      actor
    );
    // Live Teams notification so a supervisor knows a device needs review.
    if (res.ok) {
      const cfg = await getTeamsSettings();
      if (cfg.enabled && cfg.notifyDamaged && cfg.webhookUrl) {
        const device = await prisma.device.findUnique({
          where: { id: deviceId },
          select: { type: true, number: true },
        });
        const worker = await prisma.worker.findUnique({ where: { id: actor.workerId }, select: { name: true } });
        if (device) {
          await postToTeams(
            cfg.webhookUrl,
            `⚠️ ${deviceLabel(device.type, device.number)} flagged **damaged** by ${worker?.name}: ${reason} — needs a supervisor to review.`
          );
        }
      }
    }
    return res;
  }

  // Good: must be on the charger AND inspected to return to service.
  if (!answers.docked || !answers.inspected) {
    return fail("The device must be on the charger and inspected before returning to service.");
  }
  const res = await applyTransition(
    deviceId,
    {
      action: "INSPECT",
      from: [STATUS.RETURNED],
      to: STATUS.AVAILABLE,
      role: ROLE.TECH,
      data: { damageNote: null, damagePhoto: null, checkedOutById: null, checkedOutAt: null, dueAt: null },
      note: "On charger: Y, Inspected: Y, Condition: Good",
    },
    actor
  );
  if (res.ok) await notifyKioskAction(deviceId, actor.workerId, "inspected");
  return res;
}

// Supervisor/lead/admin returns a damaged device to service after review.
export async function returnDamagedToService(deviceId: number): Promise<ActionResult> {
  const worker = await getCurrentWorker();
  if (!worker) return fail("Sign in with your PIN first.");
  if (!canReturnDamaged(worker.roles)) {
    return fail("Only a supervisor, lead, or admin can return a damaged device to service.");
  }
  return applyTransition(
    deviceId,
    {
      action: "REVIEW_RETURN",
      from: [STATUS.DAMAGED],
      to: STATUS.AVAILABLE,
      role: ROLE.ADMIN,
      data: { damageNote: null, damagePhoto: null, checkedOutById: null, checkedOutAt: null, dueAt: null },
    },
    { workerId: worker.id, roles: worker.roles },
    true // already authorized above
  );
}

// ---- Lifecycle actions (management board, signed-in session) --------------

export async function checkoutDevice(deviceId: number): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(ROLE.OPERATOR);
  if (!auth.ok) return fail(auth.error);
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { type: true } });
  if (!device) return fail("Device not found.");
  const now = new Date();
  const due = computeDueDate(await getDueHoursFor(normalizeType(device.type)), now);
  return transition(deviceId, {
    action: "CHECKOUT",
    from: [STATUS.AVAILABLE],
    to: STATUS.CHECKED_OUT,
    role: ROLE.OPERATOR,
    data: { checkedOutById: auth.workerId, checkedOutAt: now, dueAt: due },
  });
}

export async function returnDevice(deviceId: number): Promise<ActionResult> {
  return transition(deviceId, {
    action: "RETURN",
    from: [STATUS.CHECKED_OUT],
    to: STATUS.RETURNED,
    role: ROLE.OPERATOR,
    data: { checkedOutById: null, checkedOutAt: null, dueAt: null },
    guard: RETURN_GUARD,
  });
}

// Quick inspection from the board (no checklist): marks the device on the
// charger, inspected, and good. Techs use this to clear the rack in bulk.
export async function inspectDevice(deviceId: number): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(ROLE.TECH);
  if (!auth.ok) return fail(auth.error);
  return applyInspection(
    deviceId,
    { workerId: auth.workerId, roles: auth.roles },
    { docked: true, inspected: true, condition: "GOOD" }
  );
}

// Full checklist from the board (with the damaged branch).
export async function inspectDeviceWithChecklist(
  deviceId: number,
  answers: InspectAnswers
): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(ROLE.TECH);
  if (!auth.ok) return fail(auth.error);
  return applyInspection(deviceId, { workerId: auth.workerId, roles: auth.roles }, answers);
}

// ---- Batch actions (techs clear many devices at once) ----------------------

export type BatchResult = { ok: boolean; done: number; failed: number; error?: string };

async function runBatch(
  ids: number[],
  fn: (id: number) => Promise<ActionResult>
): Promise<BatchResult> {
  let done = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const id of ids) {
    const res = await fn(id);
    if (res.ok) done++;
    else {
      failed++;
      if (!firstError) firstError = res.error;
    }
  }
  return { ok: done > 0, done, failed, error: failed > 0 ? firstError : undefined };
}

export async function batchInspect(ids: number[]): Promise<BatchResult> {
  return runBatch(ids, inspectDevice);
}

export async function retireDevice(deviceId: number, reason: string): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);
  if (!canRetireDevices(auth.roles)) return fail("You can't retire devices.");
  return applyTransition(
    deviceId,
    {
      action: "RETIRE",
      from: [STATUS.AVAILABLE, STATUS.CHECKED_OUT, STATUS.RETURNED, STATUS.DAMAGED],
      to: STATUS.OUT_OF_SERVICE,
      role: ROLE.ADMIN,
      note: (reason || "").trim() || undefined,
      data: {
        retiredAt: new Date(),
        damageNote: null,
        damagePhoto: null,
        checkedOutById: null,
        checkedOutAt: null,
        dueAt: null,
      },
    },
    { workerId: auth.workerId, roles: auth.roles },
    true
  );
}

// A restored device goes to Awaiting inspection so a tech checks it over and
// docks it before it can be checked out again.
export async function restoreDevice(deviceId: number): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);
  if (!canRetireDevices(auth.roles)) return fail("You can't restore devices.");
  return applyTransition(
    deviceId,
    {
      action: "RESTORE",
      from: [STATUS.OUT_OF_SERVICE],
      to: STATUS.RETURNED,
      role: ROLE.ADMIN,
      data: { retiredAt: null },
    },
    { workerId: auth.workerId, roles: auth.roles },
    true
  );
}

// ---- Admin: fleet & workers ----------------------------------------------

function parseNumber(input: string): { ok: true; label: string; sortKey: number } | { ok: false; error: string } {
  const label = (input || "").trim().replace(/^#/, "");
  if (!/^\d+$/.test(label)) return { ok: false, error: "Device number must be a positive whole number." };
  return { ok: true, label, sortKey: Number(label) };
}

export async function addDevice(number: string, type: string = "SCANNER"): Promise<ActionResult> {
  const auth = await requireConfigAccess();
  if (!auth.ok) return fail(auth.error);
  const parsed = parseNumber(number);
  if (!parsed.ok) return fail(parsed.error);
  const deviceType = normalizeType(type);

  const existing = await prisma.device.findUnique({
    where: { type_number: { type: deviceType, number: parsed.label } },
  });
  if (existing) return fail(`${deviceLabel(deviceType, parsed.label)} already exists.`);

  try {
    await prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: { type: deviceType, number: parsed.label, sortKey: parsed.sortKey, status: STATUS.AVAILABLE },
      });
      await tx.deviceEvent.create({
        data: {
          deviceId: device.id,
          workerId: auth.workerId,
          action: "ADD",
          fromStatus: null,
          toStatus: STATUS.AVAILABLE,
          note: `Added to fleet (${TYPE_META[deviceType].label})`,
        },
      });
    });
  } catch {
    return fail("Could not add device.");
  }
  revalidatePath("/", "layout");
  return ok();
}

// Add a numbered range at once, e.g. scanners #21–#40. Skips numbers that
// already exist.
export async function addDeviceRange(
  type: string,
  from: number,
  to: number
): Promise<{ ok: boolean; added: number; skipped: number; error?: string }> {
  const auth = await requireConfigAccess();
  if (!auth.ok) return { ok: false, added: 0, skipped: 0, error: auth.error };
  const deviceType = normalizeType(type);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return { ok: false, added: 0, skipped: 0, error: "Enter a valid range (from ≤ to, both ≥ 1)." };
  }
  if (to - from + 1 > 500) return { ok: false, added: 0, skipped: 0, error: "Add at most 500 devices at a time." };

  const existing = await prisma.device.findMany({
    where: { type: deviceType, sortKey: { gte: from, lte: to } },
    select: { sortKey: true },
  });
  const have = new Set(existing.map((d) => d.sortKey));
  let added = 0;
  let skipped = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (let n = from; n <= to; n++) {
        if (have.has(n)) {
          skipped++;
          continue;
        }
        const device = await tx.device.create({
          data: { type: deviceType, number: String(n), sortKey: n, status: STATUS.AVAILABLE },
        });
        await tx.deviceEvent.create({
          data: {
            deviceId: device.id,
            workerId: auth.workerId,
            action: "ADD",
            fromStatus: null,
            toStatus: STATUS.AVAILABLE,
            note: `Added to fleet (${TYPE_META[deviceType].label}, range ${from}–${to})`,
          },
        });
        added++;
      }
    });
  } catch {
    return { ok: false, added: 0, skipped: 0, error: "Could not add devices." };
  }
  revalidatePath("/", "layout");
  return { ok: added > 0, added, skipped, error: added === 0 ? "All of those devices already exist." : undefined };
}

export async function setDeviceType(deviceId: number, type: string): Promise<ActionResult> {
  const auth = await requireConfigAccess();
  if (!auth.ok) return fail(auth.error);
  const deviceType = normalizeType(type);
  try {
    await prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({ where: { id: deviceId } });
      if (!device) throw new Error("Device not found.");
      if (device.type === deviceType) return;
      const clash = await tx.device.findUnique({
        where: { type_number: { type: deviceType, number: device.number } },
      });
      if (clash) throw new Error(`${deviceLabel(deviceType, device.number)} already exists — renumber first.`);
      await tx.device.update({ where: { id: deviceId }, data: { type: deviceType } });
      await tx.deviceEvent.create({
        data: {
          deviceId,
          workerId: auth.workerId,
          action: "RETYPE",
          fromStatus: device.status,
          toStatus: device.status,
          note: `Type set to ${TYPE_META[deviceType].label}`,
        },
      });
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not update type.");
  }
  revalidatePath("/", "layout");
  return ok();
}

// Edit a device's number and/or type from the admin panel.
export async function updateDeviceDetails(
  deviceId: number,
  input: { number: string; type: string }
): Promise<ActionResult> {
  const auth = await requireConfigAccess();
  if (!auth.ok) return fail(auth.error);
  const parsed = parseNumber(input.number);
  if (!parsed.ok) return fail(parsed.error);
  const deviceType = normalizeType(input.type);

  try {
    await prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({ where: { id: deviceId } });
      if (!device) throw new Error("Device not found.");
      if (parsed.label === device.number && deviceType === device.type) return;
      const clash = await tx.device.findUnique({
        where: { type_number: { type: deviceType, number: parsed.label } },
      });
      if (clash && clash.id !== deviceId) {
        throw new Error(`${deviceLabel(deviceType, parsed.label)} already exists.`);
      }
      await tx.device.update({
        where: { id: deviceId },
        data: { number: parsed.label, sortKey: parsed.sortKey, type: deviceType },
      });
      await tx.deviceEvent.create({
        data: {
          deviceId,
          workerId: auth.workerId,
          action: "EDIT",
          fromStatus: device.status,
          toStatus: device.status,
          note: `Edited: ${deviceLabel(device.type, device.number)} → ${deviceLabel(deviceType, parsed.label)}`,
        },
      });
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not update device.");
  }
  revalidatePath("/", "layout");
  return ok();
}

// Permanently delete a device and its audit history. For mis-added devices;
// use Retire to take a real device out of service while keeping its history.
export async function deleteDevice(deviceId: number): Promise<ActionResult> {
  const auth = await requireConfigAccess();
  if (!auth.ok) return fail(auth.error);
  try {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return fail("Device not found.");
    if (device.status === STATUS.CHECKED_OUT) {
      return fail("Return this device before removing it.");
    }
    await prisma.$transaction([
      prisma.deviceEvent.deleteMany({ where: { deviceId } }),
      prisma.device.delete({ where: { id: deviceId } }),
    ]);
  } catch {
    return fail("Could not remove device.");
  }
  revalidatePath("/", "layout");
  return ok();
}

export async function addWorker(
  name: string,
  pin: string,
  roles: string[]
): Promise<ActionResult> {
  const auth = await requireWorkerAdmin();
  if (!auth.ok) return fail(auth.error);
  const cleanName = (name || "").trim();
  const cleanPin = (pin || "").trim();
  if (!cleanName) return fail("Name is required.");
  if (!/^\d{4,8}$/.test(cleanPin)) return fail("PIN must be 4–8 digits.");
  const validRoles = roles.filter((r) => r in ROLE);
  if (validRoles.length === 0) return fail("Select at least one role.");

  // Ensure PIN is unique (compare against all stored hashes).
  const all = await prisma.worker.findMany();
  if (all.some((w) => verifyPin(cleanPin, w.pin))) {
    return fail("That PIN is already in use — choose another.");
  }

  try {
    await prisma.worker.create({
      data: { name: cleanName, pin: hashPin(cleanPin), roles: validRoles.join(","), active: true },
    });
  } catch {
    return fail("Could not add worker.");
  }
  revalidatePath("/", "layout");
  return ok();
}

// Count active admins other than `excludeId` — used to prevent locking
// everyone out by removing/deactivating the last admin.
async function activeAdminsExcluding(excludeId: number): Promise<number> {
  const workers = await prisma.worker.findMany({ where: { active: true } });
  return workers.filter((w) => w.id !== excludeId && hasRole(w.roles, ROLE.ADMIN)).length;
}

export async function setWorkerActive(
  workerId: number,
  active: boolean
): Promise<ActionResult> {
  const auth = await requireWorkerAdmin();
  if (!auth.ok) return fail(auth.error);
  const target = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!target) return fail("Worker not found.");
  if (!active && hasRole(target.roles, ROLE.ADMIN) && (await activeAdminsExcluding(workerId)) === 0) {
    return fail("You can't deactivate the last admin — add another admin first.");
  }
  await prisma.worker.update({ where: { id: workerId }, data: { active } });
  revalidatePath("/", "layout");
  return ok();
}

export async function updateWorker(
  workerId: number,
  input: { name: string; roles: string[]; pin?: string }
): Promise<ActionResult> {
  const auth = await requireWorkerAdmin();
  if (!auth.ok) return fail(auth.error);

  const cleanName = (input.name || "").trim();
  if (!cleanName) return fail("Name is required.");
  const validRoles = input.roles.filter((r) => r in ROLE);
  if (validRoles.length === 0) return fail("Select at least one role.");

  const target = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!target) return fail("Worker not found.");

  // Don't let the last admin drop their own ADMIN role.
  const losingAdmin = hasRole(target.roles, ROLE.ADMIN) && !validRoles.includes(ROLE.ADMIN);
  if (losingAdmin && target.active && (await activeAdminsExcluding(workerId)) === 0) {
    return fail("You can't remove the last admin's ADMIN role — add another admin first.");
  }

  const data: { name: string; roles: string; pin?: string } = {
    name: cleanName,
    roles: validRoles.join(","),
  };

  const newPin = (input.pin || "").trim();
  if (newPin) {
    if (!/^\d{4,8}$/.test(newPin)) return fail("PIN must be 4–8 digits.");
    const others = await prisma.worker.findMany({ where: { id: { not: workerId } } });
    if (others.some((w) => verifyPin(newPin, w.pin))) {
      return fail("That PIN is already in use — choose another.");
    }
    data.pin = hashPin(newPin);
  }

  await prisma.worker.update({ where: { id: workerId }, data });
  revalidatePath("/", "layout");
  return ok();
}

export async function deleteWorker(workerId: number): Promise<ActionResult> {
  const auth = await requireWorkerAdmin();
  if (!auth.ok) return fail(auth.error);

  const target = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!target) return fail("Worker not found.");

  // Protect the audit trail: anyone with recorded activity can only be deactivated.
  const eventCount = await prisma.deviceEvent.count({ where: { workerId } });
  if (eventCount > 0) {
    return fail(
      "This employee has activity history — deactivate them instead so the audit trail stays intact."
    );
  }
  if (await prisma.device.count({ where: { checkedOutById: workerId } })) {
    return fail("This employee currently holds a device — return it first.");
  }
  if (hasRole(target.roles, ROLE.ADMIN) && target.active && (await activeAdminsExcluding(workerId)) === 0) {
    return fail("You can't remove the last admin — add another admin first.");
  }

  await prisma.worker.delete({ where: { id: workerId } });
  revalidatePath("/", "layout");
  return ok();
}

// ---- Checkout policy (due window per device type) -------------------------

export async function updateDuePolicy(input: { SCANNER: number; RADIO: number }): Promise<ActionResult> {
  const auth = await requireConfigAccess();
  if (!auth.ok) return fail(auth.error);
  for (const type of DEVICE_TYPES) {
    const raw = Number(input[type]);
    if (!Number.isFinite(raw) || raw < MIN_DUE_HOURS || raw > MAX_DUE_HOURS) {
      return fail(`${TYPE_META[type].plural}: enter between ${MIN_DUE_HOURS} and ${MAX_DUE_HOURS} hours.`);
    }
  }
  for (const type of DEVICE_TYPES) {
    const value = String(clampDueHours(Number(input[type]), DEFAULT_DUE_HOURS[type]));
    const key = dueSettingKey(type);
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  revalidatePath("/", "layout");
  return ok();
}

// ---- Microsoft Teams notifications ----------------------------------------

// POST a message to a Teams webhook. Returns an error string on failure, or
// null on success. Never throws.
//
// Teams has two kinds of incoming webhook, which need different payloads:
//  - Legacy "Incoming Webhook" connector (…webhook.office.com…) → { text }.
//  - Power Automate "Workflows" webhook (…logic.azure.com…, the current
//    Microsoft-recommended method) → an Adaptive Card wrapped in an
//    attachments array. A { text } body posts nothing there.
// We pick the shape from the URL so both work.
function teamsPayload(webhookUrl: string, text: string): unknown {
  const isLegacyConnector = /webhook\.office\.com/i.test(webhookUrl);
  if (isLegacyConnector) return { text };
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [{ type: "TextBlock", text, wrap: true }],
        },
      },
    ],
  };
}

// Catch obviously-wrong URLs before posting, with a message that says what to
// paste instead. A Teams *channel link* is the most common mistake — POSTing
// to it returns HTTP 405 because it's a web page, not a webhook.
function teamsUrlProblem(webhookUrl: string): string | null {
  let host = "";
  try {
    host = new URL(webhookUrl).hostname.toLowerCase();
  } catch {
    return "That doesn't look like a valid URL.";
  }
  if (host === "teams.microsoft.com" || host.endsWith(".teams.microsoft.com")) {
    return (
      "That's a link to the Teams channel itself, not a webhook. In Teams: channel → ⋯ → " +
      "Workflows → “Post to a channel when a webhook request is received” → copy the URL it " +
      "gives you (it contains logic.azure.com)."
    );
  }
  return null;
}

async function postToTeams(webhookUrl: string, text: string): Promise<string | null> {
  const problem = teamsUrlProblem(webhookUrl);
  if (problem) return problem;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamsPayload(webhookUrl, text)),
    });
    if (!res.ok) {
      if (res.status === 405) {
        return (
          "Teams returned HTTP 405 — that URL doesn't accept messages, so it isn't a webhook. " +
          "Create one in Teams: channel → ⋯ → Workflows → “Post to a channel when a webhook " +
          "request is received”, then paste the URL it generates (contains logic.azure.com)."
        );
      }
      const detail = (await res.text().catch(() => "")).slice(0, 300).trim();
      return `Teams returned HTTP ${res.status}${detail ? ` — ${detail}` : ""}.`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? `Could not reach Teams: ${e.message}` : "Could not reach Teams.";
  }
}

export async function updateTeamsSettings(input: {
  enabled: boolean;
  webhookUrl: string;
  notifyDamaged: boolean;
  notifyOverdue: boolean;
  notifyCheckout: boolean;
  notifyCheckin: boolean;
  notifyInspected: boolean;
}): Promise<ActionResult> {
  const auth = await requireTeamsAdmin();
  if (!auth.ok) return fail(auth.error);
  const url = (input.webhookUrl || "").trim();
  if (input.enabled) {
    if (!/^https:\/\/\S+$/.test(url)) return fail("Enter a valid https Teams webhook URL.");
    const problem = teamsUrlProblem(url);
    if (problem) return fail(problem);
    if (
      !input.notifyDamaged &&
      !input.notifyOverdue &&
      !input.notifyCheckout &&
      !input.notifyCheckin &&
      !input.notifyInspected
    ) {
      return fail("Choose at least one thing to be notified about.");
    }
  }
  const entries: [string, string][] = [
    ["teams.enabled", String(input.enabled)],
    ["teams.webhookUrl", url],
    ["teams.notifyDamaged", String(input.notifyDamaged)],
    ["teams.notifyOverdue", String(input.notifyOverdue)],
    ["teams.notifyCheckout", String(input.notifyCheckout)],
    ["teams.notifyCheckin", String(input.notifyCheckin)],
    ["teams.notifyInspected", String(input.notifyInspected)],
  ];
  for (const [key, value] of entries) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  revalidatePath("/", "layout");
  return ok();
}

// Send a test message so an admin can confirm the webhook works.
export async function sendTeamsTest(): Promise<ActionResult> {
  const auth = await requireTeamsAdmin();
  if (!auth.ok) return fail(auth.error);
  const cfg = await getTeamsSettings();
  if (!cfg.webhookUrl) return fail("Add a webhook URL first.");
  const err = await postToTeams(
    cfg.webhookUrl,
    "✅ Scanner & Radio Checkout — Teams notifications are connected."
  );
  return err ? fail(err) : ok();
}

// ---- Company logo (kiosk branding) ----------------------------------------

// Save (or clear) the company logo shown in the kiosk's top-left corner.
// The logo is stored as a data: URL. Pass an empty string to remove it.
export async function updateLogo(dataUrl: string): Promise<ActionResult> {
  const auth = await requireConfigAccess();
  if (!auth.ok) return fail(auth.error);
  const value = (dataUrl || "").trim();
  if (value) {
    if (!/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(value)) {
      return fail("Upload a PNG, JPG, GIF, WEBP, or SVG image.");
    }
    // Data URLs are stored inline; keep them small (~700 KB of base64 ≈ 512 KB image).
    if (value.length > 700_000) return fail("Image is too large — use one under 500 KB.");
  }
  await prisma.setting.upsert({
    where: { key: "branding.logoDataUrl" },
    update: { value },
    create: { key: "branding.logoDataUrl", value },
  });
  revalidatePath("/", "layout");
  return ok();
}

// ---- Bulk worker upload (CSV) ---------------------------------------------

export type BulkResult = { ok: boolean; added: number; skipped: number; errors: string[] };

// Parse a CSV of "name,pin,roles" (roles separated by ; | or space) and create
// the workers. Header row optional. Existing/duplicate PINs are skipped.
export async function bulkAddWorkers(csv: string): Promise<BulkResult> {
  const auth = await requireWorkerAdmin();
  if (!auth.ok) return { ok: false, added: 0, skipped: 0, errors: [auth.error] };

  const lines = (csv || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: false, added: 0, skipped: 0, errors: ["The file is empty."] };
  // Drop a header row if present.
  if (/^\s*name\s*,/i.test(lines[0])) lines.shift();

  const existing = await prisma.worker.findMany();
  const usedPins = new Set<string>(); // within this upload
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, line] of lines.entries()) {
    const cols = line.split(",").map((c) => c.trim());
    const name = cols[0] ?? "";
    const pin = cols[1] ?? "";
    const rolesRaw = cols.slice(2).join(",");
    const rowNo = i + 1;

    if (!name) { errors.push(`Row ${rowNo}: missing name.`); skipped++; continue; }
    if (!/^\d{4,8}$/.test(pin)) { errors.push(`Row ${rowNo} (${name}): PIN must be 4–8 digits.`); skipped++; continue; }
    const roles = rolesRaw.split(/[;| ]+/).map((r) => r.trim().toUpperCase()).filter((r) => r in ROLE);
    if (roles.length === 0) { errors.push(`Row ${rowNo} (${name}): no valid roles (OPERATOR/TECH/LEAD/SUPERVISOR/ADMIN).`); skipped++; continue; }
    if (usedPins.has(pin) || existing.some((w) => verifyPin(pin, w.pin))) {
      errors.push(`Row ${rowNo} (${name}): PIN already in use.`); skipped++; continue;
    }

    try {
      await prisma.worker.create({ data: { name, pin: hashPin(pin), roles: roles.join(","), active: true } });
      usedPins.add(pin);
      added++;
    } catch {
      errors.push(`Row ${rowNo} (${name}): could not be added.`);
      skipped++;
    }
  }

  revalidatePath("/", "layout");
  return { ok: added > 0, added, skipped, errors };
}
