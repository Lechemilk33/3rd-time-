"use client";

/* eslint-disable @next/next/no-img-element -- photos are resized before upload and served from Supabase Storage */
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
 * One photo, shown whole: tall and wide photos sit on a soft, blurred copy of themselves instead
 * of being cropped to fit the frame.
 */
function Slide({
  photo,
  fadeIn,
  first,
  onReady,
}: {
  photo: HeroPhoto;
  fadeIn: boolean;
  first: boolean;
  onReady: (url: string) => void;
}) {
  return (
    <div className={cn("absolute inset-0", fadeIn && "hero-fade-in")}>
      <img src={photo.url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-95" />
      <img
        src={photo.url}
        alt={photo.name}
        loading="eager"
        fetchPriority={first ? "high" : "auto"}
        ref={(el) => {
          if (el?.complete && el.naturalWidth) onReady(photo.url);
        }}
        onLoad={() => onReady(photo.url)}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  );
}

/**
 * The home page photos, changing every few seconds with a crossfade, and the pup's name (when one
 * was added) on the little card beside them. The first photo always shows first (it's what search
 * engines and slow phones see); the rest follow in a shuffled order that's different each visit.
 * The next photo loads in the background, and the slideshow waits for it rather than fading to a
 * half-loaded picture. The pause button stops it, and it holds while the tab is in the background.
 */
export function HeroSlideshow({ photos, seconds }: { photos: HeroPhoto[]; seconds: number }) {
  const n = photos.length;
  const [order, setOrder] = useState<number[] | null>(null);
  const [slide, setSlide] = useState({ current: 0, prev: -1, key: 0 });
  const [paused, setPaused] = useState(false);
  const loaded = useRef(new Set<string>());
  const ready = (url: string) => loaded.current.add(url);

  // Once the page is up: pick this visit's order (which also starts loading the next photo).
  useEffect(() => {
    if (n < 2) return;
    const t = setTimeout(() => setOrder(shuffled(n)), 0);
    return () => clearTimeout(t);
  }, [n]);

  const next = order ? order[(order.indexOf(slide.current) + 1) % n] : -1;

  // Each photo stays up for `seconds`, counted from when it appeared.
  useEffect(() => {
    if (n < 2 || paused || next < 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const advance = () => {
      // Hold while the tab is in the background or the next photo is still downloading.
      if (document.hidden || !loaded.current.has(photos[next].url)) {
        timer = setTimeout(advance, 250);
        return;
      }
      setSlide((s) => ({ current: next, prev: s.current, key: s.key + 1 }));
    };
    timer = setTimeout(advance, seconds * 1000);
    return () => clearTimeout(timer);
  }, [n, paused, next, seconds, photos, slide.key]);

  const show = (i: number) => setSlide((s) => (s.current === i ? s : { current: i, prev: s.current, key: s.key + 1 }));
  const name = photos[slide.current]?.name;

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
      <div className="relative h-full w-full" aria-roledescription="carousel" aria-label="Photos of our pups">
        {/* The photo underneath stays put while the new one fades in over it. */}
        {slide.prev >= 0 ? <Slide key={`s-${slide.key - 1}`} photo={photos[slide.prev]} fadeIn={false} first={false} onReady={ready} /> : null}
        <Slide key={`s-${slide.key}`} photo={photos[slide.current]} fadeIn={slide.key > 0} first={slide.key === 0} onReady={ready} />
        {/* The next photo, downloading in the background so it's ready when its turn comes. */}
        {next >= 0 && next !== slide.current ? (
          <img
            key={photos[next].url}
            src={photos[next].url}
            alt=""
            aria-hidden
            className="hidden"
            ref={(el) => {
              if (el?.complete && el.naturalWidth) ready(photos[next].url);
            }}
            onLoad={() => ready(photos[next].url)}
          />
        ) : null}

        {n > 1 ? (
          <div className="absolute right-3 bottom-3 flex items-center gap-2 rounded-full bg-ink/40 py-1.5 pr-1.5 pl-3 backdrop-blur-sm">
            {n <= 12 ? (
              <div className="flex items-center gap-1.5">
                {photos.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => show(i)}
                    aria-label={p.name ? `Photo of ${p.name}` : `Photo ${i + 1} of ${n}`}
                    aria-current={slide.current === i ? "true" : undefined}
                    className={cn(
                      "h-2 rounded-full bg-white transition-all",
                      slide.current === i ? "w-5 opacity-100" : "w-2 opacity-60 hover:opacity-90",
                    )}
                  />
                ))}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play slideshow" : "Pause slideshow"}
              className="grid size-7 place-items-center rounded-full bg-white/90 text-ink transition hover:bg-white"
            >
              {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            </button>
          </div>
        ) : null}
      </div>
    </HeroFrame>
  );
}
