import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";

// 세팅 회차 히스토리
export async function GET(_req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  const settings = await prisma.gymSetting.findMany({
    where: { gymId },
    orderBy: { setDate: "desc" },
    include: { reportedBy: { select: { id: true, nickname: true } } },
  });
  return json(settings);
}

const schema = z.object({
  setDate: z.coerce.date(),
  noticeUrl: z.string().url("올바른 링크가 아닙니다").optional().or(z.literal("")),
});

// 새 세팅(뉴셋) 제보
export async function POST(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { gymId } = await params;

  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) return notFound("암장");

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const setting = await prisma.gymSetting.create({
    data: {
      gymId,
      setDate: parsed.data.setDate,
      noticeUrl: parsed.data.noticeUrl || null,
      reportedById: userId,
    },
  });
  return json(setting, 201);
}
