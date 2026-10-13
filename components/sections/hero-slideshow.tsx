"use client";

/* eslint-disable @next/next/no-img-element -- photos are resized before upload and served from Supabase Storage */
import { Pause, Play } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { HeroBadge, HeroFrame } from "@/components/sections/hero-frame";
import type { HeroPhoto } from "@/components/sections/helpers";
import { cn } from "@/lib/utils";

function shuffled(n: number) {
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [0, ...rest];
}

/**
 * The home page photos, fading from one to the next every few seconds, with the pup's name (when
 * one was added) on the little card beside them. The first photo always loads first (it's what
 * search engines and slow phones see); the rest come in a shuffled order that's different each
 * visit, each loaded just before its turn. Pauses while hovered, while the tab is hidden, or with
 * the pause button, and doesn't advance on its own for people who've asked for less motion.
 */
export function HeroSlideshow({ photos, seconds }: { photos: HeroPhoto[]; seconds: number }) {
  const n = photos.length;
  const [order, setOrder] = useState(() => photos.map((_, i) => i));
  const [warm, setWarm] = useState(false);
  const [slide, setSlide] = useState({ current: 0, prev: -1, key: 0 });
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const nextOf = (i: number) => order[(order.indexOf(i) + 1) % n];

  // After the first photo is up: pick this visit's order and start loading the next one.
  useEffect(() => {
    if (n < 2) return;
    const t = setTimeout(() => {
      setOrder(shuffled(n));
      setWarm(true);
    }, 600);
    return () => clearTimeout(t);
  }, [n]);

  useEffect(() => {
    if (n < 2 || !warm || paused || hovered) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      setSlide((s) => ({ current: order[(order.indexOf(s.current) + 1) % n], prev: s.current, key: s.key + 1 }));
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [n, warm, paused, hovered, order, seconds]);

  const show = (i: number) => setSlide((s) => (s.current === i ? s : { current: i, prev: s.current, key: s.key + 1 }));
  const drift = { "--hero-drift": `${seconds + 1.5}s` } as CSSProperties;
  const name = photos[slide.current]?.name;
  const alt = (p: HeroPhoto) => p.name;

  return (
    <HeroFrame
      badge={
        name ? (
          // Keyed by photo so the card gently pops when the name changes.
          <HeroBadge key={slide.current} title={`Meet ${name}!`} subtitle="Tails wagging in OB" pop={slide.key > 0} />
        ) : (
          <HeroBadge title="Tails wagging" subtitle="in Ocean Beach" />
        )
      }
    >
      <div
        className="relative h-full w-full"
        aria-roledescription="carousel"
        aria-label="Photos of our pups"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {slide.prev >= 0 ? (
          <img
            key={`s-${slide.key - 1}`}
            src={photos[slide.prev].url}
            alt=""
            className="hero-slide absolute inset-0 h-full w-full object-cover"
            style={drift}
          />
        ) : null}
        <img
          key={`s-${slide.key}`}
          src={photos[slide.current].url}
          alt={alt(photos[slide.current])}
          loading="eager"
          fetchPriority={slide.key === 0 ? "high" : "auto"}
          className={cn("absolute inset-0 h-full w-full object-cover", slide.key === 0 ? "hero-slide" : "hero-slide-in")}
          style={drift}
        />
        {/* The next photo, loading in the background so it's ready when its turn comes. */}
        {warm ? <img src={photos[nextOf(slide.current)].url} alt="" aria-hidden className="hidden" /> : null}

        {n > 1 ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-3 bg-gradient-to-t from-ink/35 to-transparent px-4 pt-8 pb-3">
            {n <= 12 ? (
              <div className="flex flex-wrap justify-end gap-1.5">
                {photos.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => show(i)}
                    aria-label={p.name ? `Photo of ${p.name}` : `Photo ${i + 1} of ${n}`}
                    aria-current={slide.current === i ? "true" : undefined}
                    className={cn(
                      "h-2 rounded-full bg-white transition-all",
                      slide.current === i ? "w-6 opacity-100" : "w-2 opacity-60 hover:opacity-90",
                    )}
                  />
                ))}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play slideshow" : "Pause slideshow"}
              className="grid size-7 place-items-center rounded-full bg-white/85 text-ink transition hover:bg-white"
            >
              {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            </button>
          </div>
        ) : null}
      </div>
    </HeroFrame>
  );
}
