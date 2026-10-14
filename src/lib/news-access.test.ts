import assert from "node:assert/strict";
import test from "node:test";
import { accessibleNewsServiceIds } from "./news-access.ts";

test("本人の紐付け済み契約と完全一致する契約だけをニュース対象にする", () => {
  const serviceIds = accessibleNewsServiceIds({
    subscriptions: [
      { name: "ChatGPT", serviceMasterId: "service_chatgpt" },
      { name: "  GITHUB\u3000COPILOT  ", serviceMasterId: null },
      { name: "未対応サービス", serviceMasterId: null },
    ],
    services: [
      { id: "service_chatgpt", name: "ChatGPT" },
      { id: "service_github-copilot", name: "GitHub Copilot" },
      { id: "service_claude", name: "Claude" },
    ],
  });
  assert.deepEqual(serviceIds.sort(), ["service_chatgpt", "service_github-copilot"]);
});

test("契約がなければニュース対象も空にする", () => {
  assert.deepEqual(accessibleNewsServiceIds({ subscriptions: [], services: [{ id: "service_chatgpt", name: "ChatGPT" }] }), []);
});
