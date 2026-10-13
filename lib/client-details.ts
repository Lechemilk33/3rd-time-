import type { Handoff, Profile, Service } from "@/lib/types";

/**
 * Contact and home details are asked right when a booking needs them, never up front, and saved to
 * the client's profile so they're only asked once.
 */

export type ClientDetails = Pick<
  Profile,
  "phone" | "address" | "access_notes" | "emergency_contact_name" | "emergency_contact_phone" | "vet_care_ok"
>;

export type DetailsNeeded = { phone: boolean; address: boolean; access: boolean; emergency: boolean; vet: boolean };

const blank = (v: string | null | undefined) => !v?.trim();

/**
 * What we still need before this booking:
 * - phone: for any visit, so we can reach them
 * - address: whenever we come to them (everything except drop-offs)
 * - how to get in, an emergency contact and vet permission: for visits we make without them, so not
 *   the meet & greet (the services everyone can book)
 */
export function detailsNeeded(p: ClientDetails, service: Pick<Service, "audience">, handoff: Handoff | null): DetailsNeeded {
  const atHome = handoff !== "bring";
  const care = service.audience !== "everyone";
  return {
    phone: blank(p.phone),
    address: atHome && blank(p.address),
    access: care && atHome && blank(p.access_notes),
    emergency: care && (blank(p.emergency_contact_name) || blank(p.emergency_contact_phone)),
    vet: care && p.vet_care_ok == null,
  };
}

export const anyNeeded = (n: DetailsNeeded) => Object.values(n).some(Boolean);

/** Quick answer for the "How do we get in?" box. */
export const SOMEONE_HOME = "Someone will be home to let you in.";
