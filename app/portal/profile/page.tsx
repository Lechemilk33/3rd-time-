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
            How we reach you and get in.{" "}
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
