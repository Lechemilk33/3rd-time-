import { Inbox, Mail, Trash2 } from "lucide-react";
import { deleteMessage, setMessageHandled } from "@/app/admin/_actions/business";
import { adminData } from "@/app/admin/_lib";
import { EmptyState, PageTitle } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { ContactMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function MessagesPage() {
  const { supabase } = await adminData();
  const { data } = await supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
  const messages = (data ?? []) as ContactMessage[];

  return (
    <>
      <PageTitle title="Messages" description="Notes sent through the contact form on your website." />
      {messages.length === 0 ? (
        <EmptyState icon={<Inbox className="size-7" />} title="Inbox zero 🎉">
          New messages from your contact page will land here.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id}>
              <Card className={cn(m.handled && "opacity-70")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {m.name} {!m.handled ? <Badge tone="sun">New</Badge> : <Badge tone="gray">Handled</Badge>}
                    </p>
                    <p className="text-sm text-ink-600">
                      {m.email}
                      {m.phone ? ` · ${m.phone}` : ""} · {formatDateTime(m.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your message")}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-ocean px-3 py-1.5 text-sm font-bold text-white hover:bg-ocean-700"
                    >
                      <Mail className="size-4" aria-hidden /> Reply
                    </a>
                    <form action={setMessageHandled.bind(null, m.id, !m.handled)}>
                      <button type="submit" className="rounded-full bg-sea-50 px-3 py-1.5 text-sm font-bold text-ink-600 hover:bg-sea-100">
                        {m.handled ? "Mark as new" : "Mark handled"}
                      </button>
                    </form>
                    <form action={deleteMessage.bind(null, m.id)}>
                      <button type="submit" aria-label="Delete message" className="grid size-8 place-items-center rounded-full text-red-700 hover:bg-red-50">
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap">{m.message}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
