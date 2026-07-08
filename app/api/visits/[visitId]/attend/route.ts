import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";
import { emitCrew } from "@/lib/events";

const schema = z.object({ going: z.boolean() });

// #4 확정된 일정에 참여/불참 토글
export async function PUT(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { visitId } = await params;

  const visit = await prisma.visit.findUnique({ where: { id: visitId }, select: { id: true, crewId: true } });
  if (!visit) return notFound("일정");
  if (!(await getApprovedMembership(visit.crewId, userId))) return forbidden();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

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
  emitCrew(visit.crewId, { type: "visit_attend", visitId, userId, going: parsed.data.going });
  return json({ ok: true, mine: parsed.data.going, attendeeCount: count });
}
