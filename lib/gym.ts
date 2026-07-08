import { prisma } from "@/lib/prisma";

/** 방문 날짜에 해당하는 세팅 회차 id (그 날짜 이하의 가장 최근 세팅). 없으면 null */
export async function settingIdForVisit(gymId: string, date: Date): Promise<string | null> {
  const s = await prisma.gymSetting.findFirst({
    where: { gymId, setDate: { lte: date } },
    orderBy: { setDate: "desc" },
    select: { id: true },
  });
  return s?.id ?? null;
}
