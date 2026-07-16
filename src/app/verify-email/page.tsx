import { VerifyEmailView } from "@/components/auth-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function VerifyEmailPage() {
  return <VerifyEmailView />;
}
