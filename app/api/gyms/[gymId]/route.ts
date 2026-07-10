import { prisma } from "@/lib/prisma";
import { json, notFound, unauthorized } from "@/lib/http";
import { getCurrentUserId } from "@/lib/auth";
import { getApprovedMembership } from "@/lib/crew";
import { computeVisitRecency } from "@/lib/newset";

// 암장 상세. ?crewId= 면 그 크루 기준, 없으면 내 개인 기록 기준 "간 지 몇 주 / 또 갈 때".
export async function GET(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { gymId } = await params;
  const { searchParams } = new URL(req.url);
  const crewId = searchParams.get("crewId");

  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    include: {
      settings: { orderBy: { setDate: "desc" }, take: 10 },
    },
  });
  if (!gym) return notFound("암장");

  const ratingAgg = await prisma.review.aggregate({
    where: { gymId },
    _avg: { rating: true },
    _count: true,
  });

  const now = new Date();
  let recency = computeVisitRecency(null, gym.resetCycleWeeks);
  if (crewId) {
    // 크루 기준: 멤버만. 미래(예정) 방문은 아직 안 간 것이므로 제외.
    if (!(await getApprovedMembership(crewId, userId))) return unauthorized();
    const lastVisit = await prisma.visit.findFirst({ where: { crewId, gymId, date: { lte: now } }, orderBy: { date: "desc" }, select: { date: true } });
    recency = computeVisitRecency(lastVisit?.date ?? null, gym.resetCycleWeeks);
  } else {
    // 개인 기준: 내가 만든 개인 기록 + 내가 참석한 크루 일정 중 지난 것.
    const lastVisit = await prisma.visit.findFirst({
      where: { gymId, date: { lte: now }, OR: [{ createdById: userId, crewId: null }, { attendees: { some: { userId } } }] },
      orderBy: { date: "desc" }, select: { date: true },
    });
    recency = computeVisitRecency(lastVisit?.date ?? null, gym.resetCycleWeeks);
  }

  return json({
    ...gym,
    rating: {
      avg: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
      count: ratingAgg._count,
    },
    recency,
  });
}
