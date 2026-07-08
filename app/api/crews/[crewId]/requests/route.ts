import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, forbidden, notFound } from "@/lib/http";
import { isCrewLeader } from "@/lib/crew";

// 가입 신청 (검색 등으로 찾아와 신청 → 승인 대기 PENDING)
export async function POST(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  const crew = await prisma.crew.findUnique({ where: { id: crewId }, select: { id: true } });
  if (!crew) return notFound("크루");

  const existing = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId, userId } },
  });
  if (existing) {
    if (existing.status === "APPROVED") return error("이미 크루 멤버입니다", 409);
    return json({ status: "PENDING", membership: existing });
  }

  const membership = await prisma.crewMember.create({
    data: { crewId, userId, role: "MEMBER", status: "PENDING", joinedVia: "REQUEST" },
  });
  return json({ status: "PENDING", membership }, 201);
}

// 가입 신청 목록 (크루장만)
export async function GET(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  if (!(await isCrewLeader(crewId, userId))) return forbidden();

  const requests = await prisma.crewMember.findMany({
    where: { crewId, status: "PENDING" },
    include: { user: { select: { id: true, nickname: true, profileImg: true } } },
    orderBy: { createdAt: "asc" },
  });
  return json(requests);
}
