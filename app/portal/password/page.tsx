import { NewPasswordForm } from "@/components/auth/forms";
import { PageTitle } from "@/components/dashboard/shell";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export default async function PasswordPage() {
  await requireUser();
  return (
    <>
      <PageTitle title="Change password" description="Pick something memorable (but not your dog’s name 😉)." />
      <Card className="max-w-lg">
        <NewPasswordForm />
      </Card>
    </>
  );
}
