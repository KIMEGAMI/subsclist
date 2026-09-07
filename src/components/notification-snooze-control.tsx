"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { userErrorMessage, userMessage } from "@/lib/error-messages";
import type { NotificationSnoozeDuration } from "@/lib/notification-snooze";

type NotificationSnoozeControlProps = {
  subscriptionId: string;
  subscriptionName: string;
  isSnoozed: boolean;
};

export function NotificationSnoozeControl({
  subscriptionId,
  subscriptionName,
  isSnoozed,
}: NotificationSnoozeControlProps) {
  const router = useRouter();
  const [duration, setDuration] = useState<NotificationSnoozeDuration>("SEVEN_DAYS");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function update(nextDuration: NotificationSnoozeDuration) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/notifications/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: nextDuration }),
      });
      const data = (await response.json().catch(() => ({
        message: "通知設定の更新に失敗しました。",
      }))) as { message?: string };
      if (!response.ok) {
        throw new Error(userMessage(data.message, "通知設定の更新に失敗しました。"));
      }
      setMessage(userMessage(data.message, "通知設定を更新しました。"));
      router.refresh();
    } catch (error) {
      setMessage(userErrorMessage(error, "通知設定の更新に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  if (isSnoozed) {
    return (
      <div className="grid justify-items-end gap-1">
        <button
          type="button"
          disabled={loading}
          onClick={() => update("CLEAR")}
          className="btn-secondary min-h-0 px-3 py-2 text-sm"
          aria-label={`${subscriptionName}の通知を今すぐ再開`}
        >
          {loading ? "更新中..." : "今すぐ再開"}
        </button>
        {message && <p role="status" className="max-w-56 text-right text-xs font-semibold text-slate-600">{message}</p>}
      </div>
    );
  }

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <select
          value={duration}
          onChange={(event) => setDuration(event.target.value as NotificationSnoozeDuration)}
          className="input min-h-0 w-auto py-2 text-sm"
          aria-label={`${subscriptionName}の通知を一時停止する期間`}
        >
          <option value="ONE_DAY">1日間</option>
          <option value="SEVEN_DAYS">7日間</option>
          <option value="THIRTY_DAYS">30日間</option>
        </select>
        <button
          type="button"
          disabled={loading}
          onClick={() => update(duration)}
          className="btn-secondary min-h-0 px-3 py-2 text-sm"
        >
          {loading ? "更新中..." : "一時停止"}
        </button>
      </div>
      {message && <p role="status" className="max-w-56 text-right text-xs font-semibold text-slate-600">{message}</p>}
    </div>
  );
}
