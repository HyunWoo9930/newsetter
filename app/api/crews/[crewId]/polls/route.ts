import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { emitCrew } from "@/lib/events";

// 날짜는 YYYY-MM-DD 로 받아 UTC 자정으로 고정 (타임존 밀림 방지)
const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않아요");
const dayToUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);

const createSchema = z.object({
  title: z.string().min(1, "투표 제목을 입력해주세요").max(80),
  deadline: z.coerce.date().optional(),
  // 날짜 범위: 시작~끝 (하루만 고르면 시작=끝). 범위 안의 모든 날이 후보가 됨.
  rangeStart: dayStr,
  rangeEnd: dayStr,
  // 암장 후보 (선택 — 없어도 투표 생성 가능)
  gymIds: z.array(z.string()).max(20).default([]),
});

// 투표 생성 (멤버 누구나)
export async function POST(req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const { title, deadline, rangeStart, rangeEnd, gymIds } = parsed.data;

  const start = dayToUtc(rangeStart);
  const end = dayToUtc(rangeEnd);
  if (end < start) return error("종료일이 시작일보다 빠를 수 없어요", 422);
  // 범위 안의 모든 날을 후보로 생성 (최대 31일)
  const days: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) days.push(new Date(t));
  if (days.length > 31) return error("날짜 범위는 최대 31일까지예요", 422);

  // 중복 제거된 암장만. 최소 1곳은 있어야 마감 시 일정(날짜+암장)이 생김.
  const uniqueGymIds = [...new Set(gymIds)];
  if (uniqueGymIds.length === 0) return error("암장 후보를 최소 한 곳 골라주세요", 422);
  const foundGyms = await prisma.gym.count({ where: { id: { in: uniqueGymIds } } });
  if (foundGyms !== uniqueGymIds.length) return error("존재하지 않는 암장이 포함되어 있습니다", 422);

  const poll = await prisma.poll.create({
    data: {
      crewId,
      creatorId: userId,
      title,
      deadline: deadline ?? null,
      rangeStart: start,
      rangeEnd: end,
      dateOptions: { create: days.map((date) => ({ date })) },
      gymOptions: { create: uniqueGymIds.map((gymId) => ({ gymId })) },
    },
    include: { dateOptions: true, gymOptions: { include: { gym: true } } },
  });
  emitCrew(crewId, { type: "poll_created", pollId: poll.id, title: poll.title, userId });
  return json(poll, 201);
}

// 크루 투표 목록
export async function GET(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const polls = await prisma.poll.findMany({
    where: { crewId },
    include: {
      _count: { select: { dateVotes: true, gymVotes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const pollIds = polls.map((p) => p.id);
  // 응답자 = PollResponse 행 기준 ("다 가능"으로 X 0개 낸 사람도 포함). 표는 무시.
  const responses = await prisma.pollResponse.groupBy({ by: ["pollId"], where: { pollId: { in: pollIds } }, _count: { userId: true } });
  const respCount = new Map(responses.map((r) => [r.pollId, r._count.userId]));

  const confirmedIds = polls.map((p) => p.confirmedGymId).filter((x): x is string => !!x);
  const cgyms = confirmedIds.length
    ? await prisma.gym.findMany({ where: { id: { in: confirmedIds } }, select: { id: true, name: true } })
    : [];
  const gymNameById = new Map(cgyms.map((g) => [g.id, g.name]));

  return json(
    polls.map((p) => ({
      ...p,
      responderCount: respCount.get(p.id) ?? 0,
      confirmedGymName: p.confirmedGymId ? gymNameById.get(p.confirmedGymId) ?? null : null,
    }))
  );
}
