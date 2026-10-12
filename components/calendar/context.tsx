"use client";

import { createContext, useContext } from "react";
import type { BookingDetail, BookingWindow, Walker } from "@/lib/booking";
import type { Ymd } from "@/lib/dates";
import type { FormField } from "@/lib/types";

export type MoveTarget = {
  date: Ymd;
  /** Exact arrival minute; undefined keeps the current time / window. */
  minute?: number;
  /** New walker; undefined keeps the current one. */
  walkerId?: string;
};

export type CreateTarget = { date: Ymd; minute?: number; walkerId?: string };

export type CalendarContextValue = {
  timeZone: string;
  today: Ymd;
  windows: Map<string, BookingWindow>;
  walkers: Map<string, Walker>;
  /** Intake questions (labels for booking answers). */
  fields: FormField[];
  /** True when a search is active and this booking doesn't match it. */
  isDimmed: (b: BookingDetail) => boolean;
  open: (id: string) => void;
  hoverStart: (b: BookingDetail, el: HTMLElement) => void;
  hoverEnd: () => void;
  move: (b: BookingDetail, target: MoveTarget) => void;
  create: (target: CreateTarget) => void;
  /** A drag is in progress (hover cards stay hidden). */
  setDragging: (dragging: boolean) => void;
};

export const CalendarContext = createContext<CalendarContextValue | null>(null);

export function useCalendar() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCalendar must be used inside <AdminCalendar>");
  return ctx;
}

/** Statuses that can be dragged around. */
export function isMovable(b: BookingDetail) {
  return b.status === "scheduled" || b.status === "requested";
}

export function walkerColor(walker: Walker | undefined) {
  return walker?.color ?? "#94A3B8";
}

export function tint(color: string, percent = 14) {
  return `color-mix(in srgb, ${color} ${percent}%, white)`;
}
