import Link from "next/link";
import { PageTitle } from "@/components/dashboard/shell";
import { ProfileForm } from "@/components/portal/profile-form";
import { requireUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <PageTitle
        title="Your profile"
        description={
          <>
            Contact details and home access info.{" "}
            <Link href="/portal/password" className="font-bold text-ocean hover:underline">
              Change password
            </Link>
          </>
        }
      />
      <ProfileForm profile={user.profile} email={user.email} />
    </>
  );
}
