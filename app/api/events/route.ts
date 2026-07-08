import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { onCrews, type CrewEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// SSE: 내가 속한 크루들의 실시간 이벤트 스트림 (투표 생성/응답/마감, 일정 생성/변경/취소/참여)
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const memberships = await prisma.crewMember.findMany({
    where: { userId, status: "APPROVED" },
    select: { crewId: true },
  });
  const crewIds = memberships.map((m) => m.crewId);

  const encoder = new TextEncoder();
  let unsub = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ }
      };
      send({ type: "hello", crewIds }); // 연결 확인

      unsub = onCrews(crewIds, (e: CrewEvent) => {
        // 본인이 유발한 이벤트는 스킵(에코 방지)
        if ((e as { userId?: string }).userId === userId) return;
        send(e);
      });

      // 25초마다 keep-alive 코멘트 (프록시 타임아웃 방지)
      ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { /* closed */ }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        unsub();
        if (ping) clearInterval(ping);
        try { controller.close(); } catch { /* already */ }
      });
    },
    cancel() {
      unsub();
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
