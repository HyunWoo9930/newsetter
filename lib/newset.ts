/**
 * 뉴셋(벽 세팅) 관련 상태 계산.
 * 킬러 기능 1: "우리 크루가 이번 세팅 이후에 이 암장을 갔는가?"
 */

export type NewsetStatus = {
  latestSetDate: Date | null;
  daysSinceSet: number | null; // 최근 세팅으로부터 며칠 지났는지
  visitedThisSet: boolean; // 최근 세팅일 이후 방문 기록이 있는지
};

/**
 * @param latestSetDate 암장의 가장 최근 세팅일 (없으면 null)
 * @param lastVisitDate 우리 크루의 이 암장 마지막 방문일 (없으면 null)
 * @param now 기준 시각 (기본 현재)
 */
export type VisitRecency = {
  weeksSinceVisit: number | null; // 우리 크루가 마지막으로 간 지 몇 주 (없으면 null = 아직 안 가봄)
  everVisited: boolean;
  dueForReset: boolean; // 안 가봤거나, 세팅 주기를 넘겨서 벽이 갈렸을 가능성 → 또 갈 때
};

/**
 * "우리 크루가 간 지 몇 주 됐나" 기반 상태. 뉴셋 날짜 제보가 필요 없음.
 * 주기(resetCycleWeeks)를 넘기면 "뉴셋 지났을 듯 = 또 갈 때"로 추정.
 */
export function computeVisitRecency(
  lastVisitDate: Date | null,
  resetCycleWeeks: number,
  now: Date = new Date()
): VisitRecency {
  if (!lastVisitDate) return { weeksSinceVisit: null, everVisited: false, dueForReset: true };
  const weeks = Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
  return { weeksSinceVisit: Math.max(0, weeks), everVisited: true, dueForReset: weeks >= resetCycleWeeks };
}

export function computeNewsetStatus(
  latestSetDate: Date | null,
  lastVisitDate: Date | null,
  now: Date = new Date()
): NewsetStatus {
  if (!latestSetDate) {
    return { latestSetDate: null, daysSinceSet: null, visitedThisSet: false };
  }
  const dayMs = 1000 * 60 * 60 * 24;
  const daysSinceSet = Math.floor((now.getTime() - latestSetDate.getTime()) / dayMs);
  const visitedThisSet = !!lastVisitDate && lastVisitDate.getTime() >= latestSetDate.getTime();
  return { latestSetDate, daysSinceSet, visitedThisSet };
}
