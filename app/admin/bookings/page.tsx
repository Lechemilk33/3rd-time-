import { redirect } from "next/navigation";

/** Bookings live on the calendar now. */
export default function BookingsPage() {
  redirect("/admin/calendar?view=agenda");
}
