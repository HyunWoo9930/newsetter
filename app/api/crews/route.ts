import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, parseBody, generateInviteCode } from "@/lib/http";

const createSchema = z.object({
  name: z.string().min(1, "크루 이름을 입력해주세요").max(40),
  description: z.string().max(200).optional(),
  region: z.string().max(60).optional(),
  openChatUrl: z.string().url("올바른 링크가 아닙니다").optional().or(z.literal("")),
  homeGymIds: z.array(z.string()).max(8).optional(),
});

// 새 크루 생성 (생성자는 자동으로 크루장)
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const { name, description, region, openChatUrl, homeGymIds } = parsed.data;
  const uniqueHomeGymIds = [...new Set(homeGymIds ?? [])];

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const crew = await prisma.crew.create({
        data: {
          name,
          description: description || null,
          region: region || null,
          openChatUrl: openChatUrl || null,
          inviteCode: generateInviteCode(),
          leaderId: userId,
          members: {
            create: {
              userId,
              role: "LEADER",
              status: "APPROVED",
              joinedVia: "INVITE_LINK",
            },
          },
          homeGyms: uniqueHomeGymIds.length
            ? { create: uniqueHomeGymIds.map((gymId) => ({ gymId })) }
            : undefined,
        },
      });
      return json(crew, 201);
    } catch (e) {
      // 초대 코드 유니크 충돌이면 재시도
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return error("크루 생성에 실패했습니다. 다시 시도해주세요", 500);
}

// 내가 속한 크루 목록
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const crews = await prisma.crew.findMany({
    where: { members: { some: { userId, status: "APPROVED" } } },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });
  return json(crews);
}
