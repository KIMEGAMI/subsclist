"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { userErrorMessage, userMessage } from "@/lib/error-messages";

export function DemoLoginButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function openDemo() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/demo-login", { method: "POST" });
      const data = (await response.json().catch(() => ({ message: "デモを開始できませんでした。" }))) as { message?: string };
      if (!response.ok) throw new Error(userMessage(data.message, "デモを開始できませんでした。"));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "デモを開始できませんでした。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={openDemo}
        disabled={loading}
        className="rounded-full border border-blue-200 bg-white px-7 py-4 text-center font-black text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-md disabled:bg-slate-100 disabled:text-slate-400"
      >
        {loading ? "デモを準備中..." : "デモを開く"}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
