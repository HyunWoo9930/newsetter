import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";

// 암장 색 → 공통척도(vGrade) 집계 + 내 투표.
// 페인 1(암장 간 난이도 보정)의 데이터 소스.
export async function GET(_req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { gymId } = await params;

  const [agg, mine] = await Promise.all([
    prisma.colorGradeVote.groupBy({
      by: ["color"],
      where: { gymId },
      _avg: { vGrade: true },
      _count: true,
    }),
    prisma.colorGradeVote.findMany({
      where: { gymId, userId },
      select: { color: true, vGrade: true },
    }),
  ]);

  const myMap = Object.fromEntries(mine.map((m) => [m.color, m.vGrade]));
  const colors = agg
    .map((r) => ({
      color: r.color,
      avgVGrade: r._avg.vGrade != null ? Math.round(r._avg.vGrade * 10) / 10 : null,
      voteCount: r._count,
      myVGrade: myMap[r.color] ?? null,
    }))
    .sort((a, b) => (a.avgVGrade ?? Infinity) - (b.avgVGrade ?? Infinity));

  return json({ gymId, colors });
}

const schema = z.object({
  color: z.string().min(1, "색을 입력해주세요").max(20),
  vGrade: z.number().int().min(0, "등급이 올바르지 않습니다").max(20),
});

// 색 등급 투표 (유저당 암장·색당 1개 → upsert)
export async function POST(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { gymId } = await params;

  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) return notFound("암장");

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { color, vGrade } = parsed.data;

  const vote = await prisma.colorGradeVote.upsert({
    where: { gymId_color_userId: { gymId, color, userId } },
    update: { vGrade },
    create: { gymId, color, userId, vGrade },
  });
  return json(vote, 201);
}
