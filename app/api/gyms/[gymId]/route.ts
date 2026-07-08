import { prisma } from "@/lib/prisma";
import { json, notFound } from "@/lib/http";
import { computeVisitRecency } from "@/lib/newset";

// 암장 상세. ?crewId= 를 주면 그 크루의 "간 지 몇 주 / 또 갈 때인지"까지 계산.
export async function GET(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
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

  let recency = computeVisitRecency(null, gym.resetCycleWeeks);
  if (crewId) {
    const lastVisit = await prisma.visit.findFirst({
      where: { crewId, gymId },
      orderBy: { date: "desc" },
      select: { date: true },
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
