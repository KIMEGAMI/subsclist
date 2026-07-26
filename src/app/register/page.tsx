import { redirect } from "next/navigation";
import { RegisterView } from "@/components/auth-views";
import { getCurrentUser } from "@/lib/auth";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.emailVerified ? "/dashboard" : "/verify-email");
  }

  return <RegisterView />;
}
