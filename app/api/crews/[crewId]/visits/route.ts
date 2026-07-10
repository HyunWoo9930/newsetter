import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { settingIdForVisit } from "@/lib/gym";
import { emitCrew } from "@/lib/events";
import { logEvent } from "@/lib/activity";

// 크루 클라이밍 일정 목록 (캘린더용) — 참석자 + 내가 가는지 포함
export async function GET(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const visits = await prisma.visit.findMany({
    where: { crewId },
    include: {
      gym: { select: { id: true, name: true } },
      attendees: { include: { user: { select: { id: true, nickname: true, profileImg: true } } } },
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  return json(
    visits.map((v) => ({
      ...v,
      mine: v.attendees.some((a) => a.userId === userId), // #5 내가 가는 일정인지
      attendeeCount: v.attendees.length,
    }))
  );
}

const schema = z.object({
  gymId: z.string().min(1),
  date: z.coerce.date(),
});

// 방문/일정 수동 추가 (추가한 사람이 생성자 & 자동 참석)
export async function POST(req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { gymId, date } = parsed.data;

  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) return notFound("암장");

  const settingId = await settingIdForVisit(gymId, date);
  const visit = await prisma.visit.create({
    data: {
      crewId, gymId, gymSettingId: settingId, date, source: "MANUAL", createdById: userId,
      attendees: { create: { userId } },
    },
    include: {
      gym: { select: { id: true, name: true } },
      attendees: { include: { user: { select: { id: true, nickname: true, profileImg: true } } } },
    },
  });

  emitCrew(crewId, { type: "visit_created", visitId: visit.id, gymName: visit.gym.name, userId });
  await logEvent("visit_create", { userId, req, meta: { crewId, visitId: visit.id, gymName: visit.gym.name } });
  return json({ ...visit, mine: true, attendeeCount: visit.attendees.length }, 201);
}
