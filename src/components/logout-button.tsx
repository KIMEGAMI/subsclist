"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { userErrorMessage, userMessage } from "@/lib/error-messages";

type LogoutButtonProps = {
  className?: string;
  label?: string;
  showError?: boolean;
};

export function LogoutButton({
  className = "btn-secondary",
  label = "ログアウト",
  showError = true,
}: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data = (await response.json().catch(() => ({ message: "ログアウトに失敗しました。" }))) as { message?: string };
      if (!response.ok) throw new Error(userMessage(data.message, "ログアウトに失敗しました。"));
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "ログアウトに失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button type="button" onClick={logout} disabled={loading} className={className}>
        {loading ? "ログアウト中..." : label}
      </button>
      {showError && error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
