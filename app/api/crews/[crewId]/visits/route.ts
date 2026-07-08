import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { settingIdForVisit } from "@/lib/gym";

// 크루 방문 기록 목록 (캘린더용)
export async function GET(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const visits = await prisma.visit.findMany({
    where: { crewId },
    include: { gym: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });
  return json(visits);
}

const schema = z.object({
  gymId: z.string().min(1),
  date: z.coerce.date(),
});

// 방문 기록 수동 추가
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
    data: { crewId, gymId, gymSettingId: settingId, date, source: "MANUAL" },
    include: { gym: { select: { id: true, name: true } } },
  });
  return json(visit, 201);
}
