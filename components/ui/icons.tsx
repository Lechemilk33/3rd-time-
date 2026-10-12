import type { SVGProps } from "react";

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function PawMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...props}>
      <g fill="currentColor">
        <ellipse cx="32" cy="41" rx="11" ry="9" />
        <ellipse cx="19" cy="29" rx="5" ry="6.5" transform="rotate(-20 19 29)" />
        <ellipse cx="27" cy="20" rx="5" ry="6.5" transform="rotate(-6 27 20)" />
        <ellipse cx="37" cy="20" rx="5" ry="6.5" transform="rotate(6 37 20)" />
        <ellipse cx="45" cy="29" rx="5" ry="6.5" transform="rotate(20 45 29)" />
      </g>
    </svg>
  );
}
