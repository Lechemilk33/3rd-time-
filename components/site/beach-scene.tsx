import { cn } from "@/lib/utils";

const PILINGS = Array.from({ length: 16 }, (_, i) => 8 + i * 27);
const PAWS = [
  { x: 70, y: 418, r: -18 },
  { x: 104, y: 402, r: -14 },
  { x: 142, y: 420, r: -10 },
  { x: 178, y: 404, r: -8 },
  { x: 216, y: 422, r: -4 },
  { x: 252, y: 407, r: 0 },
  { x: 290, y: 424, r: 4 },
];

/** Default artwork: OB pier, waves, sunshine and a trail of paw prints. Recolors with the theme. */
export function BeachScene({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 600 450"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label ?? "Illustration of Ocean Beach with the pier, waves and paw prints in the sand"}
      className={cn("h-full w-full", className)}
    >
      <defs>
        <linearGradient id="wfp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--color-sea-200)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-sea-50)" }} />
        </linearGradient>
        <symbol id="wfp-paw" viewBox="0 0 64 64">
          <ellipse cx="32" cy="41" rx="11" ry="9" />
          <ellipse cx="19" cy="29" rx="5" ry="6.5" transform="rotate(-20 19 29)" />
          <ellipse cx="27" cy="20" rx="5" ry="6.5" transform="rotate(-6 27 20)" />
          <ellipse cx="37" cy="20" rx="5" ry="6.5" transform="rotate(6 37 20)" />
          <ellipse cx="45" cy="29" rx="5" ry="6.5" transform="rotate(20 45 29)" />
        </symbol>
      </defs>

      <rect width="600" height="450" fill="url(#wfp-sky)" />

      {/* sun */}
      <circle cx="462" cy="112" r="84" fill="var(--color-sun-100)" />
      <circle cx="462" cy="112" r="56" fill="var(--color-sun)" />

      {/* clouds */}
      <g fill="white" opacity="0.92">
        <path d="M78 118a20 20 0 0 1 34-14 26 26 0 0 1 49 6 17 17 0 0 1 3 34H84a17 17 0 0 1-6-26z" />
        <path d="M300 70a14 14 0 0 1 24-9 18 18 0 0 1 34 4 12 12 0 0 1 2 24h-56a12 12 0 0 1-4-19z" />
      </g>

      {/* distant water */}
      <rect y="246" width="600" height="204" fill="var(--color-sea)" />

      {/* OB pier */}
      <g fill="var(--color-ink)">
        {PILINGS.map((x) => (
          <rect key={x} x={x} y="236" width="5" height="44" rx="1" />
        ))}
        <rect x="-10" y="228" width="452" height="10" rx="2" />
        <rect x="-10" y="214" width="452" height="3" rx="1.5" />
        {PILINGS.map((x) => (
          <rect key={`post-${x}`} x={x + 1} y="214" width="3" height="14" />
        ))}
        <path d="M58 228v-28h50v28z" />
        <path d="M50 202l33-18 33 18z" />
      </g>
      <rect x="70" y="208" width="10" height="9" rx="1" fill="var(--color-sun)" />
      <rect x="86" y="208" width="10" height="9" rx="1" fill="var(--color-sun)" />

      {/* waves */}
      <path
        d="M0 286c50-16 100 16 150 0s100-16 150 0 100 16 150 0 100-16 150 0V450H0z"
        fill="var(--color-ocean)"
        opacity="0.28"
      />
      <path
        d="M0 318c40-14 80 14 120 0s80-14 120 0 80 14 120 0 80-14 120 0 80 14 120 0V450H0z"
        fill="var(--color-ocean)"
        opacity="0.5"
      />
      <path
        d="M0 318c40-14 80 14 120 0s80-14 120 0 80 14 120 0 80-14 120 0 80 14 120 0"
        fill="none"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* sand */}
      <path d="M0 372c120-22 250-12 360 2s190 14 240 4V450H0z" fill="var(--color-sand)" />
      <path
        d="M0 372c120-22 250-12 360 2s190 14 240 4"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* paw print trail */}
      <g fill="var(--color-ink)" opacity="0.2">
        {PAWS.map((p) => (
          <use
            key={p.x}
            href="#wfp-paw"
            width="22"
            height="22"
            transform={`translate(${p.x} ${p.y}) rotate(${80 + p.r} 11 11)`}
          />
        ))}
      </g>

      {/* tennis ball */}
      <g transform="translate(470 404)">
        <circle r="19" fill="var(--color-sun)" />
        <path d="M-15-11c9 6 9 16 0 22M15-11c-9 6-9 16 0 22" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
