import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";

// 문제의 완등 로그 목록 (영상 피드 + 베타)
export async function GET(_req: Request, { params }: { params: Promise<{ problemId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { problemId } = await params;
  const logs = await prisma.climbLog.findMany({
    where: { problemId },
    include: { user: { select: { id: true, nickname: true, profileImg: true } } },
    orderBy: { createdAt: "desc" },
  });
  return json(logs);
}

const schema = z.object({
  sent: z.boolean().default(false),
  attempts: z.number().int().min(0).max(9999).optional(),
  relativeFeel: z.enum(["EASIER", "AS_EXPECTED", "HARDER"]).optional(),
  honey: z.boolean().default(false),
  content: z.string().max(1000).optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  videoThumb: z.string().url().optional().or(z.literal("")),
});

// 내 완등 로그 남기기/수정 (유저당 문제당 1개 → upsert)
export async function POST(req: Request, { params }: { params: Promise<{ problemId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { problemId } = await params;

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true },
  });
  if (!problem) return notFound("문제");

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  const data = {
    sent: d.sent,
    attempts: d.attempts ?? null,
    relativeFeel: d.relativeFeel ?? null,
    honey: d.honey,
    content: d.content || null,
    videoUrl: d.videoUrl || null,
    videoThumb: d.videoThumb || null,
  };

  const log = await prisma.climbLog.upsert({
    where: { problemId_userId: { problemId, userId } },
    update: data,
    create: { problemId, userId, ...data },
    include: { user: { select: { id: true, nickname: true, profileImg: true } } },
  });
  return json(log, 201);
}
