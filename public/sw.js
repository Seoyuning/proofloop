// ProofLoop 서비스워커 — 설치형 PWA + 안전한 네트워크 우선 캐싱
// 같은 출처의 GET 페이지/정적자원만 캐시한다. API·인증·외부(Supabase 등)는 캐시하지 않음.
const CACHE = "proofloop-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 외부(Supabase, 폰트 CDN 등) 건너뜀
  if (url.pathname.startsWith("/api/")) return; // API 응답은 절대 캐시하지 않음

  // 네트워크 우선 → 온라인이면 항상 최신, 실패 시 캐시 폴백 (오프라인 대비)
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
