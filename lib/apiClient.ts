// 프론트엔드용 API 클라이언트 (브라우저에서 호출).
/* eslint-disable @typescript-eslint/no-explicit-any */
async function j<T = any>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const noStore: RequestInit = { cache: "no-store" };

export const api = {
  me: () => fetch("/api/me", noStore).then(j),
  gymsList: (q?: string) => fetch(`/api/gyms${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(j),
  crews: () => fetch("/api/crews", noStore).then(j),
  crew: (id: string) => fetch(`/api/crews/${id}`).then(j),
  crewGyms: (id: string) => fetch(`/api/crews/${id}/gyms`).then(j),
  crewPolls: (id: string) => fetch(`/api/crews/${id}/polls`).then(j),
  crewVisits: (id: string) => fetch(`/api/crews/${id}/visits`).then(j),
  requests: (id: string) => fetch(`/api/crews/${id}/requests`).then(j),
  poll: (id: string) => fetch(`/api/polls/${id}`).then(j),
  gym: (id: string, crewId?: string) => fetch(`/api/gyms/${id}${crewId ? `?crewId=${crewId}` : ""}`).then(j),
  gymReviews: (id: string) => fetch(`/api/gyms/${id}/reviews`).then(j),
  colorGrades: (id: string) => fetch(`/api/gyms/${id}/color-grades`).then(j),
  problems: (settingId: string) => fetch(`/api/gym-settings/${settingId}/problems`).then(j),
  problem: (id: string) => fetch(`/api/problems/${id}`).then(j),
  recommendations: (settingId: string, growth: boolean) =>
    fetch(`/api/gym-settings/${settingId}/recommendations${growth ? "?growth=1" : ""}`).then(j),

  // 일정(방문) 참여/변경/취소
  visitAttend: (visitId: string, going: boolean) => fetch(`/api/visits/${visitId}/attend`, jsonInit("PUT", { going })).then(j),
  visitUpdate: (visitId: string, body: { gymId?: string; date?: string }) => fetch(`/api/visits/${visitId}`, jsonInit("PATCH", body)).then(j),
  visitCancel: (visitId: string) => fetch(`/api/visits/${visitId}`, { method: "DELETE" }).then(j),

  post: <T = unknown>(path: string, body: unknown) => fetch(path, jsonInit("POST", body)).then<T>(j),
  patch: <T = unknown>(path: string, body: unknown) => fetch(path, jsonInit("PATCH", body)).then<T>(j),
  put: <T = unknown>(path: string, body: unknown) => fetch(path, jsonInit("PUT", body)).then<T>(j),
};
