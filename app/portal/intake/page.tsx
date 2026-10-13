import { redirect } from "next/navigation";

// Questions are asked while booking now (see lib/intake.ts), so old links land on the portal home.
export default function IntakePage() {
  redirect("/portal");
}
