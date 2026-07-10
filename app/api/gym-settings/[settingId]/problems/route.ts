import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound, parseBody } from "@/lib/http";
import { getColorVGradeMap } from "@/lib/colorGrade";
import { problemDifficultyScore, sendRate, honeyRatio, type LogSignal } from "@/lib/difficulty";

// 세팅 회차의 문제 목록. 색(난이도)별로 묶고, 색 안에서 "쉬운 순" 정렬.
export async function GET(_req: Request, { params }: { params: Promise<{ settingId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { settingId } = await params;

  const setting = await prisma.gymSetting.findUnique({
    where: { id: settingId },
    select: { id: true, gymId: true, setDate: true },
  });
  if (!setting) return notFound("세팅 회차");

  const [problems, colorMap] = await Promise.all([
    prisma.problem.findMany({
      where: { gymSettingId: settingId },
      include: {
        logs: {
          select: { userId: true, sent: true, relativeFeel: true, honey: true, videoUrl: true },
        },
      },
    }),
    getColorVGradeMap(setting.gymId),
  ]);

  // 문제별 파생 통계 계산
  const enriched = problems.map((p) => {
    const signals: LogSignal[] = p.logs.map((l) => ({
      sent: l.sent,
      relativeFeel: l.relativeFeel,
      honey: l.honey,
    }));
    const myLog = p.logs.find((l) => l.userId === userId) ?? null;
    return {
      id: p.id,
      color: p.color,
      grade: p.grade,
      label: p.label,
      photoUrl: p.photoUrl,
      difficultyScore: problemDifficultyScore(signals),
      sendRate: sendRate(signals),
      honeyRatio: honeyRatio(signals),
      logCount: p.logs.length,
      videoCount: p.logs.filter((l) => l.videoUrl).length,
      mySent: myLog?.sent ?? null,
    };
  });

  // 색 그룹 만들기
  const byColor = new Map<string, typeof enriched>();
  for (const p of enriched) {
    if (!byColor.has(p.color)) byColor.set(p.color, []);
    byColor.get(p.color)!.push(p);
  }

  const NULL_LAST = Number.POSITIVE_INFINITY;
  const colors = [...byColor.entries()].map(([color, ps]) => {
    // 색 안: 쉬운 순(difficultyScore 오름차순, 로그 없으면 뒤로)
    ps.sort((a, b) => (a.difficultyScore ?? NULL_LAST) - (b.difficultyScore ?? NULL_LAST));
    return { color, avgVGrade: colorMap.get(color) ?? null, problems: ps };
  });
  // 색 그룹: 공통척도 오름차순(모르면 뒤로)
  colors.sort((a, b) => (a.avgVGrade ?? NULL_LAST) - (b.avgVGrade ?? NULL_LAST));

  return json({ settingId, gymId: setting.gymId, setDate: setting.setDate, colors });
}

const createSchema = z.object({
  color: z.string().min(1, "색을 입력해주세요").max(20),
  grade: z.number().int().min(0).max(20).optional(),
  label: z.string().max(40).optional(),
  photoUrl: z.string().url().optional().or(z.literal("")),
});

// 문제 등록 (크라우드소싱)
export async function POST(req: Request, { params }: { params: Promise<{ settingId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { settingId } = await params;

  const setting = await prisma.gymSetting.findUnique({
    where: { id: settingId },
    select: { id: true },
  });
  if (!setting) return notFound("세팅 회차");

  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  const problem = await prisma.problem.create({
    data: {
      gymSettingId: settingId,
      color: d.color,
      grade: d.grade ?? null,
      label: d.label || null,
      photoUrl: d.photoUrl || null,
      createdById: userId,
    },
  });
  return json(problem, 201);
}
