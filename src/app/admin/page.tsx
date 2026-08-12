import { createAnnouncement, deleteAnnouncement, updateAnnouncementStatus, updateMaintenanceMode } from "@/app/admin/actions";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { AdminBulkEmailForm } from "@/components/contact-form";
import { getAllAnnouncements, getMaintenanceMode } from "@/lib/admin";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });

function planLabel(plan: string) {
  return plan === "FREE" ? "Free" : "Premium";
}

export default async function AdminPage() {
  await requireAdminUser();

  const [users, announcements, maintenanceMode] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, plan: true, emailVerified: true, createdAt: true },
    }),
    getAllAnnouncements(),
    getMaintenanceMode(),
  ]);

  return (
    <AppShell>
      <PageHeader title="管理者メニュー" description="お知らせ、一斉メール、ユーザー、メンテナンス状態を管理します。" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-5">
          <Card className="scroll-mt-6" id="maintenance">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-black">メンテナンスモード</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  現在は<span className="mx-1 font-black text-slate-950">{maintenanceMode ? "メンテナンス中" : "通常モード"}</span>です。
                  メンテナンス中は管理者ログイン以外のページ表示を制限します。
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${maintenanceMode ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
                {maintenanceMode ? "メンテナンス中" : "通常モード"}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <form action={updateMaintenanceMode}>
                <input type="hidden" name="mode" value="disabled" />
                <button className="btn-secondary" type="submit">通常モードに戻す</button>
              </form>
              <form action={updateMaintenanceMode}>
                <input type="hidden" name="mode" value="enabled" />
                <button className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 shadow-sm transition hover:bg-amber-400" type="submit">
                  メンテナンス中にする
                </button>
              </form>
            </div>
          </Card>

          <Card className="scroll-mt-6" id="bulk-email">
            <h2 className="text-lg font-black">一斉メール送信</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ユーザーへ個別送信します。送信元は SubscList &lt;saas.system.shinji@gmail.com&gt; です。
            </p>
            <AdminBulkEmailForm />
          </Card>

          <Card className="scroll-mt-6" id="announcements">
            <h2 className="text-lg font-black">お知らせ作成</h2>
            <form action={createAnnouncement} className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">タイトル</span>
                <input name="title" className="input mt-1" maxLength={80} required />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">本文</span>
                <textarea name="body" className="input mt-1 min-h-32" maxLength={1000} required />
              </label>
              <div className="flex flex-wrap gap-4 text-sm font-bold text-slate-700">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="published" defaultChecked />公開する</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="pinned" />固定表示</label>
              </div>
              <button className="btn-primary" type="submit">お知らせを保存</button>
            </form>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="scroll-mt-6" id="users">
            <h2 className="text-lg font-black">ユーザー一覧</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs font-black text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">ユーザー</th>
                    <th className="py-2 pr-4">プラン</th>
                    <th className="py-2 pr-4">認証</th>
                    <th className="py-2">登録日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="py-3 pr-4">
                        <p className="font-bold text-slate-950">{user.name ?? "名前未設定"}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${user.plan === "FREE" ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-700"}`}>
                          {planLabel(user.plan)}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{user.emailVerified ? "認証済み" : "未認証"}</td>
                      <td className="py-3">{dateFormatter.format(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-black">お知らせ一覧</h2>
            <div className="mt-4 space-y-3">
              {announcements.length === 0 ? (
                <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">保存済みのお知らせはありません。</p>
              ) : announcements.map((announcement) => (
                <article key={announcement.id} className="rounded-lg border border-slate-100 bg-white/80 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-black text-slate-950">{announcement.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{announcement.body}</p>
                      <p className="mt-2 text-xs font-bold text-slate-400">{dateFormatter.format(announcement.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {announcement.published && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">公開中</span>}
                      {announcement.pinned && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">固定</span>}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <form action={updateAnnouncementStatus} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="id" value={announcement.id} />
                      <label className="inline-flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="published" defaultChecked={announcement.published} />公開</label>
                      <label className="inline-flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="pinned" defaultChecked={announcement.pinned} />固定</label>
                      <button className="btn-secondary min-h-0 px-3 py-2 text-sm" type="submit">更新</button>
                    </form>
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={announcement.id} />
                      <button className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-black text-red-700 transition hover:bg-red-50" type="submit">
                        削除
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
