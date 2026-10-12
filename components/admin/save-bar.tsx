"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SaveBar({
  dirty,
  pending,
  onSave,
  onReset,
  message,
  error,
  label = "Save changes",
}: {
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  onReset?: () => void;
  message?: string | null;
  error?: string | null;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={onSave} disabled={!dirty || pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {pending ? "Saving…" : label}
      </Button>
      {onReset && dirty && !pending ? (
        <Button variant="ghost" onClick={onReset}>
          Discard changes
        </Button>
      ) : null}
      {error ? <span className="text-sm font-bold text-red-700">{error}</span> : null}
      {!error && message && !dirty ? (
        <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
          <CircleCheck className="size-4" aria-hidden /> {message}
        </span>
      ) : null}
      {dirty && !pending ? <span className="text-sm font-bold text-coral">Unsaved changes</span> : null}
    </div>
  );
}
