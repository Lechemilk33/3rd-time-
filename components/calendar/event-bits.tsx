"use client";

import { Car, Check, Clock, Hourglass, MapPin, PawPrint, X } from "lucide-react";
import { Photo } from "@/components/ui/photo";
import type { BookingDetail, BookingPet } from "@/lib/booking";
import { cn } from "@/lib/utils";

export function StatusGlyph({ status, className }: { status: BookingDetail["status"]; className?: string }) {
  const c = cn("size-3 shrink-0", className);
  if (status === "requested") return <Hourglass className={cn(c, "text-amber-600")} aria-label="Request" />;
  if (status === "completed") return <Check className={cn(c, "text-emerald-600")} aria-label="Done" />;
  if (status === "canceled" || status === "declined") return <X className={cn(c, "text-ink-400")} aria-label={status} />;
  return null;
}

/** Pick-ups (we drive to get the pup) and drop-offs (the client brings them) stand out on the calendar. */
export function HandoffGlyph({ handoff, className }: { handoff: BookingDetail["handoff"]; className?: string }) {
  if (handoff === "pickup") return <Car className={cn("size-3 shrink-0 text-ink-600", className)} aria-label="Pick up from home" />;
  if (handoff === "bring") return <MapPin className={cn("size-3 shrink-0 text-ink-600", className)} aria-label="Client drops off" />;
  return null;
}

/** Shown on visits that only have a window (no exact time pinned yet). */
export function WindowGlyph({ className }: { className?: string }) {
  return <Clock className={cn("size-3 shrink-0 opacity-60", className)} aria-label="Arrival window" />;
}

export function PetAvatar({ pet, size = 28, ring = true }: { pet: Pick<BookingPet, "name" | "photo_url">; size?: number; ring?: boolean }) {
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-sea-100 text-ocean",
        ring && "ring-2 ring-white",
      )}
      style={{ width: size, height: size }}
      title={pet.name}
    >
      {pet.photo_url ? (
        <Photo src={pet.photo_url} alt="" className="h-full w-full" />
      ) : (
        <PawPrint style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden />
      )}
    </span>
  );
}

export function PetStack({ pets, size = 28, max = 3 }: { pets: BookingPet[]; size?: number; max?: number }) {
  if (!pets.length) return null;
  const shown = pets.slice(0, max);
  return (
    <span className="flex -space-x-2">
      {shown.map((p) => (
        <PetAvatar key={p.id} pet={p} size={size} />
      ))}
      {pets.length > max ? (
        <span
          className="inline-grid place-items-center rounded-full bg-ink-100 text-[10px] font-bold text-ink-600 ring-2 ring-white"
          style={{ width: size, height: size }}
        >
          +{pets.length - max}
        </span>
      ) : null}
    </span>
  );
}
