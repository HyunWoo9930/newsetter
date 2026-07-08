// NewSetter 관리자 대시보드 (/admin) — 로그인한 카카오 계정이 ADMIN_KAKAO_IDS 에 있으면 접근.
// 서버 컴포넌트: prisma 직접 조회 후 렌더. 크레파스 테마 대신 읽기 좋은 관리자 UI.
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

const INK = "#1f2937";
const MUTE = "#6b7280";
const LINE = "#e5e7eb";
const BG = "#f8fafc";

function kst(d: Date | string) {
  return new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function kstDate(d: Date | string) {
  return new Date(d).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
}

async function isAdmin(): Promise<{ ok: boolean; me?: { nickname: string; kakaoId: string | null } }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true, kakaoId: true } });
  if (!me) return { ok: false };
  const admins = (process.env.ADMIN_KAKAO_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { ok: !!me.kakaoId && admins.includes(me.kakaoId), me };
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 13, color: MUTE }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, color: INK }}>{value}</div>
    </div>
  );
}

export default async function AdminPage() {
  const { ok, me } = await isAdmin();
  if (!ok) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", color: INK, background: BG, textAlign: "center", padding: 24 }}>
        <div>
          <div style={{ fontSize: 44 }}>🔒</div>
          <h1 style={{ fontSize: 20, margin: "10px 0 6px" }}>관리자 전용</h1>
          <p style={{ color: MUTE, fontSize: 14 }}>{me ? "이 계정은 관리자가 아니에요." : "먼저 로그인해주세요."}</p>
          <a href="/" style={{ display: "inline-block", marginTop: 14, color: "#2563eb", fontSize: 14 }}>← 앱으로 돌아가기</a>
        </div>
      </div>
    );
  }

  // ── 집계 & 목록 병렬 조회 ──
  const [users, crews, gyms, polls, visits, reviews, problems, climbLogs, recentUsers, crewRows, recentPolls, recentReviews, recentVisits] = await Promise.all([
    prisma.user.count(),
    prisma.crew.count(),
    prisma.gym.count(),
    prisma.poll.count(),
    prisma.visit.count(),
    prisma.review.count(),
    prisma.problem.count(),
    prisma.climbLog.count(),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, nickname: true, kakaoId: true, profileImg: true, createdAt: true } }),
    prisma.crew.findMany({ orderBy: { createdAt: "desc" }, include: { leader: { select: { nickname: true } }, _count: { select: { members: true } } } }),
    prisma.poll.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { crew: { select: { name: true } } } }),
    prisma.review.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { gym: { select: { name: true } }, user: { select: { nickname: true } } } }),
    prisma.visit.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { gym: { select: { name: true } }, crew: { select: { name: true } } } }),
  ]);

  // ── 최근 14일 가입 추이 (JS 버킷) ──
  const days: { label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
    days.push({ label: key, count: 0 });
  }
  const dayIndex = new Map(days.map((d, i) => [d.label, i]));
  for (const u of recentUsers) {
    const k = kstDate(u.createdAt);
    const idx = dayIndex.get(k);
    if (idx != null) days[idx].count++;
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  // ── 활동 로그 병합 ──
  type Ev = { when: Date; tag: string; color: string; text: string };
  const events: Ev[] = [];
  for (const u of recentUsers.slice(0, 15)) events.push({ when: u.createdAt, tag: "가입", color: "#16a34a", text: `${u.nickname} 님이 가입` });
  for (const c of crewRows.slice(0, 15)) events.push({ when: c.createdAt, tag: "크루", color: "#2563eb", text: `크루 “${c.name}” 생성 (크루장 ${c.leader?.nickname ?? "?"})` });
  for (const p of recentPolls) events.push({ when: p.createdAt, tag: "투표", color: "#9333ea", text: `투표 “${p.title}” (${p.crew?.name ?? "?"})` });
  for (const r of recentReviews) events.push({ when: r.createdAt, tag: "리뷰", color: "#ea580c", text: `${r.user?.nickname ?? "?"} → ${r.gym?.name ?? "?"} 리뷰 ★${r.rating}` });
  for (const v of recentVisits) events.push({ when: v.createdAt, tag: "방문", color: "#0891b2", text: `${v.crew?.name ?? "?"} → ${v.gym?.name ?? "?"} 방문` });
  events.sort((a, b) => +new Date(b.when) - +new Date(a.when));
  const feed = events.slice(0, 40);

  const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 12, color: MUTE, fontWeight: 600, borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "9px 12px", fontSize: 13, color: INK, borderBottom: `1px solid #f1f5f9`, whiteSpace: "nowrap" };

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "system-ui, -apple-system, sans-serif", color: INK }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 64px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>NewSetter 관리자</h1>
          <div style={{ fontSize: 13, color: MUTE }}>{me?.nickname} 님 · <a href="/" style={{ color: "#2563eb" }}>앱으로</a></div>
        </div>

        {/* 통계 카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 20 }}>
          <Card label="유저" value={users} />
          <Card label="크루" value={crews} />
          <Card label="암장" value={gyms} />
          <Card label="투표" value={polls} />
          <Card label="방문" value={visits} />
          <Card label="리뷰" value={reviews} />
          <Card label="문제" value={problems} />
          <Card label="완등 로그" value={climbLogs} />
        </div>

        {/* 가입 추이 */}
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>최근 14일 가입</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
            {days.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 11, color: MUTE }}>{d.count || ""}</div>
                <div title={`${d.label}: ${d.count}명`} style={{ width: "100%", maxWidth: 28, height: `${(d.count / maxDay) * 78}px`, minHeight: d.count ? 4 : 0, background: "#3b82f6", borderRadius: "4px 4px 0 0" }} />
                <div style={{ fontSize: 10, color: MUTE, transform: "rotate(-45deg)", whiteSpace: "nowrap", marginTop: 2 }}>{d.label}</div>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20, marginTop: 20 }}>
          {/* 크루 목록 */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 700, padding: "14px 16px", borderBottom: `1px solid ${LINE}` }}>크루 ({crewRows.length})</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>크루명</th><th style={th}>크루장</th><th style={th}>멤버</th><th style={th}>초대코드</th><th style={th}>생성일</th></tr></thead>
                <tbody>
                  {crewRows.map((c) => (
                    <tr key={c.id}>
                      <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                      <td style={td}>{c.leader?.nickname ?? "-"}</td>
                      <td style={td}>{c._count.members}</td>
                      <td style={{ ...td, fontFamily: "ui-monospace, monospace", color: MUTE }}>{c.inviteCode}</td>
                      <td style={{ ...td, color: MUTE }}>{kst(c.createdAt)}</td>
                    </tr>
                  ))}
                  {crewRows.length === 0 && <tr><td style={{ ...td, color: MUTE }} colSpan={5}>크루 없음</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {/* 가입자 목록 */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 700, padding: "14px 16px", borderBottom: `1px solid ${LINE}` }}>가입자 (최근 {recentUsers.length})</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}></th><th style={th}>닉네임</th><th style={th}>카카오 ID</th><th style={th}>가입일시</th></tr></thead>
                <tbody>
                  {recentUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={{ ...td, width: 40 }}>
                        {u.profileImg
                          ? <img src={u.profileImg} alt="" width={26} height={26} style={{ borderRadius: "50%", objectFit: "cover", display: "block" }} />
                          : <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: MUTE }}>{u.nickname?.[0] ?? "?"}</div>}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{u.nickname}</td>
                      <td style={{ ...td, fontFamily: "ui-monospace, monospace", color: MUTE }}>{u.kakaoId}</td>
                      <td style={{ ...td, color: MUTE }}>{kst(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 활동 로그 */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 700, padding: "14px 16px", borderBottom: `1px solid ${LINE}` }}>최근 활동</div>
            <div>
              {feed.map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: `1px solid #f1f5f9` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: e.color, borderRadius: 6, padding: "2px 7px", flexShrink: 0, width: 34, textAlign: "center" }}>{e.tag}</span>
                  <span style={{ fontSize: 13, flex: 1 }}>{e.text}</span>
                  <span style={{ fontSize: 12, color: MUTE, flexShrink: 0 }}>{kst(e.when)}</span>
                </div>
              ))}
              {feed.length === 0 && <div style={{ padding: 16, color: MUTE, fontSize: 13 }}>활동 없음</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
