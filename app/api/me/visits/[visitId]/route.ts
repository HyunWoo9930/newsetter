import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, notFound } from "@/lib/http";
import { logEvent } from "@/lib/activity";

// 개인 방문 기록 삭제 — 내 개인 기록(crewId null)만. 크루 일정은 /api/visits/:id 로.
export async function DELETE(_req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { visitId } = await params;

  const visit = await prisma.visit.findUnique({ where: { id: visitId }, select: { id: true, crewId: true, createdById: true } });
  if (!visit) return notFound("기록");
  if (visit.crewId !== null || visit.createdById !== userId) return error("내 개인 기록만 삭제할 수 있어요", 403);

  await prisma.visit.delete({ where: { id: visitId } });
  await logEvent("visit_cancel", { userId, req: _req, meta: { visitId, personal: true } });
  return json({ ok: true });
}
