import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, notFound, parseBody } from "@/lib/http";

const schema = z.object({
  inviteCode: z.string().min(1, "초대 코드를 입력해주세요"),
});

// 초대 링크/코드로 가입 → 승인 없이 바로 멤버(APPROVED)
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const crew = await prisma.crew.findUnique({
    where: { inviteCode: parsed.data.inviteCode.trim().toUpperCase() },
    select: { id: true, name: true },
  });
  if (!crew) return notFound("크루");

  const existing = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId: crew.id, userId } },
  });
  if (existing) {
    if (existing.status === "APPROVED") return json({ crewId: crew.id, alreadyMember: true });
    // 신청 대기 중이었어도 초대 코드로 들어오면 즉시 승인 처리
    const updated = await prisma.crewMember.update({
      where: { id: existing.id },
      data: { status: "APPROVED", joinedVia: "INVITE_LINK" },
    });
    return json({ crewId: crew.id, membership: updated });
  }

  const membership = await prisma.crewMember.create({
    data: { crewId: crew.id, userId, role: "MEMBER", status: "APPROVED", joinedVia: "INVITE_LINK" },
  });
  return json({ crewId: crew.id, membership }, 201);
}
