"use client";

import { CalendarClock, Dog, Minus, Plus, Settings2, Trash2, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { saveHours, saveWalker } from "@/app/admin/_actions/schedule";
import { SaveBar } from "@/components/admin/save-bar";
import { Toggle } from "@/components/admin/schedule-editor";
import { tint } from "@/components/calendar/context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Popover } from "@/components/ui/popover";
import type { HoursBlock, Walker } from "@/lib/booking";
import { minuteLabel } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SWATCHES = ["#1A6FA0", "#F2711C", "#0E9F6E", "#7C3AED", "#DB2777", "#0891B2", "#CA8A04", "#475569"];
const PX = 0.8; // pixels per minute (48px an hour)
const SNAP = 15;
const STEPS = Array.from({ length: 97 }, (_, i) => i * SNAP); // 12 AM … midnight

export type HoursService = { id: string; name: string };

const timeLabel = (m: number) => (m >= 1440 ? "Midnight" : minuteLabel(m));
const spanLabel = (b: Pick<HoursBlock, "start_minute" | "end_minute">) => `${timeLabel(b.start_minute)} – ${timeLabel(b.end_minute)}`;
const dogsLabel = (n: number) => (n <= 1 ? "One at a time" : `Up to ${n} dogs at once`);
/** "8a – 5p", for narrow day columns. */
const compactSpan = (b: Pick<HoursBlock, "start_minute" | "end_minute">) =>
  `${minuteLabel(b.start_minute, true)} – ${b.end_minute >= 1440 ? "12a" : minuteLabel(b.end_minute, true)}`;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function hoursLabel(minutes: number) {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`;
}

/** Another block of the same walker on the same day that overlaps this one. */
function clash(blocks: HoursBlock[], b: Pick<HoursBlock, "id" | "walker_id" | "weekday" | "start_minute" | "end_minute">) {
  return blocks.find(
    (x) =>
      x.id !== b.id &&
      x.walker_id === b.walker_id &&
      x.weekday === b.weekday &&
      x.start_minute < b.end_minute &&
      b.start_minute < x.end_minute,
  );
}

/** Free time around [from, to) on a day: from the end of the block before it to the start of the next. */
function room(blocks: HoursBlock[], walkerId: string, weekday: number, from: number, to: number, except?: string) {
  let lo = 0;
  let hi = 1440;
  for (const b of blocks) {
    if (b.id === except || b.walker_id !== walkerId || b.weekday !== weekday) continue;
    if (b.end_minute <= from) lo = Math.max(lo, b.end_minute);
    if (b.start_minute >= to) hi = Math.min(hi, b.start_minute);
  }
  return { lo, hi };
}

function normalize(blocks: HoursBlock[]) {
  return [...blocks]
    .sort((a, b) => a.walker_id.localeCompare(b.walker_id) || a.weekday - b.weekday || a.start_minute - b.start_minute)
    .map((b) => [b.id, b.walker_id, b.weekday, b.start_minute, b.end_minute, b.dogs, b.label ?? "", b.service_ids?.join(",") ?? "*"]);
}

const wideQuery = "(min-width: 768px)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(wideQuery);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// ---------------------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------------------

export function HoursEditor({
  walkers,
  initial,
  services,
}: {
  walkers: Walker[];
  initial: HoursBlock[];
  services: HoursService[];
}) {
  const [blocks, setBlocks] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [walkerId, setWalkerId] = useState(() => (walkers.find((w) => w.active) ?? walkers[0])?.profile_id ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true);

  const walker = walkers.find((w) => w.profile_id === walkerId);
  const mine = blocks.filter((b) => b.walker_id === walkerId);
  const open = mine.find((b) => b.id === openId) ?? null;
  const dirty = useMemo(() => JSON.stringify(normalize(blocks)) !== JSON.stringify(normalize(saved)), [blocks, saved]);
  const weekMinutes = mine.reduce((sum, b) => sum + b.end_minute - b.start_minute, 0);

  // Anything that would stop the save, worded for people.
  const problem = useMemo(() => {
    for (const b of blocks) {
      const who = walkers.length > 1 ? `${walkers.find((w) => w.profile_id === b.walker_id)?.display_name ?? "A walker"}’s ` : "";
      if (clash(blocks, b)) return `${who}${DAYS[b.weekday - 1]} hours overlap. Adjust one block so they don’t.`;
      if (b.service_ids && !b.service_ids.length) return `Pick a service for ${who}${DAYS[b.weekday - 1]} ${spanLabel(b)}, or open it to any service.`;
    }
    return null;
  }, [blocks, walkers]);

  const update = (id: string, patch: Partial<HoursBlock>) => {
    setResult(null);
    setBlocks((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const remove = (id: string) => {
    setResult(null);
    setBlocks((list) => list.filter((b) => b.id !== id));
    setOpenId(null);
  };
  const add = (weekday: number, startMinute: number, endMinute: number, from?: HoursBlock) => {
    const b: HoursBlock = {
      id: crypto.randomUUID(),
      walker_id: walkerId,
      weekday,
      start_minute: startMinute,
      end_minute: endMinute,
      dogs: from?.dogs ?? 1,
      label: from?.label ?? null,
      service_ids: from?.service_ids ?? null,
    };
    setResult(null);
    setBlocks((list) => [...list, b]);
    return b;
  };

  /** "+" on a day: 8 AM – 5 PM on an empty day, else the hour after its last block. */
  const addToDay = (weekday: number) => {
    const day = mine.filter((b) => b.weekday === weekday);
    const after = Math.max(0, ...day.map((b) => b.end_minute));
    const [s, e] = day.length ? [after, Math.min(1440, after + 60)] : [8 * 60, 17 * 60];
    if (e - s < SNAP) return;
    setOpenId(add(weekday, s, e).id);
  };

  const copyTo = (source: HoursBlock, days: number[]) => {
    const done: string[] = [];
    const skipped: string[] = [];
    const next = [...blocks];
    for (const d of days) {
      const copy = { ...source, id: crypto.randomUUID(), weekday: d };
      if (clash(next, copy)) skipped.push(SHORT[d - 1]);
      else {
        next.push(copy);
        done.push(SHORT[d - 1]);
      }
    }
    setResult(null);
    setBlocks(next);
    return [
      done.length ? `Copied to ${done.join(", ")}.` : "",
      skipped.length ? `Skipped ${skipped.join(", ")} — already has hours then.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  const save = () => {
    if (problem) return;
    start(async () => {
      const r = await saveHours(blocks);
      setResult(r);
      if (r.ok) setSaved(blocks);
    });
  };

  if (!walker) {
    return (
      <p className="text-ink-600">
        Every admin becomes a walker automatically. Make someone an admin from their client profile, then set their hours here.
      </p>
    );
  }

  const editor = open ? (
    <BlockEditor
      key={open.id}
      block={open}
      blocks={blocks}
      walkerName={walker.display_name}
      services={services}
      onChange={(patch) => update(open.id, patch)}
      onRemove={() => remove(open.id)}
      onClose={() => setOpenId(null)}
      onCopy={(days) => copyTo(open, days)}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {walkers.length > 1 ? (
          <div role="tablist" aria-label="Walker" className="flex flex-wrap gap-2">
            {walkers.map((w) => (
              <button
                key={w.profile_id}
                type="button"
                role="tab"
                aria-selected={w.profile_id === walkerId}
                onClick={() => {
                  setWalkerId(w.profile_id);
                  setOpenId(null);
                }}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full border-2 px-4 text-sm font-bold transition",
                  w.profile_id === walkerId ? "border-ink bg-ink text-white" : "border-ink-100 bg-white hover:border-ink-200",
                )}
              >
                <span className="size-3 rounded-full ring-2 ring-white" style={{ background: w.color }} aria-hidden />
                {w.display_name}
                {!w.active ? <span className="text-xs font-semibold opacity-70">not booking</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        <span className="text-sm font-bold text-ink-400">{weekMinutes ? `${hoursLabel(weekMinutes)} a week` : "No hours yet"}</span>
        <div className="ml-auto">
          <WalkerSettings key={`${walker.profile_id}-${walker.display_name}-${walker.color}-${walker.active}`} walker={walker} />
        </div>
      </div>

      {!walker.active ? (
        <p className="rounded-2xl bg-sun-100 px-4 py-3 text-sm font-semibold">
          {walker.display_name} isn’t taking client bookings right now, so clients won’t see these hours. Turn it on in{" "}
          {walker.display_name}’s settings.
        </p>
      ) : null}

      {wide ? (
        <WeekGrid
          blocks={blocks}
          walker={walker}
          services={services}
          openId={openId}
          onOpen={setOpenId}
          onAdd={(weekday, s, e) => setOpenId(add(weekday, s, e).id)}
          onAddToDay={addToDay}
          onUpdate={update}
          onRemove={remove}
          editor={editor}
          onStarter={() => {
            for (let d = 1; d <= 5; d++) add(d, 8 * 60, 17 * 60);
          }}
        />
      ) : (
        <DayList blocks={mine} color={walker.color} onOpen={setOpenId} onAddToDay={addToDay} />
      )}

      {!wide && editor ? (
        <>
          <div className="fixed inset-0 z-40 bg-ink/30" aria-hidden onClick={() => setOpenId(null)} />
          <div className="fixed inset-x-3 bottom-3 z-50 max-h-[85dvh] overflow-y-auto rounded-3xl">{editor}</div>
        </>
      ) : null}

      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={save}
        onReset={() => {
          setBlocks(saved);
          setOpenId(null);
          setResult(null);
        }}
        message={result?.ok ? result.message : null}
        error={problem ?? (result && !result.ok ? result.error : null)}
        label="Save hours"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Week grid (tablets and up)
// ---------------------------------------------------------------------------------------------

type Preview = { id?: string; weekday: number; start: number; end: number; ok: boolean };
type Gesture =
  | { kind: "draw"; weekday: number; anchor: number; lo: number; hi: number; startY: number; moved: boolean; preview: Preview }
  | { kind: "move"; block: HoursBlock; grab: number; startX: number; startY: number; moved: boolean; preview: Preview | null }
  | { kind: "top" | "bottom"; block: HoursBlock; lo: number; hi: number; preview: Preview | null };

function WeekGrid({
  blocks,
  walker,
  services,
  openId,
  onOpen,
  onAdd,
  onAddToDay,
  onUpdate,
  onRemove,
  editor,
  onStarter,
}: {
  blocks: HoursBlock[];
  walker: Walker;
  services: HoursService[];
  openId: string | null;
  onOpen: (id: string | null) => void;
  onAdd: (weekday: number, start: number, end: number) => void;
  onAddToDay: (weekday: number) => void;
  onUpdate: (id: string, patch: Partial<HoursBlock>) => void;
  onRemove: (id: string) => void;
  editor: ReactNode;
  onStarter: () => void;
}) {
  const walkerId = walker.profile_id;
  const mine = useMemo(() => blocks.filter((b) => b.walker_id === walkerId), [blocks, walkerId]);
  const colsRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastPointer = useRef("mouse");
  const [preview, setPreview] = useState<Preview | null>(null);
  const serviceNames = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);

  // 6 AM – 9 PM, stretched to fit any earlier or later hours.
  const lo = Math.floor(Math.min(6 * 60, ...mine.map((b) => b.start_minute)) / 60) * 60;
  const hi = Math.ceil(Math.max(21 * 60, ...mine.map((b) => b.end_minute)) / 60) * 60;
  const hours = Array.from({ length: (hi - lo) / 60 }, (_, i) => lo + i * 60);

  useEffect(() => {
    const minuteAt = (y: number) => lo + (y - (colsRef.current?.getBoundingClientRect().top ?? 0)) / PX;
    const dayAt = (x: number) => {
      const r = colsRef.current?.getBoundingClientRect();
      if (!r) return 1;
      return clamp(Math.floor(((x - r.left) / r.width) * 7), 0, 6) + 1;
    };
    function onMove(e: PointerEvent) {
      const g = gesture.current;
      if (!g) return;
      if (g.kind === "draw") {
        if (!g.moved && Math.abs(e.clientY - g.startY) < 4) return;
        g.moved = true;
        const at = snap(minuteAt(e.clientY));
        const start = clamp(Math.min(g.anchor, at), g.lo, g.anchor);
        const end = clamp(Math.max(g.anchor + SNAP, at), g.anchor + SNAP, g.hi);
        g.preview = { weekday: g.weekday, start, end, ok: true };
      } else if (g.kind === "move") {
        if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 4) return;
        if (!g.moved) document.body.classList.add("cursor-grabbing", "select-none");
        g.moved = true;
        const len = g.block.end_minute - g.block.start_minute;
        const start = clamp(snap(minuteAt(e.clientY) - g.grab), lo, Math.max(lo, hi - len));
        const weekday = dayAt(e.clientX);
        const next = { ...g.block, weekday, start_minute: start, end_minute: start + len };
        g.preview = { id: g.block.id, weekday, start, end: start + len, ok: !clash(blocks, next) };
      } else {
        const at = clamp(snap(minuteAt(e.clientY)), g.lo, g.hi);
        g.preview =
          g.kind === "top"
            ? { id: g.block.id, weekday: g.block.weekday, start: at, end: g.block.end_minute, ok: true }
            : { id: g.block.id, weekday: g.block.weekday, start: g.block.start_minute, end: at, ok: true };
      }
      setPreview(g.preview);
    }
    function onUp() {
      const g = gesture.current;
      gesture.current = null;
      document.body.classList.remove("cursor-grabbing", "select-none");
      setPreview(null);
      if (!g) return;
      if (g.kind === "draw") {
        // A click adds an hour; a drag adds what was drawn.
        const p = g.moved ? g.preview : { ...g.preview, end: Math.min(g.anchor + 60, g.hi) };
        if (p.end - p.start >= SNAP) onAdd(g.weekday, p.start, p.end);
      } else if (g.kind === "move") {
        if (!g.moved) onOpen(openId === g.block.id ? null : g.block.id);
        else if (g.preview?.ok) onUpdate(g.block.id, { weekday: g.preview.weekday, start_minute: g.preview.start, end_minute: g.preview.end });
      } else if (g.preview) {
        onUpdate(g.block.id, { start_minute: g.preview.start, end_minute: g.preview.end });
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && gesture.current) {
        gesture.current = null;
        document.body.classList.remove("cursor-grabbing", "select-none");
        setPreview(null);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [blocks, lo, hi, onAdd, onOpen, onUpdate, openId]);

  const minuteFromEvent = (e: ReactPointerEvent | ReactMouseEvent) =>
    lo + (e.clientY - (colsRef.current?.getBoundingClientRect().top ?? 0)) / PX;

  function startDraw(e: ReactPointerEvent, weekday: number) {
    lastPointer.current = e.pointerType;
    if (e.pointerType === "touch" || e.button !== 0) return;
    // With a block open, the first click elsewhere just closes it.
    if (openId) return onOpen(null);
    const at = clamp(Math.floor(minuteFromEvent(e) / SNAP) * SNAP, 0, 1440 - SNAP);
    const r = room(blocks, walkerId, weekday, at, at + SNAP);
    if (r.hi - r.lo < SNAP) return;
    e.preventDefault();
    gesture.current = {
      kind: "draw",
      weekday,
      anchor: at,
      lo: r.lo,
      hi: r.hi,
      startY: e.clientY,
      moved: false,
      preview: { weekday, start: at, end: at + SNAP, ok: true },
    };
  }

  function startMove(e: ReactPointerEvent, b: HoursBlock) {
    lastPointer.current = e.pointerType;
    if (e.pointerType === "touch" || e.button !== 0) return;
    e.preventDefault();
    gesture.current = {
      kind: "move",
      block: b,
      grab: minuteFromEvent(e) - b.start_minute,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      preview: null,
    };
  }

  function startResize(e: ReactPointerEvent, b: HoursBlock, edge: "top" | "bottom") {
    lastPointer.current = e.pointerType;
    if (e.pointerType === "touch" || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const r = room(blocks, walkerId, b.weekday, b.start_minute, b.end_minute, b.id);
    gesture.current =
      edge === "top"
        ? { kind: "top", block: b, lo: Math.max(r.lo, lo), hi: b.end_minute - SNAP, preview: null }
        : { kind: "bottom", block: b, lo: b.start_minute + SNAP, hi: Math.min(r.hi, hi), preview: null };
  }

  const open = mine.find((b) => b.id === openId);
  const openCol = open ? open.weekday - 1 : 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-ink-100">
      {/* Day headers */}
      <div className="flex border-b border-ink-100 bg-sea-50/60">
        <div className="w-14 shrink-0" />
        <div className="grid flex-1 grid-cols-7">
          {DAYS.map((d, i) => {
            const minutes = mine.filter((b) => b.weekday === i + 1).reduce((s, b) => s + b.end_minute - b.start_minute, 0);
            return (
              <div key={d} className="group flex min-w-0 items-center justify-between gap-1 border-l border-ink-100 py-2 pr-1 pl-2.5">
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold tracking-wider text-ink uppercase">{SHORT[i]}</span>
                  <span className="block truncate text-[11px] font-bold text-ink-400">{minutes ? hoursLabel(minutes) : "Off"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onAddToDay(i + 1)}
                  aria-label={`Add hours on ${d}`}
                  title={`Add hours on ${d}`}
                  className="grid size-7 shrink-0 place-items-center rounded-full text-ocean transition hover:bg-white focus-visible:bg-white"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative flex" style={{ height: (hi - lo) * PX }}>
        <div className="relative w-14 shrink-0 select-none">
          {hours.map((m) => (
            <span
              key={m}
              className="absolute right-2 -translate-y-1/2 text-[11px] font-bold whitespace-nowrap text-ink-400"
              style={{ top: (m - lo) * PX }}
            >
              {m === lo ? "" : minuteLabel(m, true)}
            </span>
          ))}
        </div>

        <div ref={colsRef} className="relative grid flex-1 grid-cols-7">
          <div className="pointer-events-none absolute inset-0">
            {hours.map((m) => (
              <div key={m}>
                <div className="absolute inset-x-0 border-t border-ink-100" style={{ top: (m - lo) * PX }} />
                <div className="absolute inset-x-0 border-t border-dashed border-ink-100/60" style={{ top: (m + 30 - lo) * PX }} />
              </div>
            ))}
          </div>

          {DAYS.map((d, i) => {
            const weekday = i + 1;
            return (
              <div key={d} className="relative min-w-0 border-l border-ink-100">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Add hours on ${d}`}
                  className="absolute inset-0 cursor-cell"
                  onPointerDown={(e) => startDraw(e, weekday)}
                  onClick={(e) => {
                    // Touch has no drag-to-draw: a tap adds an hour there.
                    if (lastPointer.current !== "touch") return;
                    if (openId) return onOpen(null);
                    const at = clamp(Math.floor(minuteFromEvent(e) / SNAP) * SNAP, 0, 1440 - SNAP);
                    const r = room(blocks, walkerId, weekday, at, at + SNAP);
                    if (Math.min(at + 60, r.hi) - at >= SNAP) onAdd(weekday, at, Math.min(at + 60, r.hi));
                  }}
                />
                {mine
                  .filter((b) => b.weekday === weekday)
                  .map((b) => {
                    const moving = preview?.id === b.id;
                    return (
                      <HourBlock
                        key={b.id}
                        block={b}
                        top={(b.start_minute - lo) * PX}
                        height={(b.end_minute - b.start_minute) * PX}
                        color={walker.color}
                        services={serviceNames}
                        selected={b.id === openId}
                        ghosted={moving}
                        onPointerDown={(e) => startMove(e, b)}
                        onResize={(e, edge) => startResize(e, b, edge)}
                        onClick={(e) => {
                          // Keyboard and touch open it here; mouse clicks are handled on pointer up.
                          if (e.detail === 0 || lastPointer.current === "touch") onOpen(openId === b.id ? null : b.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Delete" || e.key === "Backspace") {
                            e.preventDefault();
                            onRemove(b.id);
                          }
                        }}
                      />
                    );
                  })}
                {preview && preview.weekday === weekday ? (
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-x-1 z-30 rounded-xl border-2 border-dashed px-2 py-1 text-[11px] font-extrabold shadow-lg",
                      preview.ok ? "border-ink bg-white/90 text-ink" : "border-red-500 bg-red-50/90 text-red-700",
                    )}
                    style={{ top: (preview.start - lo) * PX, height: Math.max(12, (preview.end - preview.start) * PX) }}
                  >
                    {spanLabel({ start_minute: preview.start, end_minute: preview.end })}
                    {!preview.ok ? <span className="block font-bold">Overlaps other hours</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {mine.length === 0 && !preview ? (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center p-6">
              <div className="pointer-events-auto max-w-sm rounded-3xl border border-ink-100 bg-white p-5 text-center shadow-xl">
                <CalendarClock className="mx-auto size-8 text-ocean" aria-hidden />
                <p className="mt-2 font-display text-lg font-semibold">When does {walker.display_name} work?</p>
                <p className="mt-1 text-sm text-ink-600">Drag down a day to add hours, or start with a regular week and adjust it.</p>
                <Button size="sm" variant="secondary" className="mt-4" onClick={onStarter}>
                  Mon–Fri, 8 AM – 5 PM
                </Button>
              </div>
            </div>
          ) : null}

          {open && editor ? (
            <div
              className="absolute z-40"
              style={{
                top: clamp((open.start_minute - lo) * PX, 0, Math.max(0, (hi - lo) * PX - 520)),
                ...(openCol <= 3 ? { left: `calc(${((openCol + 1) / 7) * 100}% + 8px)` } : { right: `calc(${((7 - openCol) / 7) * 100}% + 8px)` }),
              }}
            >
              {editor}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HourBlock({
  block: b,
  top,
  height,
  color,
  services,
  selected,
  ghosted,
  onPointerDown,
  onResize,
  onClick,
  onKeyDown,
}: {
  block: HoursBlock;
  top: number;
  height: number;
  color: string;
  services: Map<string, string>;
  selected: boolean;
  ghosted: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onResize: (e: ReactPointerEvent, edge: "top" | "bottom") => void;
  onClick: (e: ReactMouseEvent) => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
}) {
  const only = b.service_ids?.map((id) => services.get(id)).filter(Boolean) ?? [];
  return (
    <button
      type="button"
      aria-label={`${DAYS[b.weekday - 1]} ${spanLabel(b)}${b.label ? `, ${b.label}` : ""}, ${dogsLabel(b.dogs).toLowerCase()}. Press Enter to edit, Delete to remove.`}
      aria-expanded={selected}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "group absolute inset-x-1 z-10 flex cursor-grab flex-col overflow-hidden rounded-xl border-l-4 px-2 py-1 text-left text-[11px] leading-snug text-ink transition-[box-shadow,opacity] hover:shadow-md focus-visible:ring-4 focus-visible:ring-sea-100 focus-visible:outline-none active:cursor-grabbing",
        selected && "shadow-lg ring-2 ring-ink",
        ghosted && "opacity-30",
      )}
      style={{ top, height, background: tint(color, 18), borderLeftColor: color }}
    >
      <span
        aria-hidden
        onPointerDown={(e) => onResize(e, "top")}
        className="absolute inset-x-0 top-0 h-2 cursor-ns-resize"
      />
      <span className="truncate font-extrabold">{compactSpan(b)}</span>
      {height >= 30 ? (
        <span className="flex items-center gap-1 truncate font-bold text-ink-600">
          <Dog className="size-3 shrink-0" aria-hidden />
          {b.dogs} dog{b.dogs === 1 ? "" : "s"}
        </span>
      ) : null}
      {height >= 46 && (b.label || only.length) ? (
        <span className="truncate font-semibold text-ink-600">{b.label || `${only.join(", ")} only`}</span>
      ) : null}
      <span
        aria-hidden
        onPointerDown={(e) => onResize(e, "bottom")}
        className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize justify-center"
      >
        <span className="mt-1 h-0.5 w-6 rounded-full bg-ink/25 opacity-0 transition group-hover:opacity-100" />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Phones: one row per day
// ---------------------------------------------------------------------------------------------

function DayList({
  blocks,
  color,
  onOpen,
  onAddToDay,
}: {
  blocks: HoursBlock[];
  color: string;
  onOpen: (id: string) => void;
  onAddToDay: (weekday: number) => void;
}) {
  return (
    <ul className="divide-y divide-ink-100 rounded-3xl border border-ink-100">
      {DAYS.map((d, i) => {
        const list = blocks.filter((b) => b.weekday === i + 1).sort((a, b) => a.start_minute - b.start_minute);
        return (
          <li key={d} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
            <span className="w-10 shrink-0 text-sm font-extrabold tracking-wider uppercase">{SHORT[i]}</span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {list.length ? (
                list.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpen(b.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border-l-4 px-2.5 py-1.5 text-left text-sm font-bold"
                    style={{ background: tint(color, 18), borderLeftColor: color }}
                  >
                    {spanLabel(b)}
                    {b.label ? <span className="text-xs font-semibold text-ink-600">{b.label}</span> : null}
                    {b.dogs > 1 ? (
                      <span className="inline-flex items-center gap-0.5 text-xs text-ink-600">
                        <Dog className="size-3.5" aria-hidden />
                        {b.dogs}
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <span className="text-sm font-semibold text-ink-400">Off</span>
              )}
            </div>
            <Button size="sm" variant="ghost" className="px-3" aria-label={`Add hours on ${d}`} onClick={() => onAddToDay(i + 1)}>
              <Plus className="size-4" aria-hidden />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// One block's details
// ---------------------------------------------------------------------------------------------

function BlockEditor({
  block: b,
  blocks,
  walkerName,
  services,
  onChange,
  onRemove,
  onClose,
  onCopy,
}: {
  block: HoursBlock;
  blocks: HoursBlock[];
  walkerName: string;
  services: HoursService[];
  onChange: (patch: Partial<HoursBlock>) => void;
  onRemove: () => void;
  onClose: () => void;
  onCopy: (days: number[]) => string;
}) {
  const [days, setDays] = useState<number[]>([]);
  const [copied, setCopied] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const conflict = clash(blocks, b);
  const id = `hb-${b.id.slice(0, 8)}`;

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="w-full space-y-4 rounded-3xl border border-ink-100 bg-white p-4 shadow-[0_20px_50px_-12px_rgba(15,43,63,0.35)] outline-none md:w-80 motion-safe:animate-[pop_120ms_ease-out]"
    >
      <div className="flex items-center justify-between gap-2">
        <p id={`${id}-title`} className="font-display text-lg font-semibold">
          {DAYS[b.weekday - 1]}
        </p>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full hover:bg-sea-50">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="From" htmlFor={`${id}-from`}>
          <Select
            id={`${id}-from`}
            value={b.start_minute}
            className="py-2"
            onChange={(e) => {
              const start = Number(e.target.value);
              onChange({ start_minute: start, end_minute: Math.max(b.end_minute, start + SNAP) });
            }}
          >
            {STEPS.slice(0, -1).map((m) => (
              <option key={m} value={m}>
                {timeLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To" htmlFor={`${id}-to`}>
          <Select id={`${id}-to`} value={b.end_minute} className="py-2" onChange={(e) => onChange({ end_minute: Number(e.target.value) })}>
            {STEPS.filter((m) => m > b.start_minute).map((m) => (
              <option key={m} value={m}>
                {timeLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {conflict ? (
        <p className="-mt-2 text-sm font-bold text-red-700" role="alert">
          Overlaps {spanLabel(conflict)}. Adjust the times.
        </p>
      ) : null}

      <div>
        <p className="mb-1.5 text-sm font-bold">Dogs at once</p>
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center rounded-full border-2 border-ink-100">
            <button
              type="button"
              aria-label="Fewer dogs"
              disabled={b.dogs <= 1}
              onClick={() => onChange({ dogs: b.dogs - 1 })}
              className="grid size-9 place-items-center rounded-full hover:bg-sea-50 disabled:opacity-30"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span className="w-7 text-center text-lg font-extrabold tabular-nums" aria-live="polite">
              {b.dogs}
            </span>
            <button
              type="button"
              aria-label="More dogs"
              disabled={b.dogs >= 20}
              onClick={() => onChange({ dogs: b.dogs + 1 })}
              className="grid size-9 place-items-center rounded-full hover:bg-sea-50 disabled:opacity-30"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <p className="text-xs leading-snug text-ink-600">
            {b.dogs <= 1
              ? "One visit at a time. A family’s dogs always go together."
              : `Group walks and park trips can share up to ${b.dogs} dogs. Drop-ins still get ${walkerName} to themselves.`}
          </p>
        </div>
      </div>

      <Field label="Name (optional)" htmlFor={`${id}-label`}>
        <Input
          id={`${id}-label`}
          value={b.label ?? ""}
          maxLength={40}
          placeholder="e.g. Park run"
          className="py-2"
          onChange={(e) => onChange({ label: e.target.value || null })}
        />
      </Field>

      {services.length > 1 ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">Clients can book</legend>
          <div className="flex gap-1.5">
            {[
              { on: !b.service_ids, label: "Any service", set: () => onChange({ service_ids: null }) },
              { on: Boolean(b.service_ids), label: "Only some", set: () => onChange({ service_ids: b.service_ids ?? [] }) },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={o.on}
                onClick={o.set}
                className={cn(
                  "h-9 rounded-full border-2 px-3.5 text-sm font-bold transition",
                  o.on ? "border-ink bg-ink text-white" : "border-ink-100 hover:border-ink-200",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {b.service_ids ? (
            <div className="mt-2 space-y-1">
              {services.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold hover:bg-sea-50">
                  <input
                    type="checkbox"
                    className="size-4 accent-ocean"
                    checked={b.service_ids?.includes(s.id) ?? false}
                    onChange={(e) =>
                      onChange({
                        service_ids: e.target.checked
                          ? [...(b.service_ids ?? []), s.id]
                          : (b.service_ids ?? []).filter((x) => x !== s.id),
                      })
                    }
                  />
                  {s.name}
                </label>
              ))}
              {!b.service_ids.length ? <p className="text-xs font-bold text-red-700">Pick at least one.</p> : null}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div>
        <p className="mb-1.5 text-sm font-bold">Copy to other days</p>
        <div className="flex flex-wrap gap-1">
          {SHORT.map((d, i) =>
            i + 1 === b.weekday ? null : (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(i + 1)}
                onClick={() => {
                  setCopied("");
                  setDays((list) => (list.includes(i + 1) ? list.filter((x) => x !== i + 1) : [...list, i + 1]));
                }}
                className={cn(
                  "h-8 min-w-10 rounded-full border-2 px-1.5 text-xs font-extrabold transition",
                  days.includes(i + 1) ? "border-ocean bg-ocean text-white" : "border-ink-100 hover:border-ink-200",
                )}
              >
                {d}
              </button>
            ),
          )}
        </div>
        {days.length ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              setCopied(onCopy([...days].sort()));
              setDays([]);
            }}
          >
            Copy to {days.length} day{days.length === 1 ? "" : "s"}
          </Button>
        ) : null}
        {copied ? <p className="mt-2 text-sm font-bold text-emerald-700">{copied}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
        <Button size="sm" variant="danger" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden /> Remove
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Walker name, color and whether they take bookings
// ---------------------------------------------------------------------------------------------

function WalkerSettings({ walker }: { walker: Walker }) {
  const [name, setName] = useState(walker.display_name);
  const [color, setColor] = useState(walker.color);
  const [active, setActive] = useState(walker.active);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const dirty = name !== walker.display_name || color !== walker.color || active !== walker.active;

  return (
    <Popover
      align="end"
      sheetOnMobile
      className="w-80"
      trigger={({ open, toggle }) => (
        <Button size="sm" variant="outline" aria-expanded={open} onClick={toggle}>
          <Settings2 className="size-4" aria-hidden /> {walker.display_name}’s settings
        </Button>
      )}
    >
      <div className="space-y-4 p-1">
        <Field label="Name clients see" htmlFor={`wk-${walker.profile_id}`}>
          <Input id={`wk-${walker.profile_id}`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-bold">Calendar color</p>
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color.toLowerCase() === c.toLowerCase()}
                className={cn("size-8 rounded-full transition", color.toLowerCase() === c.toLowerCase() ? "ring-4 ring-sea-200" : "hover:scale-110")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <Toggle checked={active} onChange={setActive} label="Takes client bookings" help="Off: clients can’t book them, but you still can." />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !dirty}
            onClick={() =>
              start(async () => setResult(await saveWalker({ profile_id: walker.profile_id, display_name: name, color, active })))
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          {result ? (
            <span className={cn("text-sm font-bold", result.ok ? "text-emerald-700" : "text-red-700")}>
              {result.ok ? result.message : result.error}
            </span>
          ) : null}
        </div>
      </div>
    </Popover>
  );
}
