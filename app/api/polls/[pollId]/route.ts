import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, notFound } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";

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

  const [myDateVotes, myGymVotes] = await Promise.all([
    prisma.pollDateVote.findMany({ where: { pollId, userId }, select: { dateOptionId: true } }),
    prisma.pollGymVote.findMany({ where: { pollId, userId }, select: { gymOptionId: true } }),
  ]);

  return json({
    ...poll,
    myVotes: {
      dateOptionIds: myDateVotes.map((v) => v.dateOptionId),
      gymOptionIds: myGymVotes.map((v) => v.gymOptionId),
    },
  });
}
