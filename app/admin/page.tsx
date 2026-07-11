// NewSetter 관리자 대시보드 (/admin) — 로그인한 카카오 계정이 ADMIN_KAKAO_IDS 에 있으면 접근.
// 서버 컴포넌트: prisma 직접 조회 후 렌더. 크레파스 테마 대신 읽기 좋은 관리자 UI.
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

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
// "3일 전" 같은 상대 시간 (이탈 판단 가독성).
function ago(d: Date | string | null): string {
  if (!d) return "기록 없음";
  const ms = Date.now() - +new Date(d);
  const m = Math.floor(ms / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day}일 전`;
  return `${Math.floor(day / 30)}개월 전`;
}
function daysSince(d: Date | string | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - +new Date(d)) / 86400000);
}

// 이벤트 타입 → 라벨/색 (lib/activity.ts EventType 과 동기화).
const EV: Record<string, { label: string; color: string }> = {
  signup: { label: "가입", color: "#16a34a" },
  login: { label: "로그인", color: "#64748b" },
  crew_create: { label: "크루생성", color: "#2563eb" },
  crew_join: { label: "크루합류", color: "#3b82f6" },
  crew_leave: { label: "크루탈퇴", color: "#94a3b8" },
  poll_create: { label: "투표생성", color: "#9333ea" },
  poll_vote: { label: "투표참여", color: "#a855f7" },
  poll_close: { label: "투표마감", color: "#7c3aed" },
  visit_create: { label: "일정생성", color: "#0891b2" },
  visit_join: { label: "참여", color: "#0d9488" },
  visit_leave: { label: "불참", color: "#94a3b8" },
  visit_cancel: { label: "일정취소", color: "#94a3b8" },
  visit_update: { label: "일정변경", color: "#0891b2" },
  review_create: { label: "리뷰", color: "#ea580c" },
  problem_create: { label: "문제등록", color: "#d97706" },
  climb_log: { label: "완등로그", color: "#dc2626" },
  gym_favorite: { label: "즐겨찾기", color: "#e11d48" },
  account_delete: { label: "탈퇴", color: "#ef4444" },
};
function evOf(type: string) {
  return EV[type] ?? { label: type, color: "#64748b" };
}
// meta 에서 사람이 읽을 부가정보 추출.
function metaText(meta: Prisma.JsonValue | null): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const m = meta as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof m.name === "string") bits.push(`“${m.name}”`);
  if (typeof m.title === "string") bits.push(`“${m.title}”`);
  if (typeof m.gymName === "string") bits.push(String(m.gymName));
  if (typeof m.rating === "number") bits.push(`★${m.rating}`);
  if (m.personal === true) bits.push("개인");
  if (m.sent === true) bits.push("완등");
  return bits.length ? " · " + bits.join(" ") : "";
}

async function isAdmin(): Promise<{ ok: boolean; me?: { nickname: string; kakaoId: string | null } }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true, kakaoId: true } });
  if (!me) return { ok: false };
  const admins = (process.env.ADMIN_KAKAO_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { ok: !!me.kakaoId && admins.includes(me.kakaoId), me };
}

function Card({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 13, color: MUTE }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, color: INK }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{sub}</div>}
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

  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const d30 = new Date(now.getTime() - 30 * 86400000);

  // ── 집계 & 목록 병렬 조회 ──
  const [
    users, crews, gyms, polls, visits, reviews, problems, climbLogs,
    allUsers, crewRows, recentReviews,
    crewMemberUsers, votedUsers, attendedUsers, loggedUsers,
    recentEvents, ev7, evToday, activeToday, active7,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.crew.count(),
    prisma.gym.count(),
    prisma.poll.count(),
    prisma.visit.count(),
    prisma.review.count(),
    prisma.problem.count(),
    prisma.climbLog.count(),
    // 전체 유저 (가입추이·휴면·퍼널단계 표기용)
    prisma.user.findMany({
      orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: { id: true, nickname: true, kakaoId: true, profileImg: true, createdAt: true, lastSeenAt: true },
    }),
    prisma.crew.findMany({ orderBy: { createdAt: "desc" }, include: { leader: { select: { nickname: true } }, _count: { select: { members: true } } } }),
    prisma.review.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { gym: { select: { name: true } }, user: { select: { nickname: true } } } }),
    // ── 활성화 퍼널: 각 단계에 도달한 "고유 유저" 집합 (개수 + 유저별 단계 판정용) ──
    prisma.crewMember.groupBy({ by: ["userId"], where: { status: "APPROVED" } }),
    prisma.pollResponse.groupBy({ by: ["userId"] }),
    prisma.visitAttendee.groupBy({ by: ["userId"] }),
    prisma.climbLog.groupBy({ by: ["userId"] }),
    // ── 행동 로그 ──
    prisma.activityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 80, include: { user: { select: { nickname: true } } } }),
    prisma.activityEvent.groupBy({ by: ["type"], where: { createdAt: { gte: d7 } }, _count: { _all: true } }),
    prisma.activityEvent.groupBy({ by: ["type"], where: { createdAt: { gte: dayStart } }, _count: { _all: true } }),
    // 활성 유저(고유) — 오늘/7일 (로그 있는 액션 기준)
    prisma.activityEvent.findMany({ where: { createdAt: { gte: dayStart }, userId: { not: null } }, distinct: ["userId"], select: { userId: true } }),
    prisma.activityEvent.findMany({ where: { createdAt: { gte: d7 }, userId: { not: null } }, distinct: ["userId"], select: { userId: true } }),
  ]);

  // 퍼널 집합
  const crewSet = new Set(crewMemberUsers.map((r) => r.userId));
  const voteSet = new Set(votedUsers.map((r) => r.userId));
  const visitSet = new Set(attendedUsers.map((r) => r.userId));
  const logSet = new Set(loggedUsers.map((r) => r.userId));
  const funnel = [
    { label: "가입", count: users, color: "#16a34a", desc: "카카오 로그인" },
    { label: "크루 합류", count: crewSet.size, color: "#2563eb", desc: "크루 생성·가입" },
    { label: "투표 참여", count: voteSet.size, color: "#9333ea", desc: "일정 투표에 응답" },
    { label: "일정 참여", count: visitSet.size, color: "#0891b2", desc: "확정 일정에 '간다'" },
    { label: "완등 기록", count: logSet.size, color: "#dc2626", desc: "문제 완등 로그" },
  ];
  const funnelMax = Math.max(1, users);

  // 유저별 도달 단계 (깊은 단계부터)
  function stageOf(id: string): number {
    if (logSet.has(id)) return 4;
    if (visitSet.has(id)) return 3;
    if (voteSet.has(id)) return 2;
    if (crewSet.has(id)) return 1;
    return 0;
  }
  const STAGE_LABEL = ["가입만", "크루", "투표", "일정", "완등"];

  // ── 최근 14일 가입 추이 ──
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dd = new Date(now.getTime() - i * 86400000);
    days.push({ label: kstDate(dd), count: 0 });
  }
  const dayIndex = new Map(days.map((d, i) => [d.label, i]));
  for (const u of allUsers) {
    const idx = dayIndex.get(kstDate(u.createdAt));
    if (idx != null) days[idx].count++;
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  // ── 휴면/이탈 버킷 (전체 유저의 마지막 활동 기준) ──
  const lastOf = (u: { lastSeenAt: Date | null; createdAt: Date }) => u.lastSeenAt ?? u.createdAt;
  let bActive = 0, bIdle = 0, bDormant = 0;
  for (const u of allUsers) {
    const ds = daysSince(lastOf(u)) ?? 999;
    if (ds <= 3) bActive++; else if (ds <= 14) bIdle++; else bDormant++;
  }
  // 이탈 위험: 3일 이상 잠잠 + 완등단계 못 감, 최근활동 오래된 순
  const churnRisk = [...allUsers]
    .map((u) => ({ ...u, last: lastOf(u), ds: daysSince(lastOf(u)) ?? 999, stage: stageOf(u.id) }))
    .filter((u) => u.ds >= 3)
    .sort((a, b) => b.ds - a.ds)
    .slice(0, 20);

  // ── 이벤트 타입별 카운트 (7일, 오늘) ──
  const todayByType = new Map(evToday.map((e) => [e.type, e._count._all]));
  const typeStats = [...ev7]
    .map((e) => ({ type: e.type, week: e._count._all, today: todayByType.get(e.type) ?? 0 }))
    .sort((a, b) => b.week - a.week);
  const typeMax = Math.max(1, ...typeStats.map((t) => t.week));

  const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 12, color: MUTE, fontWeight: 600, borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "9px 12px", fontSize: 13, color: INK, borderBottom: `1px solid #f1f5f9`, whiteSpace: "nowrap" };
  const secHdr: React.CSSProperties = { fontSize: 14, fontWeight: 700, padding: "14px 16px", borderBottom: `1px solid ${LINE}` };

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "system-ui, -apple-system, sans-serif", color: INK, overflowX: "hidden" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>NewSetter 관리자</h1>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>기준 {kst(now)} · <a href="/admin" style={{ color: "#2563eb" }}>↻ 새로고침</a></div>
          </div>
          <div style={{ fontSize: 13, color: MUTE }}>{me?.nickname} 님 · <a href="/" style={{ color: "#2563eb" }}>앱으로</a></div>
        </div>

        {/* 통계 카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 20 }}>
          <Card label="유저" value={users} sub={`오늘 활성 ${activeToday.length} · 7일 ${active7.length}`} />
          <Card label="크루" value={crews} />
          <Card label="암장" value={gyms} />
          <Card label="투표" value={polls} />
          <Card label="방문" value={visits} />
          <Card label="리뷰" value={reviews} />
          <Card label="문제" value={problems} />
          <Card label="완등 로그" value={climbLogs} />
        </div>

        {/* ── 활성화 퍼널 (이탈 지점) ── */}
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>활성화 퍼널 · 어디서 이탈하나</div>
          <div style={{ fontSize: 12, color: MUTE, marginBottom: 16 }}>단계별 도달 고유 유저 수. 우측은 가입 대비 전환율 · 직전 단계 대비 이탈.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {funnel.map((f, i) => {
              const prev = i === 0 ? f.count : funnel[i - 1].count;
              const pctTotal = Math.round((f.count / funnelMax) * 100);
              const drop = i === 0 ? 0 : prev - f.count;
              const dropPct = i === 0 || prev === 0 ? 0 : Math.round((drop / prev) * 100);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 76, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: MUTE, lineHeight: 1.2, marginTop: 1 }}>{f.desc}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, background: "#f1f5f9", borderRadius: 8, height: 30, overflow: "hidden" }}>
                    <div style={{ width: `max(${pctTotal}%, 30px)`, height: "100%", background: f.color, borderRadius: 8, display: "flex", alignItems: "center", paddingLeft: 9, color: "#fff", fontSize: 13, fontWeight: 700 }}>
                      {f.count}
                    </div>
                  </div>
                  <div style={{ width: 72, flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{pctTotal}%</div>
                    {i > 0 && drop > 0 && <div style={{ fontSize: 11, color: "#dc2626" }}>▼{drop} ({dropPct}%)</div>}
                    {i > 0 && drop === 0 && <div style={{ fontSize: 11, color: MUTE }}>유지</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 20 }}>
          {/* 최근 14일 가입 */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>최근 14일 가입</div>
            <div style={{ overflowX: "auto", paddingBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 120, minWidth: 392 }}>
                {days.map((d, i) => (
                  <div key={i} style={{ width: 21, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 11, color: MUTE, height: 14 }}>{d.count || ""}</div>
                    <div title={`${d.label}: ${d.count}명`} style={{ width: "100%", height: `${(d.count / maxDay) * 74}px`, minHeight: d.count ? 4 : 0, background: "#3b82f6", borderRadius: "4px 4px 0 0" }} />
                    <div style={{ fontSize: 9, color: MUTE, whiteSpace: "nowrap" }}>{i % 2 === 0 ? d.label.replace(/\s/g, "") : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 활동 요약 (휴면 버킷 + 이벤트 타입) */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>참여 상태</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, background: "#f0fdf4", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{bActive}</div>
                <div style={{ fontSize: 11, color: MUTE }}>활성 (≤3일)</div>
              </div>
              <div style={{ flex: 1, background: "#fffbeb", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#d97706" }}>{bIdle}</div>
                <div style={{ fontSize: 11, color: MUTE }}>뜸함 (4~14일)</div>
              </div>
              <div style={{ flex: 1, background: "#fef2f2", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}>{bDormant}</div>
                <div style={{ fontSize: 11, color: MUTE }}>휴면 (&gt;14일)</div>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>행동 빈도 <span style={{ fontWeight: 400, color: MUTE, fontSize: 11 }}>(7일 · 오늘)</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {typeStats.slice(0, 10).map((t) => (
                <div key={t.type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 62, fontSize: 11, color: "#fff", background: evOf(t.type).color, borderRadius: 5, padding: "2px 6px", textAlign: "center", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{evOf(t.type).label}</span>
                  <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 5, height: 14 }}>
                    <div style={{ width: `${(t.week / typeMax) * 100}%`, height: "100%", background: evOf(t.type).color, opacity: 0.75, borderRadius: 5 }} />
                  </div>
                  <span style={{ fontSize: 12, color: INK, width: 52, textAlign: "right", flexShrink: 0 }}>{t.week}<span style={{ color: MUTE }}> · {t.today}</span></span>
                </div>
              ))}
              {typeStats.length === 0 && <div style={{ fontSize: 12, color: MUTE }}>아직 기록된 행동이 없어요 (배포 후 쌓이기 시작)</div>}
            </div>
          </section>
        </div>

        {/* ── 이탈 위험 사용자 ── */}
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", marginTop: 20 }}>
          <div style={secHdr}>이탈 위험 사용자 <span style={{ fontWeight: 400, color: MUTE, fontSize: 12 }}>· 3일+ 미활동, 오래된 순</span></div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}></th><th style={th}>닉네임</th><th style={th}>가입</th><th style={th}>마지막 활동</th><th style={th}>도달 단계</th></tr></thead>
              <tbody>
                {churnRisk.map((u) => (
                  <tr key={u.id}>
                    <td style={{ ...td, width: 40 }}>
                      {u.profileImg
                        ? <img src={u.profileImg} alt="" width={26} height={26} style={{ borderRadius: "50%", objectFit: "cover", display: "block" }} />
                        : <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: MUTE }}>{u.nickname?.[0] ?? "?"}</div>}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{u.nickname}</td>
                    <td style={{ ...td, color: MUTE }}>{kstDate(u.createdAt)}</td>
                    <td style={{ ...td, color: u.ds >= 14 ? "#dc2626" : "#d97706", fontWeight: 600 }}>{ago(u.last)}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, background: "#f1f5f9", color: INK, borderRadius: 5, padding: "2px 7px" }}>{STAGE_LABEL[u.stage]}</span>
                    </td>
                  </tr>
                ))}
                {churnRisk.length === 0 && <tr><td style={{ ...td, color: MUTE }} colSpan={5}>이탈 위험 사용자 없음 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 최근 활동 로그 (실제 행동 이벤트) ── */}
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", marginTop: 20 }}>
          <div style={secHdr}>실시간 활동 로그 <span style={{ fontWeight: 400, color: MUTE, fontSize: 12 }}>· 최근 {recentEvents.length}건</span></div>
          <div>
            {recentEvents.map((e) => {
              const m = evOf(e.type);
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: `1px solid #f1f5f9` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: m.color, borderRadius: 6, padding: "2px 7px", flexShrink: 0, minWidth: 52, textAlign: "center" }}>{m.label}</span>
                  <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <b>{e.user?.nickname ?? "(탈퇴 유저)"}</b>
                    <span style={{ color: MUTE }}>{metaText(e.meta)}</span>
                  </span>
                  <span style={{ fontSize: 12, color: MUTE, flexShrink: 0 }} title={kst(e.createdAt)}>{ago(e.createdAt)}</span>
                </div>
              );
            })}
            {recentEvents.length === 0 && <div style={{ padding: 16, color: MUTE, fontSize: 13 }}>아직 기록된 행동이 없어요. 이 배포 이후의 사용자 행동부터 로그가 쌓입니다.</div>}
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20, marginTop: 20 }}>
          {/* 크루 목록 */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={secHdr}>크루 ({crewRows.length})</div>
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

          {/* 가입자 목록 (마지막 활동 포함) */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={secHdr}>사용자 ({allUsers.length}) <span style={{ fontWeight: 400, color: MUTE, fontSize: 12 }}>· 최근 활동순</span></div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}></th><th style={th}>닉네임</th><th style={th}>가입일</th><th style={th}>마지막 활동</th><th style={th}>단계</th></tr></thead>
                <tbody>
                  {allUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={{ ...td, width: 40 }}>
                        {u.profileImg
                          ? <img src={u.profileImg} alt="" width={26} height={26} style={{ borderRadius: "50%", objectFit: "cover", display: "block" }} />
                          : <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: MUTE }}>{u.nickname?.[0] ?? "?"}</div>}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{u.nickname}</td>
                      <td style={{ ...td, color: MUTE }}>{kstDate(u.createdAt)}</td>
                      <td style={{ ...td, color: MUTE }}>{ago(u.lastSeenAt)}</td>
                      <td style={td}><span style={{ fontSize: 11, background: "#f1f5f9", borderRadius: 5, padding: "2px 7px" }}>{STAGE_LABEL[stageOf(u.id)]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 최근 리뷰 */}
          <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={secHdr}>최근 리뷰</div>
            <div>
              {recentReviews.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: `1px solid #f1f5f9` }}>
                  <span style={{ fontSize: 13, flex: 1 }}><b>{r.user?.nickname ?? "?"}</b> → {r.gym?.name ?? "?"} <span style={{ color: "#ea580c" }}>★{r.rating}</span></span>
                  <span style={{ fontSize: 12, color: MUTE }}>{kst(r.createdAt)}</span>
                </div>
              ))}
              {recentReviews.length === 0 && <div style={{ padding: 16, color: MUTE, fontSize: 13 }}>리뷰 없음</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
