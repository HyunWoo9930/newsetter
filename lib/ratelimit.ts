// 단일 파드용 인메모리 레이트리밋 (슬라이딩 윈도우). events.ts 처럼 globalThis 에 보관.
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
const store: Map<string, number[]> = g.__setterRL ?? (g.__setterRL = new Map());

// key 에 대해 windowMs 안 limit 회 초과면 false. 가끔 오래된 키를 정리.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { store.set(key, arr); return false; }
  arr.push(now);
  store.set(key, arr);
  if (store.size > 5000) { for (const [k, v] of store) { if (v.every((t) => now - t > windowMs)) store.delete(k); } }
  return true;
}

// Traefik(x-forwarded-for) 뒤 클라이언트 IP
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
