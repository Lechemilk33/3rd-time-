"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { deletePet, savePet } from "@/app/portal/actions";
import { ImageUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Pet } from "@/lib/types";

export function PetForm({ pet, userId }: { pet?: Pet; userId: string }) {
  const [state, action] = useActionState(savePet, null);
  const [photo, setPhoto] = useState(pet?.photo_url ?? "");
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const yesNo = pet?.spayed_neutered == null ? "" : pet.spayed_neutered ? "yes" : "no";

  return (
    <form action={action} className="space-y-6">
      {pet ? <input type="hidden" name="id" value={pet.id} /> : null}
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
          />
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required>
            <Input id="name" name="name" defaultValue={pet?.name ?? ""} required />
          </Field>
          <Field label="Breed" htmlFor="breed">
            <Input id="breed" name="breed" defaultValue={pet?.breed ?? ""} placeholder="e.g. Golden doodle" />
          </Field>
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
          <Field label="Birthday (or best guess)" htmlFor="birthday">
            <Input id="birthday" name="birthday" type="date" defaultValue={pet?.birthday ?? ""} />
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
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-xl font-semibold sm:col-span-2">Personality & walks</h2>
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
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-xl font-semibold sm:col-span-2">Health</h2>
        <Field label="Medical notes & allergies" htmlFor="medical_notes" className="sm:col-span-2">
          <Textarea id="medical_notes" name="medical_notes" defaultValue={pet?.medical_notes ?? ""} rows={3} />
        </Field>
        <Field label="Vet name / clinic" htmlFor="vet_name">
          <Input id="vet_name" name="vet_name" defaultValue={pet?.vet_name ?? ""} />
        </Field>
        <Field label="Vet phone" htmlFor="vet_phone">
          <Input id="vet_phone" name="vet_phone" type="tel" defaultValue={pet?.vet_phone ?? ""} />
        </Field>
      </Card>

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {deleteError ? <Notice tone="error">{deleteError}</Notice> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubmitButton size="lg" pendingText="Saving…">
          {pet ? "Save changes" : "Add pup"}
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
