import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/ratelimit";

// 기록하는 행동 종류. 새 이벤트를 추가하면 admin 라벨(EVENT_LABEL)도 같이 추가.
export type EventType =
  | "signup"
  | "login"
  | "crew_create"
  | "crew_join"
  | "crew_leave"
  | "poll_create"
  | "poll_vote"
  | "poll_close"
  | "visit_create"
  | "visit_join"
  | "visit_leave"
  | "visit_cancel"
  | "visit_update"
  | "review_create"
  | "problem_create"
  | "climb_log"
  | "gym_favorite"
  | "feedback"
  | "account_delete";

/**
 * 사용자 행동 1건을 기록한다.
 * 절대 요청 흐름을 깨면 안 되므로(로깅 실패가 기능 실패가 되면 안 됨) 모든 예외를 삼킨다.
 * 로컬 PG 라 쓰기가 1~2ms 수준 → await 해도 체감 지연 없음.
 */
export async function logEvent(
  type: EventType,
  opts: { userId?: string | null; meta?: Record<string, unknown>; req?: Request } = {}
): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        type,
        userId: opts.userId ?? null,
        meta: opts.meta ? (opts.meta as object) : undefined,
        ip: opts.req ? clientIp(opts.req).slice(0, 45) : undefined,
      },
    });
    // 마지막 활동 시각 갱신(이탈/휴면 판단용). 방금 탈퇴한 유저면 조용히 실패.
    if (opts.userId) {
      await prisma.user
        .update({ where: { id: opts.userId }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }
  } catch {
    // 로깅 실패는 무시 — 기능에 영향 없음.
  }
}
