// 프로브용 헬스체크 — 인증/DB 없이 프로세스 생존만 확인(가볍고 항상 200).
// DB 장애가 앱 파드 재시작을 유발하지 않도록 일부러 DB 는 건드리지 않음.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
