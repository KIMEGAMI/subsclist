import { redirect } from "next/navigation";
import { ForgotPasswordView } from "@/components/auth-views";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(isAdminEmail(user.email) ? "/admin" : user.emailVerified ? "/dashboard" : "/verify-email");
  }

  return <ForgotPasswordView />;
}
