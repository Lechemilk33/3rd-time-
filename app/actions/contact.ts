"use server";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { formString } from "@/lib/utils";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendContactMessage(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  // Honeypot: real people never fill this hidden field.
  if (formString(formData, "company")) return { ok: true, message: "Thanks! We’ll be in touch soon." };

  const name = formString(formData, "name");
  const email = formString(formData, "email");
  const phone = formString(formData, "phone");
  const message = formString(formData, "message");

  if (!name || !email || !message) return { ok: false, error: "Please fill in your name, email, and message." };
  if (!EMAIL.test(email)) return { ok: false, error: "That email address doesn’t look right." };
  if (message.length > 5000) return { ok: false, error: "That message is a little long — please shorten it." };

  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Messages aren’t connected yet. Please reach out on Instagram for now." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_messages")
    .insert({ name: name.slice(0, 200), email: email.slice(0, 200), phone: phone?.slice(0, 50), message });

  if (error) {
    console.error("Contact message failed", error.message);
    return { ok: false, error: "Something went wrong sending your message. Please try again." };
  }
  return { ok: true, message: "Thanks! Your message is on its way — we’ll get back to you soon. 🐾" };
}
