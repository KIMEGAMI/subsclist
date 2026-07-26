import { redirect } from "next/navigation";
import { LoginView } from "@/components/auth-views";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Promise<{ google?: string; notice?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect(isAdminEmail(user.email) ? "/admin" : user.emailVerified ? "/dashboard" : "/verify-email");
  }

  const params = await searchParams;
  return <LoginView googleStatus={params?.google} notice={params?.notice} />;
}
