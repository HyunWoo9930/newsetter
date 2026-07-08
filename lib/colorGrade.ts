import { prisma } from "@/lib/prisma";

/** 암장의 색 → 평균 공통척도(vGrade) 맵. ColorGradeVote 집계. */
export async function getColorVGradeMap(gymId: string): Promise<Map<string, number>> {
  const rows = await prisma.colorGradeVote.groupBy({
    by: ["color"],
    where: { gymId },
    _avg: { vGrade: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r._avg.vGrade != null) map.set(r.color, Math.round(r._avg.vGrade * 10) / 10);
  }
  return map;
}
