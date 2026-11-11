import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const source = readFileSync(join(__dirname, "../../public/sw.js"), "utf8");

function createWorker(fetchImpl = async () => new Response("online")) {
  const listeners = new Map();
  const cacheNames = new Set();
  const cacheEntries = new Map();
  let claimed = false;
  let skippedWaiting = false;

  const cacheKey = (name, path) => `${name}:${path}`;
  const caches = {
    async open(name) {
      cacheNames.add(name);
      return {
        async add(path) {
          cacheEntries.set(cacheKey(name, path), new Response("offline page"));
        },
      };
    },
    async keys() {
      return [...cacheNames];
    },
    async delete(name) {
      cacheNames.delete(name);
      for (const key of cacheEntries.keys()) {
        if (key.startsWith(`${name}:`)) cacheEntries.delete(key);
      }
      return true;
    },
    async match(path) {
      const entry = [...cacheEntries.entries()].find(([key]) =>
        key.endsWith(`:${path}`),
      );
      return entry?.[1].clone();
    },
  };

  const self = {
    location: { origin: "https://subsclist.example" },
    clients: {
      claim: async () => {
        claimed = true;
      },
    },
    skipWaiting: async () => {
      skippedWaiting = true;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };

  vm.runInNewContext(source, {
    self,
    caches,
    fetch: fetchImpl,
    URL,
    Response,
    Promise,
  });

  return {
    listeners,
    cacheEntries,
    cacheNames,
    get claimed() {
      return claimed;
    },
    get skippedWaiting() {
      return skippedWaiting;
    },
  };
}

test("install precaches only the generic offline page", async () => {
  const worker = createWorker();
  let installation;
  worker.listeners.get("install")({
    waitUntil(promise) {
      installation = promise;
    },
  });
  await installation;

  assert.deepEqual([...worker.cacheNames], ["subsclist-shell-v1"]);
  assert.deepEqual(
    [...worker.cacheEntries.keys()],
    ["subsclist-shell-v1:/offline.html"],
  );
  assert.equal(worker.skippedWaiting, true);
});

test("activation removes only old SubscList shell caches", async () => {
  const worker = createWorker();
  worker.cacheNames.add("subsclist-shell-old");
  worker.cacheNames.add("another-app-cache");
  let activation;
  worker.listeners.get("activate")({
    waitUntil(promise) {
      activation = promise;
    },
  });
  await activation;

  assert.deepEqual([...worker.cacheNames].sort(), ["another-app-cache"]);
  assert.equal(worker.claimed, true);
});

test("offline navigation returns the generic page without caching private pages", async () => {
  const worker = createWorker(async () => {
    throw new TypeError("offline");
  });
  worker.cacheNames.add("subsclist-shell-v1");
  worker.cacheEntries.set(
    "subsclist-shell-v1:/offline.html",
    new Response("offline page"),
  );
  let responsePromise;

  worker.listeners.get("fetch")({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://subsclist.example/dashboard",
    },
    respondWith(promise) {
      responsePromise = promise;
    },
  });

  const response = await responsePromise;
  assert.equal(await response.text(), "offline page");
  assert.deepEqual(
    [...worker.cacheEntries.keys()],
    ["subsclist-shell-v1:/offline.html"],
  );
});

test("online navigation uses the network and API requests bypass the worker", async () => {
  let fetchCount = 0;
  const worker = createWorker(async () => {
    fetchCount += 1;
    return new Response("fresh page");
  });
  let responsePromise;

  worker.listeners.get("fetch")({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://subsclist.example/dashboard",
    },
    respondWith(promise) {
      responsePromise = promise;
    },
  });
  assert.equal(await (await responsePromise).text(), "fresh page");

  let apiIntercepted = false;
  worker.listeners.get("fetch")({
    request: {
      method: "GET",
      mode: "cors",
      url: "https://subsclist.example/api/subscriptions",
    },
    respondWith() {
      apiIntercepted = true;
    },
  });

  assert.equal(apiIntercepted, false);
  assert.equal(fetchCount, 1);
  assert.equal(worker.cacheEntries.size, 0);
});
