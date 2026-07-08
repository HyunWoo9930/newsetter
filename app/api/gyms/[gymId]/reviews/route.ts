import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";

// 암장 리뷰 목록 (?settingId= 로 특정 세팅 회차 리뷰만)
export async function GET(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  const { searchParams } = new URL(req.url);
  const settingId = searchParams.get("settingId");

  const reviews = await prisma.review.findMany({
    where: { gymId, ...(settingId ? { gymSettingId: settingId } : {}) },
    include: { user: { select: { id: true, nickname: true, profileImg: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json(reviews);
}

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string()).max(10).optional(),
  content: z.string().max(1000).optional(),
  gymSettingId: z.string().optional(), // 이번 셋 리뷰면 세팅 회차 연결
  crewId: z.string().optional(),
});

// 리뷰 작성
export async function POST(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { gymId } = await params;

  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) return notFound("암장");

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  const review = await prisma.review.create({
    data: {
      userId,
      gymId,
      gymSettingId: d.gymSettingId || null,
      crewId: d.crewId || null,
      rating: d.rating,
      tags: d.tags ?? [],
      content: d.content || null,
    },
    include: { user: { select: { id: true, nickname: true, profileImg: true } } },
  });
  return json(review, 201);
}
