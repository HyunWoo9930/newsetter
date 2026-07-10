import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";
import { settingIdForVisit } from "@/lib/gym";
import { logEvent } from "@/lib/activity";

// 내 일정/기록 통합 목록 — 개인 기록(crewId null) + 내가 참석하는 크루 일정
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const visits = await prisma.visit.findMany({
    where: {
      OR: [
        { crewId: null, createdById: userId },
        { attendees: { some: { userId } } },
      ],
    },
    include: {
      gym: { select: { id: true, name: true } },
      crew: { select: { id: true, name: true } },
      attendees: { include: { user: { select: { id: true, nickname: true, profileImg: true } } } },
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  return json(
    visits.map((v) => ({
      ...v,
      personal: !v.crewId,
      crewName: v.crew?.name ?? null,
      mine: true, // 이 목록은 전부 내 일정
      attendeeCount: v.attendees.length,
    }))
  );
}

const schema = z.object({
  gymId: z.string().min(1),
  date: z.coerce.date(),
});

// 개인 방문 기록 추가 (크루와 무관한 내 기록)
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { gymId, date } = parsed.data;

  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) return notFound("암장");

  const settingId = await settingIdForVisit(gymId, date);
  const visit = await prisma.visit.create({
    data: { crewId: null, gymId, gymSettingId: settingId, date, source: "MANUAL", createdById: userId },
    include: { gym: { select: { id: true, name: true } } },
  });
  await logEvent("visit_create", { userId, req, meta: { visitId: visit.id, personal: true } });
  return json({ ...visit, personal: true, crewName: null, mine: true, attendeeCount: 0 }, 201);
}
