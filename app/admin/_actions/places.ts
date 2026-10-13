"use server";

import { refresh } from "next/cache";
import { rpcError } from "@/lib/booking-server";
import type { ActionResult, Place } from "@/lib/types";
import { adminClient, clampText } from "./shared";

type PlacesResult = ActionResult & { places?: Place[] };

/** Saved meeting places, A to Z. */
export async function getPlaces(): Promise<Place[]> {
  const supabase = await adminClient();
  const { data } = await supabase.from("places").select("*").order("name");
  return (data ?? []) as Place[];
}

/** Adds a place (no id) or updates one. Visits already set to it keep the name and address they had. */
export async function savePlace(id: string | null, input: { name: string; address: string }): Promise<PlacesResult> {
  const name = clampText(input.name, 80).trim();
  const address = clampText(input.address, 300).trim();
  if (!name) return { ok: false, error: "Give the place a name, like “OB Dog Park”." };
  const supabase = await adminClient();
  const { error } = id
    ? await supabase.from("places").update({ name, address }).eq("id", id)
    : await supabase.from("places").insert({ name, address });
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: id ? "Place saved" : `${name} added`, places: await getPlaces() };
}

/** Removes a saved place. Visits already set to it keep their spot. */
export async function removePlace(id: string): Promise<PlacesResult> {
  const supabase = await adminClient();
  const { error } = await supabase.from("places").delete().eq("id", id);
  if (error) return { ok: false, error: rpcError(error) };
  refresh();
  return { ok: true, message: "Place removed", places: await getPlaces() };
}
