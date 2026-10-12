"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getForm } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import { missingMessage, readAnswers, visibleFields } from "@/lib/intake";
import type { ActionResult, FormAnswers } from "@/lib/types";
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
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: "Saved! 🐾" };
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
  const { error } = id
    ? await supabase.from("pets").update(pet).eq("id", id).eq("owner_id", user.id)
    : await supabase.from("pets").insert({ ...pet, owner_id: user.id });

  if (error) return { ok: false, error: error.message };
  redirect("/portal/pets");
}

export async function deletePet(petId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("pets").delete().eq("id", petId).eq("owner_id", user.id);
  if (error) return { ok: false, error: error.message };
  redirect("/portal/pets");
}

export async function submitIntake(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const form = await getForm("intake");
  if (!form) return { ok: false, error: "The intake form isn’t available right now." };

  const supabase = await createClient();
  const [servicesRes, existingRes] = await Promise.all([
    supabase.from("services").select("id").eq("active", true),
    supabase.from("form_submissions").select("answers").eq("form_slug", form.slug).eq("user_id", user.id).maybeSingle(),
  ]);
  const valid = new Set((servicesRes.data ?? []).map((s) => s.id as string));
  const serviceIds = [...new Set(formData.getAll("service_ids").map(String))].filter((id) => valid.has(id));

  // Only questions for the services they picked are required.
  const { answers, missing } = readAnswers(form.fields, formData, visibleFields(form.fields, serviceIds));
  if (missing.length) return { ok: false, error: missingMessage(missing) };

  const { error } = await supabase.from("form_submissions").upsert(
    {
      form_slug: form.slug,
      user_id: user.id,
      answers: { ...((existingRes.data?.answers as FormAnswers | undefined) ?? {}), ...answers },
      service_ids: serviceIds,
    },
    { onConflict: "form_slug,user_id" },
  );
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: "Thanks! Your intake form is in. We’ll review it before your meet & greet. 🐾" };
}
