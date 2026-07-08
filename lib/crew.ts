import { prisma } from "@/lib/prisma";

/** APPROVED 상태의 크루 멤버십을 반환 (없으면 null) */
export async function getApprovedMembership(crewId: string, userId: string) {
  return prisma.crewMember.findFirst({
    where: { crewId, userId, status: "APPROVED" },
  });
}

/** 해당 유저가 크루장인지 */
export async function isCrewLeader(crewId: string, userId: string) {
  const m = await prisma.crewMember.findFirst({
    where: { crewId, userId, role: "LEADER", status: "APPROVED" },
    select: { id: true },
  });
  return !!m;
}
