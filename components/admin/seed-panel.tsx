"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { seedStarterContent } from "@/app/admin/_actions/content";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function SeedPanel() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-3xl border-2 border-sun bg-sun-100 p-6">
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <Sparkles className="size-6" aria-hidden /> Let’s set up your website
      </h2>
      <p className="mt-2 max-w-2xl text-ink">
        Your site is currently showing starter content. Click below to copy it into your database — after that,
        every word, photo, page and color is editable from here.
      </p>
      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
      <Button
        size="lg"
        className="mt-5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await seedStarterContent();
            if (!res.ok) setError(res.error ?? "Something went wrong.");
          })
        }
      >
        {pending ? "Loading…" : "Load starter content"}
      </Button>
    </div>
  );
}
