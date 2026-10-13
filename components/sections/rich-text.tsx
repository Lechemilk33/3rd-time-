import { cn } from "@/lib/utils";

/**
 * Renders admin-entered plain text: blank lines split paragraphs, lines starting with "- " become
 * bullet lists and lines starting with "## " become headings. No HTML is ever interpreted.
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
                  <span>{l.trim().replace(/^[-•*]\s+/, "")}</span>
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
                {l}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
