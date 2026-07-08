import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";

const schema = z.object({
  dateOptionIds: z.array(z.string()).default([]),
  gymOptionIds: z.array(z.string()).default([]),
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
  ]);

  return json({ ok: true, dateOptionIds, gymOptionIds });
}
