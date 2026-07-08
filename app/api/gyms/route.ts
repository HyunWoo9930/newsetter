import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, parseBody } from "@/lib/http";

// 암장 검색/목록 (?q= 이름 검색)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const gyms = await prisma.gym.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      settings: { orderBy: { setDate: "desc" }, take: 1 },
      _count: { select: { reviews: true } },
    },
    orderBy: { name: "asc" },
    take: 50,
  });
  return json(gyms);
}

const createSchema = z.object({
  name: z.string().min(1, "암장 이름을 입력해주세요").max(60),
  address: z.string().max(200).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  resetCycleWeeks: z.number().int().min(1).max(52).optional(),
  gradeSystem: z.string().max(60).optional(),
  instagram: z.string().max(200).optional(),
});

// 암장 추가 (유저 제보)
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  const gym = await prisma.gym.create({
    data: {
      name: d.name,
      address: d.address || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      resetCycleWeeks: d.resetCycleWeeks ?? 4,
      gradeSystem: d.gradeSystem || null,
      instagram: d.instagram || null,
    },
  });
  return json(gym, 201);
}
