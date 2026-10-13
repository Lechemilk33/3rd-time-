"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deletePet, savePet } from "@/app/portal/actions";
import { ImageUpload } from "@/components/image-upload";
import { PetRecordsCard } from "@/components/portal/pet-records-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PetRecordFile } from "@/lib/records";
import type { Pet } from "@/lib/types";
import { useFormAction } from "@/lib/use-form-action";

export function PetForm({
  pet,
  userId,
  next,
  records = [],
  teamEmail,
  today,
}: {
  pet?: Pet;
  userId: string;
  next?: string;
  records?: PetRecordFile[];
  teamEmail: string | null;
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction(savePet);
  const [photo, setPhoto] = useState(pet?.photo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [filing, setFiling] = useState(false);
  // Only the name is needed. The rest can wait, so it starts tucked away for a new pup.
  const hasMore = Boolean(
    pet &&
      (pet.sex || pet.spayed_neutered != null || pet.weight_lbs || pet.temperament || pet.walking_notes || pet.feeding_notes ||
        pet.medications || pet.medical_notes || pet.vet_name || pet.vet_phone),
  );
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const yesNo = pet?.spayed_neutered == null ? "" : pet.spayed_neutered ? "yes" : "no";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {pet ? <input type="hidden" name="id" value={pet.id} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Card className="grid gap-6 md:grid-cols-[16rem_1fr]">
        <div>
          <p className="mb-2 text-sm font-bold">Photo</p>
          <ImageUpload
            value={photo}
            onChange={setPhoto}
            folder={`pets/${userId}`}
            name="photo_url"
            label="Add a photo"
            aspect="aspect-square"
            onBusyChange={setUploading}
          />
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required>
            <Input id="name" name="name" defaultValue={pet?.name ?? ""} required />
          </Field>
          <Field label="Breed" htmlFor="breed">
            <Input id="breed" name="breed" defaultValue={pet?.breed ?? ""} placeholder="e.g. Golden doodle" />
          </Field>
          <Field label="Birthday (or best guess)" htmlFor="birthday">
            <Input id="birthday" name="birthday" type="date" defaultValue={pet?.birthday ?? ""} />
          </Field>
        </div>
      </Card>

      <details open={hasMore} className="group rounded-3xl border border-ink-100 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl font-semibold">More about {pet?.name || "your pup"}</span>
            <span className="block text-sm text-ink-600">Size, personality, walks, food, health and vet. Optional, and you can add it anytime.</span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-ink-400 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-6 border-t border-ink-100 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Sex" htmlFor="sex">
          <Select id="sex" name="sex" defaultValue={pet?.sex ?? ""}>
            <option value="">—</option>
            <option>Female</option>
            <option>Male</option>
          </Select>
        </Field>
        <Field label="Spayed / neutered?" htmlFor="spayed_neutered">
          <Select id="spayed_neutered" name="spayed_neutered" defaultValue={yesNo}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Weight (lbs)" htmlFor="weight_lbs">
          <Input
            id="weight_lbs"
            name="weight_lbs"
            type="number"
            step="0.1"
            min="0"
            defaultValue={pet?.weight_lbs ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-lg font-semibold sm:col-span-2">Personality & walks</h2>
        <Field label="Personality" htmlFor="temperament" help="Shy? Social butterfly? Couch potato?">
          <Textarea id="temperament" name="temperament" defaultValue={pet?.temperament ?? ""} rows={3} />
        </Field>
        <Field label="Walking notes" htmlFor="walking_notes" help="Pulling, reactivity, favorite routes, harness tips.">
          <Textarea id="walking_notes" name="walking_notes" defaultValue={pet?.walking_notes ?? ""} rows={3} />
        </Field>
        <Field label="Feeding notes" htmlFor="feeding_notes">
          <Textarea id="feeding_notes" name="feeding_notes" defaultValue={pet?.feeding_notes ?? ""} rows={3} />
        </Field>
        <Field label="Medications" htmlFor="medications">
          <Textarea id="medications" name="medications" defaultValue={pet?.medications ?? ""} rows={3} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-lg font-semibold sm:col-span-2">Health</h2>
        <Field label="Medical notes & allergies" htmlFor="medical_notes" className="sm:col-span-2">
          <Textarea id="medical_notes" name="medical_notes" defaultValue={pet?.medical_notes ?? ""} rows={3} />
        </Field>
        <Field label="Vet name / clinic" htmlFor="vet_name">
          <Input id="vet_name" name="vet_name" defaultValue={pet?.vet_name ?? ""} />
        </Field>
        <Field label="Vet phone" htmlFor="vet_phone">
          <Input id="vet_phone" name="vet_phone" type="tel" defaultValue={pet?.vet_phone ?? ""} />
        </Field>
      </div>
        </div>
      </details>

      <PetRecordsCard pet={pet} userId={userId} files={records} teamEmail={teamEmail} today={today} onBusyChange={setFiling} />

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {deleteError ? <Notice tone="error">{deleteError}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubmitButton size="lg" pendingText="Saving…" pending={pending} disabled={uploading || filing}>
          {uploading ? "Uploading photo…" : filing ? "Uploading records…" : pet ? "Save changes" : next ? "Add pup & pick a time" : "Add pup"}
        </SubmitButton>
        {pet ? (
          <Button
            variant="danger"
            disabled={deleting}
            onClick={() => {
              if (!confirm(`Remove ${pet.name} from your account?`)) return;
              startDelete(async () => {
                const result = await deletePet(pet.id);
                if (result && !result.ok) setDeleteError(result.error ?? "Couldn’t remove this pup.");
              });
            }}
          >
            <Trash2 className="size-4" aria-hidden /> Remove pup
          </Button>
        ) : null}
      </div>
    </form>
  );
}
