import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, notFound } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";

// 방문 기록 삭제 — 실수 탭으로 생긴 기록을 정리할 수 있게 (멤버 누구나)
export async function DELETE(_req: Request, { params }: { params: Promise<{ crewId: string; visitId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId, visitId } = await params;

  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const visit = await prisma.visit.findUnique({ where: { id: visitId }, select: { id: true, crewId: true } });
  if (!visit || visit.crewId !== crewId) return notFound("방문 기록");

  await prisma.visit.delete({ where: { id: visitId } });
  return json({ ok: true });
}
