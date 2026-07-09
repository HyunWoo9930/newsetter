import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, notFound } from "@/lib/http";

// 크루 탈퇴.
// - 일반 멤버: 즉시 탈퇴
// - 크루장: 다른 멤버가 남아 있으면 불가(위임 기능 전까지), 혼자면 크루 자체 삭제(cascade)
export async function POST(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  const membership = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId, userId } },
  });
  if (!membership || membership.status !== "APPROVED") return notFound("멤버십");

  if (membership.role === "LEADER") {
    const others = await prisma.crewMember.count({
      where: { crewId, status: "APPROVED", NOT: { userId } },
    });
    if (others > 0) return error("크루장은 다른 멤버가 있는 동안 탈퇴할 수 없어요", 409);
    await prisma.crew.delete({ where: { id: crewId } });
    return json({ ok: true, crewDeleted: true });
  }

  await prisma.crewMember.delete({ where: { id: membership.id } });
  return json({ ok: true, crewDeleted: false });
}
