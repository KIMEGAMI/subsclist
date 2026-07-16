"use client";

import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { AdminGate } from "@/components/access-guard";
import { useStore } from "@/components/store";
import { siteConfig } from "@/lib/site";

const statusLabels: Record<string, string> = {
  new: "未対応",
  reviewing: "確認中",
  resolved: "完了",
  blocked: "NGワード",
};

export function AdminConsoleView() {
  const { user, siteSettings, toggleMaintenanceMode, contactMessages, updateContactMessageStatus, deleteContactMessage } = useStore();

  const blockedCount = contactMessages.filter((item) => item.blocked).length;
  const openCount = contactMessages.filter((item) => item.status === "new" || item.status === "reviewing").length;

  return (
    <AdminGate>
      <AppShell>
      <PageHeader title="管理者画面" description="メンテナンスモードの切り替えと問い合わせ管理を行います。" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <p className="text-sm font-semibold text-slate-500">管理者</p>
          <p className="mt-2 text-xl font-bold">{user.name}</p>
          <p className="mt-1 text-sm text-slate-600">{user.email}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">問い合わせ</p>
          <p className="mt-2 text-3xl font-black">{contactMessages.length}</p>
          <p className="mt-1 text-sm text-slate-600">未対応 {openCount} 件 / NGワード {blockedCount} 件</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">公開状態</p>
          <label className="mt-3 flex items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={siteSettings.maintenanceMode}
              onChange={(event) => toggleMaintenanceMode(event.target.checked)}
              className="size-4 rounded border-slate-300"
            />
            メンテナンスモードを有効化
          </label>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            有効時は一般ユーザーをメンテナンス画面へ誘導し、管理者だけが管理画面へ入れます。
          </p>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">問い合わせ一覧</h2>
            <p className="mt-1 text-sm text-slate-600">問い合わせフォームから保存された内容を確認します。</p>
          </div>
          <p className="text-sm text-slate-500">運営窓口: {siteConfig.name}</p>
        </div>
        <div className="mt-4 space-y-4">
          {contactMessages.length === 0 && <p className="text-sm text-slate-500">まだ問い合わせはありません。</p>}
          {contactMessages.map((message) => (
            <article key={message.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{message.subject}</p>
                  <p className="text-sm text-slate-500">
                    {message.name} / {message.email} / {new Date(message.createdAt).toLocaleString("ja-JP")}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${message.blocked ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-700"}`}>
                  {statusLabels[message.status] ?? message.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{message.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {message.status !== "resolved" && (
                  <button onClick={() => updateContactMessageStatus(message.id, "resolved")} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">
                    完了にする
                  </button>
                )}
                {message.status !== "reviewing" && message.status !== "resolved" && (
                  <button onClick={() => updateContactMessageStatus(message.id, "reviewing")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                    確認中へ
                  </button>
                )}
                <button onClick={() => deleteContactMessage(message.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>
      </Card>
      </AppShell>
    </AdminGate>
  );
}
