import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { settingIdForVisit } from "@/lib/gym";
import { emitCrew } from "@/lib/events";

// 일정 변경/취소 권한: 만든 사람 또는 크루장
async function loadEditable(visitId: string, userId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { crew: { select: { id: true, leaderId: true } }, gym: { select: { name: true } } },
  });
  if (!visit) return { err: notFound("일정") } as const;
  if (!(await getApprovedMembership(visit.crewId, userId))) return { err: forbidden() } as const;
  const canEdit = visit.createdById === userId || visit.crew.leaderId === userId;
  if (!canEdit) return { err: error("만든 사람 또는 크루장만 변경/취소할 수 있어요", 403) } as const;
  return { visit } as const;
}

const patchSchema = z.object({
  gymId: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
});

// #3 일정 변경 (날짜/암장)
export async function PATCH(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { visitId } = await params;

  const res = await loadEditable(visitId, userId);
  if ("err" in res) return res.err;
  const { visit } = res;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const gymId = parsed.data.gymId ?? visit.gymId;
  const date = parsed.data.date ?? visit.date;

  if (parsed.data.gymId) {
    const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
    if (!gym) return notFound("암장");
  }

  const settingId = await settingIdForVisit(gymId, date);
  const updated = await prisma.visit.update({
    where: { id: visitId },
    data: { gymId, date, gymSettingId: settingId },
    include: {
      gym: { select: { id: true, name: true } },
      attendees: { include: { user: { select: { id: true, nickname: true, profileImg: true } } } },
    },
  });

  emitCrew(visit.crewId, { type: "visit_updated", visitId, gymName: updated.gym.name });
  return json({ ...updated, mine: updated.attendees.some((a) => a.userId === userId), attendeeCount: updated.attendees.length });
}

// #2 일정 취소 (삭제)
export async function DELETE(_req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { visitId } = await params;

  const res = await loadEditable(visitId, userId);
  if ("err" in res) return res.err;
  const { visit } = res;

  await prisma.visit.delete({ where: { id: visitId } });
  emitCrew(visit.crewId, { type: "visit_canceled", visitId, gymName: visit.gym.name });
  return json({ ok: true });
}
