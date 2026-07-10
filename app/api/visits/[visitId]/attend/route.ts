import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { emitCrew } from "@/lib/events";
import { logEvent } from "@/lib/activity";

const schema = z.object({ going: z.boolean() });

// #4 확정된 일정에 참여/불참 토글
export async function PUT(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { visitId } = await params;

  const visit = await prisma.visit.findUnique({ where: { id: visitId }, select: { id: true, crewId: true, date: true } });
  if (!visit) return notFound("일정");
  if (!visit.crewId) return forbidden(); // 개인 기록엔 참여 개념이 없음
  const crewId = visit.crewId;
  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  // 지난 일정엔 새로 참여 불가 (기록 왜곡 방지). 이미 참여했던 걸 취소하는 건 허용.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  if (parsed.data.going && visit.date < todayStart) return error("지난 일정에는 참여할 수 없어요", 422);

  if (parsed.data.going) {
    await prisma.visitAttendee.upsert({
      where: { visitId_userId: { visitId, userId } },
      create: { visitId, userId },
      update: {},
    });
  } else {
    await prisma.visitAttendee.deleteMany({ where: { visitId, userId } });
  }

  const count = await prisma.visitAttendee.count({ where: { visitId } });
  emitCrew(crewId, { type: "visit_attend", visitId, userId, going: parsed.data.going });
  await logEvent(parsed.data.going ? "visit_join" : "visit_leave", { userId, req, meta: { visitId, crewId } });
  return json({ ok: true, mine: parsed.data.going, attendeeCount: count });
}
