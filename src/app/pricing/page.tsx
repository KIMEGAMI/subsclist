import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "料金プラン | SubscList",
  description: "SubscListはポートフォリオ版として、全機能を無料で利用できます。",
  alternates: { canonical: "/" },
};

export default function PricingPage() {
  redirect("/");
}
