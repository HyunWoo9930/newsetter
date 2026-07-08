import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, notFound } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";

// 크루 상세 (멤버만 조회 가능)
export async function GET(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  const membership = await getApprovedMembership(crewId, userId);
  if (!membership) return forbidden();

  const crew = await prisma.crew.findUnique({
    where: { id: crewId },
    include: {
      members: {
        where: { status: "APPROVED" },
        include: { user: { select: { id: true, nickname: true, profileImg: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { members: true } },
    },
  });
  if (!crew) return notFound("크루");
  return json(crew);
}
