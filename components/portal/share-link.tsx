"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** A client's personal invite link, with the phone's share sheet when there is one. */
export function ShareLink({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={async () => {
          if (typeof navigator.share === "function") {
            try {
              await navigator.share({ title: "Waiting for Paws", text, url });
              return;
            } catch {
              // Closed the share sheet, or sharing isn't allowed here: fall back to copying.
            }
          }
          await copy();
        }}
      >
        <Share2 className="size-4" aria-hidden /> Share
      </Button>
      <Button size="sm" variant="outline" onClick={copy}>
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied!" : "Copy link"}
      </Button>
    </div>
  );
}
