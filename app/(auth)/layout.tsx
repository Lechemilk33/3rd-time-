import { BeachScene } from "@/components/site/beach-scene";
import { Logo } from "@/components/site/logo";
import { getSiteSettings } from "@/lib/content";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const settings = await getSiteSettings();
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sea-100 lg:block">
        <BeachScene className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-10 pt-24 text-white">
          <p className="font-display text-3xl font-semibold">{settings.businessName}</p>
          <p className="mt-2 max-w-md text-white/85">{settings.tagline}</p>
        </div>
      </div>
      <div className="flex flex-col bg-white px-4 py-8 sm:px-10">
        <Logo name={settings.businessName} logoUrl={settings.logoUrl} />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</main>
      </div>
    </div>
  );
}
