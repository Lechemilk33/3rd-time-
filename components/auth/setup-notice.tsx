import { Notice } from "@/components/ui/notice";

export function SetupNotice() {
  return (
    <Notice tone="warning" title="Accounts aren’t connected yet" className="mb-6">
      The site owner still needs to connect the database (Supabase). Logins will work as soon as that’s done.
    </Notice>
  );
}
