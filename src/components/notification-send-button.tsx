"use client";

import { useState } from "react";

export function NotificationSendButton() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch("/api/notifications/send", { method: "POST" });
      const data = (await response.json().catch(() => ({ message: "通知送信に失敗しました。" }))) as {
        message?: string;
        sent?: number;
        skipped?: number;
        failures?: string[];
      };
      if (!response.ok) throw new Error(data.message ?? "通知送信に失敗しました。");
      const failed = data.failures?.length ? ` / 失敗 ${data.failures.length}件` : "";
      setMessage(`送信 ${data.sent ?? 0}件 / 重複スキップ ${data.skipped ?? 0}件${failed}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "通知送信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button disabled={loading} onClick={send} className="btn-primary">
        {loading ? "送信中..." : "期限通知を今すぐ送信"}
      </button>
      {message && <p className="text-sm font-semibold text-slate-600">{message}</p>}
    </div>
  );
}
