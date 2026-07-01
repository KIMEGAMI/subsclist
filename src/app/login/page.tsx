import { LoginView } from "@/components/auth-views";

type LoginPageProps = {
  searchParams?: Promise<{ google?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return <LoginView googleStatus={params?.google} />;
}
