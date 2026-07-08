import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, forbidden, parseBody } from "@/lib/http";
import { getApprovedMembership } from "@/lib/crew";

// 현재 홈 암장 id 목록
export async function GET(_req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;
  if (!(await getApprovedMembership(crewId, userId))) return forbidden();
  const rows = await prisma.crewHomeGym.findMany({ where: { crewId }, select: { gymId: true } });
  return json(rows.map((r) => r.gymId));
}

const schema = z.object({ gymIds: z.array(z.string()).max(8) });

// 홈 암장 전체 교체 (추가/삭제 편집)
export async function PUT(req: Request, { params }: { params: Promise<{ crewId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { crewId } = await params;
  if (!(await getApprovedMembership(crewId, userId))) return forbidden();

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const ids = [...new Set(parsed.data.gymIds)];
  const found = ids.length
    ? await prisma.gym.findMany({ where: { id: { in: ids } }, select: { id: true } })
    : [];
  const validIds = found.map((g) => g.id);

  await prisma.$transaction([
    prisma.crewHomeGym.deleteMany({ where: { crewId } }),
    prisma.crewHomeGym.createMany({ data: validIds.map((gymId) => ({ crewId, gymId })) }),
  ]);
  return json({ ok: true, gymIds: validIds });
}
