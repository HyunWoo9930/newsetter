import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized } from "@/lib/http";
import { computeVisitRecency } from "@/lib/newset";

// 개인 기준 암장 목록 + 뉴셋 상태 (크루 gyms 라우트와 같은 shape — UI 재사용).
// 마지막 방문 = 내 개인 기록 ∪ 내가 참석한 크루 일정. isHome 자리는 즐겨찾기.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const [gyms, myVisits, reviewAgg, favorites] = await Promise.all([
    prisma.gym.findMany({
      include: { settings: { orderBy: { setDate: "desc" }, take: 1 } },
    }),
    prisma.visit.findMany({
      where: {
        date: { lte: new Date() },
        OR: [
          { crewId: null, createdById: userId },
          { attendees: { some: { userId } } },
        ],
      },
      select: { gymId: true, date: true },
    }),
    prisma.review.groupBy({ by: ["gymId"], _avg: { rating: true }, _count: true }),
    prisma.gymFavorite.findMany({ where: { userId }, select: { gymId: true } }),
  ]);

  const lastVisitByGym = new Map<string, Date>();
  for (const v of myVisits) {
    const cur = lastVisitByGym.get(v.gymId);
    if (!cur || v.date > cur) lastVisitByGym.set(v.gymId, v.date);
  }
  const ratingByGym = new Map(reviewAgg.map((r) => [r.gymId, r]));
  const favSet = new Set(favorites.map((f) => f.gymId));

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
      isHome: favSet.has(g.id), // 개인 모드에선 즐겨찾기가 홈 암장 역할 (UI 호환)
      isFavorite: favSet.has(g.id),
      latestSetting: g.settings[0] ?? null,
      resetCycleWeeks: g.resetCycleWeeks,
      rating: r?._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null,
      reviewCount: r?._count ?? 0,
      lastVisit: lastVisitByGym.get(g.id) ?? null,
      ...rec,
    };
  });

  rows.sort((a, b) => {
    if (a.dueForReset !== b.dueForReset) return a.dueForReset ? -1 : 1;
    const aw = a.weeksSinceVisit == null ? Infinity : a.weeksSinceVisit;
    const bw = b.weeksSinceVisit == null ? Infinity : b.weeksSinceVisit;
    if (aw !== bw) return bw - aw;
    return a.name.localeCompare(b.name);
  });

  return json(rows);
}
