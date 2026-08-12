"use client";

import { useState } from "react";
import { userErrorMessage, userMessage } from "@/lib/error-messages";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string; sent?: number; failed?: number; total?: number };
  if (!response.ok) throw new Error(userMessage(data.message, "送信に失敗しました。"));
  return data;
}

export function AdminBulkEmailForm() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientScope, setRecipientScope] = useState<"VERIFIED" | "ALL" | "PREMIUM">("VERIFIED");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!subject.trim() || !body.trim()) {
      setError("件名と本文を入力してください。");
      return;
    }

    setLoading(true);
    try {
      const data = await postJson("/api/admin/bulk-email", { subject, body, recipientScope });
      setMessage(`送信完了: ${data.sent ?? 0}/${data.total ?? 0}件。失敗 ${data.failed ?? 0}件。`);
    } catch (err) {
      setError(userErrorMessage(err, "一斉メールを送信できませんでした。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <label className="block">
        <span className="text-sm font-bold text-slate-700">送信対象</span>
        <select value={recipientScope} onChange={(event) => setRecipientScope(event.target.value as "VERIFIED" | "ALL" | "PREMIUM")} className="input mt-1">
          <option value="VERIFIED">認証済みユーザー全員</option>
          <option value="PREMIUM">Premiumユーザーのみ</option>
          <option value="ALL">全ユーザー</option>
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-bold text-slate-700">件名</span>
        <input value={subject} onChange={(event) => setSubject(event.target.value)} className="input mt-1" maxLength={120} required />
      </label>
      <label className="block">
        <span className="text-sm font-bold text-slate-700">本文</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} className="input mt-1 min-h-44" maxLength={5000} required />
      </label>
      <p className="text-xs leading-5 text-slate-500">送信元は SubscList &lt;saas.system.shinji@gmail.com&gt; です。宛先漏えい防止のため、ユーザーごとに個別送信します。</p>
      <button disabled={loading} className="btn-primary" type="submit">
        {loading ? "送信中..." : "一斉メールを送信"}
      </button>
    </form>
  );
}

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!name.trim() || !email.includes("@") || !messageBody.trim()) {
      setError("お名前、メールアドレス、お問い合わせ内容を入力してください。");
      return;
    }

    setLoading(true);
    try {
      const data = await postJson("/api/contact", { name, email, message: messageBody, website });
      setMessage(data.message ?? "お問い合わせを送信しました。");
      setName("");
      setEmail("");
      setMessageBody("");
      setWebsite("");
    } catch (err) {
      setError(userErrorMessage(err, "お問い合わせを送信できませんでした。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <label className="block">
        <span className="text-sm font-bold text-slate-700">お名前</span>
        <input value={name} onChange={(event) => setName(event.target.value)} className="input mt-1" maxLength={100} required />
      </label>
      <label className="block">
        <span className="text-sm font-bold text-slate-700">メールアドレス</span>
        <input value={email} onChange={(event) => setEmail(event.target.value)} className="input mt-1" type="email" maxLength={255} required />
      </label>
      <label className="block">
        <span className="text-sm font-bold text-slate-700">お問い合わせ内容</span>
        <textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} className="input mt-1 min-h-40" maxLength={2000} required />
      </label>
      <div className="hidden" aria-hidden="true">
        <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" name="website" />
      </div>
      <p className="text-xs leading-5 text-slate-500">送信先: saas.system.shinji@gmail.com</p>
      <button disabled={loading} className="btn-primary" type="submit">
        {loading ? "送信中..." : "問い合わせを送信"}
      </button>
    </form>
  );
}
