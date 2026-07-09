import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";

const schema = z.object({ favorite: z.boolean() });

// 암장 즐겨찾기 토글 — 개인 모드의 "홈 암장" 역할
export async function PUT(req: Request, { params }: { params: Promise<{ gymId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { gymId } = await params;

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) return notFound("암장");

  if (parsed.data.favorite) {
    await prisma.gymFavorite.upsert({
      where: { userId_gymId: { userId, gymId } },
      create: { userId, gymId },
      update: {},
    });
  } else {
    await prisma.gymFavorite.deleteMany({ where: { userId, gymId } });
  }
  return json({ favorite: parsed.data.favorite });
}
