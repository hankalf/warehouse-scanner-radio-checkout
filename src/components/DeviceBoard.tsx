"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  STATUS_META,
  DISPLAY_ORDER,
  TYPE_META,
  DEVICE_TYPES,
  normalizeType,
  deviceLabel,
  type DisplayState,
} from "@/lib/status";
import {
  checkoutDevice,
  returnDevice,
  inspectDeviceWithChecklist,
  retireDevice,
  restoreDevice,
  returnDamagedToService,
  setDeviceType,
  batchInspect,
  type ActionResult,
  type BatchResult,
  type InspectAnswers,
} from "@/app/actions";
import { InspectChecklist } from "./KioskBoard";

export type DeviceDTO = {
  id: number;
  type: string;
  number: string;
  status: string;
  dueAtMs: number | null;
  checkedOutAtMs: number | null;
  holderName: string | null;
  damageNote: string | null;
  damagePhoto: string | null;
};

function computeDisplayState(d: DeviceDTO, now: number): DisplayState {
  if (d.status === "CHECKED_OUT" && d.dueAtMs && d.dueAtMs < now) return "OVERDUE";
  return d.status as DisplayState;
}

function fmt(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DeviceBoard({
  devices,
  roles,
  signedIn,
  canConfigure,
  canRetire,
}: {
  devices: DeviceDTO[];
  roles: string[];
  signedIn: boolean;
  // Whether this worker may change configuration (device type). Leads hold
  // floor powers but are read-only for configuration, so this is passed
  // separately rather than derived from `roles`.
  canConfigure: boolean;
  // Whether this worker may retire / restore devices.
  canRetire: boolean;
}) {
  const router = useRouter();
  // A ticking clock so overdue flips live without a server round-trip.
  const [now, setNow] = useState<number>(() => 0);
  const [filter, setFilter] = useState<DisplayState | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [batchPending, startBatch] = useTransition();

  // Which batch action, if any, the current worker can run in the current filter.
  const batchOption = useMemo(() => {
    if (filter === "RETURNED" && roles.includes("TECH"))
      return { status: "RETURNED", label: "Inspect & dock (good)", fn: batchInspect };
    return null;
  }, [filter, roles]);

  // Leaving a batch-eligible filter cancels batch mode.
  useEffect(() => {
    if (!batchOption && batchMode) {
      setBatchMode(false);
      setPicked(new Set());
    }
  }, [batchOption, batchMode]);

  function togglePicked(id: number) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBatch() {
    if (!batchOption || picked.size === 0) return;
    const ids = [...picked];
    startBatch(async () => {
      const res: BatchResult = await batchOption.fn(ids);
      setBatchMode(false);
      setPicked(new Set());
      router.refresh();
      void res;
    });
  }

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => router.refresh(), 5000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const withState = useMemo(
    () => devices.map((d) => ({ d, state: computeDisplayState(d, now || Date.now()) })),
    [devices, now]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { state } of withState) c[state] = (c[state] ?? 0) + 1;
    return c;
  }, [withState]);

  const overdue = withState.filter((x) => x.state === "OVERDUE");

  const visible = withState.filter((x) => filter === "ALL" || x.state === filter);
  const groups = DEVICE_TYPES.map((t) => ({
    type: t,
    items: visible.filter((x) => normalizeType(x.d.type) === t),
  })).filter((g) => g.items.length > 0);

  const selected = devices.find((d) => d.id === selectedId) ?? null;
  const selectedState = selected
    ? computeDisplayState(selected, now || Date.now())
    : null;

  return (
    <div>
      {/* Summary counts */}
      <div className="flex flex-wrap gap-2 mb-4">
        <SummaryChip
          label="All"
          count={devices.length}
          active={filter === "ALL"}
          dot="bg-slate-800"
          onClick={() => setFilter("ALL")}
        />
        {DISPLAY_ORDER.map((s) => (
          <SummaryChip
            key={s}
            label={STATUS_META[s].label}
            count={counts[s] ?? 0}
            active={filter === s}
            dot={STATUS_META[s].dot}
            onClick={() => setFilter(filter === s ? "ALL" : s)}
          />
        ))}
      </div>

      {/* Overdue banner */}
      {overdue.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200 flex items-center gap-2 flex-wrap">
          <span aria-hidden>⚠️</span>
          <span className="font-medium">
            {overdue.length} device{overdue.length > 1 ? "s" : ""} overdue
          </span>
          <span className="text-red-600 dark:text-red-300">
            (out longer than allowed — must be returned & inspected):{" "}
            {overdue.map((x) => deviceLabel(x.d.type, x.d.number)).join(", ")}
          </span>
        </div>
      )}

      {!signedIn && (
        <p className="mb-4 text-sm text-slate-500">
          You are viewing in read-only mode. Enter your PIN below to take actions.
        </p>
      )}

      {/* Batch toolbar — only when the worker can act on the filtered state */}
      {batchOption && (
        <div className="mb-3">
          {!batchMode ? (
            <button
              onClick={() => setBatchMode(true)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              ☑︎ Select multiple to {batchOption.label.toLowerCase()}
            </button>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Tap the devices to {batchOption.label.toLowerCase()}, then confirm below.
            </p>
          )}
        </div>
      )}

      {/* Grids — one per device type */}
      <div className="space-y-5">
        {groups.map(({ type, items }) => (
          <section key={type}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              <span aria-hidden>{TYPE_META[type].icon}</span>
              {TYPE_META[type].plural}
              <span className="text-slate-400 font-normal tabular-nums">({items.length})</span>
            </h2>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 sm:gap-2 md:grid-cols-10">
              {items.map(({ d, state }) => {
                const eligible = batchMode && batchOption && d.status === batchOption.status;
                const isPicked = picked.has(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() =>
                      eligible ? togglePicked(d.id) : batchMode ? undefined : setSelectedId(d.id)
                    }
                    className={`relative aspect-square rounded-lg border-[3px] flex flex-col items-center justify-center gap-0.5 font-bold text-sm sm:text-base md:text-lg transition ${
                      TYPE_META[type].tile
                    } ${STATUS_META[state].ring} ${batchMode && !eligible ? "opacity-40" : ""} ${
                      isPicked ? "ring-4 ring-offset-2 ring-slate-900" : ""
                    }`}
                    title={`${deviceLabel(d.type, d.number)} — ${STATUS_META[state].label}`}
                  >
                    <span className="leading-none">#{d.number}</span>
                    <span className="w-full px-0.5 text-center text-[8px] sm:text-[9px] font-bold uppercase leading-[1.05] opacity-80">
                      {TYPE_META[type].label}
                    </span>
                    {d.status === "CHECKED_OUT" && d.holderName && (
                      <span className="absolute inset-x-0 bottom-0 truncate rounded-b px-1 text-center text-[8px] sm:text-[9px] font-semibold bg-black/20 leading-tight">
                        {d.holderName.replace(/\([^)]*\)/g, "").trim().split(/\s+/)[0]}
                      </span>
                    )}
                    {isPicked && (
                      <span className="absolute top-1 right-1 bg-white text-slate-900 rounded-full w-5 h-5 text-xs flex items-center justify-center">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {visible.length === 0 && (
          <p className="text-center text-slate-400 py-8">No devices in this state.</p>
        )}
      </div>

      {/* Sticky batch action bar */}
      {batchMode && batchOption && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 shadow-lg px-4 py-3 dark:bg-slate-800 dark:border-slate-700">
          <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600 dark:text-slate-300">{picked.size} selected</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBatchMode(false);
                  setPicked(new Set());
                }}
                className="rounded-lg px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={runBatch}
                disabled={batchPending || picked.size === 0}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                {batchPending ? "Working…" : `${batchOption.label} (${picked.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / action modal */}
      {selected && selectedState && (
        <DeviceModal
          device={selected}
          state={selectedState}
          roles={roles}
          signedIn={signedIn}
          canConfigure={canConfigure}
          canRetire={canRetire}
          onClose={() => setSelectedId(null)}
          onDone={() => {
            setSelectedId(null);
            router.refresh();
          }}
          fmt={fmt}
        />
      )}
    </div>
  );
}

function SummaryChip({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
        active
          ? "border-slate-800 bg-slate-800 text-white dark:border-slate-500 dark:bg-slate-600"
          : "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      }`}
    >
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </button>
  );
}

function DeviceModal({
  device,
  state,
  roles,
  signedIn,
  canConfigure,
  canRetire,
  onClose,
  onDone,
  fmt,
}: {
  device: DeviceDTO;
  state: DisplayState;
  roles: string[];
  signedIn: boolean;
  canConfigure: boolean;
  canRetire: boolean;
  onClose: () => void;
  onDone: () => void;
  fmt: (ms: number | null) => string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState(false);
  const type = normalizeType(device.type);
  const label = deviceLabel(device.type, device.number);

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) onDone();
      else setError(res.error ?? "Action failed.");
    });
  }

  const is = device.status;
  const has = (r: string) => roles.includes(r);
  // Supervisors, leads, and admins review damaged devices.
  const canReview = has("ADMIN") || has("SUPERVISOR") || has("LEAD");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 dark:text-slate-100 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[92vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span aria-hidden>{TYPE_META[type].icon}</span>
            {label}
          </h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none px-2">
            ×
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={`inline-block w-3 h-3 rounded-full ${STATUS_META[state].dot}`} />
          <span className="font-medium">{STATUS_META[state].label}</span>
          <span className={`ml-1 rounded px-2 py-0.5 text-xs font-bold ${TYPE_META[type].badge}`}>
            {TYPE_META[type].label}
          </span>
        </div>

        {checklist ? (
          <InspectChecklist
            name={null}
            type={type}
            pending={pending}
            error={error}
            dark
            onCancel={() => setChecklist(false)}
            onSubmit={(answers: InspectAnswers) => run(() => inspectDeviceWithChecklist(device.id, answers))}
          />
        ) : (
          <>
            <dl className="text-sm text-slate-600 dark:text-slate-300 space-y-1 mb-4">
              {device.holderName && (
                <div className="flex justify-between">
                  <dt>Checked out by</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">{device.holderName}</dd>
                </div>
              )}
              {device.checkedOutAtMs && (
                <div className="flex justify-between">
                  <dt>Checked out</dt>
                  <dd>{fmt(device.checkedOutAtMs)}</dd>
                </div>
              )}
              {device.dueAtMs && (
                <div className="flex justify-between">
                  <dt>Due back</dt>
                  <dd className={state === "OVERDUE" ? "text-red-600 font-semibold" : ""}>
                    {fmt(device.dueAtMs)}
                  </dd>
                </div>
              )}
            </dl>

            {is === "DAMAGED" && device.damageNote && (
              <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                <span className="font-semibold">Reported damage:</span> {device.damageNote}
                {device.damagePhoto && (
                  <a href={device.damagePhoto} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={device.damagePhoto}
                      alt={`Damage on ${label}`}
                      className="max-h-48 w-auto rounded border border-rose-300 dark:border-rose-900"
                    />
                  </a>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 mb-3" role="alert">
                {error}
              </p>
            )}

            {!signedIn ? (
              <p className="text-sm text-slate-500">Sign in with your PIN to act on this device.</p>
            ) : (
              <div className="space-y-2">
                {is === "CHECKED_OUT" && state === "OVERDUE" && (
                  <p className="text-xs text-red-600">This device is overdue — return it now.</p>
                )}

                {is === "AVAILABLE" && has("OPERATOR") && (
                  <ActionButton
                    pending={pending}
                    onClick={() => run(() => checkoutDevice(device.id))}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Check out
                  </ActionButton>
                )}

                {is === "CHECKED_OUT" && has("OPERATOR") && (
                  <ActionButton
                    pending={pending}
                    onClick={() => run(() => returnDevice(device.id))}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    Check in (return)
                  </ActionButton>
                )}

                {is === "RETURNED" && has("TECH") && (
                  <ActionButton
                    pending={pending}
                    onClick={() => {
                      setError(null);
                      setChecklist(true);
                    }}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    Inspect &amp; dock (checklist)
                  </ActionButton>
                )}

                {is === "DAMAGED" && canReview && (
                  <ActionButton
                    pending={pending}
                    onClick={() => run(() => returnDamagedToService(device.id))}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Return to service (reviewed)
                  </ActionButton>
                )}
                {is === "DAMAGED" && !canReview && (
                  <p className="text-xs text-slate-500">
                    Only a supervisor, lead, or admin can return a damaged device to service.
                  </p>
                )}

                {canRetire && is !== "OUT_OF_SERVICE" && (
                  <ActionButton
                    pending={pending}
                    onClick={() => run(() => retireDevice(device.id, ""))}
                    className="bg-slate-600 hover:bg-slate-700"
                  >
                    Retire (out of service)
                  </ActionButton>
                )}
                {canRetire && is === "OUT_OF_SERVICE" && (
                  <ActionButton
                    pending={pending}
                    onClick={() => run(() => restoreDevice(device.id))}
                    className="bg-slate-600 hover:bg-slate-700"
                  >
                    Restore to fleet
                  </ActionButton>
                )}

                {canConfigure && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Device type</div>
                    <div className="flex gap-2">
                      {DEVICE_TYPES.map((t) => {
                        const active = type === t;
                        return (
                          <button
                            key={t}
                            onClick={() => !active && run(() => setDeviceType(device.id, t))}
                            disabled={pending}
                            className={`flex-1 rounded-lg py-2 text-sm font-semibold border disabled:opacity-50 ${
                              active
                                ? `${TYPE_META[t].badge} border-transparent`
                                : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-600"
                            }`}
                          >
                            {TYPE_META[t].icon} {TYPE_META[t].label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 text-center">
              <Link
                href={`/device/${TYPE_META[type].slug}/${device.number}`}
                className="text-sm text-sky-700 dark:text-sky-400 underline"
              >
                View full history
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  className,
  pending,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className: string;
  pending: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={`w-full rounded-lg py-3 text-white font-semibold disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
