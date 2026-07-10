import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { emitCrew } from "@/lib/events";

const schema = z.object({
  dateOptionIds: z.array(z.string()).max(100).default([]),
  gymOptionIds: z.array(z.string()).max(20).default([]),
});

// 내 응답 제출/수정 (기존 응답을 갈아끼움)
export async function POST(req: Request, { params }: { params: Promise<{ pollId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { pollId } = await params;

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      dateOptions: { select: { id: true } },
      gymOptions: { select: { id: true } },
    },
  });
  if (!poll) return notFound("투표");
  if (poll.status === "CLOSED") return error("이미 마감된 투표입니다", 409);
  if (poll.deadline && poll.deadline < new Date()) return error("응답 기한이 지났어요", 409);
  if (!(await getApprovedMembership(poll.crewId, userId))) return forbidden();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  // 이 투표에 실제로 속한 옵션만 남긴다
  const validDateIds = new Set(poll.dateOptions.map((o) => o.id));
  const validGymIds = new Set(poll.gymOptions.map((o) => o.id));
  const dateOptionIds = [...new Set(parsed.data.dateOptionIds)].filter((id) => validDateIds.has(id));
  const gymOptionIds = [...new Set(parsed.data.gymOptionIds)].filter((id) => validGymIds.has(id));

  await prisma.$transaction([
    prisma.pollDateVote.deleteMany({ where: { pollId, userId } }),
    prisma.pollGymVote.deleteMany({ where: { pollId, userId } }),
    prisma.pollDateVote.createMany({
      data: dateOptionIds.map((dateOptionId) => ({ pollId, userId, dateOptionId })),
    }),
    prisma.pollGymVote.createMany({
      data: gymOptionIds.map((gymOptionId) => ({ pollId, userId, gymOptionId })),
    }),
    // "다 가능"(X 0개)도 유효 응답 → 응답 기록을 남겨 응답자 수/재방문 상태를 정확히.
    prisma.pollResponse.upsert({
      where: { pollId_userId: { pollId, userId } },
      create: { pollId, userId },
      update: {},
    }),
  ]);

  emitCrew(poll.crewId, { type: "vote_submitted", pollId, userId });
  return json({ ok: true, dateOptionIds, gymOptionIds, responded: true });
}
