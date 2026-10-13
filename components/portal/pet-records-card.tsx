"use client";

import { Syringe } from "lucide-react";
import { addPetRecords, removePetRecord } from "@/app/portal/actions";
import { RecordsUpload } from "@/components/records-upload";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { addMonths } from "@/lib/dates";
import { recordsState, shotStatus, VACCINES, type PetRecordFile } from "@/lib/records";
import type { Pet } from "@/lib/types";

/**
 * Vaccine records on the pup's page. Always optional: a photo of the vet paperwork is all it takes,
 * and there's a no-records-handy way out right there.
 */
export function PetRecordsCard({
  pet,
  userId,
  files,
  teamEmail,
  today,
  onBusyChange,
}: {
  /** Missing while the pup is being added: uploads are sent with the form. */
  pet?: Pet;
  userId: string;
  files: PetRecordFile[];
  teamEmail: string | null;
  today: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const state = pet ? recordsState(pet, files.at(-1)?.created_at) : "none";
  const checked = pet && pet.records_checked_at ? pet : null;
  const puppy = Boolean(pet?.birthday && pet.birthday > addMonths(today, -6));

  return (
    <Card id="records" className="scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Syringe className="size-5 text-ocean" aria-hidden /> Vaccine records
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            A photo of the paperwork from your vet is perfect. We’ll check it and remind you before anything runs out.
          </p>
        </div>
        {state === "checking" ? (
          <Badge tone="sun">We’re checking them</Badge>
        ) : state === "checked" ? (
          <Badge tone="green">Checked ✓</Badge>
        ) : (
          <Badge tone="gray">Optional</Badge>
        )}
      </div>

      <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 px-4">
        {VACCINES.map((v) => {
          const status = checked ? shotStatus(checked[v.key], today) : null;
          return (
            <li key={v.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm font-bold">{v.name}</span>
                {!status || !checked?.[v.key] ? <span className="block text-xs text-ink-600">{v.why}</span> : null}
              </span>
              {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
            </li>
          );
        })}
      </ul>
      {checked?.records_note ? (
        <p className="rounded-2xl bg-sea-50 p-3 text-sm">
          <span className="font-bold">Note from us:</span> {checked.records_note}
        </p>
      ) : null}

      <RecordsUpload
        ownerId={userId}
        files={files}
        attach={pet ? (list) => addPetRecords(pet.id, list) : undefined}
        remove={pet ? removePetRecord : undefined}
        name={pet ? undefined : "records"}
        onBusyChange={onBusyChange}
      />

      <p className="text-sm text-ink-600">
        {puppy ? "Puppy still getting shots? Add what you have so far. " : ""}
        No records handy?{" "}
        {teamEmail ? (
          <>
            Your vet can email them to{" "}
            <a href={`mailto:${teamEmail}`} className="font-bold text-ocean hover:underline">
              {teamEmail}
            </a>{" "}
            and we’ll add them for you, or add them here later.
          </>
        ) : (
          "Add them here anytime, or bring them to the meet & greet."
        )}
      </p>
    </Card>
  );
}

