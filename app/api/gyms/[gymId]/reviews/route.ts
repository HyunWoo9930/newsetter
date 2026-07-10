import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { rateLimit } from "@/lib/ratelimit";
import { tooMany } from "@/lib/http";
import { logEvent } from "@/lib/activity";

// 암장 리뷰 목록 (?settingId= 로 특정 세팅 회차 리뷰만) — 로그인 필요(리뷰어 프로필 노출)
export async function GET(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
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
  tags: z.array(z.string().max(20)).max(10).optional(),
  content: z.string().max(1000).optional(),
  gymSettingId: z.string().nullish(), // 이번 셋 리뷰면 세팅 회차 연결 (개인모드 등에서 null 가능)
  crewId: z.string().nullish(),        // 개인모드는 null
});

// 리뷰 작성 (같은 회차엔 한 번 — 재작성 시 갱신)
export async function POST(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { gymId } = await params;

  if (!rateLimit(`review:${userId}`, 30, 3600_000)) return tooMany();
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) return notFound("암장");

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  // 세팅 회차 유효성 (해당 암장 것인지) — 잘못된 id 로 FK 500 나는 것 방지
  if (d.gymSettingId) {
    const setting = await prisma.gymSetting.findUnique({ where: { id: d.gymSettingId }, select: { gymId: true } });
    if (!setting || setting.gymId !== gymId) return error("세팅 정보가 올바르지 않아요", 422);
  }
  // 크루 id 를 붙일 땐 그 크루 멤버여야
  if (d.crewId && !(await getApprovedMembership(d.crewId, userId))) return error("크루 정보가 올바르지 않아요", 422);

  // 같은 유저·암장·세팅 리뷰가 있으면 갱신(중복 방지), 없으면 생성
  const existing = await prisma.review.findFirst({ where: { userId, gymId, gymSettingId: d.gymSettingId ?? null }, select: { id: true } });
  const data = { rating: d.rating, tags: d.tags ?? [], content: d.content || null, crewId: d.crewId ?? null };
  const review = existing
    ? await prisma.review.update({ where: { id: existing.id }, data, include: { user: { select: { id: true, nickname: true, profileImg: true } } } })
    : await prisma.review.create({ data: { userId, gymId, gymSettingId: d.gymSettingId ?? null, ...data }, include: { user: { select: { id: true, nickname: true, profileImg: true } } } });
  await logEvent("review_create", { userId, req, meta: { gymId, rating: d.rating, updated: !!existing } });
  return json(review, existing ? 200 : 201);
}
