import { prisma } from "@/lib/prisma";
import { getColorVGradeMap } from "@/lib/colorGrade";

/**
 * 유저의 효과적 실력(vGrade 척도). 완등한 문제들의 효과 등급 중 견고한 상한.
 * 완등 기록이 없으면 프로필의 referenceGrade로 폴백, 그것도 없으면 null.
 */
export async function estimateUserAbility(userId: string): Promise<number | null> {
  const sentLogs = await prisma.climbLog.findMany({
    where: { userId, sent: true },
    include: { problem: { include: { gymSetting: { select: { gymId: true } } } } },
  });

  if (sentLogs.length === 0) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referenceGrade: true },
    });
    return user?.referenceGrade ?? null;
  }

  const gymMaps = new Map<string, Map<string, number>>();
  const grades: number[] = [];

  for (const log of sentLogs) {
    const p = log.problem;
    let g: number | null = p.grade ?? null;
    if (g == null) {
      const gymId = p.gymSetting.gymId;
      if (!gymMaps.has(gymId)) gymMaps.set(gymId, await getColorVGradeMap(gymId));
      g = gymMaps.get(gymId)?.get(p.color) ?? null;
    }
    if (g != null) grades.push(g);
  }

  if (grades.length === 0) return null;
  grades.sort((a, b) => a - b);
  // 상위 25% 지점 — 한 번 운좋게 깬 걸 실력으로 오인하지 않도록
  const idx = Math.min(Math.floor(grades.length * 0.75), grades.length - 1);
  return grades[idx];
}

/** 문제의 효과 등급(vGrade). grade가 있으면 그대로, 없으면 암장 색맵에서. */
export function effectiveVGrade(
  problem: { grade: number | null; color: string },
  colorMap: Map<string, number>
): number | null {
  return problem.grade ?? colorMap.get(problem.color) ?? null;
}
