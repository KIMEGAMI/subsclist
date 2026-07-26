"use client";

import { useMemo, useState } from "react";
import { DASHBOARD_ANNOUNCEMENT_PAGE_SIZE } from "@/lib/app-constants";

type DashboardAnnouncement = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: Date | string;
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(value: Date | string) {
  return dateFormatter.format(new Date(value));
}

function pageNumbers(total: number) {
  return Array.from({ length: total }, (_, index) => index + 1);
}

export function DashboardAnnouncements({ announcements }: { announcements: DashboardAnnouncement[] }) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(announcements.length / DASHBOARD_ANNOUNCEMENT_PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const visibleAnnouncements = useMemo(() => {
    const start = (safePage - 1) * DASHBOARD_ANNOUNCEMENT_PAGE_SIZE;
    return announcements.slice(start, start + DASHBOARD_ANNOUNCEMENT_PAGE_SIZE);
  }, [announcements, safePage]);

  const moveTo = (page: number) => {
    setCurrentPage(Math.min(pageCount, Math.max(1, page)));
  };

  return (
    <section className="h-full rounded-lg border border-slate-900 bg-slate-950 p-4 text-white shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-cyan-200">NOTICE BOARD</p>
          <h2 className="mt-1 text-base font-black">管理者からのお知らせ</h2>
        </div>
        <span className="shrink-0 rounded-full bg-cyan-200 px-2 py-1 text-xs font-black text-slate-950">管理者</span>
      </div>

      {visibleAnnouncements.length > 0 ? (
        <div className="mt-3 divide-y divide-white/15">
          {visibleAnnouncements.map((announcement) => (
            <div key={announcement.id} className="py-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="truncate text-sm font-black text-white" title={announcement.title}>
                  {announcement.title}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {announcement.pinned && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-black text-black">固定</span>}
                  <time className="text-xs font-bold text-cyan-100">{formatDate(announcement.createdAt)}</time>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-white/15 bg-white/10 p-3 text-sm font-bold text-white">
          現在、掲載中のお知らせはありません。
        </p>
      )}

      {pageCount > 1 && (
        <nav className="mt-4 flex flex-wrap items-center justify-start gap-2" aria-label="お知らせのページ送り">
          <button
            type="button"
            onClick={() => moveTo(safePage - 1)}
            disabled={safePage === 1}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-black text-white transition hover:bg-white/20 disabled:bg-white/5 disabled:text-slate-500"
            aria-label="前のページ"
          >
            ←
          </button>

          {pageNumbers(pageCount).map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => moveTo(page)}
              className={
                page === safePage
                  ? "rounded-lg bg-cyan-200 px-3 py-2 text-sm font-black text-slate-950"
                  : "rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-black text-white transition hover:bg-white/20"
              }
              aria-current={page === safePage ? "page" : undefined}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            onClick={() => moveTo(safePage + 1)}
            disabled={safePage === pageCount}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-black text-white transition hover:bg-white/20 disabled:bg-white/5 disabled:text-slate-500"
            aria-label="次のページ"
          >
            →
          </button>
        </nav>
      )}
    </section>
  );
}
