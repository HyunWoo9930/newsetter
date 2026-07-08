import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { computeVisitRecency } from "@/lib/newset";

// 크루 기준 암장 목록 + 뉴셋 상태.
// "가야 할 암장"(뉴셋 됐는데 이번 셋 미방문) 이 위로 오도록 정렬.
export async function GET(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const [gyms, visitAgg, reviewAgg, homeGyms] = await Promise.all([
    prisma.gym.findMany({
      include: { settings: { orderBy: { setDate: "desc" }, take: 1 } },
    }),
    prisma.visit.groupBy({
      by: ["gymId"],
      where: { crewId },
      _max: { date: true },
    }),
    prisma.review.groupBy({ by: ["gymId"], _avg: { rating: true }, _count: true }),
    prisma.crewHomeGym.findMany({ where: { crewId }, select: { gymId: true } }),
  ]);

  const lastVisitByGym = new Map(visitAgg.map((v) => [v.gymId, v._max.date]));
  const ratingByGym = new Map(reviewAgg.map((r) => [r.gymId, r]));
  const homeSet = new Set(homeGyms.map((h) => h.gymId));

  const rows = gyms.map((g) => {
    const rec = computeVisitRecency(lastVisitByGym.get(g.id) ?? null, g.resetCycleWeeks);
    const r = ratingByGym.get(g.id);
    return {
      id: g.id,
      name: g.name,
      address: g.address,
      lat: g.lat,
      lng: g.lng,
      instagram: g.instagram,
      isHome: homeSet.has(g.id),
      latestSetting: g.settings[0] ?? null,
      resetCycleWeeks: g.resetCycleWeeks,
      rating: r?._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null,
      reviewCount: r?._count ?? 0,
      lastVisit: lastVisitByGym.get(g.id) ?? null,
      ...rec,
    };
  });

  // 정렬: (1) 또 갈 때 된 곳 먼저 → (2) 오래 안 간 순(안 가본 곳 최우선) → (3) 이름
  rows.sort((a, b) => {
    if (a.dueForReset !== b.dueForReset) return a.dueForReset ? -1 : 1;
    const aw = a.weeksSinceVisit == null ? Infinity : a.weeksSinceVisit;
    const bw = b.weeksSinceVisit == null ? Infinity : b.weeksSinceVisit;
    if (aw !== bw) return bw - aw;
    return a.name.localeCompare(b.name);
  });

  return json(rows);
}
