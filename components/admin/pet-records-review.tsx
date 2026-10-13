"use client";

import { Syringe } from "lucide-react";
import { addPetRecordsAsTeam, checkPetRecords, removePetRecordAsTeam } from "@/app/admin/_actions/business";
import { RecordsUpload } from "@/components/records-upload";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate } from "@/lib/format";
import { recordsState, shotStatus, VACCINES, type PetRecordFile } from "@/lib/records";
import type { Pet } from "@/lib/types";
import { useFormAction } from "@/lib/use-form-action";

/** A pup's vaccine records on the client page: open the files, note how long each shot is good for. */
export function PetRecordsReview({ pet, files, today }: { pet: Pet; files: PetRecordFile[]; today: string }) {
  const [state, onSubmit, pending] = useFormAction(checkPetRecords.bind(null, pet.id));
  const status = recordsState(pet, files.at(-1)?.created_at);
  const checkedAt = pet.records_checked_at ? Date.parse(pet.records_checked_at) : 0;

  return (
    <section id={`records-${pet.id}`} className="mt-4 scroll-mt-24 space-y-4 rounded-2xl bg-sea-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold">
          <Syringe className="size-4 text-ocean" aria-hidden /> Vaccine records
        </p>
        {status === "checking" ? (
          <Badge tone="sun">New, needs a look</Badge>
        ) : status === "checked" ? (
          <Badge tone="green">Checked {formatDate(pet.records_checked_at)}</Badge>
        ) : (
          <Badge tone="gray">None yet</Badge>
        )}
      </div>

      <RecordsUpload
        compact
        ownerId={pet.owner_id}
        files={files}
        attach={(list) => addPetRecordsAsTeam(pet.id, list)}
        remove={removePetRecordAsTeam}
        isNew={(f) => Date.parse(f.created_at) > checkedAt}
      />

      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-ink-600">Use the due or expiration date on each certificate. Leave one blank if it isn’t on file.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {VACCINES.map((v) => {
            const st = shotStatus(pet[v.key], today);
            return (
              <Field key={v.key} label={`${v.short} good through`} htmlFor={`${pet.id}-${v.key}`}>
                <Input id={`${pet.id}-${v.key}`} name={v.key} type="date" defaultValue={pet[v.key] ?? ""} className="py-2" />
                {pet[v.key] ? (
                  <Badge tone={st.tone} className="mt-1.5">
                    {st.label}
                  </Badge>
                ) : null}
              </Field>
            );
          })}
        </div>
        <Field label="Note for the client (optional)" htmlFor={`${pet.id}-note`}>
          <Input
            id={`${pet.id}-note`}
            name="records_note"
            maxLength={300}
            defaultValue={pet.records_note ?? ""}
            placeholder="e.g. Titer test accepted instead of DHPP"
            className="py-2"
          />
        </Field>
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state?.ok ? <Notice tone="success">{state.message}</Notice> : null}
        <SubmitButton size="sm" variant="secondary" pendingText="Saving…" pending={pending}>
          {status === "checked" ? "Save" : "Save and mark checked"}
        </SubmitButton>
      </form>
    </section>
  );
}
