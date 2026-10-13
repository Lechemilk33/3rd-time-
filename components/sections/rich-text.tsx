import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Turns [label](/page) or [label](https://…) into links; anything else stays plain text. */
function withLinks(line: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const [whole, label, href] = m;
    const at = m.index ?? 0;
    if (at > last) parts.push(line.slice(last, at));
    const cls = "font-bold text-ocean underline decoration-2 underline-offset-2 hover:text-ocean-700";
    if (href.startsWith("/") && !href.startsWith("//")) {
      parts.push(
        <Link key={at} href={href} className={cls}>
          {label}
        </Link>,
      );
    } else if (/^https?:\/\//i.test(href)) {
      parts.push(
        <a key={at} href={href} target="_blank" rel="noreferrer" className={cls}>
          {label}
        </a>,
      );
    } else {
      parts.push(whole);
    }
    last = at + whole.length;
  }
  if (!parts.length) return line;
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

/**
 * Renders admin-entered plain text: blank lines split paragraphs, lines starting with "- " become
 * bullet lists, lines starting with "## " become headings and [label](/page) becomes a link. No
 * HTML is ever interpreted.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .replace(/^##[ \t]+(.+)$/gm, "\n\n## $1\n\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className={cn("space-y-4 leading-relaxed", className)}>
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} className="pt-4 font-display text-2xl leading-tight font-semibold text-ink">
              {block.slice(3).trim()}
            </h2>
          );
        }
        const lines = block.split("\n");
        if (lines.every((l) => /^[-•*]\s+/.test(l.trim()))) {
          return (
            <ul key={i} className="space-y-2 text-left">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ocean" aria-hidden />
                  <span>{withLinks(l.trim().replace(/^[-•*]\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                {withLinks(l)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
