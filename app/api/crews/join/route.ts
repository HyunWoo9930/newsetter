import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, tooMany, parseBody } from "@/lib/http";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { logEvent } from "@/lib/activity";

const schema = z.object({
  inviteCode: z.string().min(1, "초대 코드를 입력해주세요"),
});

// 초대 링크/코드로 가입 → 승인 없이 바로 멤버(APPROVED)
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  // 초대코드 무차별 대입 방어: 유저 20회/시간, IP 60회/시간
  if (!rateLimit(`join:u:${userId}`, 20, 3600_000) || !rateLimit(`join:ip:${clientIp(req)}`, 60, 3600_000)) {
    return tooMany("초대 코드 시도가 너무 많아요. 잠시 후 다시 시도해주세요");
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  // 접두사 없이 "8H2K" 만 입력해도 되도록 정규화
  let code = parsed.data.inviteCode.trim().toUpperCase().replace(/\s/g, "");
  if (!code.startsWith("CREW-")) code = "CREW-" + code.replace(/^CREW-?/, "");

  const crew = await prisma.crew.findUnique({
    where: { inviteCode: code },
    select: { id: true, name: true },
  });
  if (!crew) return error("초대 코드를 찾을 수 없어요. 다시 확인해주세요 (예: CREW-8H2K)", 404);

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
    await logEvent("crew_join", { userId, req, meta: { crewId: crew.id, name: crew.name } });
    return json({ crewId: crew.id, membership: updated });
  }

  const membership = await prisma.crewMember.create({
    data: { crewId: crew.id, userId, role: "MEMBER", status: "APPROVED", joinedVia: "INVITE_LINK" },
  });
  await logEvent("crew_join", { userId, req, meta: { crewId: crew.id, name: crew.name } });
  return json({ crewId: crew.id, membership }, 201);
}
