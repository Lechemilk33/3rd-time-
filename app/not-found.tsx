import { BeachScene } from "@/components/site/beach-scene";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto aspect-[4/3] w-full overflow-hidden rounded-[2rem] border-4 border-white shadow-lg">
          <BeachScene label="Ocean Beach illustration" />
        </div>
        <h1 className="mt-8 text-4xl font-semibold text-ink">This pup wandered off</h1>
        <p className="mt-3 text-lg text-ink-600">We couldn’t find that page. Let’s head back to the beach.</p>
        <ButtonLink href="/" size="lg" className="mt-6">
          Back home
        </ButtonLink>
      </div>
    </main>
  );
}
