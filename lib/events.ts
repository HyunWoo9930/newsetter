import { EventEmitter } from "events";

// 실시간 알림용 인메모리 pub/sub. 단일 파드(replicas:1)라 프로세스 내 EventEmitter로 충분.
// HMR/모듈 재평가에도 하나만 쓰도록 globalThis 에 보관.
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
const bus: EventEmitter = g.__setterBus ?? (g.__setterBus = new EventEmitter());
bus.setMaxListeners(0);

export type CrewEvent = { type: string; [k: string]: any };

// 크루 채널로 이벤트 브로드캐스트 (그 크루의 SSE 구독자 모두에게)
export function emitCrew(crewId: string, event: CrewEvent) {
  bus.emit("crew:" + crewId, { ...event, crewId, at: Date.now() });
}

// 여러 크루 구독. 구독 해제 함수 반환.
export function onCrews(crewIds: string[], cb: (e: CrewEvent) => void): () => void {
  const chans = crewIds.map((id) => "crew:" + id);
  chans.forEach((ch) => bus.on(ch, cb));
  return () => chans.forEach((ch) => bus.off(ch, cb));
}
