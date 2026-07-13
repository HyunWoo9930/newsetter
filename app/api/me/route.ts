import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";
import { estimateUserAbility } from "@/lib/ability";
import { logEvent } from "@/lib/activity";

// 내 프로필 + 실력 추정치
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { homeGym: { select: { id: true, name: true } } },
  });
  if (!user) return notFound("유저");

  const [ability, myReviewCount, myLogCount, favoriteCount, myVisitCount] = await Promise.all([
    estimateUserAbility(userId),
    prisma.review.count({ where: { userId } }),
    prisma.climbLog.count({ where: { userId } }),
    prisma.gymFavorite.count({ where: { userId } }),
    // 내 기록 = 개인 기록 + 내가 참석한 크루 일정
    prisma.visit.count({
      where: {
        OR: [
          { crewId: null, createdById: userId },
          { attendees: { some: { userId } } },
        ],
      },
    }),
  ]);
  return json({ ...user, ability, stats: { myReviewCount, myLogCount, favoriteCount, myVisitCount } });
}

const schema = z.object({
  nickname: z.string().min(1).max(20).optional(),
  homeGymId: z.string().nullable().optional(),
  referenceColor: z.string().max(20).nullable().optional(),
  referenceGrade: z.number().int().min(0).max(20).nullable().optional(),
  feedbackIntroSeen: z.literal(true).optional(), // 문의하기 안내 모달을 봤음 (1회성 — 되돌리기 없음)
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
      ...(d.feedbackIntroSeen ? { feedbackIntroSeenAt: new Date() } : {}),
    },
    include: { homeGym: { select: { id: true, name: true } } },
  });
  return json(user);
}

// 회원 탈퇴 — 내 계정과 관련 데이터 삭제.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  await logEvent("account_delete", { userId, meta: { userId } });
  await prisma.$transaction(async (tx) => {
    // 내가 크루장인 크루 통째 삭제(멤버·투표·방문·홈짐 cascade). 크루장 위임 대신 삭제.
    await tx.crew.deleteMany({ where: { leaderId: userId } });
    // 다른 크루에서 내가 만든 투표 삭제(creatorId FK).
    await tx.poll.deleteMany({ where: { creatorId: userId } });
    // 나머지(멤버십·표·리뷰·완등로그·즐겨찾기·푸시·색보정·응답·참석)는 User cascade,
    // 내가 만든 방문/제보한 세팅/등록한 문제는 SetNull 로 보존.
    await tx.user.delete({ where: { id: userId } });
  });
  return json({ ok: true });
}
