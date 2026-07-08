import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";
import { estimateUserAbility } from "@/lib/ability";

// 내 프로필 + 실력 추정치
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { homeGym: { select: { id: true, name: true } } },
  });
  if (!user) return notFound("유저");

  const ability = await estimateUserAbility(userId);
  return json({ ...user, ability });
}

const schema = z.object({
  nickname: z.string().min(1).max(20).optional(),
  homeGymId: z.string().nullable().optional(),
  referenceColor: z.string().max(20).nullable().optional(),
  referenceGrade: z.number().int().min(0).max(20).nullable().optional(),
});

// 프로필 수정 (홈짐/기준 등급 등 개인화 기준점)
export async function PATCH(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  if (d.homeGymId) {
    const gym = await prisma.gym.findUnique({ where: { id: d.homeGymId }, select: { id: true } });
    if (!gym) return notFound("암장");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(d.nickname !== undefined ? { nickname: d.nickname } : {}),
      ...(d.homeGymId !== undefined ? { homeGymId: d.homeGymId } : {}),
      ...(d.referenceColor !== undefined ? { referenceColor: d.referenceColor } : {}),
      ...(d.referenceGrade !== undefined ? { referenceGrade: d.referenceGrade } : {}),
    },
    include: { homeGym: { select: { id: true, name: true } } },
  });
  return json(user);
}
