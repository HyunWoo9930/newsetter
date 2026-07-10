import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, notFound } from "@/lib/http";
import { getApprovedMembership, isCrewLeader } from "@/lib/crew";
import { emitCrew } from "@/lib/events";

// 투표 상세: 날짜/암장 후보별 득표수 + 내 응답
export async function GET(_req: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { pollId } = await params;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      dateOptions: {
        orderBy: { date: "asc" },
        include: {
          _count: { select: { votes: true } },
          votes: { include: { user: { select: { id: true, nickname: true, profileImg: true } } } },
        },
      },
      gymOptions: {
        include: {
          gym: { include: { settings: { orderBy: { setDate: "desc" }, take: 1 } } },
          _count: { select: { votes: true } },
          votes: { include: { user: { select: { id: true, nickname: true, profileImg: true } } } },
        },
      },
    },
  });
  if (!poll) return notFound("투표");

  if (!(await getApprovedMembership(poll.crewId, userId))) return forbidden();

  const [myDateVotes, myGymVotes, myResponse] = await Promise.all([
    prisma.pollDateVote.findMany({ where: { pollId, userId }, select: { dateOptionId: true } }),
    prisma.pollGymVote.findMany({ where: { pollId, userId }, select: { gymOptionId: true } }),
    prisma.pollResponse.findUnique({ where: { pollId_userId: { pollId, userId } }, select: { id: true } }),
  ]);

  return json({
    ...poll,
    myVotes: {
      dateOptionIds: myDateVotes.map((v) => v.dateOptionId),
      gymOptionIds: myGymVotes.map((v) => v.gymOptionId),
      responded: !!myResponse, // X 0개(다 가능)로 냈어도 true
    },
  });
}

// 투표 삭제 — 생성자 또는 크루장만, 열려 있는 투표만 (마감된 투표는 확정 일정과 엮여 있어 보존)
export async function DELETE(_req: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { pollId } = await params;

  const poll = await prisma.poll.findUnique({ where: { id: pollId }, select: { id: true, crewId: true, creatorId: true, status: true, title: true } });
  if (!poll) return notFound("투표");
  if (!(await getApprovedMembership(poll.crewId, userId))) return forbidden();
  if (poll.status === "CLOSED") return error("마감된 투표는 삭제할 수 없어요", 409);
  if (poll.creatorId !== userId && !(await isCrewLeader(poll.crewId, userId))) {
    return error("투표를 만든 사람 또는 크루장만 삭제할 수 있어요", 403);
  }

  await prisma.poll.delete({ where: { id: pollId } });
  emitCrew(poll.crewId, { type: "poll_deleted", pollId, title: poll.title, userId });
  return json({ ok: true });
}
