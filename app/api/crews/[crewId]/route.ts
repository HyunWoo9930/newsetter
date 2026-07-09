import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, notFound, parseBody } from "@/lib/http";
import { getApprovedMembership, isCrewLeader } from "@/lib/crew";

// 크루 상세 (멤버만 조회 가능)
export async function GET(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  const membership = await getApprovedMembership(crewId, userId);
  if (!membership) return forbidden();

  const crew = await prisma.crew.findUnique({
    where: { id: crewId },
    include: {
      members: {
        where: { status: "APPROVED" },
        include: { user: { select: { id: true, nickname: true, profileImg: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { members: true } },
    },
  });
  if (!crew) return notFound("크루");
  return json(crew);
}

const patchSchema = z.object({
  name: z.string().min(1, "크루 이름을 입력해주세요").max(40).optional(),
  description: z.string().max(200).nullable().optional(),
  region: z.string().max(60).nullable().optional(),
  openChatUrl: z.string().max(300).nullable().optional(),
});

// 크루 정보 수정 (크루장만)
export async function PATCH(req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;

  if (!(await isCrewLeader(crewId, userId))) return forbidden();

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  const crew = await prisma.crew.update({
    where: { id: crewId },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.region !== undefined ? { region: d.region } : {}),
      ...(d.openChatUrl !== undefined ? { openChatUrl: d.openChatUrl } : {}),
    },
  });
  return json(crew);
}
