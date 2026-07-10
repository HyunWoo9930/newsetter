// 프론트엔드용 API 클라이언트 (브라우저에서 호출).
/* eslint-disable @typescript-eslint/no-explicit-any */
async function j<T = any>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    // HTTP/2 뒤에선 statusText 가 비어 빈 토스트가 뜨므로 항상 사람이 읽을 메시지를 보장.
    const err = (msg as { error?: string }).error;
    throw new Error(err || (res.status >= 500 ? "서버에 문제가 생겼어요. 잠시 후 다시 시도해주세요" : `요청에 실패했어요 (${res.status})`));
  }
  return res.json() as Promise<T>;
}

// fetch 자체가 실패(네트워크 끊김 등)하면 "Failed to fetch" 대신 한국어로.
const nf: typeof fetch = (input, init) =>
  fetch(input, init).catch(() => { throw new Error("네트워크가 불안정해요. 연결을 확인해주세요"); });

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const noStore: RequestInit = { cache: "no-store" };

export const api = {
  me: () => nf("/api/me", noStore).then(j),
  gymsList: (q?: string) => nf(`/api/gyms${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(j),
  crews: () => nf("/api/crews", noStore).then(j),
  crew: (id: string) => nf(`/api/crews/${id}`).then(j),
  crewGyms: (id: string) => nf(`/api/crews/${id}/gyms`).then(j),
  crewPolls: (id: string) => nf(`/api/crews/${id}/polls`).then(j),
  crewVisits: (id: string) => nf(`/api/crews/${id}/visits`).then(j),
  requests: (id: string) => nf(`/api/crews/${id}/requests`).then(j),
  poll: (id: string) => nf(`/api/polls/${id}`).then(j),
  gym: (id: string, crewId?: string) => nf(`/api/gyms/${id}${crewId ? `?crewId=${crewId}` : ""}`).then(j),
  gymReviews: (id: string) => nf(`/api/gyms/${id}/reviews`).then(j),
  colorGrades: (id: string) => nf(`/api/gyms/${id}/color-grades`).then(j),
  problems: (settingId: string) => nf(`/api/gym-settings/${settingId}/problems`).then(j),
  problem: (id: string) => nf(`/api/problems/${id}`).then(j),
  recommendations: (settingId: string, growth: boolean) =>
    nf(`/api/gym-settings/${settingId}/recommendations${growth ? "?growth=1" : ""}`).then(j),

  deleteAccount: () => nf("/api/me", { method: "DELETE" }).then(j),

  // 개인 모드 — 내 암장/기록/즐겨찾기
  meGyms: () => nf("/api/me/gyms", noStore).then(j),
  meVisits: () => nf("/api/me/visits", noStore).then(j),
  favoriteGym: (gymId: string, favorite: boolean) => nf(`/api/gyms/${gymId}/favorite`, jsonInit("PUT", { favorite })).then(j),

  // 일정(방문) 참여/변경/취소
  visitAttend: (visitId: string, going: boolean) => nf(`/api/visits/${visitId}/attend`, jsonInit("PUT", { going })).then(j),
  visitUpdate: (visitId: string, body: { gymId?: string; date?: string }) => nf(`/api/visits/${visitId}`, jsonInit("PATCH", body)).then(j),
  visitCancel: (visitId: string) => nf(`/api/visits/${visitId}`, { method: "DELETE" }).then(j),

  post: <T = unknown>(path: string, body: unknown) => nf(path, jsonInit("POST", body)).then<T>(j),
  del: <T = unknown>(path: string) => nf(path, { method: "DELETE" }).then<T>(j),
  patch: <T = unknown>(path: string, body: unknown) => nf(path, jsonInit("PATCH", body)).then<T>(j),
  put: <T = unknown>(path: string, body: unknown) => nf(path, jsonInit("PUT", body)).then<T>(j),
};
