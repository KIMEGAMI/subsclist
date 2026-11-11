"use client";

import { useEffect, useState } from "react";

type InstallOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "dismissed") setShowInstructions(true);
    } catch {
      setShowInstructions(true);
    } finally {
      setInstallPrompt(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={install}
        className="pwa-install-button fixed bottom-4 right-4 z-40 flex min-h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-xl shadow-slate-950/20 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        title="SubscListをアプリとして追加"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          &#8595;
        </span>
        アプリを追加
      </button>
      {showInstructions && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setShowInstructions(false);
          }}
        >
          <section
            aria-labelledby="pwa-install-title"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl"
            role="dialog"
          >
            <h2 id="pwa-install-title" className="text-lg font-black">
              SubscListをホーム画面に追加
            </h2>
            {isAppleMobile() ? (
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
                <li>ブラウザーの共有ボタンをタップします。</li>
                <li>「ホーム画面に追加」を選びます。</li>
                <li>右上の「追加」をタップします。</li>
              </ol>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-700">
                ブラウザーのメニューを開き、「アプリをインストール」または「ホーム画面に追加」を選んでください。表示される項目名はブラウザーによって異なります。
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="btn-primary mt-6 w-full justify-center"
            >
              閉じる
            </button>
          </section>
        </div>
      )}
    </>
  );
}
