"use client";

import { ExternalLink, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { removePlace, savePlace } from "@/app/admin/_actions/places";
import { AddressInput } from "@/components/maps/address-input";
import { MapPreview } from "@/components/maps/map-preview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { mapsUrl } from "@/lib/maps";
import type { Place } from "@/lib/types";

/** Saved meeting places: add, rename, move or remove. */
export function PlacesManager({ initial, maps }: { initial: Place[]; maps: boolean }) {
  const [places, setPlaces] = useState(initial);
  // "new", a place id, or null when nothing is open.
  const [editing, setEditing] = useState<string | null>(initial.length ? null : "new");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = (id: string | null, input: { name: string; address: string }) =>
    start(async () => {
      const res = await savePlace(id, input);
      if (res.ok && res.places) {
        setPlaces(res.places);
        setEditing(null);
      }
      setMessage({ tone: res.ok ? "success" : "error", text: (res.ok ? res.message : res.error) ?? "" });
    });

  const remove = (place: Place) => {
    if (!confirm(`Remove ${place.name}? Visits already set to meet there keep it.`)) return;
    start(async () => {
      const res = await removePlace(place.id);
      if (res.ok && res.places) setPlaces(res.places);
      setMessage({ tone: res.ok ? "success" : "error", text: (res.ok ? res.message : res.error) ?? "" });
    });
  };

  return (
    <div className="max-w-3xl space-y-4">
      {message ? (
        <Notice tone={message.tone} className="mb-2">
          {message.text}
        </Notice>
      ) : null}

      {editing === "new" ? (
        <PlaceForm pending={pending} maps={maps} onCancel={places.length ? () => setEditing(null) : undefined} onSave={(input) => save(null, input)} />
      ) : (
        <Button
          onClick={() => {
            setMessage(null);
            setEditing("new");
          }}
        >
          <Plus className="size-4" aria-hidden /> Add a place
        </Button>
      )}

      {places.length ? (
        <ul className="space-y-3">
          {places.map((place) =>
            editing === place.id ? (
              <li key={place.id}>
                <PlaceForm place={place} pending={pending} maps={maps} onCancel={() => setEditing(null)} onSave={(input) => save(place.id, input)} />
              </li>
            ) : (
              <li key={place.id}>
                <Card className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sea-100 text-ocean">
                    <MapPin className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold">{place.name}</p>
                    {place.address ? (
                      <a
                        href={mapsUrl(place.name, place.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-start gap-1 text-sm text-ocean hover:underline"
                      >
                        {place.address} <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <p className="text-sm text-ink-400">No address yet</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setMessage(null);
                        setEditing(place.id);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(place)} className="text-red-700 hover:bg-red-50">
                      <Trash2 className="size-4" aria-hidden /> Remove
                    </Button>
                  </div>
                </Card>
              </li>
            ),
          )}
        </ul>
      ) : editing !== "new" ? (
        <p className="text-ink-600">No places yet.</p>
      ) : null}
    </div>
  );
}

function PlaceForm({
  place,
  pending,
  maps,
  onSave,
  onCancel,
}: {
  place?: Place;
  pending: boolean;
  maps: boolean;
  onSave: (input: { name: string; address: string }) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(place?.name ?? "");
  const [address, setAddress] = useState(place?.address ?? "");
  const [shown, setShown] = useState(place?.address ?? "");
  const id = place?.id ?? "new";

  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, address });
        }}
      >
        <h2 className="font-display text-xl font-semibold">{place ? `Edit ${place.name}` : "Add a place"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor={`place-name-${id}`} required help="What you call it, like “OB Dog Park”.">
            <Input id={`place-name-${id}`} value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} placeholder="OB Dog Park" />
          </Field>
          <Field label="Address" htmlFor={`place-address-${id}`} help={maps ? "Start typing and pick it from the list." : undefined}>
            <AddressInput
              id={`place-address-${id}`}
              value={address}
              maxLength={300}
              placeholder="Search for a place or address"
              onChange={setAddress}
              onPick={(picked) => {
                setShown(picked.address);
                if (!name.trim()) setName(picked.name.slice(0, 80));
              }}
              onBlur={() => setShown(address)}
            />
          </Field>
        </div>
        {shown.trim() ? <MapPreview address={shown} className="h-48" /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Saving…" : place ? "Save place" : "Add place"}
          </Button>
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
