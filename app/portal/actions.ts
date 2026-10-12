"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getForm } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
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

  const answers: FormAnswers = {};
  const missing: string[] = [];

  for (const field of form.fields) {
    if (field.type === "heading") continue;
    const key = `f_${field.id}`;
    let value: string | string[] | boolean;
    if (field.type === "checkboxes") {
      const options = field.options ?? [];
      value = formData.getAll(key).map(String).filter((v) => options.includes(v));
      if (field.required && value.length === 0) missing.push(field.label);
    } else if (field.type === "agreement") {
      value = formData.get(key) === "on";
      if (field.required && !value) missing.push(field.label);
    } else {
      const raw = (formString(formData, key) ?? "").slice(0, 5000);
      value = raw;
      if ((field.type === "select" || field.type === "radio") && raw && !(field.options ?? []).includes(raw)) {
        value = "";
      }
      if (field.type === "yesno" && raw && raw !== "Yes" && raw !== "No") value = "";
      if (field.required && !value) missing.push(field.label);
    }
    answers[field.id] = value;
  }

  if (missing.length) {
    return { ok: false, error: `Please answer: ${missing.slice(0, 3).join(" · ")}${missing.length > 3 ? " …" : ""}` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("form_submissions")
    .upsert(
      { form_slug: form.slug, user_id: user.id, answers, status: "submitted" },
      { onConflict: "form_slug,user_id" },
    );
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: "Thanks! Your intake form is in. We’ll review it before your meet & greet. 🐾" };
}
