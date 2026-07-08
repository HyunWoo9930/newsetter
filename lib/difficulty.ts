import type { RelativeFeel } from "@prisma/client";

export type LogSignal = {
  sent: boolean;
  relativeFeel: RelativeFeel | null;
  honey: boolean;
};

const FEEL: Record<RelativeFeel, number> = { EASIER: -1, AS_EXPECTED: 0, HARDER: 1 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 문제 체감 난이도 점수. **낮을수록 쉬움.** 로그가 없으면 null.
 * 신호: 체감 투표(쉬움 -1 / 적정 0 / 어려움 +1) + 완등률(높을수록 쉬움).
 */
export function problemDifficultyScore(logs: LogSignal[]): number | null {
  if (logs.length === 0) return null;
  const feels = logs
    .map((l) => l.relativeFeel)
    .filter((f): f is RelativeFeel => f !== null);
  const feelAvg = feels.length ? feels.reduce((s, f) => s + FEEL[f], 0) / feels.length : 0;
  const rate = logs.filter((l) => l.sent).length / logs.length;
  // feel 가중 0.7, 완등률 편차 가중 0.6 (완등률 높으면 점수 낮아짐 = 쉬움)
  return round2(feelAvg * 0.7 - (rate - 0.5) * 0.6);
}

export function sendRate(logs: LogSignal[]): number | null {
  if (logs.length === 0) return null;
  return round2(logs.filter((l) => l.sent).length / logs.length);
}

export function honeyRatio(logs: LogSignal[]): number | null {
  if (logs.length === 0) return null;
  return round2(logs.filter((l) => l.honey).length / logs.length);
}
