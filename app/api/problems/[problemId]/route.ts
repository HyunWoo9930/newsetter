import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound } from "@/lib/http";
import { problemDifficultyScore, sendRate, honeyRatio, type LogSignal } from "@/lib/difficulty";

// 문제 상세: 통계 + 완등 로그(영상/베타) + 내 로그
export async function GET(_req: Request, { params }: { params: Promise<{ problemId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { problemId } = await params;

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      gymSetting: { include: { gym: { select: { id: true, name: true } } } },
      logs: {
        include: { user: { select: { id: true, nickname: true, profileImg: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!problem) return notFound("문제");

  const signals: LogSignal[] = problem.logs.map((l) => ({
    sent: l.sent,
    relativeFeel: l.relativeFeel,
    honey: l.honey,
  }));

  const myLog = problem.logs.find((l) => l.userId === userId) ?? null;
  const videos = problem.logs.filter((l) => l.videoUrl);

  return json({
    ...problem,
    stats: {
      difficultyScore: problemDifficultyScore(signals),
      sendRate: sendRate(signals),
      honeyRatio: honeyRatio(signals),
      logCount: problem.logs.length,
      videoCount: videos.length,
    },
    myLog,
  });
}
