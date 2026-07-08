import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { isCrewLeader } from "@/lib/crew";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
});

// 가입 신청 승인/거절 (크루장만)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ crewId: string; userId: string }> }
) {
  const leaderId = await getCurrentUserId();
  if (!leaderId) return unauthorized();
  const { crewId, userId } = await params;

  if (!(await isCrewLeader(crewId, leaderId))) return forbidden();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const membership = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId, userId } },
  });
  if (!membership || membership.status !== "PENDING") return notFound("가입 신청");

  if (parsed.data.action === "approve") {
    const updated = await prisma.crewMember.update({
      where: { id: membership.id },
      data: { status: "APPROVED" },
    });
    return json({ action: "approve", membership: updated });
  }

  await prisma.crewMember.delete({ where: { id: membership.id } });
  return json({ action: "reject", ok: true });
}
