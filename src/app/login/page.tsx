import { LoginView } from "@/components/auth-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function LoginPage() {
  return <LoginView />;
}
