import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordView } from "@/components/auth-views";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

export const metadata: Metadata = {
  title: "パスワード再設定 | SubscList",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type ResetPasswordPageProps = {
  searchParams?: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const user = await getCurrentUser();
  if (user) {
    redirect(isAdminEmail(user.email) ? "/admin" : user.emailVerified ? "/dashboard" : "/verify-email");
  }

  const params = await searchParams;
  return <ResetPasswordView token={params?.token} />;
}
