const japaneseTextPattern = /[\u3040-\u30ff\u3400-\u9fff]/;

export function userMessage(message: string | null | undefined, fallback: string) {
  const text = message?.trim();
  if (!text) return fallback;
  if (japaneseTextPattern.test(text)) return text;

  const lower = text.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) {
    return "通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。";
  }
  if (lower.includes("currenttarget") || lower.includes("current target") || lower.includes("reset")) {
    return "フォームの送信処理に失敗しました。もう一度お試しください。";
  }
  if (lower.includes("unexpected token") || lower.includes("json")) {
    return "サーバーからの応答を読み取れませんでした。時間をおいてもう一度お試しください。";
  }
  if (lower.includes("is not set") || lower.includes("missing")) {
    return "必要な設定が不足しています。管理者に設定内容の確認を依頼してください。";
  }
  if (lower.includes("must be at least") || lower.includes("too short")) {
    return "入力値が短すぎます。内容を確認してください。";
  }
  if (lower.includes("invalid")) {
    return "入力内容または設定内容が正しくありません。内容を確認してください。";
  }
  if (lower.includes("unauthorized") || lower.includes("forbidden")) {
    return "操作する権限がありません。ログイン状態を確認してください。";
  }
  if (lower.includes("not found")) {
    return "対象のデータが見つかりませんでした。";
  }

  return fallback;
}

export function userErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return userMessage(error.message, fallback);
  if (typeof error === "string") return userMessage(error, fallback);
  return fallback;
}
