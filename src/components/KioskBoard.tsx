"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS_META,
  DISPLAY_ORDER,
  TYPE_META,
  DEVICE_TYPES,
  normalizeType,
  deviceLabel,
  type DisplayState,
  type DeviceType,
} from "@/lib/status";
import { formatDueWindow, type DuePolicy } from "@/lib/schedule";
import { kioskAct, kioskIdentify, kioskInspect, type InspectAnswers } from "@/app/actions";

export type KioskDevice = {
  id: number;
  type: string;
  number: string;
  status: string;
  dueAtMs: number | null;
  holderName: string | null;
};

function stateOf(d: KioskDevice, now: number): DisplayState {
  if (d.status === "CHECKED_OUT" && d.dueAtMs && d.dueAtMs < now) return "OVERDUE";
  return d.status as DisplayState;
}

// Compact holder label for the small kiosk tile: "First L." Parentheticals
// (e.g. a seeded "Olivia (Operator)") are stripped first.
function shortName(full: string): string {
  const parts = full.replace(/\([^)]*\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return full.trim();
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// Downscale a captured photo to a small JPEG data URL so it fits in the DB
// column without needing object storage. Camera shots are multi-MB; this caps
// the longest edge and re-encodes as JPEG.
export async function downscalePhoto(file: File, maxDim = 1024, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

// Compact due label for the tile: same-day shows just the time, another day
// shows the weekday too. An overdue device says so outright.
function dueLabel(dueAtMs: number, now: number): string {
  if (dueAtMs < now) return "OVERDUE";
  const due = new Date(dueAtMs);
  const sameDay = new Date(now).toDateString() === due.toDateString();
  const time = due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay
    ? `Due ${time}`
    : `Due ${due.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

type KioskAction = "CHECKOUT" | "RETURN" | "INSPECT";

function kioskActionFor(status: string): { action: KioskAction; label: string; role: string } | null {
  switch (status) {
    case "AVAILABLE":
      return { action: "CHECKOUT", label: "Check out", role: "Operator" };
    case "CHECKED_OUT":
      return { action: "RETURN", label: "Check in (return)", role: "Operator" };
    case "RETURNED":
      return { action: "INSPECT", label: "Inspect & dock", role: "Tech" };
    default:
      return null; // DAMAGED / OUT_OF_SERVICE → supervisors handle on the main board
  }
}

export default function KioskBoard({
  devices,
  locked,
  logoDataUrl,
  duePolicy,
}: {
  devices: KioskDevice[];
  locked: boolean;
  logoDataUrl?: string | null;
  duePolicy: DuePolicy;
}) {
  const router = useRouter();
  const [now, setNow] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
    () => devices.map((d) => ({ d, state: stateOf(d, now || Date.now()) })),
    [devices, now]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { state } of withState) c[state] = (c[state] ?? 0) + 1;
    return c;
  }, [withState]);

  // One grid per device type (scanners, then radios), each in number order.
  const groups = useMemo(
    () =>
      DEVICE_TYPES.map((t) => ({
        type: t,
        items: withState.filter((x) => normalizeType(x.d.type) === t),
      })).filter((g) => g.items.length > 0),
    [withState]
  );

  const overdue = withState.filter((x) => x.state === "OVERDUE").map((x) => deviceLabel(x.d.type, x.d.number));
  const selected = devices.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col p-3 lg:p-4 overflow-hidden">
      {/* Compact top bar: title + counts on one row so the grids get the rest
          of the (landscape) screen height. */}
      <div className="flex items-center flex-wrap gap-x-5 gap-y-1 mb-2">
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUrl}
              alt="Company logo"
              className="h-8 lg:h-9 w-auto max-w-[160px] object-contain rounded bg-white/5 p-0.5"
            />
          ) : (
            <span aria-hidden>📟</span>
          )}
          Scanner &amp; Radio Check-in / Checkout
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-2">
          {DISPLAY_ORDER.map((s) => (
            <div
              key={s}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 text-xs lg:text-sm"
            >
              <span className={`inline-block w-3 h-3 rounded-full ${STATUS_META[s].dot}`} />
              <span className="text-slate-300">{STATUS_META[s].label}</span>
              <span className="text-base lg:text-lg font-bold tabular-nums">{counts[s] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {locked ? (
        <p className="text-amber-300 text-xs lg:text-sm mb-1">
          🔒 View-only — the kiosk is locked. · Solo lectura — el kiosco está bloqueado.
        </p>
      ) : (
        <p className="text-slate-400 text-xs lg:text-sm mb-1">
          Tap a device, enter your PIN, and confirm your name. · Toque un dispositivo, ingrese su
          PIN y confirme su nombre.
        </p>
      )}

      {/* Return policy per device type */}
      <p className="text-xs lg:text-sm mb-2 flex flex-wrap gap-x-5 gap-y-0.5">
        {DEVICE_TYPES.map((t) => (
          <span key={t}>
            <span className={`font-semibold ${t === "RADIO" ? "text-blue-400" : "text-slate-200"}`}>
              {TYPE_META[t].plural}:
            </span>{" "}
            <span className="text-slate-300">
              return at end of shift — due {formatDueWindow(duePolicy[t])} after checkout
            </span>{" "}
            <span className="text-slate-500">
              · devolver al final del turno — vence {formatDueWindow(duePolicy[t])} después del retiro
            </span>
          </span>
        ))}
      </p>

      {overdue.length > 0 && (
        <div className="mb-2 rounded-lg bg-red-950 border border-red-700 px-3 py-2 text-red-200 text-base lg:text-lg font-semibold flex items-center gap-2">
          <span aria-hidden>⚠️</span>
          {overdue.length} OVERDUE / VENCIDO — {overdue.join("  ·  ")}
        </div>
      )}

      {/* Grids — one per device type. Each group gets an equal share of the
          remaining height and lays its tiles out in 10 columns, so a 20-device
          type is exactly two rows. The tiles grow to fill the space and the
          whole board fits a landscape iPad with no scrolling. Text scales with
          vmin so it tracks the tile size. */}
      <div className="flex-1 min-h-0 flex flex-col gap-2 lg:gap-3">
        {groups.map(({ type, items }) => (
          <section key={type} className="flex-1 min-h-0 flex flex-col">
            <h2 className="flex items-center gap-2 text-sm lg:text-base font-semibold text-slate-200 mb-1">
              <span aria-hidden>{TYPE_META[type].icon}</span>
              {TYPE_META[type].plural}
              <span className="text-slate-500 font-normal">· {TYPE_META[type].esPlural}</span>
              <span className="text-slate-500 font-normal tabular-nums">({items.length})</span>
            </h2>
            <div
              className="grid grid-cols-[repeat(10,minmax(0,1fr))] gap-1.5 lg:gap-2 flex-1 min-h-0 w-full"
              style={{ gridAutoRows: "minmax(0, 1fr)" }}
            >
              {items.map(({ d, state }) => (
                <button
                  key={d.id}
                  onClick={() => !locked && setSelectedId(d.id)}
                  className={`relative min-h-0 rounded-lg lg:rounded-xl border-[3px] lg:border-4 flex flex-col items-center justify-center gap-0.5 font-bold transition ${
                    TYPE_META[type].tile
                  } ${STATUS_META[state].ring} ${locked ? "cursor-default" : ""}`}
                  title={`${deviceLabel(d.type, d.number)} — ${STATUS_META[state].label}`}
                >
                  {/* who has it checked out — pinned to the top of the card */}
                  {d.status === "CHECKED_OUT" && d.holderName && (
                    <span
                      className="absolute inset-x-0 top-0 truncate rounded-t px-1 py-0.5 text-center font-semibold bg-black/25 leading-tight"
                      style={{ fontSize: "clamp(0.45rem, 1.5vmin, 0.85rem)" }}
                    >
                      {shortName(d.holderName)}
                    </span>
                  )}
                  <span
                    className="max-w-full leading-none font-extrabold"
                    style={{ fontSize: "clamp(0.85rem, 3.2vmin, 2.4rem)" }}
                  >
                    #{d.number}
                  </span>
                  {/* when it's due back */}
                  {d.dueAtMs && (d.status === "CHECKED_OUT" || state === "OVERDUE") && (
                    <span
                      className={`w-full px-0.5 text-center leading-tight ${
                        state === "OVERDUE"
                          ? "font-extrabold text-red-100 bg-red-700/80 rounded"
                          : "font-semibold"
                      }`}
                      style={{ fontSize: "clamp(0.42rem, 1.45vmin, 0.8rem)" }}
                    >
                      {dueLabel(d.dueAtMs, now || Date.now())}
                    </span>
                  )}
                  {/* device type — pinned to the bottom of the card */}
                  <span
                    className="absolute inset-x-0 bottom-0 px-0.5 py-0.5 text-center font-bold uppercase tracking-tight leading-[1.05] opacity-80"
                    style={{ fontSize: "clamp(0.45rem, 1.5vmin, 0.9rem)" }}
                  >
                    {TYPE_META[type].label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="text-slate-400 text-center py-10">
            No devices yet — add scanners and radios in Admin.
          </p>
        )}
      </div>

      {selected && !locked && (
        <KioskModal
          device={selected}
          state={stateOf(selected, now || Date.now())}
          onClose={() => setSelectedId(null)}
          onDone={() => {
            setSelectedId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function KioskModal({
  device,
  state,
  onClose,
  onDone,
}: {
  device: KioskDevice;
  state: DisplayState;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"pin" | "confirm" | "checklist">("pin");
  const [pin, setPin] = useState("");
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [dueAtMs, setDueAtMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = kioskActionFor(device.status);
  const type: DeviceType = normalizeType(device.type);
  const label = deviceLabel(device.type, device.number);

  function identify() {
    if (!act) return;
    setError(null);
    start(async () => {
      const res = await kioskIdentify(device.id, act.action, pin);
      if (res.ok) {
        setWorkerName(res.name);
        setDueAtMs(res.dueAtMs ?? null);
        setStep("confirm");
      } else {
        setError(res.error);
        setPin("");
      }
    });
  }

  // Confirm "it's me": inspection goes to the checklist; others run immediately.
  function afterConfirm() {
    if (!act) return;
    if (act.action === "INSPECT") {
      setStep("checklist");
      return;
    }
    const action = act.action as "CHECKOUT" | "RETURN";
    setError(null);
    start(async () => {
      const res = await kioskAct(device.id, action, pin);
      if (res.ok) onDone();
      else {
        setError(res.error ?? "Action failed.");
        setStep("pin");
        setPin("");
      }
    });
  }

  function submitInspection(answers: InspectAnswers) {
    setError(null);
    start(async () => {
      const res = await kioskInspect(device.id, pin, answers);
      if (res.ok) onDone();
      else setError(res.error ?? "Action failed.");
    });
  }

  function notMe() {
    setStep("pin");
    setPin("");
    setWorkerName(null);
    setError(null);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-900 w-full max-w-sm rounded-2xl shadow-xl p-6 max-h-[92vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span aria-hidden>{TYPE_META[type].icon}</span>
            {label}
          </h2>
          <button onClick={onClose} className="text-slate-400 text-3xl leading-none px-2">
            ×
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={`inline-block w-3 h-3 rounded-full ${STATUS_META[state].dot}`} />
          <span className="font-medium">{STATUS_META[state].label}</span>
          <span className={`ml-1 rounded px-2 py-0.5 text-xs font-bold ${TYPE_META[type].badge}`}>
            {TYPE_META[type].label} · {TYPE_META[type].es}
          </span>
        </div>

        {!act ? (
          <p className="text-slate-600">
            {device.status === "DAMAGED"
              ? "This device is damaged — a supervisor will review it. · Este dispositivo está dañado — un supervisor lo revisará."
              : "No action for this device — it's out of service. · Sin acción — fuera de servicio."}
          </p>
        ) : step === "pin" ? (
          <>
            <div className="rounded-lg bg-slate-100 px-4 py-3 mb-4 text-center">
              <div className="text-lg font-semibold">{act.label}</div>
              <div className="text-xs text-slate-500">Enter your {act.role} PIN · Ingrese su PIN</div>
            </div>
            <div className="h-12 mb-3 rounded-lg border border-slate-300 flex items-center justify-center tracking-[0.5em] text-2xl font-mono">
              {pin.replace(/./g, "•") || (
                <span className="text-slate-300 tracking-normal text-base">enter PIN</span>
              )}
            </div>
            {error && <p className="text-center text-sm text-red-600 mb-3" role="alert">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => { setError(null); setPin((p) => (p.length >= 8 ? p : p + k)); }}
                  className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl font-semibold"
                >
                  {k}
                </button>
              ))}
              <button onClick={() => setPin((p) => p.slice(0, -1))} className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-lg" aria-label="Delete">⌫</button>
              <button onClick={() => { setError(null); setPin((p) => (p.length >= 8 ? p : p + "0")); }} className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl font-semibold">0</button>
              <button
                onClick={identify}
                disabled={pending || pin.length === 0}
                className="h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
              >
                {pending ? "…" : "Next / Siguiente"}
              </button>
            </div>
          </>
        ) : step === "confirm" ? (
          <>
            <div className="rounded-lg bg-slate-100 px-4 py-4 mb-4 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Verify it&apos;s you · Verifique que es usted
              </div>
              <div className="text-2xl font-bold">{workerName}</div>
              <div className="text-sm text-slate-600 mt-2">{act.label} — {label}</div>
            </div>
            {act.action === "CHECKOUT" && dueAtMs && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 mb-4 text-center text-amber-900">
                <div className="text-xs uppercase tracking-wide font-semibold mb-0.5">
                  Due back · Fecha de devolución
                </div>
                <div className="text-lg font-bold">
                  {new Date(dueAtMs).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            )}
            {error && <p className="text-center text-sm text-red-600 mb-3" role="alert">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={notMe} disabled={pending} className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold disabled:opacity-50">
                Not me · No soy yo
              </button>
              <button onClick={afterConfirm} disabled={pending} className="h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50">
                {pending ? "…" : act.action === "INSPECT" ? "Yes — continue / Sí" : "Yes, that's me / Sí"}
              </button>
            </div>
          </>
        ) : (
          <InspectChecklist
            name={workerName}
            type={type}
            pending={pending}
            error={error}
            onCancel={notMe}
            onSubmit={submitInspection}
          />
        )}
      </div>
    </div>
  );
}

// Equipment-tech inspection checklist (bilingual). All questions must be
// answered; a damaged device requires a reason and is sent to a supervisor.
export function InspectChecklist({
  name,
  type,
  pending,
  error,
  onCancel,
  onSubmit,
  dark,
}: {
  name: string | null;
  type: DeviceType;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (a: InspectAnswers) => void;
  // Render with the management board's dark-mode classes.
  dark?: boolean;
}) {
  const [docked, setDocked] = useState<boolean | null>(null);
  const [inspected, setInspected] = useState<boolean | null>(null);
  const [condition, setCondition] = useState<"GOOD" | "DAMAGED" | null>(null);
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhoto(await downscalePhoto(file));
    } catch {
      setPhoto(null);
    } finally {
      setPhotoBusy(false);
    }
  }

  const ready =
    docked !== null &&
    inspected !== null &&
    condition !== null &&
    (condition !== "DAMAGED" || reason.trim().length > 0);

  const idle = dark
    ? "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 dark:text-slate-100"
    : "bg-white border-slate-300";
  const neutral = dark
    ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
    : "bg-slate-100 hover:bg-slate-200";

  const YesNo = ({ value, set }: { value: boolean | null; set: (v: boolean) => void }) => (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={() => set(true)}
        className={`rounded-lg py-2 text-sm font-semibold border ${value === true ? "bg-emerald-600 text-white border-transparent" : idle}`}
      >
        Yes / Sí
      </button>
      <button
        onClick={() => set(false)}
        className={`rounded-lg py-2 text-sm font-semibold border ${value === false ? "bg-red-600 text-white border-transparent" : idle}`}
      >
        No
      </button>
    </div>
  );

  const what = type === "RADIO" ? "antenna, PTT button, battery, belt clip" : "screen, trigger/keys, battery, strap";
  const whatEs = type === "RADIO" ? "antena, botón PTT, batería, clip" : "pantalla, gatillo/teclas, batería, correa";

  return (
    <div className="space-y-4">
      <div className={`text-sm ${dark ? "text-slate-600 dark:text-slate-300" : "text-slate-600"}`}>
        Inspection by <span className="font-semibold">{name}</span> · Inspección por
      </div>

      <div>
        <div className="text-sm font-medium mb-1">1. On the charger? · ¿En el cargador?</div>
        <YesNo value={docked} set={setDocked} />
      </div>
      <div>
        <div className="text-sm font-medium mb-1">2. Inspected? · ¿Inspeccionado?</div>
        <div className={`text-xs mb-1 ${dark ? "text-slate-500 dark:text-slate-400" : "text-slate-500"}`}>
          {what} · {whatEs}
        </div>
        <YesNo value={inspected} set={setInspected} />
      </div>
      <div>
        <div className="text-sm font-medium mb-1">3. Condition · Condición</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setCondition("GOOD")}
            className={`rounded-lg py-2 text-sm font-semibold border ${condition === "GOOD" ? "bg-emerald-600 text-white border-transparent" : idle}`}
          >
            Good / Bueno
          </button>
          <button
            onClick={() => setCondition("DAMAGED")}
            className={`rounded-lg py-2 text-sm font-semibold border ${condition === "DAMAGED" ? "bg-rose-600 text-white border-transparent" : idle}`}
          >
            Damaged / Dañado
          </button>
        </div>
      </div>

      {condition === "DAMAGED" && (
        <div>
          <div className="text-sm font-medium mb-1">
            4. Why is it damaged? · ¿Por qué está dañado?
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Describe the damage… · Describa el daño…"
            className={`w-full rounded-lg border px-3 py-2 text-sm ${idle}`}
          />

          {/* Optional photo of the damage. */}
          <div className="mt-2">
            <div className="text-sm font-medium mb-1">Photo (optional) · Foto (opcional)</div>
            {photo ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="Damage" className="h-16 w-16 rounded object-cover border border-slate-300" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className={`text-sm rounded-lg px-3 py-1.5 ${neutral}`}
                >
                  Remove · Quitar
                </button>
              </div>
            ) : (
              <label className={`inline-flex items-center gap-2 text-sm rounded-lg px-3 py-2 cursor-pointer ${neutral}`}>
                {photoBusy ? "…" : "📷 Add photo · Agregar foto"}
                <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
              </label>
            )}
          </div>

          <p className="text-xs text-rose-600 mt-2">
            A supervisor must return this device to service. · Un supervisor debe devolverlo al servicio.
          </p>
        </div>
      )}

      {error && <p className="text-center text-sm text-red-600" role="alert">{error}</p>}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onCancel} disabled={pending} className={`h-12 rounded-lg font-semibold disabled:opacity-50 ${neutral}`}>
          Cancel · Cancelar
        </button>
        <button
          onClick={() =>
            onSubmit({
              docked: docked === true,
              inspected: inspected === true,
              condition: condition ?? "GOOD",
              damageReason: reason,
              damagePhoto: photo ?? undefined,
            })
          }
          disabled={pending || !ready || photoBusy}
          className="h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
        >
          {pending ? "…" : "Submit · Enviar"}
        </button>
      </div>
    </div>
  );
}
