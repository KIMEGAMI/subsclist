"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { userErrorMessage, userMessage } from "@/lib/error-messages";

export function LogoutAllSessionsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function logoutAll() {
    if (!window.confirm("現在の端末を含む、すべての端末からログアウトします。続けますか？")) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/settings/security/sessions", {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({
        message: "すべての端末からログアウトできませんでした。",
      }))) as { message?: string };
      if (!response.ok) {
        throw new Error(
          userMessage(
            data.message,
            "すべての端末からログアウトできませんでした。",
          ),
        );
      }
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(
        userErrorMessage(
          err,
          "すべての端末からログアウトできませんでした。",
        ),
      );
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="btn-secondary w-fit"
        disabled={loading}
        onClick={logoutAll}
      >
        {loading ? "ログアウト中..." : "すべての端末からログアウト"}
      </button>
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
