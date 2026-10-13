"use client";

import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/form";
import { GOOGLE_MAPS_KEY, MAPS_HOME } from "@/lib/maps";
import { cn } from "@/lib/utils";

/* Just the parts of the Places library (Places API (New)) used here. */
type Text = { toString(): string };
type Prediction = {
  placeId: string;
  text: Text;
  mainText?: Text | null;
  secondaryText?: Text | null;
  toPlace(): { fetchFields(options: { fields: string[] }): Promise<unknown>; displayName?: string | null; formattedAddress?: string | null };
};
type PlacesLibrary = {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: Record<string, unknown>): Promise<{ suggestions: { placePrediction: Prediction | null }[] }>;
  };
};
type MapsWindow = Window & {
  google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
  __wfpMapsReady?: () => void;
};

let placesLibrary: Promise<PlacesLibrary> | null = null;

/** Loads the Maps JavaScript API once, then its Places library. */
function loadPlaces() {
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error("No Google Maps key"));
  const w = window as MapsWindow;
  placesLibrary ??= new Promise<void>((resolve, reject) => {
    if (w.google?.maps?.importLibrary) return resolve();
    w.__wfpMapsReady = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&v=weekly&loading=async&callback=__wfpMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps didn’t load"));
    document.head.append(script);
  })
    .then(() => w.google!.maps!.importLibrary!("places") as Promise<PlacesLibrary>)
    .catch((error) => {
      placesLibrary = null;
      throw error;
    });
  return placesLibrary;
}

type Suggestion = { id: string; main: string; secondary: string; prediction: Prediction };

/**
 * An address box with Google suggestions (spots around Ocean Beach first). Without a Maps key, or if
 * Google can't be reached, it's a plain text box.
 */
export function AddressInput({
  value,
  onChange,
  onPick,
  onBlur,
  className,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** A suggestion was picked: the place's name ("Ocean Beach Dog Beach") and full address. */
  onPick?: (place: { name: string; address: string }) => void;
}) {
  const listId = useId();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const session = useRef<object | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(0);
  // Stops asking after an error (say the Places API isn't switched on), so typing stays smooth.
  const disabled = useRef(!GOOGLE_MAPS_KEY);
  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (text: string) => {
    clearTimeout(timer.current);
    if (disabled.current || text.trim().length < 3) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const ask = ++latest.current;
      try {
        const places = await loadPlaces();
        session.current ??= new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: session.current,
          locationBias: { center: MAPS_HOME, radius: 25_000 },
          includedRegionCodes: ["us"],
          language: "en-US",
        });
        if (ask !== latest.current) return;
        setItems(
          suggestions
            .flatMap(({ placePrediction: p }) =>
              p ? [{ id: p.placeId, main: String(p.mainText ?? p.text), secondary: String(p.secondaryText ?? ""), prediction: p }] : [],
            )
            .slice(0, 5),
        );
        setActive(-1);
        setOpen(true);
      } catch {
        disabled.current = true;
        setItems([]);
      }
    }, 250);
  };

  const pick = async (s: Suggestion) => {
    setOpen(false);
    setItems([]);
    const typed = s.secondary ? `${s.main}, ${s.secondary}` : s.main;
    onChange(typed);
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ["displayName", "formattedAddress"] });
      const address = place.formattedAddress || typed;
      onChange(address);
      onPick?.({ name: place.displayName || s.main, address });
    } catch {
      onPick?.({ name: s.main, address: typed });
    } finally {
      // Picking a place ends this search session.
      session.current = null;
    }
  };

  const shown = open && items.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <div className="relative">
      <Input
        {...props}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (!shown) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + items.length) % items.length);
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {shown ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-ink-100 bg-white py-1 shadow-xl">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // mousedown, so the box doesn't lose focus (and close the list) first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className={cn("flex cursor-pointer items-start gap-2 px-3 py-2 text-sm", i === active ? "bg-sea-50" : "hover:bg-sea-50")}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-ocean" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-bold text-ink">{s.main}</span>
                {s.secondary ? <span className="block truncate text-xs text-ink-600">{s.secondary}</span> : null}
              </span>
            </li>
          ))}
          <li aria-hidden className="px-3 pt-0.5 pb-1 text-right text-[11px] font-semibold text-ink-400">
            Google Maps
          </li>
        </ul>
      ) : null}
    </div>
  );
}
