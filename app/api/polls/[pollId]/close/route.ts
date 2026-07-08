import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, notFound } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { settingIdForVisit } from "@/lib/gym";
import { emitCrew } from "@/lib/events";

// 투표 마감 → 최소 불가표(날짜) + 최다 선호(암장) 확정 → 방문(일정) 자동 생성.
// 투표를 만든 사람만 마감 가능.
export async function POST(_req: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { pollId } = await params;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      dateOptions: { include: { _count: { select: { votes: true } }, votes: { select: { userId: true } } } },
      gymOptions: { include: { _count: { select: { votes: true } } } },
    },
  });
  if (!poll) return notFound("투표");
  if (poll.status === "CLOSED") return error("이미 마감된 투표입니다", 409);
  if (!(await getApprovedMembership(poll.crewId, userId))) return forbidden();

  // #1 투표를 만든 사람만 마감 가능
  if (poll.creatorId !== userId) return error("투표를 만든 사람만 마감할 수 있어요", 403);

  if (poll.dateOptions.length === 0) {
    return error("날짜 후보가 없어 확정할 수 없습니다", 422);
  }

  // 날짜: 표 = "안 되는(불가) 사람" 이므로 최소 득표(=가장 적게 불가한 날) 확정, 동점이면 이른 날짜
  const winnerDate = [...poll.dateOptions].sort((a, b) => {
    const diff = a._count.votes - b._count.votes;
    return diff !== 0 ? diff : a.date.getTime() - b.date.getTime();
  })[0];

  // 암장: 최다 득표 (후보 없으면 날짜만 확정)
  const winnerGym = poll.gymOptions.length
    ? [...poll.gymOptions].sort((a, b) => b._count.votes - a._count.votes)[0]
    : null;

  const updatedPoll = await prisma.poll.update({
    where: { id: pollId },
    data: {
      status: "CLOSED",
      confirmedDate: winnerDate.date,
      confirmedGymId: winnerGym?.gymId ?? null,
    },
  });

  let visit = null;
  if (winnerGym) {
    const settingId = await settingIdForVisit(winnerGym.gymId, winnerDate.date);
    visit = await prisma.visit.create({
      data: {
        crewId: poll.crewId,
        gymId: winnerGym.gymId,
        gymSettingId: settingId,
        date: winnerDate.date,
        source: "VOTE",
        createdById: userId,
      },
    });

    // #4 확정된 날짜에 X(불가) 안 한 승인 크루원을 자동 참석으로 등록
    const xedUsers = new Set(winnerDate.votes.map((v) => v.userId));
    const members = await prisma.crewMember.findMany({
      where: { crewId: poll.crewId, status: "APPROVED" },
      select: { userId: true },
    });
    const goingUserIds = members.map((m) => m.userId).filter((uid) => !xedUsers.has(uid));
    if (goingUserIds.length) {
      await prisma.visitAttendee.createMany({
        data: goingUserIds.map((uid) => ({ visitId: visit!.id, userId: uid })),
        skipDuplicates: true,
      });
    }
  }

  emitCrew(poll.crewId, { type: "poll_closed", pollId, title: poll.title, visitId: visit?.id ?? null });

  return json({ poll: updatedPoll, visit });
}
