import { redirect } from "next/navigation";
import { LoginView } from "@/components/auth-views";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Promise<{ admin?: string; google?: string; notice?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const adminMode = params?.admin === "1";
  const user = await getCurrentUser();
  if (user && (!adminMode || (user.emailVerified && isAdminEmail(user.email)))) {
    redirect(isAdminEmail(user.email) ? "/admin" : user.emailVerified ? "/dashboard" : "/verify-email");
  }

  const googleLoginEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  return (
    <LoginView
      googleStatus={params?.google}
      notice={params?.notice}
      adminMode={adminMode}
      googleLoginEnabled={googleLoginEnabled}
    />
  );
}
