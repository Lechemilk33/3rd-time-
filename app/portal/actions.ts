"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/legal";
import { RECORDS_BUCKET, type StagedRecord } from "@/lib/records";
import { readStagedRecords, recordRows } from "@/lib/records-server";
import type { ActionResult } from "@/lib/types";
import { formString } from "@/lib/utils";

export async function updateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const fullName = formString(formData, "full_name");
  if (!fullName) return { ok: false, error: "Please add your name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone: formString(formData, "phone"),
      address: formString(formData, "address"),
      emergency_contact_name: formString(formData, "emergency_contact_name"),
      emergency_contact_phone: formString(formData, "emergency_contact_phone"),
      access_notes: formString(formData, "access_notes"),
      vet_care_ok: parseBool(formString(formData, "vet_care_ok")),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: "Saved! 🐾" };
}

/** A client agreeing to the current Terms of Service and Privacy Policy (asked once in the portal). */
export async function acceptTerms(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser();
  if (formData.get("agree") !== "on") return { ok: false, error: "Tick the box to agree, then continue." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: "Thanks!" };
}

function parseWeight(value: string | null) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 400 ? n : null;
}

function parseBool(value: string | null) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export async function savePet(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = formString(formData, "id");
  const name = formString(formData, "name");
  if (!name) return { ok: false, error: "Your pup needs a name!" };

  const birthday = formString(formData, "birthday");
  const pet = {
    name,
    breed: formString(formData, "breed"),
    sex: formString(formData, "sex"),
    birthday: birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null,
    weight_lbs: parseWeight(formString(formData, "weight_lbs")),
    spayed_neutered: parseBool(formString(formData, "spayed_neutered")),
    photo_url: formString(formData, "photo_url"),
    temperament: formString(formData, "temperament"),
    walking_notes: formString(formData, "walking_notes"),
    medical_notes: formString(formData, "medical_notes"),
    medications: formString(formData, "medications"),
    feeding_notes: formString(formData, "feeding_notes"),
    vet_name: formString(formData, "vet_name"),
    vet_phone: formString(formData, "vet_phone"),
  };

  const supabase = await createClient();
  const { data: savedPet, error } = id
    ? await supabase.from("pets").update(pet).eq("id", id).eq("owner_id", user.id).select("id").single()
    : await supabase.from("pets").insert({ ...pet, owner_id: user.id }).select("id").single();

  if (error) return { ok: false, error: error.message };
  // Vaccine records added while creating the pup.
  const records = readStagedRecords(formData.get("records"), user.id);
  if (records.length) await supabase.from("pet_records").insert(recordRows(records, savedPet.id, user.id));
  // Added from the booking wizard: go straight back to it.
  const next = formString(formData, "next");
  redirect(next?.startsWith("/portal/book") ? next : "/portal/pets");
}

export async function deletePet(petId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  // Their vaccine records go with them.
  const { data: files } = await supabase.from("pet_records").select("path").eq("pet_id", petId).eq("owner_id", user.id);
  if (files?.length) await supabase.storage.from(RECORDS_BUCKET).remove(files.map((f) => f.path as string));
  const { error } = await supabase.from("pets").delete().eq("id", petId).eq("owner_id", user.id);
  if (error) return { ok: false, error: error.message };
  redirect("/portal/pets");
}

/** Vaccine records uploaded from the pup's page, saved right away. */
export async function addPetRecords(petId: string, files: StagedRecord[]): Promise<ActionResult> {
  const user = await requireUser();
  const list = readStagedRecords(files, user.id);
  if (!list.length) return { ok: false, error: "Nothing to add." };
  const supabase = await createClient();
  const { error } = await supabase.from("pet_records").insert(recordRows(list, petId, user.id));
  if (error) return { ok: false, error: "Couldn’t save that file. Try again." };
  refresh();
  return { ok: true };
}

export async function removePetRecord(recordId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { data: file } = await supabase.from("pet_records").select("id, path").eq("id", recordId).maybeSingle();
  if (!file) return { ok: false, error: "That file is already gone." };
  await supabase.storage.from(RECORDS_BUCKET).remove([file.path as string]);
  const { error } = await supabase.from("pet_records").delete().eq("id", file.id);
  if (error) return { ok: false, error: "Couldn’t remove that file." };
  refresh();
  return { ok: true };
}
