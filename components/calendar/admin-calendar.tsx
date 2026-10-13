"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Keyboard,
  Plus,
  Search,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { moveBooking, setBookingStatus, updateBooking } from "@/app/admin/_actions/bookings";
import { AgendaList } from "@/components/calendar/agenda-list";
import { BookingDrawer } from "@/components/calendar/booking-drawer";
import { CalendarContext, type CalendarContextValue, type CreateTarget, type MoveTarget } from "@/components/calendar/context";
import { PetStack } from "@/components/calendar/event-bits";
import { HoverCard } from "@/components/calendar/hover-card";
import { MiniMonth } from "@/components/calendar/mini-month";
import { MonthGrid } from "@/components/calendar/month-grid";
import { TimeGrid, type GridColumn } from "@/components/calendar/time-grid";
import { buttonClass } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import {
  clientName,
  coversDay,
  dateSpanLabel,
  isMultiDay,
  petNames,
  visitTimeLabel,
  type BookingDetail,
  type BookingWindow,
  type Walker,
} from "@/lib/booking";
import { CALENDAR_VIEWS, stepDate, viewTitle, type CalendarView } from "@/lib/calendar";
import { addDays, daysBetween, diffDays, formatYmd, minuteLabel, minutesToTimeInput, shortDate, timeToMinutes, type Ymd } from "@/lib/dates";
import type { FormField } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; tone: "success" | "error"; undo?: () => void };

const VIEW_LABELS: Record<CalendarView, string> = { day: "Day", week: "Week", month: "Month", agenda: "Agenda" };
const UNASSIGNED = "__unassigned";

/** Keeps ?b=<id> in the address bar so an open visit can be shared or reloaded. */
function setUrlParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", url);
}

export function AdminCalendar({
  view,
  date,
  from,
  to,
  today,
  nowMinute: initialNowMinute,
  explicitView,
  bookings,
  requests,
  focus,
  windows,
  walkers,
  timeZone,
  initialOpenId,
  showRequests,
  fields,
}: {
  view: CalendarView;
  date: Ymd;
  from: Ymd;
  to: Ymd;
  today: Ymd;
  nowMinute: number;
  explicitView: boolean;
  bookings: BookingDetail[];
  requests: BookingDetail[];
  focus: BookingDetail | null;
  windows: BookingWindow[];
  walkers: Walker[];
  timeZone: string;
  initialOpenId: string | null;
  /** Open the Requests list on load (from "Review" links on the overview). */
  showRequests?: boolean;
  /** Intake questions, to label the answers saved on bookings. */
  fields: FormField[];
}) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const [, startAction] = useTransition();

  const windowMap = useMemo(() => new Map(windows.map((w) => [w.id, w])), [windows]);
  const walkerMap = useMemo(() => new Map(walkers.map((w) => [w.profile_id, w])), [walkers]);

  // ----- filters -------------------------------------------------------------------------
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [showCanceled, setShowCanceled] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // ----- optimistic moves (dropped as soon as fresh data arrives) -------------------------
  const [optimistic, setOptimistic] = useState<{ source: BookingDetail[]; patches: Record<string, Partial<BookingDetail>> }>({
    source: bookings,
    patches: {},
  });
  const all = useMemo(() => {
    const patches = optimistic.source === bookings ? optimistic.patches : {};
    return bookings.map((b) => (patches[b.id] ? { ...b, ...patches[b.id] } : b));
  }, [bookings, optimistic]);

  const visible = useMemo(
    () =>
      all.filter((b) => {
        if (!showCanceled && (b.status === "canceled" || b.status === "declined")) return false;
        return !hidden.has(b.walker_id ?? UNASSIGNED);
      }),
    [all, hidden, showCanceled],
  );

  const q = query.trim().toLowerCase();
  const isDimmed = useCallback(
    (b: BookingDetail) => {
      if (!q) return false;
      const hay = [
        b.title,
        clientName(b),
        b.client?.email,
        b.client?.phone,
        b.client?.address,
        b.meeting_place,
        b.meeting_address,
        b.walker_id ? walkerMap.get(b.walker_id)?.display_name : "unassigned",
        ...b.pets.flatMap((p) => [p.name, p.breed]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !hay.includes(q);
    },
    [q, walkerMap],
  );

  // ----- drawer ----------------------------------------------------------------------------
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const openBooking = openId ? (all.find((b) => b.id === openId) ?? requests.find((b) => b.id === openId) ?? (focus?.id === openId ? focus : null)) : null;

  // ----- hover card -------------------------------------------------------------------------
  const [hover, setHover] = useState<{ b: BookingDetail; rect: DOMRect } | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  // Fields in the open drawer with unsaved typing (notes, a cancel reason).
  const drawerUnsaved = useRef(new Set<string>());
  // "Decline" on a hover card opens the drawer straight to the decline panel.
  const [drawerPanel, setDrawerPanel] = useState<"decline" | null>(null);
  const confirmDiscard = useCallback(() => {
    if (drawerUnsaved.current.size && !window.confirm("Close without saving? What you typed will be lost.")) return false;
    drawerUnsaved.current.clear();
    return true;
  }, []);
  const hideTimer = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const hoverVisible = useRef(false);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(showTimer.current);
      hoverVisible.current = false;
      setHover(null);
    };
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, []);

  // ----- toasts ------------------------------------------------------------------------------
  const [toast, setToast] = useState<Toast | null>(null);
  const toastSeq = useRef(0);
  const showToast = useCallback((message: string, tone: Toast["tone"] = "success", undo?: () => void) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, tone, undo });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.undo ? 8000 : 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ----- navigation -------------------------------------------------------------------------
  const go = useCallback(
    (nextView: CalendarView, nextDate: Ymd) => {
      const params = new URLSearchParams({ view: nextView, date: nextDate });
      startNav(() => router.push(`/admin/calendar?${params}`, { scroll: false }));
    },
    [router],
  );

  // Phones start on the day view unless a view was picked.
  useEffect(() => {
    if (!explicitView && window.matchMedia("(max-width: 639px)").matches) {
      router.replace(`/admin/calendar?view=day&date=${date}`, { scroll: false });
    }
  }, [explicitView, date, router]);

  // ----- live updates when the other admin (or a client) changes something ------------------
  const [live, setLive] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    let timer: number | undefined;
    const channel = supabase
      .channel("admin-calendar")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => router.refresh(), 600);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  // ----- "now" line --------------------------------------------------------------------------
  const [nowMinute, setNowMinute] = useState(initialNowMinute);
  useEffect(() => {
    const id = window.setInterval(() => {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
      setNowMinute(get("hour") * 60 + get("minute"));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [timeZone]);

  // ----- actions -----------------------------------------------------------------------------
  const move = useCallback(
    (b: BookingDetail, target: MoveTarget) => {
      const before = {
        date: b.service_date,
        windowId: b.window_id,
        arrival: timeToMinutes(b.arrival_time),
        walkerId: b.walker_id,
      };
      const shift = diffDays(target.date, b.service_date);
      const patch: Partial<BookingDetail> = { service_date: target.date, end_date: addDays(b.end_date ?? b.service_date, shift) };
      if (target.minute !== undefined && !isMultiDay(b)) {
        patch.arrival_time = `${minutesToTimeInput(target.minute)}:00`;
        patch.window_id =
          windows.find((w) => w.active && target.minute! >= w.start_minute && target.minute! < w.end_minute)?.id ?? null;
      }
      if (target.walkerId !== undefined) patch.walker_id = target.walkerId;
      setOptimistic((cur) => ({
        source: bookings,
        patches: { ...(cur.source === bookings ? cur.patches : {}), [b.id]: patch },
      }));

      const who = petNames(b.pets) || clientName(b);
      const when =
        b.kind === "stay"
          ? `${shortDate(target.date)} → ${shortDate(addDays(b.end_date, shift))}`
          : `${shortDate(target.date)}${target.minute !== undefined && !isMultiDay(b) ? ` at ${minuteLabel(target.minute)}` : ""}`;
      const to = target.walkerId ? ` · ${walkerMap.get(target.walkerId)?.display_name}` : "";

      startAction(async () => {
        const res = await moveBooking({
          id: b.id,
          date: target.date,
          arrivalMinute: isMultiDay(b) ? null : (target.minute ?? null),
          walkerId: target.walkerId ?? null,
          notify: null,
        });
        if (!res.ok) {
          setOptimistic({ source: bookings, patches: {} });
          showToast(res.error ?? "Couldn’t move that visit.", "error");
          return;
        }
        showToast(`Moved ${who} to ${when}${to}${res.notified ? " · client emailed" : ""}`, "success", () => {
          startAction(async () => {
            const undo = await moveBooking({
              id: b.id,
              date: before.date,
              windowId: before.windowId,
              arrivalMinute: before.arrival,
              clearArrival: before.arrival == null,
              walkerId: target.walkerId !== undefined && before.walkerId ? before.walkerId : null,
              notify: null,
            });
            if (undo.ok && target.walkerId !== undefined && !before.walkerId) {
              await updateBooking(b.id, { walkerId: null });
            }
            showToast(undo.ok ? "Undone" : (undo.error ?? "Couldn’t undo."), undo.ok ? "success" : "error");
          });
        });
      });
    },
    [bookings, showToast, walkerMap, windows],
  );

  const create = useCallback(
    (target: CreateTarget) => {
      const params = new URLSearchParams({ date: target.date });
      if (target.minute !== undefined) params.set("time", String(target.minute));
      if (target.walkerId) params.set("walker", target.walkerId);
      router.push(`/admin/calendar/new?${params}`);
    },
    [router],
  );

  // Bookings with a quick confirm/decline in flight, so a double-click doesn't send two emails.
  const inFlight = useRef(new Set<string>());
  const quickStatus = useCallback(
    (b: BookingDetail, status: "scheduled" | "declined") => {
      setHover(null);
      if (inFlight.current.has(b.id)) return;
      inFlight.current.add(b.id);
      startAction(async () => {
        const res = await setBookingStatus(b.id, status);
        inFlight.current.delete(b.id);
        showToast(
          res.ok ? (status === "scheduled" ? `Confirmed ${petNames(b.pets) || clientName(b)} · client emailed` : "Request declined · client emailed") : (res.error ?? "Something went wrong."),
          res.ok ? "success" : "error",
        );
      });
    },
    [showToast],
  );

  const ctx = useMemo<CalendarContextValue>(
    () => ({
      timeZone,
      today,
      windows: windowMap,
      walkers: walkerMap,
      fields,
      isDimmed,
      open: (id) => {
        window.clearTimeout(showTimer.current);
        setHover(null);
        if (!confirmDiscard()) return;
        setDrawerPanel(null);
        setOpenId(id);
        setUrlParam("b", id);
      },
      hoverStart: (b, el) => {
        if (dragging.current || window.matchMedia("(hover: none)").matches) return;
        window.clearTimeout(hideTimer.current);
        window.clearTimeout(showTimer.current);
        showTimer.current = window.setTimeout(
          () => {
            hoverVisible.current = true;
            setHover({ b, rect: el.getBoundingClientRect() });
          },
          hoverVisible.current ? 80 : 350,
        );
      },
      hoverEnd: () => {
        window.clearTimeout(showTimer.current);
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => {
          hoverVisible.current = false;
          setHover(null);
        }, 160);
      },
      move,
      create,
      setDragging: (v) => {
        dragging.current = v;
        if (v) {
          window.clearTimeout(showTimer.current);
          setHover(null);
        }
      },
    }),
    [timeZone, today, windowMap, walkerMap, fields, isDimmed, move, create, confirmDiscard],
  );

  const closeDrawer = useCallback(() => {
    if (!confirmDiscard()) return;
    setOpenId(null);
    setUrlParam("b", null);
  }, [confirmDiscard]);

  // ----- keyboard shortcuts ------------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (e.key === "Escape") {
        setHover(null);
        if (typing && el === searchRef.current) {
          setQuery("");
          el.blur();
        } else if (typing) {
          // First Escape just leaves the field, so a reflex key press doesn't throw away typing.
          el.blur();
        } else if (openId) closeDrawer();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || openId) return;
      const map: Record<string, () => void> = {
        t: () => go(view, today),
        ArrowLeft: () => go(view, stepDate(view, date, -1)),
        ArrowRight: () => go(view, stepDate(view, date, 1)),
        d: () => go("day", date),
        w: () => go("week", date),
        m: () => go("month", date),
        a: () => go("agenda", date),
        n: () => create({ date }),
        "/": () => searchRef.current?.focus(),
      };
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, closeDrawer, go, view, date, today, create]);

  // ----- views -------------------------------------------------------------------------------
  const counts = useMemo(() => {
    const byWalker = new Map<string, number>();
    for (const b of all) {
      if (b.status === "canceled" || b.status === "declined") continue;
      const k = b.walker_id ?? UNASSIGNED;
      byWalker.set(k, (byWalker.get(k) ?? 0) + 1);
    }
    return byWalker;
  }, [all]);

  const markedDays = useMemo(() => {
    const set = new Set<Ymd>();
    for (const b of bookings) {
      if (b.status === "canceled" || b.status === "declined") continue;
      if (isMultiDay(b)) for (const d of daysBetween(b.service_date, b.end_date ?? b.service_date)) set.add(d);
      else set.add(b.service_date);
    }
    return set;
  }, [bookings]);

  let body: ReactNode;
  if (view === "week") {
    const days = daysBetween(from, to);
    const columns: GridColumn[] = days.map((d) => {
      const n = visible.filter((b) => coversDay(b, d)).length;
      return {
        key: d,
        date: d,
        droppable: true,
        header: (
          <button type="button" onClick={() => go("day", d)} className="group flex w-full items-center gap-2 text-left">
            <span className="text-xs font-extrabold tracking-wide text-ink-400 uppercase">{formatYmd(d, { weekday: "short" })}</span>
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full font-display text-lg font-semibold transition group-hover:bg-sea-100",
                d === today && "bg-ink text-white group-hover:bg-ink",
              )}
            >
              {Number(d.slice(8))}
            </span>
            {n ? <span className="ml-auto rounded-full bg-sea-100 px-1.5 text-[11px] font-extrabold text-ocean">{n}</span> : null}
          </button>
        ),
      };
    });
    const index = new Map(days.map((d, i) => [d, i]));
    body = (
      <TimeGrid
        columns={columns}
        bookings={visible}
        columnOf={(b) => index.get(b.service_date) ?? -1}
        spanOf={(b) => {
          const end = b.end_date ?? b.service_date;
          if (end < from || b.service_date > to) return null;
          return {
            start: index.get(b.service_date < from ? from : b.service_date) ?? 0,
            end: index.get(end > to ? to : end) ?? days.length - 1,
            clipStart: b.service_date < from,
            clipEnd: end > to,
          };
        }}
        nowMinute={nowMinute}
        showWalker
      />
    );
  } else if (view === "day") {
    const dayBookings = visible.filter((b) => coversDay(b, date));
    const lanes = walkers.filter(
      (w) => !hidden.has(w.profile_id) && (w.active || dayBookings.some((b) => b.walker_id === w.profile_id)),
    );
    const showUnassigned = !hidden.has(UNASSIGNED) && dayBookings.some((b) => !b.walker_id || !walkerMap.has(b.walker_id));
    const columns: GridColumn[] = [
      ...lanes.map((w) => {
        const n = dayBookings.filter((b) => b.walker_id === w.profile_id).length;
        return {
          key: w.profile_id,
          date,
          walkerId: w.profile_id,
          droppable: true,
          header: (
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full font-display font-semibold text-white" style={{ background: w.color }}>
                {w.display_name.charAt(0)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-extrabold">{w.display_name}</span>
                <span className="block text-xs font-bold text-ink-400">
                  {n} booking{n === 1 ? "" : "s"}
                </span>
              </span>
            </div>
          ),
        };
      }),
      ...(showUnassigned
        ? [
            {
              key: UNASSIGNED,
              date,
              walkerId: "",
              droppable: false,
              header: (
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-full bg-ink-100 font-bold text-ink-600">?</span>
                  <span className="font-extrabold text-ink-600">Unassigned</span>
                </div>
              ),
            },
          ]
        : []),
    ];
    const laneIndex = new Map(lanes.map((w, i) => [w.profile_id, i]));
    const laneOf = (b: BookingDetail) =>
      b.walker_id && laneIndex.has(b.walker_id) ? laneIndex.get(b.walker_id)! : showUnassigned ? lanes.length : -1;
    body = columns.length ? (
      <TimeGrid
        columns={columns}
        bookings={dayBookings}
        columnOf={laneOf}
        spanOf={(b) => {
          const lane = laneOf(b);
          return lane < 0 ? null : { start: lane, end: lane, clipStart: b.service_date < date, clipEnd: (b.end_date ?? b.service_date) > date };
        }}
        nowMinute={nowMinute}
        showWalker={false}
      />
    ) : (
      <p className="px-6 py-16 text-center text-ink-600">Pick at least one walker above to see their day.</p>
    );
  } else if (view === "month") {
    body = <MonthGrid from={from} to={to} month={date.slice(0, 7)} bookings={visible} onShowDay={(d) => go("day", d)} />;
  } else {
    body = <AgendaList bookings={visible} from={from} to={to} />;
  }

  const filterChips = [
    ...walkers.filter((w) => w.active || counts.get(w.profile_id)).map((w) => ({ key: w.profile_id, label: w.display_name, color: w.color })),
    ...(counts.get(UNASSIGNED) ? [{ key: UNASSIGNED, label: "Unassigned", color: "#94A3B8" }] : []),
  ];

  return (
    <CalendarContext.Provider value={ctx}>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button type="button" onClick={() => go(view, today)} className={buttonClass("outline", "sm")}>
            Today
          </button>
          <div className="flex items-center">
            <button type="button" onClick={() => go(view, stepDate(view, date, -1))} className="grid size-9 place-items-center rounded-full hover:bg-white" aria-label="Previous">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(view, stepDate(view, date, 1))} className="grid size-9 place-items-center rounded-full hover:bg-white" aria-label="Next">
              <ChevronRight className="size-5" />
            </button>
          </div>
          <Popover
            trigger={({ toggle, open }) => (
              <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-1 rounded-xl px-2 py-1 font-display text-xl font-semibold text-ink hover:bg-white sm:text-2xl">
                {viewTitle(view, date)}
                <ChevronDown className={cn("size-5 text-ink-400 transition", open && "rotate-180")} aria-hidden />
              </button>
            )}
          >
            {(close) => (
              <MiniMonth
                value={date}
                today={today}
                marked={markedDays}
                onSelect={(d) => {
                  close();
                  go(view, d);
                }}
              />
            )}
          </Popover>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Calendar view" className="flex rounded-full bg-white p-1 shadow-sm ring-1 ring-ink-100">
              {CALENDAR_VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={v === view}
                  onClick={() => go(v, date)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-bold transition",
                    v === view ? "bg-ink text-white" : "text-ink-600 hover:text-ink",
                  )}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
            <RequestsButton
              requests={requests}
              defaultOpen={showRequests}
              onOpen={(id) => ctx.open(id)}
              onStatus={quickStatus}
              windows={windowMap}
              timeZone={timeZone}
            />
            <Link href={`/admin/calendar/new?date=${date}`} className={buttonClass("primary", "sm")}>
              <Plus className="size-4" aria-hidden /> New booking
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {filterChips.map((c) => {
            const off = hidden.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setHidden((cur) => {
                    const next = new Set(cur);
                    if (next.has(c.key)) next.delete(c.key);
                    else next.add(c.key);
                    return next;
                  })
                }
                onDoubleClick={() => setHidden(new Set(filterChips.filter((x) => x.key !== c.key).map((x) => x.key)))}
                title="Click to show/hide · double-click to show only this walker"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border-2 bg-white px-3 py-1.5 text-sm font-bold transition",
                  off ? "border-ink-100 text-ink-400" : "border-transparent shadow-sm ring-1 ring-ink-100",
                )}
              >
                <span
                  className={cn("size-3 rounded-full transition", off && "opacity-30")}
                  style={{ background: c.color }}
                  aria-hidden
                />
                {c.label}
                <span className="text-xs text-ink-400">{counts.get(c.key) ?? 0}</span>
              </button>
            );
          })}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-ink-600 ring-1 ring-ink-100">
            <input type="checkbox" className="size-4 accent-ocean" checked={showCanceled} onChange={(e) => setShowCanceled(e.target.checked)} />
            Show canceled
          </label>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a pup, client or address"
              aria-label="Search bookings"
              className="h-10 w-full rounded-full border-2 border-ink-100 bg-white pr-9 pl-9 text-sm font-semibold placeholder:text-ink-400 focus:border-ocean focus:ring-4 focus:ring-sea-100 focus:outline-none"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-ink-100 px-1.5 text-[10px] font-bold text-ink-400 sm:block">/</kbd>
          </div>
        </div>

        {/* Calendar */}
        <div className="relative rounded-3xl border border-ink-100 bg-white shadow-sm" aria-busy={navigating}>
          {navigating ? (
            <div className="absolute inset-x-0 top-0 z-40 h-1 overflow-hidden rounded-t-3xl">
              <div className="h-full w-1/3 bg-ocean motion-safe:animate-[progress_900ms_ease-in-out_infinite]" />
            </div>
          ) : null}
          <div className={cn("transition-opacity", navigating && "opacity-60")}>{body}</div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs font-semibold text-ink-400">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", live ? "bg-emerald-500" : "bg-ink-200")} aria-hidden />
              {live ? "Live — updates as bookings come in" : "Connecting…"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-4 rounded-sm bg-sun-100 outline-1 -outline-offset-1 outline-amber-500 outline-dashed" aria-hidden /> Request
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-4 rounded-sm bg-sea-50" aria-hidden /> Arrival windows
            </span>
            <span className="inline-flex items-center gap-1.5">🌙 Overnight · ☀️ Full day</span>
          </span>
          <span className="hidden items-center gap-1.5 lg:inline-flex">
            <Keyboard className="size-3.5" aria-hidden /> T today · ←/→ move · D W M A views · N new · / search · drag to reschedule
          </span>
        </div>
      </div>

      {hover && !openId ? (
        <HoverCard
          booking={hover.b}
          anchor={hover.rect}
          onEnter={() => window.clearTimeout(hideTimer.current)}
          onLeave={ctx.hoverEnd}
          onConfirm={(b) => quickStatus(b, "scheduled")}
          onDecline={(b) => {
            setHover(null);
            ctx.open(b.id);
            setDrawerPanel("decline");
          }}
        />
      ) : null}

      {openBooking ? <BookingDrawer
          key={openBooking.id}
          booking={openBooking}
          initialPanel={drawerPanel}
          onClose={closeDrawer}
          onToast={showToast}
          unsaved={drawerUnsaved}
        /> : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4">
          <div
            role="status"
            key={toast.id}
            className={cn(
              "pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold shadow-2xl motion-safe:animate-[rise_180ms_ease-out]",
              toast.tone === "error" ? "bg-red-700 text-white" : "bg-ink text-white",
            )}
          >
            {toast.tone === "error" ? <X className="size-4 shrink-0" aria-hidden /> : <Check className="size-4 shrink-0 text-sun" aria-hidden />}
            <span>{toast.message}</span>
            {toast.undo ? (
              <button
                type="button"
                onClick={() => {
                  const undo = toast.undo;
                  setToast(null);
                  undo?.();
                }}
                className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sun hover:bg-white/25"
              >
                <Undo2 className="size-3.5" aria-hidden /> Undo
              </button>
            ) : null}
            <button type="button" onClick={() => setToast(null)} className="text-white/60 hover:text-white" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </CalendarContext.Provider>
  );
}

function RequestsButton({
  requests,
  defaultOpen,
  onOpen,
  onStatus,
  windows,
  timeZone,
}: {
  requests: BookingDetail[];
  defaultOpen?: boolean;
  onOpen: (id: string) => void;
  onStatus: (b: BookingDetail, status: "scheduled" | "declined") => void;
  windows: Map<string, BookingWindow>;
  timeZone: string;
}) {
  return (
    <Popover
      align="end"
      sheetOnMobile
      defaultOpen={defaultOpen}
      className="w-[22rem] max-w-[calc(100vw-2rem)] p-2"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            buttonClass("outline", "sm"),
            requests.length > 0 && "border-amber-300 bg-sun-100 text-ink hover:border-amber-500 hover:text-ink",
          )}
        >
          <Hourglass className="size-4" aria-hidden />
          Requests
          <span className={cn("rounded-full px-1.5 text-xs", requests.length ? "bg-amber-500 text-white" : "bg-ink-100 text-ink-600")}>
            {requests.length}
          </span>
        </button>
      )}
    >
      {(close) =>
        requests.length ? (
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {requests.map((b) => (
              <li key={b.id} className="rounded-xl p-2 hover:bg-sea-50">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => {
                    close();
                    onOpen(b.id);
                  }}
                >
                  <PetStack pets={b.pets} size={30} max={2} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">
                      {b.title} · {clientName(b)}
                    </span>
                    <span className="block truncate text-xs font-semibold text-ink-600">
                      {b.kind === "stay" ? dateSpanLabel(b) : shortDate(b.service_date)} · {visitTimeLabel(b, windows, timeZone)}
                    </span>
                  </span>
                </button>
                <div className="mt-2 flex flex-wrap gap-2 pl-1">
                  <button
                    type="button"
                    onClick={() => onStatus(b, "scheduled")}
                    className="inline-flex h-9 items-center gap-1 rounded-full bg-emerald-600 px-3.5 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    <Check className="size-4" aria-hidden /> Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Decline ${petNames(b.pets) || clientName(b)}’s request? We’ll email ${clientName(b)}.`)) onStatus(b, "declined");
                    }}
                    className="inline-flex h-9 items-center rounded-full border border-red-200 px-3.5 text-sm font-bold text-red-700 hover:bg-red-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onOpen(b.id);
                    }}
                    className="inline-flex h-9 items-center rounded-full border border-ink-100 px-3.5 text-sm font-bold text-ink-600 hover:border-ocean hover:text-ocean"
                  >
                    Details
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-3 py-6 text-center">
            <CalendarDays className="mx-auto size-8 text-sea-300" aria-hidden />
            <p className="mt-2 font-bold">No requests waiting</p>
            <p className="text-sm text-ink-600">Bookings that need your OK show up here.</p>
          </div>
        )
      }
    </Popover>
  );
}
