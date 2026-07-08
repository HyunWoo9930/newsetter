import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, unauthorized, notFound } from "@/lib/http";
import { getColorVGradeMap } from "@/lib/colorGrade";
import { estimateUserAbility, effectiveVGrade } from "@/lib/ability";
import { problemDifficultyScore, type LogSignal } from "@/lib/difficulty";

// v1 규칙기반 추천: "뭐부터 풀지".
// 내가 아직 안 깬 문제 중 (내 실력 이하 = 할 만한) 것을 쉬운 순으로.
// ?growth=1 이면 실력보다 한 단계 위까지 포함(성장 모드).
export async function GET(req: Request, { params }: { params: Promise<{ settingId: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();
  const { settingId } = await params;
  const growth = new URL(req.url).searchParams.get("growth") === "1";

  const setting = await prisma.gymSetting.findUnique({
    where: { id: settingId },
    select: { id: true, gymId: true },
  });
  if (!setting) return notFound("세팅 회차");

  const [problems, colorMap, ability] = await Promise.all([
    prisma.problem.findMany({
      where: { gymSettingId: settingId },
      include: { logs: { select: { userId: true, sent: true, relativeFeel: true, honey: true } } },
    }),
    getColorVGradeMap(setting.gymId),
    estimateUserAbility(userId),
  ]);

  const ceiling = ability == null ? null : ability + (growth ? 1 : 0);
  const NULL_LAST = Number.POSITIVE_INFINITY;

  const recs = problems
    .map((p) => {
      const signals: LogSignal[] = p.logs.map((l) => ({
        sent: l.sent,
        relativeFeel: l.relativeFeel,
        honey: l.honey,
      }));
      const mySent = p.logs.find((l) => l.userId === userId)?.sent ?? false;
      return {
        id: p.id,
        color: p.color,
        grade: p.grade,
        label: p.label,
        vGrade: effectiveVGrade(p, colorMap),
        difficultyScore: problemDifficultyScore(signals),
        honeyCount: p.logs.filter((l) => l.honey).length,
        mySent,
      };
    })
    // 이미 깬 건 제외
    .filter((p) => !p.mySent)
    // 실력을 알면 할 만한 난이도만 (등급 모르는 건 일단 포함)
    .filter((p) => ceiling == null || p.vGrade == null || p.vGrade <= ceiling)
    .sort((a, b) => (a.difficultyScore ?? NULL_LAST) - (b.difficultyScore ?? NULL_LAST));

  return json({
    ability,
    mode: growth ? "growth" : "comfort",
    coldStart: ability == null,
    count: recs.length,
    recommendations: recs,
  });
}
