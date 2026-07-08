import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, notFound } from "@/lib/http";
import { isCrewLeader } from "@/lib/crew";
import { settingIdForVisit } from "@/lib/gym";

// 투표 마감 → 최다 득표 (날짜 + 암장) 확정 → 방문 기록 자동 생성.
// 크루장 또는 투표 생성자만 마감 가능.
export async function POST(_req: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { pollId } = await params;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      dateOptions: { include: { _count: { select: { votes: true } } } },
      gymOptions: { include: { _count: { select: { votes: true } } } },
    },
  });
  if (!poll) return notFound("투표");
  if (poll.status === "CLOSED") return error("이미 마감된 투표입니다", 409);

  const isLeader = await isCrewLeader(poll.crewId, userId);
  if (!isLeader && poll.creatorId !== userId) return forbidden();

  if (poll.dateOptions.length === 0) {
    return error("날짜 후보가 없어 확정할 수 없습니다", 422);
  }

  // 날짜: 최다 득표, 동점이면 이른 날짜
  const winnerDate = [...poll.dateOptions].sort((a, b) => {
    const diff = b._count.votes - a._count.votes;
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
      },
    });
  }

  return json({ poll: updatedPoll, visit });
}
