import { AnnouncementBar } from "@/components/site/announcement-bar";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-sun px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <Header />
      <main id="main" className="flex-1 pb-10">
        {children}
      </main>
      <Footer />
    </>
  );
}
