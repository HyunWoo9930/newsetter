"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { api } from "@/lib/apiClient";
import GymMap from "./GymMap";

/* ===== 상수/헬퍼 ===== */
/* 크레파스 테마 토큰: 종이 위에 연필 테두리 + 크레파스 빗금 채움 */
const INK = "#2B2825"; // 연필 흑연 (순검정 금지)
const PAPER = "#FFFDF6"; // 스케치북 종이
const CRAYON = { red: "226,77,58", orange: "242,149,63", yellow: "245,201,61", green: "107,191,89", blue: "91,141,238", purple: "157,123,216" };
// 크레파스 빗금 — dense: 버튼 등 글자 올라가는 곳(틈 없음), soft: 장식 블롭(종이 틈 보임)
const hatch = (rgb: string) => `repeating-linear-gradient(48deg, rgba(${rgb},0.95) 0 3px, rgba(${rgb},0.7) 3px 5px, rgba(${rgb},0.9) 5px 7px)`;
const hatchSoft = (rgb: string) => `repeating-linear-gradient(48deg, rgba(${rgb},0.9) 0 3px, rgba(${rgb},0.45) 3px 5px, rgba(255,255,255,0.35) 5px 7px)`;
// 삐뚤빼뚤 테두리 반경 4종 — 요소마다 번갈아 써서 손맛
const WOBS = [
  "225px 18px 245px 15px / 16px 255px 15px 225px",
  "18px 225px 15px 245px / 245px 15px 225px 18px",
  "245px 15px 225px 18px / 225px 18px 16px 255px",
  "15px 245px 18px 225px / 18px 225px 255px 16px",
];
const wob = (i = 0): CSSProperties => ({ border: `2px solid ${INK}`, borderRadius: WOBS[i % WOBS.length] });
const crayonBtn = (rgb: string = CRAYON.red, i = 0): CSSProperties => ({ ...wob(i), background: hatch(rgb), color: "#fff", cursor: "pointer", transform: `rotate(${i % 2 ? 0.4 : -0.4}deg)` });
// 선택 상태용 노랑 형광펜 — 줄무늬를 은은한 워시로 눌러서 위 글자(잉크)가 항상 읽히게
const HILITE = `repeating-linear-gradient(-46deg, rgba(${CRAYON.yellow},0.26) 0 5px, rgba(${CRAYON.yellow},0.1) 5px 9px)`;

const HEX: Record<string, string> = {
  흰: "#EFEFE8", 노랑: "#F5C518", 주황: "#F07E1E", 초록: "#3AAE5A",
  파랑: "#2F72E0", 빨강: "#E23B3B", 보라: "#8B5CF6", 검정: "#2A2A2A",
};
const PALETTE = ["#E24D3A", "#6BBF59", "#5B8DEE", "#9D7BD8", "#F2953F"];
const REVIEW_TAGS = ["세팅 좋음", "초보 친화", "붐빔", "주차 편함", "샤워 좋음", "고인물 많음"];
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const REL_FEEL: Record<string, string> = { 쉬움: "EASIER", 적정: "AS_EXPECTED", 어려움: "HARDER" };

const fmtDate = (iso: string) => { const d = new Date(iso); const yr = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}년 ` : ""; return `${yr}${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
const fmtDateTime = (iso: string) => { const d = new Date(iso); return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, "0")}:00~`; };
const fmtDeadline = (iso: string | null) => { if (!iso) return "상시"; const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000); return diff > 0 ? `D-${diff} 마감` : "마감"; };
const rel = (iso: string) => { const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return diff <= 0 ? "오늘" : diff < 7 ? `${diff}일 전` : `${Math.floor(diff / 7)}주 전`; };
// 프랜차이즈(체인) 추출 — 이름 첫 토큰이 브랜드. 단, "클라이밍" 같은 일반어면 두 토큰까지.
const GENERIC_WORDS = new Set(["클라이밍", "볼더링", "볼더", "실내클라이밍", "스포츠클라이밍", "클라이밍짐"]);
const brandOf = (name: string) => {
  const t = (name || "").trim().split(/\s+/);
  if (t.length >= 2 && GENERIC_WORDS.has(t[0])) return `${t[0]} ${t[1]}`;
  return t[0] || name || "";
};
const PIN_RGB = ["226,77,58", "242,149,63", "230,180,20", "107,191,89", "91,141,238", "157,123,216"];
const brandColorRgb = (name: string) => { const b = brandOf(name); return PIN_RGB[[...b].reduce((a, c) => a + c.charCodeAt(0), 0) % PIN_RGB.length]; };

const handleOf = (ig: string | null) => {
  if (!ig) return "";
  let seg = "";
  try { seg = new URL(ig.startsWith("http") ? ig : `https://${ig}`).pathname.split("/").filter(Boolean).pop() || ""; }
  catch { seg = ig.split("/").filter(Boolean).pop() || ""; }
  // 도메인만 있거나(예: instagram.com) 세그먼트가 없으면 핸들 없음으로 처리
  if (!seg || seg.includes(".")) return "";
  return "@" + seg.replace(/^@/, "");
};
const feelFromScore = (score: number | null) => (score == null ? 0.5 : Math.min(1, Math.max(0, (score + 1) / 2)));
const feelLabel = (feel: number) => (feel < 0.33 ? "쉬움" : feel < 0.66 ? "적정" : "어려움");
const tagOf = (label: string | null, color: string) => (label ? label.replace(color, "").replace("·", "").trim() : "");

const dotStyle = (hex: string, name: string, size = 16): CSSProperties => ({ width: size, height: size, borderRadius: 999, background: hex, flexShrink: 0, border: name === "흰" ? "1.5px solid #D6D4CC" : "none", boxShadow: name === "검정" ? "inset 0 0 0 1px rgba(255,255,255,0.18)" : "none" });
const meterFill = (feel: number): CSSProperties => ({ position: "absolute", top: 0, bottom: 0, left: 0, width: feel * 100 + "%", borderRadius: 999, background: "linear-gradient(90deg,#3AAE5A,#E0921A,#E23B3B)" });
// 암장/크루 아바타 = 크레파스로 칠한 홀드 블롭
const hexRgb = (hex: string) => { const h = (hex || "#E24D3A").replace("#", ""); return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`; };
const avatarStyle = (color: string, size = 44): CSSProperties => ({ width: size, height: size, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size >= 60 ? 26 : 19, background: hatch(hexRgb(color)), color: "#fff", border: `2px solid ${INK}`, transform: "rotate(-2deg)" });
const cardStyle: CSSProperties = { background: "#FFFEFA", border: `2px solid ${INK}`, borderRadius: WOBS[0] };
const sectionLabel: CSSProperties = { fontSize: 16, fontWeight: 700, color: "#443F38" };
const H1: CSSProperties = { fontSize: 30, fontWeight: 700, letterSpacing: "0" };

const BackBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} style={{ width: 44, height: 44, marginLeft: -6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="뒤로"><svg width="13" height="21" viewBox="0 0 12 20" fill="none"><path d="M10 2 2 10l8 8" stroke="#3A3633" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
);
const ChevR = () => (<svg width="8" height="14" viewBox="0 0 8 14" style={{ flexShrink: 0 }}><path d="M1 1l6 6-6 6" stroke="#CFCCC2" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const PlayDot = () => (<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 2l7 4-7 4z" fill="#514C44" /></svg>);

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

// URL 로 복원해도 되는 화면들 (딥링크·새로고침). 폼/모달성 화면은 제외 → 홈으로.
const LINKABLE = new Set(["home", "explore", "calendar", "profile", "vote", "gymDetail", "crewManage", "probList", "probDetail"]);

export default function ClimbCrewApp() {
  // 네비게이션 / 입력 상태 — 화면 상태는 URL(?s=…)과 동기화 (뒤로가기·새로고침·딥링크)
  const [screen, setScreen] = useState("login");
  const [selGym, setSelGym] = useState<string | null>(null);
  const [selSettingId, setSelSettingId] = useState<string | null>(null);
  const [selProb, setSelProb] = useState<string | null>(null);
  const [selPollId, setSelPollId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [sort, setSort] = useState<"easy" | "hard">("easy");
  const [growthMode, setGrowthMode] = useState(false);
  const [form, setForm] = useState({ name: "", bio: "", region: "", kakao: "" });
  const [joinCode, setJoinCode] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [recGym, setRecGym] = useState<string | null>(null);
  const [recColor, setRecColor] = useState("파랑");
  const [recFeel, setRecFeel] = useState("적정");
  const [recHoney, setRecHoney] = useState(false);
  const [recMemo, setRecMemo] = useState("");

  // 라이브 데이터
  const [me, setMe] = useState<Any>(null);
  const [crews, setCrews] = useState<Any[]>([]);
  const [activeCrewId, setActiveCrewId] = useState<string | null>(null);
  const [crewGyms, setCrewGyms] = useState<Any[]>([]);
  const [polls, setPolls] = useState<Any[]>([]);
  const [visits, setVisits] = useState<Any[]>([]);
  const [detailVisitId, setDetailVisitId] = useState<string | null>(null);
  const [visitEdit, setVisitEdit] = useState<Any | null>(null);
  const [visitEditDate, setVisitEditDate] = useState("");
  const [visitEditGymId, setVisitEditGymId] = useState<string | null>(null);
  const [visitEditGymQ, setVisitEditGymQ] = useState("");
  const [crewDetail, setCrewDetail] = useState<Any>(null);
  const [requests, setRequests] = useState<Any[]>([]);
  const [gymDetail, setGymDetail] = useState<Any>(null);
  const [gymReviews, setGymReviews] = useState<Any[]>([]);
  const [problemsData, setProblemsData] = useState<Any>(null);
  const [probDetail, setProbDetail] = useState<Any>(null);
  const [recos, setRecos] = useState<Any>(null);
  const [recProblems, setRecProblems] = useState<Any[]>([]);

  const { status } = useSession();
  const kakaoEnabled = process.env.NEXT_PUBLIC_KAKAO_ENABLED === "true";
  const [bootstrapped, setBootstrapped] = useState(false);
  const startWasAuto = useRef(false); // 크루 없음으로 자동 이동한 start 인지(수동 '코드로 참여'와 구분)

  // 투표 로컬 선택
  const [voteDates, setVoteDates] = useState<Record<string, boolean>>({});
  const [voteGyms, setVoteGyms] = useState<Record<string, boolean>>({});
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [voteTab, setVoteTab] = useState<"date" | "gym">("date");
  const [focusDay, setFocusDay] = useState<string | null>(null);

  // 투표 만들기 / 마감
  const [pollTitle, setPollTitle] = useState("");
  const [pollRange, setPollRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [pollDeadlineDays, setPollDeadlineDays] = useState<number | null>(5);
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [pollDates, setPollDates] = useState<{ date: string; label: string }[]>([]);
  const [pollGymIds, setPollGymIds] = useState<string[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("저녁");
  const [exploreQ, setExploreQ] = useState("");
  const [mapSel, setMapSel] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);
  const [allGymsList, setAllGymsList] = useState<Any[]>([]);
  const [crewHomeGymIds, setCrewHomeGymIds] = useState<string[]>([]);
  const [createGymQ, setCreateGymQ] = useState("");
  const [manageHomeIds, setManageHomeIds] = useState<string[]>([]);
  const [manageQ, setManageQ] = useState("");
  const [homeEditOpen, setHomeEditOpen] = useState(false);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [pollCalOffset, setPollCalOffset] = useState(0);
  const [gymSearch, setGymSearch] = useState("");
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [sharePoll, setSharePoll] = useState<Any>(null);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [deletePollSheetOpen, setDeletePollSheetOpen] = useState(false);
  const [visitSheetOpen, setVisitSheetOpen] = useState(false);
  const [visitDate, setVisitDate] = useState("");
  const [crewLoaded, setCrewLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [crewEditOpen, setCrewEditOpen] = useState(false);
  const [crewEdit, setCrewEdit] = useState({ name: "", bio: "", region: "", kakao: "" });
  const [leaveSheetOpen, setLeaveSheetOpen] = useState(false);
  // 지도 키가 없으면 목록이 기본 — 지도 단독 의존 탈피
  const [exploreView, setExploreView] = useState<"map" | "list">(process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ? "map" : "list");
  // 개인 모드 — 크루 없이도 내 기록·즐겨찾기로 사용
  const [mode, setMode] = useState<"crew" | "personal">("crew");
  const [myGyms, setMyGyms] = useState<Any[]>([]);
  const [myVisits, setMyVisits] = useState<Any[]>([]);
  const [personalLoaded, setPersonalLoaded] = useState(false);
  const [recordSheetOpen, setRecordSheetOpen] = useState(false);
  const [recordGymId, setRecordGymId] = useState<string | null>(null);
  const [recordGymQ, setRecordGymQ] = useState("");
  const [recordDate, setRecordDate] = useState("");

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((m: string) => { setToast(m); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 1900); }, []);

  // 네비게이션 — 브라우저 히스토리와 동기화 (모바일 뒤로가기 · 새로고침 복원 · 딥링크)
  type NavSel = { gym?: string | null; setting?: string | null; prob?: string | null; poll?: string | null; m?: boolean };
  const navDepth = useRef(0);
  const navState = (sc: string, sel: NavSel = {}) => ({ sc, gym: sel.gym ?? null, setting: sel.setting ?? null, prob: sel.prob ?? null, poll: sel.poll ?? null, m: sel.m ?? (mode === "personal") });
  const urlOf = (st: ReturnType<typeof navState>) => {
    const q = new URLSearchParams();
    if (st.sc !== "home") q.set("s", st.sc);
    if (st.gym) q.set("gym", st.gym);
    if (st.setting) q.set("set", st.setting);
    if (st.prob) q.set("prob", st.prob);
    if (st.poll) q.set("poll", st.poll);
    if (st.m) q.set("m", "me"); // 개인 모드 — 새로고침해도 유지
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };
  const pushNav = (sc: string, sel: NavSel = {}) => { const st = navState(sc, sel); navDepth.current += 1; window.history.pushState({ ...st, d: navDepth.current }, "", urlOf(st)); };
  const replaceNav = (sc: string, sel: NavSel = {}) => { const st = navState(sc, sel); window.history.replaceState({ ...st, d: navDepth.current }, "", urlOf(st)); };
  const go = (sc: string, sel: NavSel = {}) => { pushNav(sc, sel); setScreen(sc); };
  const tab = (sc: string, sel: NavSel = {}) => { pushNav(sc, sel); setScreen(sc); };
  const back = () => {
    if (navDepth.current > 0) { window.history.back(); return; }
    // 딥링크로 바로 들어온 경우 등 — 뒤가 없으면 홈으로
    replaceNav("home"); setScreen("home");
  };
  const openGym = (id: string) => { setSelGym(id); pushNav("gymDetail", { gym: id }); setScreen("gymDetail"); };
  const openProblems = (gymId: string, settingId: string | null) => { setSelGym(gymId); setSelSettingId(settingId); pushNav("probList", { gym: gymId, setting: settingId }); setScreen("probList"); };
  const openProb = (id: string) => { setSelProb(id); pushNav("probDetail", { prob: id }); setScreen("probDetail"); };
  const goVote = (pollId: string) => { setSelPollId(pollId); pushNav("vote", { poll: pollId }); setScreen("vote"); };

  // 뒤로가기/앞으로가기 → 히스토리 상태에서 화면 복원
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as (ReturnType<typeof navState> & { d?: number }) | null;
      navDepth.current = st?.d ?? 0;
      if (!st?.sc) { setScreen("home"); return; }
      if (st.gym) setSelGym(st.gym);
      if (st.setting) setSelSettingId(st.setting);
      if (st.prob) setSelProb(st.prob);
      if (st.poll) setSelPollId(st.poll);
      setMode(st.m ? "personal" : "crew");
      setScreen(st.sc);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* ===== 데이터 로딩 ===== */
  // 공개 데이터 + 초대코드 + 딥링크 파라미터 (마운트 1회)
  const pendingLink = useRef<{ s: string; poll: string | null; gym: string | null; prob: string | null; setting: string | null; crew: string | null; m: boolean } | null>(null);
  useEffect(() => {
    api.gymsList().then(setAllGymsList).catch(() => {});
    const sp = new URLSearchParams(window.location.search);
    const inv = sp.get("invite");
    if (inv) { setJoinCode(inv.toUpperCase()); setInvitePending(true); }
    const s = sp.get("s");
    const m = sp.get("m") === "me";
    if (s || m) pendingLink.current = { s: s ?? "home", poll: sp.get("poll"), gym: sp.get("gym"), prob: sp.get("prob"), setting: sp.get("set"), crew: sp.get("crew"), m };
  }, []);

  // 앱 진입 — 딥링크(또는 새로고침 시 URL)가 있으면 해당 화면으로, 아니면 홈으로.
  // 크루가 없으면 개인 모드 홈 — 혼자서도 기록·탐색을 바로 쓸 수 있게.
  const enterApp = (cs: Any[]) => {
    const link = pendingLink.current;
    pendingLink.current = null;
    if (invitePending) { startWasAuto.current = false; navDepth.current = 0; replaceNav("start", { m: false }); setScreen("start"); return; }
    let sc = "home";
    const sel: NavSel = { m: false };
    if (!cs.length) {
      startWasAuto.current = true; // 크루가 뒤늦게 로드되면 크루 모드로 복귀 대상
      setMode("personal");
      sel.m = true;
    } else {
      startWasAuto.current = false;
    }
    if (link?.m) { setMode("personal"); sel.m = true; }
    if (link && LINKABLE.has(link.s)) {
      const target = link.crew ? cs.find((c: Any) => c.id === link.crew) : null;
      if (link.crew && !target) {
        showToast("크루 멤버만 볼 수 있는 링크예요");
      } else {
        if (target) setActiveCrewId(target.id);
        sc = link.s;
        if (link.poll) { setSelPollId(link.poll); sel.poll = link.poll; }
        if (link.gym) { setSelGym(link.gym); sel.gym = link.gym; }
        if (link.prob) { setSelProb(link.prob); sel.prob = link.prob; }
        if (link.setting) { setSelSettingId(link.setting); sel.setting = link.setting; }
      }
    }
    navDepth.current = 0;
    replaceNav(sc, sel);
    setScreen(sc);
  };

  const loadCrews = useCallback(() =>
    api.crews().then((cs: Any) => { setCrews(cs); setActiveCrewId((prev) => prev ?? (cs[0]?.id ?? null)); return cs as Any[]; }), []);

  // 세션이 확정되면(카카오 로그인 완료 포함) 내 정보·크루를 다시 불러온다.
  // 로그인 전 한 번 빈 결과를 받아도 로그인 후 재조회되도록 status 의존.
  useEffect(() => {
    if (status === "loading") return;
    api.me().then(setMe).catch(() => setMe(null));
    loadCrews().catch(() => {}).finally(() => setBootstrapped(true));
  }, [status, loadCrews]);

  // 뒤로가기 복원(bfcache)·탭 복귀 시 크루를 다시 불러온다 (로그인 직후 stale 방지)
  useEffect(() => {
    const refetch = () => { if (status === "authenticated") loadCrews().catch(() => {}); };
    const onVis = () => { if (document.visibilityState === "visible") refetch(); };
    window.addEventListener("pageshow", refetch);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("pageshow", refetch); document.removeEventListener("visibilitychange", onVis); };
  }, [status, loadCrews]);

  // #7 실시간 알림(SSE): 내 크루들의 이벤트를 받아 토스트 + 자동 새로고침
  const activeCrewRef = useRef<string | null>(null);
  useEffect(() => { activeCrewRef.current = activeCrewId; }, [activeCrewId]);
  useEffect(() => {
    if (status !== "authenticated") return;
    const es = new EventSource("/api/events");
    es.onmessage = (ev) => {
      let e: Any; try { e = JSON.parse(ev.data); } catch { return; }
      if (!e || e.type === "hello") return;
      const msgMap: Record<string, string> = {
        poll_created: "🗳️ 새 투표가 올라왔어요",
        vote_submitted: "✍️ 누군가 투표했어요",
        poll_closed: `✅ 투표 마감: ${e.title ?? ""}`,
        poll_deleted: "🗑️ 투표가 삭제됐어요",
        visit_created: "📅 새 일정이 잡혔어요",
        visit_updated: "🔁 일정이 변경됐어요",
        visit_canceled: "❌ 일정이 취소됐어요",
        visit_attend: "🙋 일정 참여자가 바뀌었어요",
      };
      if (msgMap[e.type]) showToast(msgMap[e.type]);
      const cur = activeCrewRef.current;
      if (cur && e.crewId === cur) {
        api.crewPolls(cur).then(setPolls).catch(() => {});
        api.crewVisits(cur).then(setVisits).catch(() => {});
        api.crewGyms(cur).then(setCrewGyms).catch(() => {});
      }
    };
    es.onerror = () => { /* 브라우저가 자동 재연결 */ };
    return () => es.close();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // 카카오톡 공유 SDK (JS 키가 있을 때만 로드)
  useEffect(() => {
    const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!jsKey) return;
    const w = window as Any;
    if (w.Kakao) { if (!w.Kakao.isInitialized()) w.Kakao.init(jsKey); return; }
    const s = document.createElement("script");
    s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
    s.async = true;
    s.onload = () => { if (w.Kakao && !w.Kakao.isInitialized()) w.Kakao.init(jsKey); };
    document.head.appendChild(s);
  }, []);

  // 카카오 세션이 확인되면 로그인 화면을 건너뜀 (딥링크·새로고침 URL이 있으면 그 화면으로 복원)
  useEffect(() => {
    if (status === "authenticated" && bootstrapped && screen === "login") enterApp(crews);
  }, [status, bootstrapped, screen, crews]); // eslint-disable-line react-hooks/exhaustive-deps
  // 개발 모드(카카오 미연동)에선 dev 유저가 확인되면 자동 진입 — 새로고침해도 화면 유지
  useEffect(() => {
    if (!kakaoEnabled && bootstrapped && me && screen === "login") enterApp(crews);
  }, [kakaoEnabled, bootstrapped, me, screen, crews]); // eslint-disable-line react-hooks/exhaustive-deps

  // 크루가 없어 자동으로 개인 모드 홈에 갔는데, 뒤늦게 크루가 로드되면 크루 모드로 복귀.
  // (사용자가 직접 개인 모드로 전환한 경우는 startWasAuto=false 라 건드리지 않음)
  useEffect(() => {
    if (screen === "home" && mode === "personal" && startWasAuto.current && !invitePending && crews.length > 0) {
      startWasAuto.current = false;
      setMode("crew");
      replaceNav("home", { m: false });
    }
  }, [screen, mode, crews.length, invitePending]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadCrew = useCallback((id: string) => {
    setCrewLoaded(false);
    Promise.allSettled([
      api.crewGyms(id).then((rows: Any) => { setCrewGyms(rows); const first = rows.find((r: Any) => r.latestSetting); if (first) setSelSettingId((s) => s ?? first.latestSetting.id); }),
      api.crewPolls(id).then(setPolls),
      api.crewVisits(id).then(setVisits),
      api.crew(id).then(setCrewDetail),
      api.requests(id).then(setRequests).catch(() => setRequests([])), // 멤버는 신청 목록 권한이 없을 수 있음 — 정상
    ]).then((rs) => {
      setCrewLoaded(true);
      if (rs.some((r) => r.status === "rejected")) showToast("일부 데이터를 불러오지 못했어요");
    });
  }, [showToast]);
  useEffect(() => { if (activeCrewId) reloadCrew(activeCrewId); }, [activeCrewId, reloadCrew]);

  // 개인 데이터 (내 기록·즐겨찾기) — 로그인 확인 후 1회 + 개인 모드 진입 시 갱신.
  // 즐겨찾기 ★ 은 크루 모드의 암장 상세에서도 쓰므로 미리 로드해 둔다.
  const reloadPersonal = useCallback(() => {
    Promise.allSettled([
      api.meGyms().then(setMyGyms),
      api.meVisits().then(setMyVisits),
    ]).then(() => setPersonalLoaded(true));
  }, []);
  useEffect(() => { if (me?.id) reloadPersonal(); }, [me?.id, reloadPersonal]);
  useEffect(() => { if (mode === "personal" && me?.id) reloadPersonal(); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 암장 상세
  useEffect(() => {
    if (screen !== "gymDetail" || !selGym) return;
    api.gym(selGym, activeCrewId || undefined).then(setGymDetail).catch(() => {});
    api.gymReviews(selGym).then(setGymReviews).catch(() => setGymReviews([]));
  }, [screen, selGym, activeCrewId]);

  // 문제 목록
  useEffect(() => { if (screen === "probList" && selSettingId) api.problems(selSettingId).then(setProblemsData).catch(() => {}); }, [screen, selSettingId]);
  // 문제 상세
  useEffect(() => { if (screen === "probDetail" && selProb) api.problem(selProb).then(setProbDetail).catch(() => {}); }, [screen, selProb]);
  // 추천 (홈 + 추천화면)
  useEffect(() => { if (selSettingId) api.recommendations(selSettingId, growthMode).then(setRecos).catch(() => {}); }, [selSettingId, growthMode]);
  // 완등 기록 대상 문제
  useEffect(() => {
    if (screen !== "record") return;
    const g = crewGyms.find((r) => r.id === (recGym || crewGyms[0]?.id));
    if (g?.latestSetting) api.problems(g.latestSetting.id).then((d: Any) => setRecProblems(d.colors.flatMap((c: Any) => c.problems))).catch(() => setRecProblems([]));
  }, [screen, recGym, crewGyms]);

  // 진행 중인 투표 — 여러 개 열려 있을 수 있음. 투표 화면은 선택된 것(없으면 첫 번째)을 보여줌.
  const openPolls = polls.filter((p) => p.status === "OPEN");
  const openPoll = (selPollId ? openPolls.find((p) => p.id === selPollId) : null) || openPolls[0] || null;
  useEffect(() => {
    if (screen !== "vote" || !openPoll) return;
    api.poll(openPoll.id).then((p: Any) => {
      setPolls((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
      const d: Record<string, boolean> = {}; p.myVotes.dateOptionIds.forEach((id: string) => (d[id] = true));
      const gy: Record<string, boolean> = {}; p.myVotes.gymOptionIds.forEach((id: string) => (gy[id] = true));
      setVoteDates(d); setVoteGyms(gy); setVoteSubmitted(p.myVotes.dateOptionIds.length + p.myVotes.gymOptionIds.length > 0);
      setVoteTab("date"); setFocusDay(null);
    }).catch(() => showToast("투표를 불러오지 못했어요"));
  }, [screen, openPoll?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ===== 액션 ===== */
  const createCrew = async () => {
    if (creating) return; // 더블 탭으로 크루가 복제되지 않게
    if (!form.name.trim()) { showToast("크루 이름을 입력해주세요"); return; }
    setCreating(true);
    try {
      const c: Any = await api.post("/api/crews", { name: form.name, description: form.bio, region: form.region, openChatUrl: form.kakao, homeGymIds: crewHomeGymIds });
      const cs: Any = await api.crews();
      setCrews(cs); setActiveCrewId(c.id); setCrewHomeGymIds([]); setCreateGymQ("");
      setForm({ name: "", bio: "", region: "", kakao: "" }); // 뒤로가기로 돌아와도 재생성되지 않게 비움
      go("invite");
    } catch (e: Any) { showToast(e.message); }
    finally { setCreating(false); }
  };
  const joinByCode = async () => { if (!joinCode.trim()) { showToast("초대 코드를 입력해주세요"); return; } try { const r: Any = await api.post("/api/crews/join", { inviteCode: joinCode }); const cs: Any = await api.crews(); setCrews(cs); setActiveCrewId(r.crewId); tab("home"); showToast("크루에 참여했어요"); } catch (e: Any) { showToast(e.message); } };
  const handleReq = async (userId: string, name: string, ok: boolean) => { try { await api.patch(`/api/crews/${activeCrewId}/requests/${userId}`, { action: ok ? "approve" : "reject" }); showToast(ok ? `${name}님을 승인했어요` : `${name}님 신청을 거절했어요`); if (activeCrewId) reloadCrew(activeCrewId); } catch (e: Any) { showToast(e.message); } };
  const switchCrew = (id: string) => { const c = crews.find((x) => x.id === id); setActiveCrewId(id); setMode("crew"); setSwitcherOpen(false); tab("home", { m: false }); showToast(`${c?.name ?? ""}(으)로 전환했어요`); };
  const switchPersonal = () => { setMode("personal"); setSwitcherOpen(false); tab("home", { m: true }); showToast("나의 클라이밍으로 전환했어요"); };
  // 즐겨찾기 ★ — 개인 모드의 홈 암장 역할. 낙관적 업데이트 후 서버 반영.
  const toggleFavorite = async (gymId: string, next: boolean) => {
    setMyGyms((gs) => gs.map((g: Any) => (g.id === gymId ? { ...g, isHome: next, isFavorite: next } : g)));
    try { await api.favoriteGym(gymId, next); showToast(next ? "즐겨찾기에 추가했어요 ★" : "즐겨찾기에서 뺐어요"); }
    catch (e: Any) { setMyGyms((gs) => gs.map((g: Any) => (g.id === gymId ? { ...g, isHome: !next, isFavorite: !next } : g))); showToast(e.message); }
  };
  const isFavGym = (gymId: string | null) => !!(gymId && myGyms.find((g: Any) => g.id === gymId)?.isFavorite);
  // 개인 기록 추가/삭제
  const openRecordSheet = () => { const t = new Date(); setRecordGymId(null); setRecordGymQ(""); setRecordDate(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`); setRecordSheetOpen(true); };
  const addPersonalVisit = async () => {
    if (!recordGymId) { showToast("암장을 골라주세요"); return; }
    if (!recordDate) { showToast("날짜를 골라주세요"); return; }
    try {
      await api.post("/api/me/visits", { gymId: recordGymId, date: new Date(`${recordDate}T12:00:00`).toISOString() });
      setRecordSheetOpen(false);
      showToast("기록을 추가했어요");
      reloadPersonal();
    } catch (e: Any) { showToast(e.message); }
  };
  const deletePersonalVisit = async (id: string) => {
    try { await api.del(`/api/me/visits/${id}`); showToast("기록을 삭제했어요"); reloadPersonal(); }
    catch (e: Any) { showToast(e.message); }
  };
  const submitVote = async () => { if (!openPoll) return; const dIds = Object.keys(voteDates).filter((k) => voteDates[k]); const gIds = Object.keys(voteGyms).filter((k) => voteGyms[k]); try { await api.post(`/api/polls/${openPoll.id}/responses`, { dateOptionIds: dIds, gymOptionIds: gIds }); setVoteSubmitted(true); showToast(dIds.length ? "응답을 제출했어요" : "다 가능으로 제출했어요"); if (activeCrewId) api.crewPolls(activeCrewId).then(setPolls); api.poll(openPoll.id).then((p: Any) => setPolls((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)))); } catch (e: Any) { showToast(e.message); } };
  const inviteLink = () => `${window.location.origin}/?invite=${crewDetail?.inviteCode ?? ""}`;
  const inviteText = () => `NewSetter · '${crewDetail?.name ?? "우리 크루"}' 크루에 초대합니다!\n초대 코드: ${crewDetail?.inviteCode ?? ""}`;
  const copyLink = async () => { try { await navigator.clipboard.writeText(`${inviteText()}\n${inviteLink()}`); showToast("초대 링크를 복사했어요"); } catch { showToast("복사에 실패했어요"); } };
  const shareInvite = async () => {
    const url = inviteLink(), text = inviteText(), title = `${crewDetail?.name ?? "크루"} 초대`;
    const w = window as Any;
    if (w.Kakao?.isInitialized?.() && w.Kakao.Share) {
      try { w.Kakao.Share.sendDefault({ objectType: "feed", content: { title, description: text, imageUrl: window.location.origin + "/brand/climbcrew-icon-512.png", link: { mobileWebUrl: url, webUrl: url } }, buttons: [{ title: "크루 참여하기", link: { mobileWebUrl: url, webUrl: url } }] }); return; } catch { /* fall through */ }
    }
    if ((navigator as Any).share) { try { await (navigator as Any).share({ title, text, url }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); showToast("초대 링크를 복사했어요"); } catch { showToast("이 브라우저는 공유를 지원하지 않아요"); }
  };
  const saveRecord = async () => {
    const g = crewGyms.find((r) => r.id === (recGym || crewGyms[0]?.id));
    const target = recProblems.find((p) => p.color === recColor);
    if (!g?.latestSetting) { showToast("세팅 정보가 없어요"); return; }
    if (!target) { showToast(`${recColor} 문제가 아직 없어요 · 먼저 등록해주세요`); return; }
    try { await api.post(`/api/problems/${target.id}/logs`, { sent: true, relativeFeel: REL_FEEL[recFeel], honey: recHoney, content: recMemo || undefined }); showToast("완등 기록을 저장했어요"); tab("home"); } catch (e: Any) { showToast(e.message); }
  };
  // 방문/일정 추가 — 실수 탭 방지를 위해 날짜 확인 시트를 거침
  const openVisitSheet = () => { const t = new Date(); setVisitDate(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`); setVisitSheetOpen(true); };
  const recordVisit = async () => {
    if (!selGym || !visitDate) return;
    const iso = new Date(`${visitDate}T12:00:00`).toISOString();
    try {
      if (mode === "personal") {
        // 개인 모드 — 크루와 무관한 내 기록으로 저장
        await api.post("/api/me/visits", { gymId: selGym, date: iso });
        setVisitSheetOpen(false);
        showToast("내 기록에 추가했어요");
        reloadPersonal();
      } else {
        if (!activeCrewId) return;
        await api.post(`/api/crews/${activeCrewId}/visits`, { gymId: selGym, date: iso });
        setVisitSheetOpen(false);
        showToast("방문 기록을 추가했어요");
        api.crewVisits(activeCrewId).then(setVisits);
        api.crewGyms(activeCrewId).then(setCrewGyms);
      }
      if (selGym) api.gym(selGym, activeCrewId || undefined).then(setGymDetail);
    } catch (e: Any) { showToast(e.message); }
  };

  // 일정(방문) 참여/취소/변경 — #2,#3,#4
  const reloadVisits = () => { if (activeCrewId) { api.crewVisits(activeCrewId).then(setVisits).catch(() => {}); api.crewGyms(activeCrewId).then(setCrewGyms).catch(() => {}); } };
  const attendVisit = async (v: Any, going: boolean) => { try { await api.visitAttend(v.id, going); reloadVisits(); showToast(going ? "이 일정에 참여해요!" : "참여를 취소했어요"); } catch (e: Any) { showToast(e.message); } };
  const cancelVisit = async (v: Any) => { try { await api.visitCancel(v.id); reloadVisits(); showToast("일정을 취소했어요"); } catch (e: Any) { showToast(e.message); } };
  const openVisitEdit = (v: Any) => { setVisitEdit(v); setVisitEditDate(String(v.date).slice(0, 10)); setVisitEditGymId(v.gym?.id ?? null); setVisitEditGymQ(""); };
  const saveVisitEdit = async () => { if (!visitEdit) return; if (!visitEditDate) { showToast("날짜를 골라주세요"); return; } try { await api.visitUpdate(visitEdit.id, { date: visitEditDate, gymId: visitEditGymId || undefined }); setVisitEdit(null); reloadVisits(); showToast("일정을 변경했어요"); } catch (e: Any) { showToast(e.message); } };
  const openVisitDetail = (v: Any) => setDetailVisitId(v.id);

  const openCreatePoll = () => { setPollTitle(""); setPollRange({ start: null, end: null }); setPollDeadlineDays(5); setPollGymIds([]); setPickedDay(null); setPollCalOffset(0); setGymSearch(""); go("createPoll"); };
  // 범위 선택: 첫 탭=시작, 둘째 탭=끝(시작보다 빠르면 시작을 다시 잡음). 이미 범위가 있으면 새로 시작.
  const tapRangeDay = (ds: string) => setPollRange((r) => {
    if (!r.start || r.end) return { start: ds, end: null };
    if (ds < r.start) return { start: ds, end: null };
    const days = Math.round((new Date(ds).getTime() - new Date(r.start).getTime()) / 86400000) + 1;
    if (days > 31) { showToast("날짜 범위는 최대 31일까지예요"); return r; }
    return { start: r.start, end: ds };
  });
  const toggleHomeGym = (id: string) => {
    if (!crewHomeGymIds.includes(id) && crewHomeGymIds.length >= 4) showToast("홈 암장은 최대 4곳이에요");
    setCrewHomeGymIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : h.length >= 4 ? h : [...h, id]));
  };
  const openCrewManage = () => { setManageHomeIds(crewGyms.filter((g) => g.isHome).map((g) => g.id)); setManageQ(""); if (activeCrewId) reloadCrew(activeCrewId); go("crewManage"); };
  const openCrewEdit = () => { setCrewEdit({ name: crewDetail?.name ?? ac?.name ?? "", bio: crewDetail?.description ?? "", region: crewDetail?.region ?? "", kakao: crewDetail?.openChatUrl ?? "" }); setCrewEditOpen(true); };
  const saveCrewEdit = async () => {
    if (!activeCrewId) return;
    if (!crewEdit.name.trim()) { showToast("크루 이름을 입력해주세요"); return; }
    try {
      await api.patch(`/api/crews/${activeCrewId}`, { name: crewEdit.name.trim(), description: crewEdit.bio || null, region: crewEdit.region || null, openChatUrl: crewEdit.kakao || null });
      setCrewEditOpen(false);
      showToast("크루 정보를 수정했어요");
      api.crew(activeCrewId).then(setCrewDetail);
      api.crews().then(setCrews);
    } catch (e: Any) { showToast(e.message); }
  };
  const leaveCrew = async () => {
    if (!activeCrewId) return;
    try {
      const r: Any = await api.post(`/api/crews/${activeCrewId}/leave`, {});
      setLeaveSheetOpen(false);
      showToast(r.crewDeleted ? "크루를 삭제했어요" : "크루에서 나왔어요");
      const cs: Any = await api.crews();
      setCrews(cs);
      if (cs[0]) { setActiveCrewId(cs[0].id); tab("home"); }
      else { setActiveCrewId(null); setCrewDetail(null); setCrewGyms([]); setPolls([]); setVisits([]); setRequests([]); startWasAuto.current = false; tab("start"); }
    } catch (e: Any) { showToast(e.message); }
  };
  const deletePoll = async () => {
    if (!openPoll) return;
    try {
      await api.del(`/api/polls/${openPoll.id}`);
      setDeletePollSheetOpen(false);
      setSelPollId(null);
      showToast("투표를 삭제했어요");
      if (activeCrewId) api.crewPolls(activeCrewId).then(setPolls);
      tab("home");
    } catch (e: Any) { showToast(e.message); }
  };
  const openHomeEdit = () => { setManageHomeIds(crewGyms.filter((g) => g.isHome).map((g) => g.id)); setManageQ(""); setHomeEditOpen(true); };
  const toggleManageHome = (id: string) => {
    if (!manageHomeIds.includes(id) && manageHomeIds.length >= 4) showToast("홈 암장은 최대 4곳이에요");
    setManageHomeIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : h.length >= 4 ? h : [...h, id]));
  };
  const saveHomeGyms = async () => {
    if (!activeCrewId) return;
    try { await api.put(`/api/crews/${activeCrewId}/home-gyms`, { gymIds: manageHomeIds }); api.crewGyms(activeCrewId).then(setCrewGyms); showToast("홈 암장을 저장했어요"); setHomeEditOpen(false); } catch (e: Any) { showToast(e.message); }
  };
  const openReviewSheet = () => { setReviewRating(0); setReviewTags([]); setReviewText(""); setReviewSheetOpen(true); };
  const toggleReviewTag = (t: string) => setReviewTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  const submitReview = async () => {
    if (!selGym || !reviewRating) { showToast("별점을 매겨주세요"); return; }
    try {
      await api.post(`/api/gyms/${selGym}/reviews`, { rating: reviewRating, tags: reviewTags, content: reviewText || undefined, gymSettingId: gymDetail?.settings?.[0]?.id, crewId: activeCrewId });
      setReviewSheetOpen(false);
      api.gymReviews(selGym).then(setGymReviews);
      api.gym(selGym, activeCrewId || undefined).then(setGymDetail);
      showToast("리뷰를 등록했어요");
    } catch (e: Any) { showToast(e.message); }
  };
  // 투표 딥링크 — 받은 사람이 로그인 후 바로 해당 투표로 이동
  const pollShareUrl = (pollId?: string | null) => `${window.location.origin}/?s=vote${pollId ? `&poll=${pollId}` : ""}${activeCrewId ? `&crew=${activeCrewId}` : ""}`;
  const doShare = async () => {
    const title = sharePoll?.title || "우리 크루 투표";
    const text = `우리 크루 다음 세션 투표: ${title} — 참여해줘!`;
    const url = pollShareUrl(sharePoll?.id);
    const w = window as Any;
    if (w.Kakao?.isInitialized?.() && w.Kakao.Share) {
      try { w.Kakao.Share.sendDefault({ objectType: "feed", content: { title, description: text, imageUrl: url + "/brand/climbcrew-icon-512.png", link: { mobileWebUrl: url, webUrl: url } }, buttons: [{ title: "투표 참여하기", link: { mobileWebUrl: url, webUrl: url } }] }); return; } catch { /* fall through */ }
    }
    if ((navigator as Any).share) { try { await (navigator as Any).share({ title, text, url }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(`${text} ${url}`); showToast("링크를 복사했어요"); } catch { showToast("공유를 지원하지 않는 브라우저예요"); }
  };
  const copyPollLink = async () => { try { await navigator.clipboard.writeText(pollShareUrl(sharePoll?.id)); showToast("투표 링크를 복사했어요"); } catch { showToast("복사에 실패했어요"); } };
  const addDateCandidate = () => { if (!newDate) { showToast("날짜를 골라주세요"); return; } setPollDates((d) => [...d, { date: newDate, label: newLabel }]); setNewDate(""); };
  const removeDateCandidate = (i: number) => setPollDates((d) => d.filter((_, idx) => idx !== i));
  const toggleGymCandidate = (id: string) => setPollGymIds((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const createPoll = async () => {
    if (!pollTitle.trim()) { showToast("제목을 입력해주세요"); return; }
    if (!pollRange.start) { showToast("날짜 범위를 골라주세요"); return; }
    const rangeStart = pollRange.start;
    const rangeEnd = pollRange.end ?? pollRange.start;
    const deadline = pollDeadlineDays == null ? undefined : new Date(Date.now() + pollDeadlineDays * 86400000).toISOString();
    try {
      const created: Any = await api.post(`/api/crews/${activeCrewId}/polls`, { title: pollTitle.trim(), rangeStart, rangeEnd, deadline, gymIds: pollGymIds });
      if (activeCrewId) api.crewPolls(activeCrewId).then(setPolls);
      setSharePoll({ title: pollTitle.trim(), id: created?.id });
      setShareSheetOpen(true);
      tab("home");
    } catch (e: Any) { showToast(e.message); }
  };
  const closePoll = async () => {
    if (!openPoll) return;
    try {
      await api.post(`/api/polls/${openPoll.id}/close`, {});
      setCloseSheetOpen(false);
      showToast("투표를 확정했어요");
      if (activeCrewId) { api.crewPolls(activeCrewId).then(setPolls); api.crewVisits(activeCrewId).then(setVisits); }
      tab("home");
    } catch (e: Any) { showToast(e.message); }
  };

  /* ===== 파생 / 어댑터 ===== */
  const crewColor = (id: string) => PALETTE[Math.max(0, crews.findIndex((c) => c.id === id)) % PALETTE.length];
  const ac = crews.find((c) => c.id === activeCrewId) || null;
  const memberCount = ac?._count?.members ?? crewDetail?._count?.members ?? 0;

  // 개인 모드면 내 데이터, 아니면 크루 데이터 — 홈/캘린더/탐색 렌더는 이 소스만 바라봄
  const personal = mode === "personal";
  const viewGyms = personal ? myGyms : crewGyms;
  const viewVisits = personal ? myVisits : visits;
  const viewLoaded = personal ? personalLoaded : crewLoaded;

  const gyms = viewGyms.map((r, i) => ({ id: r.id, name: r.name, loc: r.address || "", lat: r.lat ?? null, lng: r.lng ?? null, rating: r.rating ?? 0, reviews: r.reviewCount ?? 0, weeks: r.weeksSinceVisit, ever: !!r.everVisited, due: !!r.dueForReset, cycle: r.resetCycleWeeks ?? 4, hasSet: !!r.latestSetting, isHome: !!r.isHome, isFavorite: !!r.isFavorite, color: PALETTE[i % PALETTE.length], settingId: r.latestSetting?.id ?? null, instagram: r.instagram, lastVisit: r.lastVisit ?? null }));
  // 프랜차이즈: 이름 첫 토큰을 브랜드로(정확 일치만 — 잘못 합치지 않게). 2개 이상이면 체인.
  const brand = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of viewGyms) { const b = brandOf(r.name); counts.set(b, (counts.get(b) ?? 0) + 1); }
    return { of: brandOf, counts };
  }, [viewGyms]);
  const brandColorOf = (name: string) => { const b = brand.of(name); return PIN_RGB[[...b].reduce((a, c) => a + c.charCodeAt(0), 0) % PIN_RGB.length]; };
  const visitLabel = (g: Any) => (!g.ever ? "아직 안 가봄" : g.due ? `간 지 ${g.weeks}주 · 또 갈 때` : g.weeks === 0 ? "이번 주 방문" : `${g.weeks}주 전 방문`);
  // 투표 암장 후보: 홈 암장 먼저(오래 안 간 곳 최우선), 나머지는 검색으로 추가
  const homeGymCandidates = gyms.filter((g) => g.isHome).sort((a, b) => { if (a.due !== b.due) return a.due ? -1 : 1; const aw = a.weeks == null ? Infinity : a.weeks; const bw = b.weeks == null ? Infinity : b.weeks; return bw - aw; });
  const otherGyms = gyms.filter((g) => !g.isHome);
  const exploreGyms = (exploreQ.trim() ? gyms.filter((g) => (g.name + " " + g.loc).toLowerCase().includes(exploreQ.trim().toLowerCase())) : gyms).filter((g) => !brandFilter || brandOf(g.name) === brandFilter);
  // 지도 마커용(안정된 identity — crewGyms/검색어 바뀔 때만 재생성해서 188개 재구성 방지)
  const mapGyms = useMemo(() => {
    const q = exploreQ.trim().toLowerCase();
    return viewGyms
      .filter((r: Any) => r.lat != null && r.lng != null && (!q || (r.name + " " + (r.address || "")).toLowerCase().includes(q)) && (!brandFilter || brand.of(r.name) === brandFilter))
      .map((r: Any) => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, due: !!r.dueForReset, color: brandColorOf(r.name) }));
  }, [viewGyms, exploreQ, brandFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  // 인기 프랜차이즈 칩 (지점 2개 이상, 지점 수 많은 순)
  const topBrands = useMemo(() => [...brand.counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8), [brand]);
  const mapSelGym = mapSel ? gyms.find((g) => g.id === mapSel) : null;
  const mapSelBrand = mapSelGym ? brandOf(mapSelGym.name) : "";
  const mapSelBranches = mapSelGym ? brand.counts.get(brand.of(mapSelGym.name)) ?? 1 : 0;
  const selectedOtherGyms = otherGyms.filter((g) => pollGymIds.includes(g.id));
  const searchedGyms = gymSearch.trim() ? otherGyms.filter((g) => !pollGymIds.includes(g.id) && g.name.includes(gymSearch.trim())) : [];
  const gymById = (id: string | null) => gyms.find((g) => g.id === id) || null;
  const toGo = gyms.filter((g) => g.isHome && g.due).sort((a, b) => { const aw = a.weeks == null ? Infinity : a.weeks; const bw = b.weeks == null ? Infinity : b.weeks; return bw - aw; });

  const deadlinePassed = (p: Any) => !!(p?.deadline && new Date(p.deadline).getTime() < Date.now());
  const openVote = openPoll ? { id: openPoll.id, title: openPoll.title, deadline: fmtDeadline(openPoll.deadline), expired: deadlinePassed(openPoll), responded: openPoll.responderCount ?? 0, total: memberCount } : null;
  const respondedCount = (openVote?.responded ?? 0);
  const myRole = crewDetail?.members?.find((m: Any) => m.userId === me?.id)?.role ?? null;
  const canClose = !!(me && openPoll && openPoll.creatorId === me.id); // #1 투표 만든 사람만 마감
  const canDeletePoll = !!(me && openPoll && (openPoll.creatorId === me.id || myRole === "LEADER")); // 방치된 투표는 크루장도 정리 가능
  // 다음 세션 = 실제 확정된 Visit(가장 가까운 미래). 취소하면 사라지도록 Visit 기준으로 계산.
  const _todayMid0 = new Date(); _todayMid0.setHours(0, 0, 0, 0);
  const nextVisit = [...viewVisits].filter((v) => new Date(v.date).getTime() >= _todayMid0.getTime()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
  const upcoming = nextVisit ? { visit: nextVisit, date: fmtDate(nextVisit.date), gym: nextVisit.gym?.name || "", going: nextVisit.attendeeCount ?? 0 } : null;
  const detailVisit = detailVisitId ? viewVisits.find((v) => v.id === detailVisitId) || null : null; // #2 세션 상세 (취소되면 자동으로 사라짐)

  const adaptProb = (p: Any) => ({ id: p.id, color: p.color, tag: tagOf(p.label, p.color), feel: feelFromScore(p.difficultyScore), send: p.sendRate == null ? 0 : Math.round(p.sendRate * 100), honey: (p.honeyRatio ?? 0) > 0 || (p.honeyCount ?? 0) > 0, videos: p.videoCount ?? 0, mine: !!p.mySent, hex: HEX[p.color] || "#999" });
  const probGroups = (problemsData?.colors ?? []).map((c: Any) => { const items = c.problems.map(adaptProb); items.sort((a: Any, b: Any) => (sort === "easy" ? a.feel - b.feel : b.feel - a.feel)); return { color: c.color, items }; });

  const thetaChip = me?.ability != null ? "내 완등 기록 기준 맞춤" : "기록을 쌓으면 정확해져요";

  // 추천
  const recoList = (recos?.recommendations ?? []).map((p: Any) => { const feel = feelFromScore(p.difficultyScore); const easy = feel <= 0.45, mid = feel <= 0.65; return { id: p.id, color: p.color, tag: tagOf(p.label, p.color), hex: HEX[p.color] || "#999", feel, honey: (p.honeyCount ?? 0) > 0, videos: 0, phrase: recos?.coldStart ? "기록이 쌓이면 더 정확해져요" : easy ? "이 정도면 풀 만해요" : mid ? "살짝 도전해볼 만해요" : "성장 모드 · 한 단계 위", tone: easy ? 0 : mid ? 1 : 2 }; });
  const homeReco = recoList.slice(0, 2);

  // 캘린더 (현재 월)
  const now = new Date();
  // 투표 만들기용 달력
  const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const pcBase = new Date(now.getFullYear(), now.getMonth() + pollCalOffset, 1);
  const pcY = pcBase.getFullYear();
  const pcM = pcBase.getMonth();
  const pcDaysInMonth = new Date(pcY, pcM + 1, 0).getDate();
  const pcFirstDow = pcBase.getDay();
  const pcCandDays = new Set(pollDates.map((d) => d.date));
  const pcMonthLabel = `${pcY}년 ${pcM + 1}월`;
  const calBaseDate = new Date(now.getFullYear(), now.getMonth() + calMonthOffset, 1);
  const calY = calBaseDate.getFullYear(), calM = calBaseDate.getMonth();
  const isCurMonth = calMonthOffset === 0;
  const calMonth = `${calY}년 ${calM + 1}월`;
  const daysInMonth = new Date(calY, calM + 1, 0).getDate();
  const firstDow = calBaseDate.getDay();
  // #5 내가 가는 일정 vs 크루 일정(내가 안 감) 구분 (개인 모드에선 전부 내 일정)
  const inCalMonth = (v: Any) => { const d = new Date(v.date); return d.getFullYear() === calY && d.getMonth() === calM; };
  const myDays = new Set(viewVisits.filter((v) => v.mine && inCalMonth(v)).map((v) => new Date(v.date).getDate()));
  const crewDays = new Set(viewVisits.filter((v) => !v.mine && inCalMonth(v)).map((v) => new Date(v.date).getDate()));
  const calBase: CSSProperties = { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, margin: "0 auto", color: "#3A3633" };
  const calCells: { key: string; day: number | string; style: CSSProperties }[] = [];
  for (let i = 0; i < firstDow; i++) calCells.push({ key: "b" + i, day: "", style: calBase });
  for (let d = 1; d <= daysInMonth; d++) { let v: CSSProperties = {}; if (myDays.has(d)) v = { background: hatch(CRAYON.green), color: "#fff", fontWeight: 700, border: `2px solid ${INK}`, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", transform: "rotate(-3deg)" }; else if (crewDays.has(d)) v = { border: "2px dashed #2E6B22", color: "#2E6B22", fontWeight: 700, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", transform: "rotate(-2deg)" }; else if (isCurMonth && d === now.getDate()) v = { border: "2.5px solid #E24D3A", borderRadius: "52% 48% 46% 54% / 50% 46% 54% 50%", color: "#B4432E", fontWeight: 700, transform: "rotate(2deg)" }; calCells.push({ key: "d" + d, day: d, style: { ...calBase, ...v } }); }
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const futureVisits = viewVisits.filter((v) => new Date(v.date).getTime() >= todayMid).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const pastVisits = viewVisits.filter((v) => new Date(v.date).getTime() < todayMid).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const visitRow = (v: Any, future: boolean) => {
    const isPersonalRec = !!v.personal; // 크루 없는 내 기록
    const canEdit = !!me && (v.createdById === me.id || ac?.leaderId === me.id);
    return (
    <div key={v.id} style={{ padding: 14, ...cardStyle, ...(!personal && v.mine ? { border: `2px solid #2E6B22`, background: "#EAF7EE" } : {}) }}>
      <div onClick={() => openVisitDetail(v)} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: future ? "#FBF0DA" : "#E4F5EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {future ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="#E24D3A" strokeWidth="1.8" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="#E24D3A" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  : <svg width="20" height="20" viewBox="0 0 20 20"><path d="M4 10.5 8 14.5 16 5.5" stroke="#6BBF59" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{v.gym?.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{fmtDate(v.date)} · {isPersonalRec ? "내 기록" : v.source === "VOTE" ? "투표 확정" : "직접 추가"}{typeof v.attendeeCount === "number" && v.attendeeCount > 0 ? ` · ${v.attendeeCount}명 가요` : ""}</div></div>
        {personal && !isPersonalRec && v.crewName && <span style={{ fontSize: 11, fontWeight: 800, color: "#2456B0", background: "#E6EEFB", border: "1.5px solid #2456B0", borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}>{v.crewName}</span>}
        {!personal && v.mine && <span style={{ fontSize: 11, fontWeight: 800, color: "#2E6B22", background: "#CDEBD4", border: "1.5px solid #2E6B22", borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}>내가 가요</span>}
        <ChevR />
      </div>
      {isPersonalRec ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={() => { if (typeof window !== "undefined" && window.confirm("이 기록을 삭제할까요? 되돌릴 수 없어요.")) deletePersonalVisit(v.id); }} style={{ height: 36, padding: "0 12px", border: "none", background: "transparent", color: "#B4432E", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>기록 삭제</button>
        </div>
      ) : personal ? (
        future ? <div style={{ marginTop: 10, fontSize: 12, color: "#8A8477" }}>크루 일정 · 참여 변경은 크루 모드에서 할 수 있어요</div> : null
      ) : (<>
        {future && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => attendVisit(v, !v.mine)} style={{ flex: 1, height: 40, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: v.mine ? "#FFFEFA" : HILITE, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{v.mine ? "안 갈래요" : "나도 갈래요"}</button>
            {canEdit && <button onClick={() => openVisitEdit(v)} style={{ height: 40, padding: "0 14px", border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>변경</button>}
            {canEdit && <button onClick={() => { if (typeof window !== "undefined" && window.confirm("이 일정을 취소할까요?")) cancelVisit(v); }} style={{ height: 40, padding: "0 14px", border: "2px solid #C23A24", borderRadius: WOBS[2], background: "#FFFEFA", color: "#C23A24", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>취소</button>}
          </div>
        )}
        {!future && canEdit && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button onClick={() => { if (typeof window !== "undefined" && window.confirm("이 방문 기록을 삭제할까요? 되돌릴 수 없어요.")) cancelVisit(v); }} style={{ height: 36, padding: "0 12px", border: "none", background: "transparent", color: "#B4432E", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>기록 삭제</button>
          </div>
        )}
      </>)}
    </div>
    );
  };

  // 암장 상세
  const sg = gymDetail ? { name: gymDetail.name, loc: gymDetail.address || "", rating: gymDetail.rating?.avg ?? 0, reviews: gymDetail.rating?.count ?? 0, weeks: gymDetail.recency?.weeksSinceVisit ?? null, ever: !!gymDetail.recency?.everVisited, due: !!gymDetail.recency?.dueForReset, cycle: gymDetail.resetCycleWeeks ?? 4, hasSet: !!(gymDetail.settings?.length), color: gymById(selGym)?.color || "#E24D3A", initial: (gymDetail.name || "?")[0], instagram: gymDetail.instagram, settingId: gymDetail.settings?.[0]?.id ?? null } : null;
  const curSettingId = gymDetail?.settings?.[0]?.id;
  const reviewSets = (() => { if (!gymReviews.length) return []; const cur = gymReviews.filter((r) => r.gymSettingId === curSettingId); const prev = gymReviews.filter((r) => r.gymSettingId !== curSettingId); const pal = [{ bg: "#E6EEFB", c: "#2456B0" }, { bg: "#E4F5EC", c: "#3E7D2E" }, { bg: "#FBF0DA", c: "#B4432E" }]; const mk = (list: Any[]) => list.map((r, i) => ({ user: r.user.nickname, stars: "★".repeat(r.rating), text: r.content || "", date: rel(r.createdAt), ...pal[i % pal.length] })); const out: Any[] = []; if (cur.length) out.push({ header: "이번 세팅", items: mk(cur) }); if (prev.length) out.push({ header: "이전 세팅", items: mk(prev) }); return out; })();

  // 문제 상세
  const pd = probDetail ? { color: probDetail.color, tag: tagOf(probDetail.label, probDetail.color), hex: HEX[probDetail.color] || "#999", feel: feelFromScore(probDetail.stats?.difficultyScore), send: probDetail.stats?.sendRate == null ? 0 : Math.round(probDetail.stats.sendRate * 100), honey: (probDetail.stats?.honeyRatio ?? 0) > 0, videos: probDetail.stats?.videoCount ?? 0, gymName: probDetail.gymSetting?.gym?.name || "" } : null;
  const pdVideos = (probDetail?.logs ?? []).filter((l: Any) => l.videoUrl);
  const pdBetas = (probDetail?.logs ?? []).filter((l: Any) => l.content).map((l: Any, i: number) => { const pal = [{ bg: "#E4F5EC", c: "#3E7D2E" }, { bg: "#E6EEFB", c: "#2456B0" }]; return { user: l.user.nickname, text: l.content, date: rel(l.createdAt), ...pal[i % pal.length] }; });

  const probGym = gymById(selGym) || (probDetail ? { name: pd?.gymName } : null);

  // 크루 전환/멤버
  const members = (crewDetail?.members ?? []).map((m: Any, i: number) => ({ name: m.user.nickname, role: m.role === "LEADER" ? "크루장" : "멤버", color: PALETTE[i % PALETTE.length] }));
  const rolePal: Record<string, CSSProperties> = { 크루장: { background: "#FBF0DA", color: "#B4432E" }, 멤버: { background: "#F3EEDF", color: "#514C44" } };

  // 선택 = 노랑 형광펜 칠 + 연필 테두리 / 미선택 = 점선 연필
  const rowStyle = (sel: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: WOBS[1], cursor: "pointer", border: sel ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.35)", background: sel ? HILITE : "#FFFEFA" });
  const boxStyle = (sel: boolean): CSSProperties => ({ width: 24, height: 24, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", border: `2px solid ${INK}`, background: sel ? hatch(CRAYON.red) : "#FFFEFA" });
  const segStyle = (active: boolean): CSSProperties => ({ flex: 1, textAlign: "center", padding: "9px 0", fontSize: 16, fontWeight: 700, borderRadius: 14, cursor: "pointer", border: active ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: active ? HILITE : "transparent", color: active ? INK : "#8A8477" });

  const recColors: [string, string][] = [["흰", "#EFEFE8"], ["노랑", "#F5C518"], ["주황", "#F07E1E"], ["초록", "#3AAE5A"], ["파랑", "#2F72E0"], ["빨강", "#E23B3B"], ["검정", "#2A2A2A"]];

  // 즐겨찾기 ★ — 크레파스로 칠한 손그림 별 (켜짐: 노랑 채움 / 꺼짐: 연필 외곽선)
  const FavStar = ({ on, onClick, size = 40 }: { on: boolean; onClick: () => void; size?: number }) => (
    <button aria-label={on ? "즐겨찾기 해제" : "즐겨찾기 추가"} onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ width: size, height: size, flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" style={{ transform: on ? "rotate(-8deg)" : "rotate(0deg)", transition: "transform .15s" }}>
        <path d="M12 2.8l2.7 5.7 6.1.8-4.5 4.2 1.2 6-5.5-3-5.5 3 1.2-6L3.2 9.3l6.1-.8z" fill={on ? "#F5C518" : "none"} stroke={on ? INK : "rgba(58,54,51,0.45)"} strokeWidth="1.8" strokeLinejoin="round" strokeDasharray={on ? "none" : "3 2"} />
      </svg>
    </button>
  );

  // 투표 옵션 어댑터
  const votePoll = openPoll;
  const votersOf = (o: Any) => (o.votes ?? []).map((v: Any) => ({ id: v.user?.id, name: v.user?.nickname || "?", img: v.user?.profileImg || null }));
  const gymOpts = (votePoll?.gymOptions ?? []).map((o: Any) => { const g = gyms.find((x) => x.id === o.gymId); return { id: o.id, name: o.gym?.name || "", meta: g ? visitLabel(g) : "", count: o._count?.votes ?? o.votes?.length ?? 0, voters: votersOf(o) }; }).sort((a: Any, b: Any) => b.count - a.count);
  const hasGymOpts = gymOpts.length > 0;

  // 마감 프리뷰 — 서버와 같은 규칙으로 뭘로 확정되는지 미리 보여줌.
  // 날짜 표 = "안 되는 사람" 이므로 최소 득표(가장 적게 불가한 날), 동점이면 이른 날짜. 암장은 최다 선호.
  const voteCnt = (o: Any) => o._count?.votes ?? o.votes?.length ?? 0;
  const closeWinDate = (() => {
    const ds = votePoll?.dateOptions ?? [];
    if (!ds.length) return null;
    return [...ds].sort((a: Any, b: Any) => voteCnt(a) - voteCnt(b) || new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  })();
  const closeWinGym = gymOpts[0] ?? null;

  // 응답 캘린더: 날짜후보(=하루 단위 옵션)를 달력에 뿌림. 날짜키(YYYY-MM-DD)로 매칭.
  const dayKeyOf = (iso: string) => { const d = new Date(iso); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
  const respOptByDay = new Map<string, { id: string; count: number; voters: Any[] }>();
  (votePoll?.dateOptions ?? []).forEach((o: Any) => respOptByDay.set(dayKeyOf(o.date), { id: o.id, count: o._count?.votes ?? o.votes?.length ?? 0, voters: votersOf(o) }));
  const respMaxCount = Math.max(1, ...[...respOptByDay.values()].map((v) => v.count));
  const respMonths: { y: number; m: number }[] = (() => {
    const ds = (votePoll?.dateOptions ?? []).map((o: Any) => new Date(o.date));
    if (!ds.length) return [];
    const min = new Date(Math.min(...ds.map((d: Date) => d.getTime())));
    const max = new Date(Math.max(...ds.map((d: Date) => d.getTime())));
    const out: { y: number; m: number }[] = [];
    let y = min.getFullYear(), m = min.getMonth();
    while (y < max.getFullYear() || (y === max.getFullYear() && m <= max.getMonth())) { out.push({ y, m }); m++; if (m > 11) { m = 0; y++; } }
    return out;
  })();
  const respondCalendar = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {respMonths.map(({ y, m }) => {
        const dim = new Date(y, m + 1, 0).getDate();
        const fd = new Date(y, m, 1).getDay();
        return (
          <div key={`${y}-${m}`}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, textAlign: "center" }}>{y}년 {m + 1}월</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", fontSize: 11, color: "#514C44", marginBottom: 6 }}>{WD.map((d) => <div key={d}>{d}</div>)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
              {Array.from({ length: fd }).map((_, i) => <div key={"b" + i} />)}
              {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
                const k = ymd(y, m, d);
                const opt = respOptByDay.get(k);
                if (!opt) return <div key={d} style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#CDC6B5" }}>{d}</div>;
                const mine = !!voteDates[opt.id];
                const heat = opt.count / respMaxCount;
                // 불가 겹침 = 빨강 빗금(빽빽할수록 많이 안 됨) / 내 선택(불가) = 손으로 친 X — 채널 분리라 둘 다 동시에 보임
                // count = 안 되는(불가) 사람 수 → 빽빽한 빨강 빗금일수록 이 날 피해야 함
                const bg = opt.count > 0
                  ? `repeating-linear-gradient(52deg, rgba(${CRAYON.red},${0.32 + heat * 0.5}) 0 2.5px, rgba(${CRAYON.red},${0.1 + heat * 0.22}) 2.5px 5px, transparent 5px ${7.5 - heat * 1.5}px)`
                  : "#FFFEFA";
                return (
                  <div key={d} onClick={() => { setFocusDay(k); if (!voteSubmitted) setVoteDates((v) => ({ ...v, [opt.id]: !v[opt.id] })); }} style={{ position: "relative", height: 48, borderRadius: 10, cursor: "pointer", background: bg, border: "2px dashed rgba(58,54,51,0.28)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#3A3633", lineHeight: 1 }}>{d}</div>
                    {opt.count > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: "#B4432E", marginTop: 1, lineHeight: 1 }}>{opt.count}명 ✕</div>}
                    {mine && <svg viewBox="0 0 40 44" style={{ position: "absolute", inset: -4, width: "calc(100% + 8px)", height: "calc(100% + 8px)", pointerEvents: "none" }}><path d="M9 9 C18 17 24 27 32 37 M31 9 C22 18 16 27 8 37" fill="none" stroke="#C23A24" strokeWidth="3" strokeLinecap="round" /></svg>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  // 투표자 칩 — 손그림 무채 칩(사람=무채 규칙), 살짝씩 기울여 손맛
  const voterRow = (voters: Any[]) => voters.length === 0 ? null : (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
      {voters.map((p: Any, i: number) => (
        <div key={p.id ?? i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "1px 9px 1px 2px", border: "2px solid rgba(58,54,51,0.4)", borderRadius: WOBS[i % 4], background: "#FFFEFA", transform: `rotate(${i % 2 ? 0.8 : -0.8}deg)` }}>
          {p.img ? <img src={p.img} alt="" style={{ width: 18, height: 18, borderRadius: "50% 46% 52% 48% / 48% 52% 46% 50%", objectFit: "cover", border: `1.5px solid ${INK}` }} /> : <div style={{ width: 18, height: 18, borderRadius: "50% 46% 52% 48% / 48% 52% 46% 50%", background: "#3A3633", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#FFFDF6" }}>{p.name[0]}</div>}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#57534A" }}>{p.name}</span>
        </div>
      ))}
    </div>
  );

  const tc = (n: string) => (screen === n ? "#E24D3A" : "#514C44");
  const showTabBar = ["home", "explore", "calendar", "profile", "vote", "recommend"].includes(screen);
  const is = (n: string) => screen === n;

  // 하단 액션바 — 절대위치 대신 플렉스 흐름으로(콘텐츠 아래 고정, 어떤 화면 높이에서도 안 겹침)
  let bottomBar: ReactNode = null;
  if (is("createPoll")) bottomBar = <button onClick={createPoll} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>투표 만들기</button>;
  else if (is("record")) bottomBar = <button onClick={saveRecord} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>완등 기록 저장</button>;
  else if (is("probDetail") && pd) bottomBar = <button onClick={() => showToast("완등 기록은 준비 중이에요 · 조금만 기다려주세요")} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0), opacity: 0.55 }}>내 기록 남기기 <span style={{ fontSize: 13, fontWeight: 700 }}>(준비 중)</span></button>;
  else if (is("gymDetail") && sg) bottomBar = (<div style={{ display: "flex", gap: 10 }}><button onClick={openVisitSheet} style={{ flex: 1, height: 50, border: `2px solid ${INK}`, borderRadius: WOBS[1], background: "#FFFEFA", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>방문 기록</button><button onClick={openReviewSheet} style={{ flex: 1.5, height: 50, fontSize: 17, fontWeight: 700, ...crayonBtn(CRAYON.red, 2) }}>리뷰 쓰기</button></div>);
  else if (is("vote") && openVote) bottomBar = voteSubmitted ? (<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "#3E7D2E" }}><svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#6BBF59" /><path d="M5.5 10.2 8.5 13 14.5 6.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>응답을 제출했어요</div><button onClick={() => setVoteSubmitted(false)} style={{ height: 42, padding: "0 16px", border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>수정하기</button></div>) : (<button onClick={submitVote} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>응답 제출</button>);

  const loginGo = () => enterApp(crews);

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}>

          {is("login") && (
            <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", animation: "ccfade .3s ease" }}>
              <img src="/brand/climbcrew-icon.svg" alt="뉴세터" width={96} height={96} style={{ display: "block", width: 96, height: 96, transform: "rotate(-3deg)", filter: "drop-shadow(3px 4px 0 rgba(58,54,51,0.18))" }} />
              <div style={{ fontSize: 34, fontWeight: 700, marginTop: 20 }}>뉴세터</div>
              <div style={{ position: "relative", fontSize: 17, color: "#443F38", marginTop: 4, fontWeight: 700 }}>우리 크루의 클라이밍, 한곳에서<svg viewBox="0 0 120 8" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: -7, width: "100%", height: 8 }}><path d="M2 5 C20 2 35 7 55 4 S95 6 118 3" fill="none" stroke={`rgba(${CRAYON.orange},0.85)`} strokeWidth="3" strokeLinecap="round" /></svg></div>
              <div style={{ height: 56 }} />
              <button onClick={kakaoEnabled ? () => signIn("kakao") : loginGo} style={{ width: "100%", height: 52, border: `2px solid ${INK}`, borderRadius: WOBS[0], background: "#FEE500", color: "#191600", fontSize: 17, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transform: "rotate(-0.4deg)" }}><svg width="20" height="20" viewBox="0 0 20 20" fill="#191600"><path d="M10 3C5.6 3 2 5.8 2 9.3c0 2.2 1.5 4.2 3.8 5.3-.2.6-.7 2.4-.8 2.8 0 .2.1.3.3.2.2-.1 2.5-1.7 3.5-2.4.4 0 .8.1 1.2.1 4.4 0 8-2.8 8-6.3S14.4 3 10 3z" /></svg>카카오로 시작하기</button>
              <div style={{ fontSize: 12, color: "#514C44", marginTop: 16, textAlign: "center" }}>{kakaoEnabled ? "가입하면 이용약관 및 개인정보처리방침에 동의하게 됩니다." : "개발 모드 · devuser 로 로그인됩니다"}</div>
              {kakaoEnabled && <div onClick={loginGo} style={{ fontSize: 12, color: "#514C44", marginTop: 10, textAlign: "center", cursor: "pointer", textDecoration: "underline" }}>개발자 모드로 계속</div>}
            </div>
          )}

          {is("start") && (
            <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", padding: "96px 24px 32px", animation: "ccfade .3s ease" }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{crews.length ? "크루 추가하기" : "크루 시작하기"}</div>
              <div style={{ fontSize: 15, color: "#514C44", marginTop: 8, lineHeight: 1.5 }}>{crews.length ? <>새 크루를 만들거나<br />초대 코드로 다른 크루에 참여할 수 있어요.</> : <>아직 소속된 크루가 없어요.<br />새로 만들거나 초대 코드로 참여해보세요.</>}</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => go("create")} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>새 크루 만들기</button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}><div style={{ flex: 1, height: 1, background: "#C9C2B2" }} /><div style={{ fontSize: 13, color: "#514C44" }}>또는</div><div style={{ flex: 1, height: 1, background: "#C9C2B2" }} /></div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>초대 코드로 참여</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="예: CREW-8H2K" autoCapitalize="characters" style={{ flex: 1, height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none", textTransform: "uppercase" }} />
                <button onClick={joinByCode} style={{ height: 50, padding: "0 20px", fontSize: 17, fontWeight: 700, whiteSpace: "nowrap", ...crayonBtn("58,54,51", 2) }}>참여하기</button>
              </div>
            </div>
          )}

          {is("create") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 8px" }}><BackBtn onClick={back} /><div style={{ fontSize: 20, fontWeight: 700 }}>크루 만들기</div></div>
              <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 20 }}>
                {([["크루 이름", "name", "예: 볼더핏 크루"], ["한 줄 소개", "bio", "주말마다 볼더링 치는 크루예요"], ["주 활동 지역", "region", "예: 서울 성수 · 강남"]] as const).map(([label, key, ph]) => (
                  <div key={key}><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{label}</div><input value={(form as Any)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={{ width: "100%", height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none" }} /></div>
                ))}
                <div><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>오픈카톡 링크 <span style={{ color: "#514C44", fontWeight: 400 }}>(선택)</span></div><input value={form.kakao} onChange={(e) => setForm((f) => ({ ...f, kakao: e.target.value }))} placeholder="https://open.kakao.com/..." style={{ width: "100%", height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none" }} /></div>
              </div>
              <div style={{ padding: "24px 16px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>홈 암장 <span style={{ color: "#514C44", fontWeight: 400 }}>(자주 가는 곳, 최대 4곳)</span></div>
                <div style={{ fontSize: 12, color: "#514C44", marginBottom: 10 }}>선택 {crewHomeGymIds.length}/4 · 투표할 때 후보로 먼저 떠요</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", background: "#fff", border: `2px solid ${INK}`, borderRadius: WOBS[2], marginBottom: 10 }}>
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#514C44" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#514C44" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  <input value={createGymQ} onChange={(e) => setCreateGymQ(e.target.value)} placeholder="암장 검색 (이름 · 지역)" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15, minWidth: 0 }} />
                  {createGymQ && <div onClick={() => setCreateGymQ("")} style={{ cursor: "pointer", padding: 4 }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#514C44" strokeWidth="2" strokeLinecap="round" /></svg></div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {allGymsList.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>암장을 불러오는 중이에요</div>}
                  {(createGymQ.trim() ? allGymsList.filter((g: Any) => (g.name + " " + (g.address || "")).toLowerCase().includes(createGymQ.trim().toLowerCase())) : allGymsList.filter((g: Any) => crewHomeGymIds.includes(g.id))).slice(0, 40).map((g: Any) => { const sel = crewHomeGymIds.includes(g.id); return (
                    <div key={g.id} onClick={() => toggleHomeGym(g.id)} style={rowStyle(sel)}>
                      <div style={boxStyle(sel)}>{sel ? "✓" : ""}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{g.address || ""}</div></div>
                    </div>
                  ); })}
                  {allGymsList.length > 0 && !createGymQ.trim() && crewHomeGymIds.length === 0 && <div style={{ padding: 14, color: "#514C44", fontSize: 14, textAlign: "center" }}>검색해서 홈 암장을 골라보세요</div>}
                  {createGymQ.trim() && allGymsList.filter((g: Any) => (g.name + " " + (g.address || "")).toLowerCase().includes(createGymQ.trim().toLowerCase())).length === 0 && <div style={{ padding: 14, color: "#514C44", fontSize: 14, textAlign: "center" }}>검색 결과가 없어요</div>}
                </div>
              </div>
              <div style={{ padding: "28px 16px 0" }}><button onClick={createCrew} disabled={creating} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0), opacity: creating ? 0.6 : 1 }}>{creating ? "만드는 중…" : "크루 만들기"}</button></div>
            </div>
          )}

          {is("invite") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 8px" }}><BackBtn onClick={back} /><div style={{ fontSize: 20, fontWeight: 700 }}>멤버 초대</div></div>
              <div style={{ margin: "12px 16px 0", padding: 18, ...cardStyle }}>
                <div style={{ fontSize: 13, color: "#514C44" }}>초대 코드</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.06em", marginTop: 4 }}>{crewDetail?.inviteCode ?? "…"}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}><button onClick={copyLink} style={{ flex: 1, height: 44, border: "2px solid #3A3633", borderRadius: 10, background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>링크 복사</button><button onClick={shareInvite} style={{ flex: 1, height: 44, border: "none", borderRadius: 10, background: "#FEE500", color: "#191600", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>카톡 공유</button></div>
              </div>
              {requests.length > 0 && (
                <div style={{ padding: "24px 16px 0" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>가입 신청 <span style={{ color: "#E24D3A" }}>{requests.length}</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {requests.map((r) => (
                      <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", ...cardStyle, borderRadius: WOBS[2] }}>
                        <div style={{ width: 38, height: 38, borderRadius: 999, background: "#F3EEDF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#514C44" }}>{r.user.nickname[0]}</div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{r.user.nickname}</div><div style={{ fontSize: 12, color: "#514C44" }}>{rel(r.createdAt)} 신청</div></div>
                        <button onClick={() => handleReq(r.userId, r.user.nickname, false)} style={{ height: 44, padding: "0 14px", border: "2px solid #3A3633", borderRadius: 10, background: "#fff", color: "#514C44", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>거절</button>
                        <button onClick={() => handleReq(r.userId, r.user.nickname, true)} style={{ height: 44, padding: "0 16px", border: "none", borderRadius: 10, background: "#6BBF59", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>승인</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ padding: "24px 16px 0" }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>멤버 <span style={{ color: "#514C44" }}>{members.length}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {members.map((m: Any) => (
                    <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", ...cardStyle, borderRadius: WOBS[2] }}>
                      <div style={{ width: 38, height: 38, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, background: m.color + "1F", color: m.color }}>{m.name[0]}</div>
                      <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{m.name}</div>
                      <div style={{ ...rolePal[m.role], fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999 }}>{m.role}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: "28px 16px 0" }}><button onClick={() => tab("home")} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn("58,54,51", 1) }}>완료</button></div>
            </div>
          )}

          {is("home") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 96 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "56px 16px 10px" }}>
                <div onClick={() => setSwitcherOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  {personal ? (
                    me?.profileImg
                      ? <img src={me.profileImg} alt="" style={{ width: 32, height: 32, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", objectFit: "cover", border: `2px solid ${INK}`, transform: "rotate(-3deg)" }} />
                      : <div style={{ width: 32, height: 32, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", background: hatch("58,54,51"), border: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#FFFDF6", transform: "rotate(-3deg)" }}>{(me?.nickname || "나")[0]}</div>
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", background: hatch(hexRgb(ac ? crewColor(ac.id) : "#E24D3A")), border: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-3deg)" }}><svg width="17" height="17" viewBox="0 0 40 40" fill="none"><path d="M9 30 18 12l5 9 4-6 4 15" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                  )}
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{personal ? "나의 클라이밍" : ac?.name ?? "…"}</div>
                  <svg width="12" height="12" viewBox="0 0 12 12" style={{ marginTop: 2 }}><path d="M2 4.5 6 8.5 10 4.5" stroke="#514C44" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {!personal && <div onClick={openCrewManage} aria-label="크루 관리" style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.2" stroke="#3A3633" strokeWidth="1.8" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.8 5.8l1.6 1.6M16.6 16.6 18.2 18.2M18.2 5.8 16.6 7.4M7.4 16.6 5.8 18.2" stroke="#3A3633" strokeWidth="1.8" strokeLinecap="round" /></svg></div>}
                  <button aria-label="알림 (준비 중)" onClick={() => showToast("알림은 준비 중이에요")} style={{ position: "relative", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", background: "transparent", opacity: 0.55 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="#3A3633" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 20a2 2 0 0 0 4 0" stroke="#3A3633" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
                </div>
              </div>

              <div style={{ padding: "14px 16px 0" }}>
                {upcoming ? (
                  <div onClick={() => openVisitDetail(upcoming.visit)} style={{ position: "relative", padding: "16px 18px 14px", background: "#FFFEFA", border: `2.5px solid #4E9D57`, borderRadius: WOBS[0], transform: "rotate(-0.4deg)", cursor: "pointer" }}>
                    <span style={{ position: "absolute", top: -12, right: 12, transform: "rotate(7deg)", fontSize: 16, fontWeight: 700, padding: "0 12px", color: INK, background: `repeating-linear-gradient(50deg, rgba(${CRAYON.yellow},0.85) 0 4px, rgba(${CRAYON.yellow},0.6) 4px 7px)`, border: `2px solid ${INK}`, borderRadius: WOBS[2] }}>확정!</span>
                    <div style={{ fontSize: 15, color: "#8C857B", fontWeight: 700 }}>{personal ? "다음 클라이밍" : "다음 세션"}</div>
                    <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.05, margin: "4px 0 2px" }}>{upcoming.date}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19, fontWeight: 700, marginTop: 2 }}><span style={{ width: 18, height: 18, flexShrink: 0, border: `2px solid ${INK}`, borderRadius: "170px 40px 190px 30px / 30px 190px 40px 170px", background: hatchSoft(CRAYON.green) }} />{upcoming.gym}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#443F38" }}>{upcoming.visit?.personal ? "내 기록" : upcoming.visit?.crewName && personal ? `${upcoming.visit.crewName} 일정` : upcoming.going > 0 ? `${upcoming.going}명 가요${upcoming.visit?.mine ? " · 나 포함" : ""}` : "아직 참여자 없음"}</div>
                      {!upcoming.visit?.personal && <div style={{ fontSize: 13, fontWeight: 700, color: "#4E9D57" }}>누가 가는지 ›</div>}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "16px 18px", border: "2.5px dashed rgba(58,54,51,0.4)", borderRadius: WOBS[0], background: "#FFFEFA", transform: "rotate(-0.3deg)" }}>
                    <div style={{ fontSize: 15, color: "#8C857B", fontWeight: 700 }}>{personal ? "다음 클라이밍" : "다음 세션"}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 2px" }}>아직 미정이에요</div>
                    <div style={{ fontSize: 15, color: "#443F38", lineHeight: 1.45 }}>{personal ? "언제 갈지 기록으로 남겨봐요." : "투표로 날짜랑 암장을 정해봐요."}</div>
                    {personal
                      ? <button onClick={openRecordSheet} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, height: 44, padding: "0 18px", fontSize: 16, fontWeight: 700, ...crayonBtn(CRAYON.green, 1) }}>기록 추가</button>
                      : <button onClick={openCreatePoll} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, height: 44, padding: "0 18px", fontSize: 16, fontWeight: 700, ...crayonBtn(CRAYON.red, 1) }}>새 투표 만들기</button>}
                  </div>
                )}
              </div>

              {personal && (
                <div style={{ padding: "22px 16px 0" }}>
                  {crews.length === 0 ? (
                    <div style={{ padding: "16px 18px", ...cardStyle, borderRadius: WOBS[1] }}>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>크루와 함께 가면 더 재밌어요</div>
                      <div style={{ fontSize: 13, color: "#514C44", marginTop: 4, lineHeight: 1.5 }}>크루를 만들면 투표로 날짜·암장을 정하고<br />누가 가는지도 한눈에 볼 수 있어요.</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                        <button onClick={() => go("create")} style={{ flex: 1, height: 44, fontSize: 15, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>새 크루 만들기</button>
                        <button onClick={() => go("start")} style={{ flex: 1, height: 44, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>코드로 참여</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => setSwitcherOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", ...cardStyle, borderRadius: WOBS[2], cursor: "pointer" }}>
                      <div style={{ flex: 1, fontSize: 13, color: "#514C44" }}>크루 투표·일정은 크루 모드에서 볼 수 있어요</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#E24D3A" }}>크루로 전환 ›</div>
                    </div>
                  )}
                </div>
              )}

              {!personal && (
              <div style={{ padding: "22px 16px 0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={sectionLabel}>진행 중인 투표</div>
                  <div onClick={openCreatePoll} style={{ fontSize: 12, fontWeight: 700, color: "#E24D3A", cursor: "pointer" }}>+ 새 투표</div>
                </div>
                {openPolls.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {openPolls.map((p) => { const exp = deadlinePassed(p); const responded = p.responderCount ?? 0; return (
                      <div key={p.id} style={{ padding: 18, ...cardStyle }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><div style={{ fontSize: 17, fontWeight: 700, minWidth: 0 }}>{p.title}</div><div style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, color: exp ? "#fff" : "#B4432E", background: exp ? "#B4432E" : "#FBF0DA", padding: "3px 8px", borderRadius: 999 }}>{exp ? "기한 지남" : fmtDeadline(p.deadline)}</div></div>
                        <div style={{ fontSize: 13, color: "#514C44", marginTop: 8 }}>{responded}/{memberCount}명 응답 완료{exp ? " · 마감하고 확정해주세요" : ""}</div>
                        <div style={{ height: 6, borderRadius: 999, background: "#F3EEDF", marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: (memberCount ? responded / memberCount : 0) * 100 + "%", background: "#E24D3A", borderRadius: 999 }} /></div>
                        <button onClick={() => goVote(p.id)} style={{ width: "100%", height: 46, marginTop: 14, fontSize: 17, fontWeight: 700, ...crayonBtn(CRAYON.red, 3) }}>참여하기</button>
                      </div>
                    ); })}
                  </div>
                ) : !crewLoaded ? (
                  <div style={{ padding: 16, ...cardStyle, color: "#A8A297", fontSize: 14 }}>불러오는 중이에요…</div>
                ) : (
                  <div style={{ padding: 16, ...cardStyle, color: "#514C44", fontSize: 14 }}>진행 중인 투표가 없어요. <span onClick={openCreatePoll} style={{ color: "#E24D3A", fontWeight: 700, cursor: "pointer" }}>새로 만들기</span></div>
                )}
              </div>
              )}

              <div style={{ padding: "22px 16px 0" }}>
                <div style={sectionLabel}>가야 할 암장</div>
                <div style={{ fontSize: 12, color: "#514C44", margin: "2px 0 10px" }}>{personal ? "간 지 오래됐거나 안 가본 즐겨찾기 ★ 암장" : "간 지 오래됐거나 안 가본 홈 암장"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {toGo.length === 0 && (!viewLoaded ? (
                    <div style={{ padding: 14, ...cardStyle, color: "#A8A297", fontSize: 13 }}>불러오는 중이에요…</div>
                  ) : !gyms.some((g) => g.isHome) ? (
                    personal ? (
                      <div style={{ padding: 14, ...cardStyle, fontSize: 13, color: "#514C44" }}>탐색에서 ★을 누르면 자주 가는 암장을 모아둘 수 있어요. <span onClick={() => tab("explore")} style={{ color: "#E24D3A", fontWeight: 700, cursor: "pointer" }}>탐색 가기</span></div>
                    ) : (
                      <div style={{ padding: 14, ...cardStyle, fontSize: 13, color: "#514C44" }}>홈 암장을 설정하면 갈 때가 된 곳을 알려드려요. <span onClick={openCrewManage} style={{ color: "#E24D3A", fontWeight: 700, cursor: "pointer" }}>설정하기</span></div>
                    )
                  ) : (
                    <div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>다 다녀왔어요! 🎉</div>
                  ))}
                  {toGo.map((gg) => (
                    <div key={gg.id} onClick={() => openGym(gg.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, ...cardStyle, cursor: "pointer" }}>
                      <div style={avatarStyle(gg.color)}>{gg.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{gg.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{gg.loc}{gg.rating ? ` · ★ ${gg.rating}` : ""}</div><div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#FBEFD9", color: "#B5730A" }}>{visitLabel(gg)}</div></div>
                      <ChevR />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: "22px 16px 0" }}>
                <div style={sectionLabel}>오늘 추천</div>
                <div style={{ fontSize: 12, color: "#514C44", margin: "2px 0 10px" }}>내 실력에 맞는 문제 추천</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, ...cardStyle }}><div style={{ flex: 1, fontSize: 13, color: "#514C44" }}>완등 기록이 쌓이면 내 수준에 맞는 문제를 추천해드려요.</div><div style={{ fontSize: 11, fontWeight: 700, color: "#514C44", background: "#F3EEDF", padding: "3px 9px", borderRadius: 999 }}>준비 중</div></div>
              </div>
            </div>
          )}

          {is("explore") && (
            <div style={{ animation: "ccfade .3s ease", height: "100%", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "52px 14px 10px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 700, flexShrink: 0 }}>탐색</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 14px", background: "#FFFEFA", border: `2px solid ${INK}`, borderRadius: WOBS[2] }}>
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#514C44" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#514C44" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  <input value={exploreQ} onChange={(e) => { setExploreQ(e.target.value); setMapSel(null); setBrandFilter(null); }} placeholder="암장 · 지역 검색" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15, minWidth: 0 }} />
                  {exploreQ && <div onClick={() => { setExploreQ(""); setMapSel(null); }} style={{ cursor: "pointer", padding: 4 }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#514C44" strokeWidth="2" strokeLinecap="round" /></svg></div>}
                </div>
                <button aria-label={exploreView === "map" ? "목록으로 보기" : "지도로 보기"} onClick={() => setExploreView((v) => (v === "map" ? "list" : "map"))} style={{ width: 44, height: 44, flexShrink: 0, border: `2px solid ${INK}`, borderRadius: WOBS[3], background: "#FFFEFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {exploreView === "map"
                    ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke={INK} strokeWidth="2" strokeLinecap="round" /></svg>
                    : <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2ZM9 4v14M15 6v14" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" /></svg>}
                </button>
              </div>
              {topBrands.length > 0 && (
                <div style={{ display: "flex", gap: 8, padding: "0 14px 10px", overflowX: "auto", flexShrink: 0 }}>
                  <div onClick={() => setBrandFilter(null)} style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "5px 14px", borderRadius: WOBS[2], fontSize: 14, fontWeight: 700, cursor: "pointer", border: `2px solid ${INK}`, background: !brandFilter ? hatch("58,54,51") : "#FFFEFA", color: !brandFilter ? "#fff" : INK }}>전체</div>
                  {topBrands.map(([b, n]) => { const on = brandFilter === b; const rgb = brandColorOf(b); return (
                    <div key={b} onClick={() => { setBrandFilter(on ? null : b); setExploreQ(""); setMapSel(null); }} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "5px 13px", borderRadius: WOBS[3], fontSize: 14, fontWeight: 700, cursor: "pointer", border: `2px solid ${INK}`, background: on ? hatch(rgb) : "#FFFEFA", color: on ? "#fff" : INK }}>
                      {!on && <span style={{ width: 11, height: 11, borderRadius: "60% 45% 55% 50%", background: hatch(rgb) }} />}{b} <span style={{ fontSize: 12, opacity: 0.8 }}>{n}</span>
                    </div>
                  ); })}
                </div>
              )}
              {exploreView === "list" ? (
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "2px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {exploreGyms.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>{crewLoaded ? "조건에 맞는 암장이 없어요." : "불러오는 중이에요…"}</div>}
                  {exploreGyms.map((g) => (
                    <div key={g.id} onClick={() => openGym(g.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, ...cardStyle, cursor: "pointer", flexShrink: 0 }}>
                      <div style={avatarStyle(g.color, 40)}>{g.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{g.loc}{g.rating ? ` · ★ ${g.rating}` : ""}</div>
                        <div style={{ display: "inline-flex", alignItems: "center", marginTop: 6, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: g.due ? "#FBEFD9" : "#F3EEDF", color: g.due ? "#B5730A" : "#514C44" }}>{visitLabel(g)}</div>
                      </div>
                      <FavStar on={isFavGym(g.id)} onClick={() => toggleFavorite(g.id, !isFavGym(g.id))} />
                      <ChevR />
                    </div>
                  ))}
                </div>
              ) : (
              <div style={{ flex: 1, position: "relative", margin: "0 12px 12px", ...wob(0), overflow: "hidden", minHeight: 0 }}>
                <GymMap gyms={mapGyms} selectedId={mapSel} onSelect={(id) => setMapSel(id || null)} />
                {exploreQ.trim() && mapGyms.length === 0 && (
                  <div style={{ position: "absolute", top: 14, left: 14, right: 14, padding: "10px 14px", background: "#FFFEFA", border: `2px solid ${INK}`, borderRadius: WOBS[1], fontSize: 14, color: "#443F38", textAlign: "center" }}>&apos;{exploreQ.trim()}&apos; 에 맞는 암장이 없어요</div>
                )}
                {mapSelGym && (
                  <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, padding: "13px 14px", background: "#FFFEFA", border: `2.5px solid ${INK}`, borderRadius: WOBS[0], boxShadow: "0 6px 18px rgba(58,54,51,0.22)", animation: "ccfade .18s ease" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={avatarStyle(mapSelGym.color)}>{mapSelGym.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {mapSelBranches >= 2 && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 4, padding: "1px 8px 1px 6px", borderRadius: 999, background: `rgba(${brandColorOf(mapSelGym.name)},0.18)`, fontSize: 12, fontWeight: 700, color: INK }}><span style={{ width: 10, height: 10, borderRadius: "60% 45% 55% 50%", background: hatch(brandColorOf(mapSelGym.name)) }} />{mapSelBrand} · {mapSelBranches}개 지점</div>}
                        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.15 }}>{mapSelGym.name}</div>
                        <div style={{ fontSize: 13, color: "#514C44", marginTop: 2 }}>{mapSelGym.loc}{mapSelGym.rating ? ` · ★ ${mapSelGym.rating}` : ""}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: mapSelGym.due ? "#FBEFD9" : "#E4F5EC", color: mapSelGym.due ? "#B5730A" : "#3E7D2E" }}>{visitLabel(mapSelGym)}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#514C44" }}>{mapSelGym.lastVisit ? `마지막 방문 ${fmtDate(mapSelGym.lastVisit)}` : "우리 크루 방문 기록 없음"}</div>
                        </div>
                      </div>
                      <div onClick={() => setMapSel(null)} style={{ cursor: "pointer", padding: 4, flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#514C44" strokeWidth="2" strokeLinecap="round" /></svg></div>
                    </div>
                    <button onClick={() => openGym(mapSelGym.id)} style={{ width: "100%", height: 44, marginTop: 12, fontSize: 16, fontWeight: 700, ...crayonBtn(CRAYON.red, 1) }}>상세 보기</button>
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {is("vote") && (
            <>
              <div style={{ animation: "ccfade .3s ease", paddingBottom: 24 }}>
                <div style={{ padding: "56px 16px 8px" }}>
                  <div onClick={() => setSwitcherOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 5px", background: hatch(hexRgb(ac ? crewColor(ac.id) : "#E24D3A")), border: `2px solid ${INK}`, borderRadius: WOBS[0], cursor: "pointer", marginBottom: 14, transform: "rotate(-0.8deg)" }}><div style={{ width: 24, height: 24, borderRadius: "50% 46% 52% 48% / 48% 52% 46% 50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, background: "#FFFDF6", color: INK }}>{ac?.name?.[0] ?? "?"}</div><span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{ac?.name ?? ""}</span><svg width="12" height="12" viewBox="0 0 12 12" style={{ marginLeft: -1 }}><path d="M2 4.5 6 8.5 10 4.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                  {openPolls.length > 1 && (
                    <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
                      {openPolls.map((p) => { const on = p.id === openPoll?.id; return (
                        <button key={p.id} onClick={() => { setSelPollId(p.id); replaceNav("vote", { poll: p.id }); }} style={{ flexShrink: 0, padding: "6px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: on ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", borderRadius: WOBS[2], background: on ? HILITE : "#FFFEFA", color: on ? INK : "#514C44" }}>{p.title}</button>
                      ); })}
                    </div>
                  )}
                  <div style={H1}>{openVote?.title ?? "진행 중인 투표 없음"}</div>
                  {openVote && <div style={{ fontSize: 13, color: "#514C44", marginTop: 6 }}>{openVote.deadline} · {respondedCount}/{openVote.total}명 응답</div>}
                  {openVote?.expired && (
                    <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: WOBS[2], border: `2px solid ${INK}`, background: "#FBF0DA", fontSize: 14, fontWeight: 700, color: "#B4432E" }}>
                      투표 기한이 지났어요. {canClose ? "아래에서 마감하고 확정해주세요." : "투표를 만든 사람이 마감할 수 있어요."}
                    </div>
                  )}
                  {openVote && (canClose || canDeletePoll) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                      {canClose && <button onClick={() => setCloseSheetOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 42, padding: "0 16px", border: `2px solid ${INK}`, borderRadius: WOBS[3], background: HILITE, fontSize: 16, fontWeight: 700, color: INK, cursor: "pointer", transform: "rotate(-0.5deg)" }}>투표 마감하고 확정 →</button>}
                      {canDeletePoll && <button onClick={() => setDeletePollSheetOpen(true)} style={{ height: 42, padding: "0 12px", border: "none", background: "transparent", fontSize: 14, fontWeight: 700, color: "#B4432E", cursor: "pointer", textDecoration: "underline" }}>삭제</button>}
                    </div>
                  )}
                </div>
                {!openVote && <div style={{ padding: "0 16px", color: "#514C44", fontSize: 14 }}>이 크루엔 진행 중인 투표가 없어요.</div>}
                {openVote && (<>
                  {hasGymOpts && (
                    <div style={{ padding: "14px 16px 0" }}>
                      <div style={{ display: "flex", gap: 4, padding: 4, background: "#F3EEDF", borderRadius: 12 }}>
                        <div onClick={() => setVoteTab("date")} style={segStyle(voteTab === "date")}>날짜</div>
                        <div onClick={() => setVoteTab("gym")} style={segStyle(voteTab === "gym")}>암장</div>
                      </div>
                    </div>
                  )}
                  {(!hasGymOpts || voteTab === "date") && (
                    <div style={{ padding: "18px 16px 0" }}>
                      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{voteSubmitted ? "제출 완료 · 날짜를 누르면 누가 안 되는지 보여요" : "안 되는 날에 X 쳐주세요"}</div>
                      <div style={{ fontSize: 14, color: "#514C44", marginBottom: 16 }}>{voteSubmitted ? "선택을 바꾸려면 아래 '수정하기'를 눌러주세요" : "못 가는 날만 표시 · 다 되면 안 골라도 돼요 · 누르면 누가 안 되는지 나와요"}</div>
                      {respMonths.length === 0 ? <div style={{ color: "#514C44", fontSize: 15 }}>날짜 후보가 없어요.</div> : respondCalendar()}
                      {respMonths.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, fontSize: 13, fontWeight: 700, color: "#443F38", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="17" height="17" viewBox="0 0 40 44"><path d="M9 9 C18 17 24 27 32 37 M31 9 C22 18 16 27 8 37" fill="none" stroke="#C23A24" strokeWidth="3.4" strokeLinecap="round" /></svg>내가 안 되는 날</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 15, height: 15, borderRadius: 6, background: `repeating-linear-gradient(52deg, rgba(${CRAYON.red},0.8) 0 2.5px, rgba(${CRAYON.red},0.3) 2.5px 5px, transparent 5px 6.5px)`, display: "inline-block" }} />빽빽할수록 많이 안 돼요</div>
                        </div>
                      )}
                      {focusDay && respOptByDay.get(focusDay) && (
                        <div style={{ marginTop: 16, padding: 14, ...cardStyle, borderRadius: WOBS[3] }}>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: respOptByDay.get(focusDay)!.voters.length ? 8 : 0 }}>{fmtDate(focusDay)} · {respOptByDay.get(focusDay)!.count}명 안 됨</div>
                          {respOptByDay.get(focusDay)!.voters.length ? voterRow(respOptByDay.get(focusDay)!.voters) : <div style={{ fontSize: 12, color: "#3E7D2E" }}>이 날은 다들 돼요 👍</div>}
                        </div>
                      )}
                    </div>
                  )}
                  {hasGymOpts && voteTab === "gym" && (
                    <div style={{ padding: "18px 16px 0" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>선호 암장을 골라주세요</div>
                      <div style={{ fontSize: 12, color: "#514C44", marginBottom: 14 }}>다른 사람이 많이 고른 곳이 위에 · 여러 곳 가능</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {gymOpts.map((o: Any) => { const sel = !!voteGyms[o.id]; return (
                          <div key={o.id} onClick={() => { if (voteSubmitted) { showToast("아래 '수정하기'를 누르면 바꿀 수 있어요"); return; } setVoteGyms((v) => ({ ...v, [o.id]: !v[o.id] })); }} style={{ ...rowStyle(sel), alignItems: "flex-start" }}><div style={{ ...boxStyle(sel), marginTop: 1 }}>{sel ? "✓" : ""}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{o.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{o.meta}</div>{voterRow(o.voters)}</div><div style={{ fontSize: 13, fontWeight: 700, color: "#514C44" }}>{o.count}표</div></div>
                        ); })}
                      </div>
                    </div>
                  )}
                </>)}
              </div>
            </>
          )}

          {is("gymDetail") && sg && (
            <>
              <div style={{ animation: "ccfade .3s ease", paddingBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 8px" }}><BackBtn onClick={back} /><div style={{ flex: 1, fontSize: 18, fontWeight: 700, minWidth: 0 }}>{sg.name}</div><FavStar on={isFavGym(selGym)} onClick={() => selGym && toggleFavorite(selGym, !isFavGym(selGym))} size={44} /></div>
                <div style={{ padding: "8px 16px 0" }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={avatarStyle(sg.color, 60)}>{sg.initial}</div><div><div style={{ fontSize: 22, fontWeight: 800 }}>{sg.name}</div><div style={{ fontSize: 13, color: "#514C44", marginTop: 4 }}>{sg.loc}</div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>{sg.reviews ? (<><span style={{ color: "#E0921A", fontSize: 15 }}>★</span><span style={{ fontSize: 15, fontWeight: 700 }}>{sg.rating}</span><span style={{ fontSize: 13, color: "#514C44" }}>리뷰 {sg.reviews}개</span></>) : (<span style={{ fontSize: 13, color: "#514C44" }}>아직 리뷰 없음</span>)}</div></div></div></div>
                <div style={{ padding: "18px 16px 0" }}>
                  <div style={{ padding: 14, borderRadius: WOBS[1], background: sg.due ? "#FBEFD9" : "#E4F5EC", border: `2px solid ${INK}`, transform: "rotate(-0.4deg)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: "#fff", border: `2px solid ${INK}`, background: hatch(sg.due ? CRAYON.orange : CRAYON.green), transform: "rotate(-3deg)" }}>{sg.due ? "!" : "✓"}</div><div><div style={{ fontSize: 15, fontWeight: 700, color: sg.due ? "#B5730A" : "#3E7D2E" }}>{!sg.ever ? "아직 안 가봤어요" : sg.due ? "또 갈 때가 됐어요" : "최근 다녀왔어요"}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{!sg.ever ? `보통 ${sg.cycle}주 주기예요` : `${sg.weeks}주 전 방문 · 보통 ${sg.cycle}주 주기`}</div></div></div>
                  </div>
                </div>
                <div style={{ padding: "14px 16px 0" }}><a href={`https://map.naver.com/p/search/${encodeURIComponent(sg.name || "")}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, ...cardStyle, borderRadius: WOBS[3], textDecoration: "none", color: "#3A3633" }}><div style={{ width: 34, height: 34, borderRadius: 9, background: "#03C75A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, color: "#fff", fontFamily: "sans-serif" }}>N</div><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>네이버 지도에서 보기</div><div style={{ fontSize: 12, color: "#514C44" }}>길찾기 · 위치 · 영업시간</div></div><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M9 7h8v8" stroke="#514C44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></a></div>
                {sg.instagram && (
                  <div style={{ padding: "14px 16px 0" }}><a href={sg.instagram} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, ...cardStyle, borderRadius: WOBS[2], textDecoration: "none", color: "#3A3633" }}><div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#F58529,#DD2A7B)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="#fff" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.8" /><circle cx="17" cy="7" r="1.2" fill="#fff" /></svg></div><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>인스타 뉴셋 공지 보기</div><div style={{ fontSize: 12, color: "#514C44" }}>{handleOf(sg.instagram) || "인스타그램 열기"}</div></div><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M9 7h8v8" stroke="#514C44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></a></div>
                )}
                <div style={{ padding: "18px 0 0" }}>
                  <div style={{ padding: "0 16px", fontSize: 16, fontWeight: 700, marginTop: 12 }}>세팅 회차별 리뷰</div>
                  {reviewSets.length === 0 && <div style={{ padding: "12px 16px 0", color: "#514C44", fontSize: 13 }}>아직 리뷰가 없어요.</div>}
                  {reviewSets.map((set: Any) => (
                    <div key={set.header} style={{ padding: "0 16px", marginTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#514C44", marginBottom: 8, letterSpacing: "0.02em" }}>{set.header}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {set.items.map((r: Any, i: number) => (
                          <div key={i} style={{ padding: 14, ...cardStyle, borderRadius: WOBS[2] }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 999, background: r.bg, color: r.c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{r.user[0]}</div><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{r.user}</div><div style={{ fontSize: 12, color: "#E0921A", letterSpacing: 1 }}>{r.stars}</div></div><div style={{ fontSize: 12, color: "#514C44" }}>{r.date}</div></div><div style={{ fontSize: 14, color: "#3C3A34", lineHeight: 1.55, marginTop: 10 }}>{r.text}</div></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div onClick={() => showToast("문제·난이도 기능은 준비 중이에요")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 12, background: "#F5F3EE", cursor: "pointer" }}>
                    <div style={{ flex: 1, fontSize: 13, color: "#514C44" }}>이번 셋 문제 · 내 기준 난이도 보정</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#514C44" }}>준비 중</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {is("calendar") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 96 }}>
              <div style={{ padding: "56px 16px 8px" }}><div style={H1}>캘린더</div></div>
              <div style={{ margin: "12px 16px 0", padding: 16, ...cardStyle }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div onClick={() => setCalMonthOffset((o) => o - 1)} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><svg width="9" height="16" viewBox="0 0 9 16"><path d="M7 1 1 8l6 7" stroke="#514C44" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{calMonth}</div>
                  <div onClick={() => setCalMonthOffset((o) => o + 1)} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><svg width="9" height="16" viewBox="0 0 9 16"><path d="M2 1l6 7-6 7" stroke="#514C44" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", fontSize: 11, color: "#514C44", marginBottom: 8 }}>{WD.map((d) => <div key={d}>{d}</div>)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 6, fontSize: 14 }}>{calCells.map((c) => <div key={c.key} style={c.style}>{c.day}</div>)}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 14, paddingTop: 14, borderTop: "2px dashed rgba(58,54,51,0.25)", fontSize: 13, fontWeight: 700, color: "#443F38", flexWrap: "wrap" }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", background: hatch(CRAYON.green), border: `1.5px solid ${INK}`, display: "inline-block" }} />내 일정</div><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", border: "2px dashed #2E6B22", display: "inline-block" }} />크루 일정</div><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: "52% 48% 46% 54%", border: "2px solid #E24D3A", display: "inline-block" }} />오늘</div></div>
              </div>
              {viewVisits.length === 0 && <div style={{ padding: "22px 16px 0" }}><div style={{ padding: 14, ...cardStyle, color: !viewLoaded ? "#A8A297" : "#514C44", fontSize: 13 }}>{!viewLoaded ? "불러오는 중이에요…" : personal ? "아직 기록이 없어요. 가운데 + 버튼으로 첫 기록을 남겨보세요!" : "클라이밍 일정이 아직 없어요. 투표로 잡아보세요!"}</div></div>}
              {futureVisits.length > 0 && (
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ ...sectionLabel, marginBottom: 10 }}>다가오는 일정</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{futureVisits.map((v) => visitRow(v, true))}</div>
                </div>
              )}
              {pastVisits.length > 0 && (
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ ...sectionLabel, marginBottom: 10 }}>지난 클라이밍</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{pastVisits.slice(0, 8).map((v) => visitRow(v, false))}</div>
                </div>
              )}
            </div>
          )}

          {is("profile") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 96 }}>
              <div style={{ padding: "56px 16px 8px" }}><div style={H1}>프로필</div></div>
              <div style={{ padding: "14px 16px 0" }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}>{me?.profileImg ? <img src={me.profileImg} alt="" style={{ width: 66, height: 66, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", objectFit: "cover", flexShrink: 0, border: `2.5px solid ${INK}`, transform: "rotate(-2deg)" }} /> : <div style={{ width: 66, height: 66, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", background: hatch(CRAYON.red), border: `2.5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#fff", flexShrink: 0, transform: "rotate(-2deg)" }}>{(me?.nickname || "?")[0]}</div>}<div><div style={{ fontSize: 20, fontWeight: 800 }}>{me?.nickname ?? "…"}</div><div onClick={() => crews.length > 1 && setSwitcherOpen(true)} style={{ fontSize: 13, color: "#514C44", marginTop: 2, cursor: crews.length > 1 ? "pointer" : "default" }}>{crews.length === 0 ? "소속 크루 없음" : crews.length === 1 ? ac?.name : `${crews.length}개 크루 · ${ac?.name ?? ""} ▾`}</div><div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "5px 11px", borderRadius: 999, background: "#FBF0DA", fontSize: 12, fontWeight: 800, color: "#B4432E" }}><span style={{ width: 10, height: 10, borderRadius: 999, background: "#2F72E0", display: "inline-block" }} />{thetaChip}</div></div></div></div>
              <div style={{ padding: "18px 16px 0" }}>
                <div style={{ display: "flex", ...cardStyle, overflow: "hidden" }}>{[[String(me?.stats?.myVisitCount ?? 0), "내 기록"], [String(me?.stats?.favoriteCount ?? 0), "즐겨찾기 ★"], [String(me?.stats?.myReviewCount ?? 0), "내 리뷰"]].map(([n, l], i) => (<div key={l} style={{ flex: 1, textAlign: "center", padding: "16px 0", borderLeft: i ? "2px dashed rgba(58,54,51,0.25)" : "none" }}><div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{l}</div></div>))}</div>
              </div>
              <div style={{ padding: "24px 16px 0" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}><div style={sectionLabel}>내 완등 로그</div><div style={{ fontSize: 11, fontWeight: 700, color: "#514C44", background: "#F3EEDF", padding: "3px 9px", borderRadius: 999 }}>준비 중</div></div><div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>완등 기록 기능은 준비 중이에요.</div></div>
              <div style={{ padding: "22px 16px 0" }}><div style={{ ...cardStyle, overflow: "hidden" }}>
                <div onClick={() => showToast("알림 설정은 준비 중이에요")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "15px 16px", borderBottom: "2px dashed rgba(58,54,51,0.2)", cursor: "pointer" }}><div style={{ flex: 1, fontSize: 15, color: "#514C44" }}>알림 설정</div><div style={{ fontSize: 11, fontWeight: 700, color: "#514C44", background: "#F3EEDF", padding: "3px 9px", borderRadius: 999 }}>준비 중</div></div>
                {crews.length > 0 && <div onClick={openCrewManage} style={{ display: "flex", alignItems: "center", gap: 8, padding: "15px 16px", borderBottom: "2px dashed rgba(58,54,51,0.2)", cursor: "pointer" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke={INK} strokeWidth="1.8" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" stroke={INK} strokeWidth="1.8" strokeLinecap="round" /></svg><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>크루 관리</div><div style={{ fontSize: 12, color: "#514C44" }}>멤버 · 초대 · 홈 암장</div><ChevR /></div>}
                {crews.length === 0 && <div onClick={() => go("start")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "15px 16px", borderBottom: "2px dashed rgba(58,54,51,0.2)", cursor: "pointer" }}><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>크루 시작하기</div><div style={{ fontSize: 12, color: "#514C44" }}>만들기 · 초대 코드 참여</div><ChevR /></div>}
                <div onClick={async () => { if (status === "authenticated") await signOut({ redirect: false }); setCrews([]); setActiveCrewId(null); tab("login"); }} style={{ display: "flex", alignItems: "center", padding: "15px 16px", cursor: "pointer" }}><div style={{ flex: 1, fontSize: 15, color: "#D14343" }}>로그아웃</div></div>
              </div></div>
            </div>
          )}

          {is("crewManage") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 100 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 4px" }}>
                <BackBtn onClick={back} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>크루 관리</div><div style={{ fontSize: 13, color: "#514C44" }}>{ac?.name ?? ""}</div></div>
                {myRole === "LEADER" && <button onClick={openCrewEdit} style={{ height: 36, padding: "0 14px", marginRight: 4, border: `2px solid ${INK}`, borderRadius: WOBS[3], background: "#FFFEFA", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>정보 수정</button>}
              </div>

              {/* 초대 코드 */}
              <div style={{ padding: "18px 16px 0" }}>
                <div style={{ ...sectionLabel, marginBottom: 8 }}>초대</div>
                <div style={{ padding: 16, ...cardStyle, borderRadius: WOBS[0] }}>
                  <div style={{ fontSize: 13, color: "#514C44" }}>초대 코드</div>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.06em", marginTop: 2 }}>{crewDetail?.inviteCode ?? "…"}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button onClick={copyLink} style={{ flex: 1, height: 44, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>링크 복사</button>
                    <button onClick={shareInvite} style={{ flex: 1, height: 44, border: `2px solid ${INK}`, borderRadius: WOBS[1], background: "#FEE500", color: "#191600", fontSize: 15, fontWeight: 700, cursor: "pointer", transform: "rotate(-0.3deg)" }}>카톡 공유</button>
                  </div>
                </div>
              </div>

              {/* 멤버 + 가입 신청 */}
              <div style={{ padding: "24px 16px 0" }}>
                <div style={{ ...sectionLabel, marginBottom: 10 }}>멤버 {members.length}{requests.length > 0 ? ` · 신청 ${requests.length}` : ""}</div>
                {requests.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                    {requests.map((r) => (
                      <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: WOBS[2], border: `2px solid ${INK}`, background: `rgba(${CRAYON.yellow},0.12)` }}>
                        <div style={{ width: 36, height: 36, borderRadius: "56% 44% 52% 48%", background: "#EAE4D4", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#514C44" }}>{r.user.nickname[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{r.user.nickname}</div><div style={{ fontSize: 12, color: "#514C44" }}>{rel(r.createdAt)} 신청</div></div>
                        <button onClick={() => handleReq(r.userId, r.user.nickname, false)} style={{ height: 40, padding: "0 13px", border: `2px solid ${INK}`, borderRadius: WOBS[3], background: "#FFFEFA", color: "#514C44", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>거절</button>
                        <button onClick={() => handleReq(r.userId, r.user.nickname, true)} style={{ height: 40, padding: "0 15px", fontSize: 14, fontWeight: 700, ...crayonBtn(CRAYON.green, 0) }}>승인</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {members.map((m: Any) => (
                    <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", ...cardStyle, borderRadius: WOBS[2] }}>
                      <div style={{ width: 36, height: 36, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", border: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, background: hatch(hexRgb(m.color)), color: "#fff" }}>{m.name[0]}</div>
                      <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{m.name}</div>
                      <div style={{ ...rolePal[m.role], fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999 }}>{m.role}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 홈 암장 (편집은 모달) */}
              <div style={{ padding: "26px 16px 0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <div style={sectionLabel}>홈 암장 · {crewGyms.filter((g) => g.isHome).length}/4</div>
                  <button onClick={openHomeEdit} style={{ height: 34, padding: "0 14px", border: `2px solid ${INK}`, borderRadius: WOBS[3], background: "#FFFEFA", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>편집</button>
                </div>
                <div style={{ fontSize: 13, color: "#514C44", marginBottom: 12 }}>자주 가는 곳. 투표 후보와 &quot;가야 할 암장&quot;에 떠요</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {crewGyms.filter((g) => g.isHome).length === 0 && <div style={{ padding: 13, ...cardStyle, color: "#514C44", fontSize: 14, borderRadius: WOBS[2] }}>아직 없어요. &quot;편집&quot;에서 추가하세요.</div>}
                  {gyms.filter((g) => g.isHome).map((g) => (
                    <div key={g.id} onClick={() => openGym(g.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", ...cardStyle, borderRadius: WOBS[1], cursor: "pointer" }}>
                      <div style={avatarStyle(g.color, 34)}>{g.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{g.loc}</div></div>
                      <ChevR />
                    </div>
                  ))}
                </div>
              </div>

              {/* 탈퇴 */}
              <div style={{ padding: "30px 16px 0" }}>
                <button onClick={() => setLeaveSheetOpen(true)} style={{ width: "100%", height: 48, border: "2px dashed rgba(209,67,67,0.5)", borderRadius: WOBS[2], background: "transparent", color: "#D14343", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                  {myRole === "LEADER" && members.length <= 1 ? "크루 삭제하고 나가기" : "크루 탈퇴"}
                </button>
              </div>
            </div>
          )}

          {is("probList") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 96 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 2px" }}><BackBtn onClick={back} /><div style={{ fontSize: 15, fontWeight: 700, color: "#514C44" }}>{probGym?.name ?? ""}</div></div>
              <div style={{ padding: "2px 16px 0" }}><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>이번 셋 문제</div><div style={{ fontSize: 13, color: "#514C44", marginTop: 6 }}>색이 곧 난이도예요</div></div>
              <div style={{ padding: "16px 16px 0" }}><div style={{ display: "flex", gap: 4, padding: 4, background: "#F3EEDF", borderRadius: 11 }}><div onClick={() => setSort("easy")} style={segStyle(sort === "easy")}>쉬운 순</div><div onClick={() => setSort("hard")} style={segStyle(sort === "hard")}>어려운 순</div></div></div>
              {probGroups.length === 0 && <div style={{ padding: "22px 16px", color: "#514C44", fontSize: 14 }}>아직 등록된 문제가 없어요.</div>}
              {probGroups.map((grp: Any) => (
                <div key={grp.color} style={{ padding: "22px 16px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><div style={dotStyle(grp.items[0].hex, grp.color, 18)} /><div style={{ fontSize: 16, fontWeight: 800 }}>{grp.color}</div><div style={{ fontSize: 12, color: "#514C44" }}>{grp.items.length}개</div></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {grp.items.map((p: Any) => (
                      <div key={p.id} onClick={() => openProb(p.id)} style={{ padding: "13px 14px", ...cardStyle, borderRadius: WOBS[2], cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={dotStyle(p.hex, p.color)} /><div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{p.color}{p.tag ? ` · ${p.tag}` : ""}</div>{p.honey && <div style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#FBEFD9", color: "#B5730A" }}>꿀</div>}{p.mine && <div style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#E4F5EC", color: "#3E7D2E" }}>완등 ✓</div>}</div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 11 }}><div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#514C44", marginBottom: 3 }}><span>체감</span><span>{feelLabel(p.feel)}</span></div><div style={{ position: "relative", height: 6, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={meterFill(p.feel)} /></div></div><div style={{ width: 62 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#514C44", marginBottom: 3 }}><span>완등</span><span>{p.send}%</span></div><div style={{ height: 6, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={{ width: p.send + "%", height: "100%", background: "#6BBF59", borderRadius: 999 }} /></div></div><div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "#514C44", paddingBottom: 1 }}><PlayDot />{p.videos}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {is("probDetail") && pd && (
            <>
              <div style={{ animation: "ccfade .3s ease", paddingBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 2px" }}><BackBtn onClick={back} /><div style={{ fontSize: 15, fontWeight: 700, color: "#514C44" }}>{pd.gymName}</div></div>
                <div style={{ padding: "8px 16px 0" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={dotStyle(pd.hex, pd.color, 24)} /><div style={{ flex: 1 }}><div style={{ fontSize: 24, fontWeight: 800 }}>{pd.color}{pd.tag ? ` · ${pd.tag}` : ""}</div><div style={{ fontSize: 13, color: "#514C44", marginTop: 2 }}>{pd.gymName} · 이번 셋</div></div>{pd.honey && <div style={{ padding: "5px 11px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: "#FBEFD9", color: "#B5730A" }}>꿀 문제</div>}</div></div>
                <div style={{ padding: "18px 16px 0" }}><div style={{ padding: 16, ...cardStyle }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#514C44", marginBottom: 6 }}><span>크루 합의 체감</span><span style={{ fontWeight: 700, color: "#3A3633" }}>{feelLabel(pd.feel)}</span></div><div style={{ position: "relative", height: 8, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={meterFill(pd.feel)} /></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#514C44", margin: "16px 0 6px" }}><span>완등률</span><span style={{ fontWeight: 700, color: "#3E7D2E" }}>{pd.send}%</span></div><div style={{ height: 8, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={{ width: pd.send + "%", height: "100%", background: "#6BBF59", borderRadius: 999 }} /></div></div></div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>완등 영상 <span style={{ color: "#514C44", fontWeight: 600, fontSize: 14 }}>{pdVideos.length}개</span></div>
                  {pdVideos.length === 0 ? <div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>아직 영상이 없어요. 기록 탭에서 올려보세요.</div> : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{pdVideos.map((v: Any, i: number) => (<div key={i} style={{ position: "relative", aspectRatio: "3/4", borderRadius: 14, overflow: "hidden", background: "#EEEDE7", display: "flex", alignItems: "center", justifyContent: "center", color: "#514C44", fontSize: 12 }}>{v.user.nickname}<div style={{ position: "absolute", left: 8, bottom: 8, width: 30, height: 30, borderRadius: 999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 2l7 4-7 4z" fill="#fff" /></svg></div></div>))}</div>
                  )}
                </div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>베타 · 공략</div>
                  {pdBetas.length === 0 ? <div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>아직 베타가 없어요.</div> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{pdBetas.map((b: Any, i: number) => (<div key={i} style={{ padding: 14, ...cardStyle, borderRadius: WOBS[2] }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: 999, background: b.bg, color: b.c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{b.user[0]}</div><div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{b.user}</div><div style={{ fontSize: 12, color: "#514C44" }}>{b.date}</div></div><div style={{ fontSize: 14, color: "#3C3A34", lineHeight: 1.55, marginTop: 10 }}>{b.text}</div></div>))}</div>
                  )}
                </div>
              </div>
            </>
          )}

          {is("record") && (
            <>
              <div style={{ animation: "ccfade .3s ease", paddingBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "56px 16px 2px" }}><div style={{ fontSize: 24, fontWeight: 800 }}>완등 기록</div><button onClick={() => tab("home")} style={{ width: 36, height: 36, border: "none", borderRadius: 999, background: "#F3EEDF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#514C44" strokeWidth="2" strokeLinecap="round" /></svg></button></div>
                <div style={{ padding: "2px 16px 0", fontSize: 13, color: "#514C44" }}>올린 영상에 문제 정보만 붙이면 끝이에요</div>
                <div style={{ padding: "18px 16px 0" }}><div style={{ ...sectionLabel, marginBottom: 8 }}>어디서 풀었어요?</div><div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>{gyms.map((gg) => { const sel = gg.id === (recGym || gyms[0]?.id); return (<div key={gg.id} onClick={() => setRecGym(gg.id)} style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", border: sel ? "1.5px solid #E24D3A" : "1px solid #C9C2B2", background: sel ? "#FBF0DA" : "#fff", color: sel ? "#B4432E" : "#514C44" }}>{gg.name}</div>); })}</div></div>
                <div style={{ padding: "22px 16px 0" }}><div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>1. 영상·사진 올리기</div><div style={{ fontSize: 12, color: "#514C44", marginBottom: 10 }}>완등 순간을 끌어다 놓으세요</div><div style={{ height: 220, borderRadius: 16, background: "#EEEDE7", display: "flex", alignItems: "center", justifyContent: "center", color: "#514C44", fontSize: 14 }}>여기로 영상·사진을 끌어다 놓으세요</div></div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>2. 이 영상은 어떤 문제였어요?</div>
                  <div style={{ padding: 16, ...cardStyle }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#514C44", marginBottom: 10 }}>문제 색 (난이도)</div>
                    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>{recColors.map(([name, hex]) => { const sel = recColor === name; return (<div key={name} onClick={() => setRecColor(name)} style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}><div style={{ width: 40, height: 40, borderRadius: 12, background: hex, cursor: "pointer", border: name === "흰" ? "1.5px solid #D6D4CC" : "none", boxShadow: sel ? "0 0 0 2px #fff, 0 0 0 4px #E24D3A" : "none" }} /><div style={{ fontSize: 11, marginTop: 6, textAlign: "center", fontWeight: sel ? 800 : 600, color: sel ? "#3A3633" : "#514C44" }}>{name}</div></div>); })}</div>
                    <div style={{ height: 1, background: "#F3EEDF", margin: "16px 0" }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#514C44", marginBottom: 8 }}>체감 난이도</div>
                    <div style={{ display: "flex", gap: 4, padding: 4, background: "#F3EEDF", borderRadius: 10 }}>{["쉬움", "적정", "어려움"].map((f) => <div key={f} onClick={() => setRecFeel(f)} style={segStyle(recFeel === f)}>{f}</div>)}</div>
                    <div style={{ marginTop: 16 }}><div onClick={() => setRecHoney((h) => !h)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: recHoney ? "none" : "1px solid #C9C2B2", background: recHoney ? "#FBEFD9" : "#fff", color: recHoney ? "#B5730A" : "#514C44" }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#E0921A", display: "inline-block" }} />꿀 문제로 표시</div></div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#514C44", margin: "18px 0 8px" }}>한 줄 설명 · 베타</div>
                    <textarea value={recMemo} onChange={(e) => setRecMemo(e.target.value)} placeholder="어떻게 풀었는지, 베타 한 줄" style={{ width: "100%", height: 80, border: "2px solid #3A3633", borderRadius: 10, padding: "12px 14px", fontSize: 14, background: "#FFFDF6", outline: "none", resize: "none", lineHeight: 1.5 }} />
                  </div>
                </div>
              </div>
            </>
          )}

          {is("recommend") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 96 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 2px" }}><BackBtn onClick={back} /><div style={{ fontSize: 15, fontWeight: 700, color: "#514C44" }}>오늘 추천</div></div>
              <div style={{ padding: "2px 16px 0" }}><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>이거 지금 풀 만해요</div><div style={{ fontSize: 13, color: "#514C44", marginTop: 6 }}>{thetaChip} · 미완등 문제를 쉬운 순으로</div></div>
              <div style={{ padding: "16px 16px 0" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, ...cardStyle, borderRadius: WOBS[2] }}><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>성장 모드</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>한 단계 위 난이도까지 추천</div></div><div onClick={() => setGrowthMode((g) => !g)} style={{ width: 46, height: 28, borderRadius: 999, flexShrink: 0, cursor: "pointer", position: "relative", transition: "background .15s", background: growthMode ? "#E24D3A" : "#DAD8D0" }}><div style={{ position: "absolute", top: 3, left: growthMode ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} /></div></div></div>
              <div style={{ padding: "18px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
                {recoList.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>{recos == null ? "계산 중이에요" : growthMode ? "추천할 문제가 없어요." : "지금 딱 맞는 문제가 없어요 · 성장 모드를 켜보세요."}</div>}
                {recoList.map((p: Any) => (
                  <div key={p.id} onClick={() => openProb(p.id)} style={{ padding: 16, ...cardStyle, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={dotStyle(p.hex, p.color, 20)} /><div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{p.color}{p.tag ? ` · ${p.tag}` : ""}</div>{p.honey && <div style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#FBEFD9", color: "#B5730A" }}>꿀</div>}</div>
                    <div style={{ marginTop: 12 }}><div style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: p.tone === 0 ? "#3E7D2E" : p.tone === 1 ? "#B5730A" : "#B4432E", background: p.tone === 0 ? "#E4F5EC" : p.tone === 1 ? "#FBEFD9" : "#FBF0DA" }}>{p.phrase}</div></div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 12 }}><div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#514C44", marginBottom: 3 }}><span>체감</span><span>{feelLabel(p.feel)}</span></div><div style={{ position: "relative", height: 6, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={meterFill(p.feel)} /></div></div></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {is("gradeMap") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 60 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 2px" }}><BackBtn onClick={back} /><div style={{ fontSize: 15, fontWeight: 700, color: "#514C44" }}>난이도 지도</div></div>
              <div style={{ padding: "2px 16px 0" }}><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>내 기준 난이도 지도</div><div style={{ fontSize: 13, color: "#514C44", marginTop: 6, lineHeight: 1.5 }}>암장마다 색-난이도가 달라요.<br />같은 척도 위에 놓고 비교합니다.</div></div>
              <div style={{ padding: "24px 16px 0" }}><div style={{ padding: 16, background: "#FBF0DA", borderRadius: 14, fontSize: 14, color: "#B4432E", lineHeight: 1.55 }}><b>난이도 지도는 준비 중이에요.</b> 색→공통척도 투표가 더 쌓이면 암장 간 비교를 여기에 그려줄게요.</div></div>
            </div>
          )}

          {is("createPoll") && (
            <>
              <div style={{ animation: "ccfade .3s ease", paddingBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 8px" }}><BackBtn onClick={back} /><div style={{ fontSize: 20, fontWeight: 700 }}>투표 만들기</div></div>
                {openPolls.length > 0 && (
                  <div style={{ margin: "8px 16px 0", padding: "10px 14px", borderRadius: WOBS[1], border: `2px solid ${INK}`, background: "#FBF0DA", fontSize: 13, fontWeight: 700, color: "#B4432E", lineHeight: 1.5 }}>
                    이미 진행 중인 투표가 {openPolls.length}개 있어요 · 같은 세션 투표를 또 만드는 건 아닌지 확인해주세요
                  </div>
                )}
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>제목</div>
                  <input value={pollTitle} onChange={(e) => setPollTitle(e.target.value)} placeholder="예: 이번 주말 어디 갈까?" style={{ width: "100%", height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none" }} />
                </div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>1. 날짜 범위</div>
                  <div style={{ fontSize: 12, color: "#514C44", marginBottom: 12 }}>가고 싶은 기간의 시작·끝 날짜를 눌러요 (하루면 같은 날 한 번)</div>
                  <div style={{ padding: 14, ...cardStyle }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div onClick={() => setPollCalOffset((o) => Math.max(0, o - 1))} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: pollCalOffset > 0 ? "pointer" : "default", opacity: pollCalOffset > 0 ? 1 : 0.3 }}><svg width="9" height="16" viewBox="0 0 9 16"><path d="M7 1 1 8l6 7" stroke="#514C44" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{pcMonthLabel}</div>
                      <div onClick={() => setPollCalOffset((o) => Math.min(2, o + 1))} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: pollCalOffset < 2 ? "pointer" : "default", opacity: pollCalOffset < 2 ? 1 : 0.3 }}><svg width="9" height="16" viewBox="0 0 9 16"><path d="M2 1l6 7-6 7" stroke="#514C44" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", fontSize: 11, color: "#514C44", marginBottom: 6 }}>{WD.map((d) => <div key={d}>{d}</div>)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 4 }}>
                      {Array.from({ length: pcFirstDow }).map((_, i) => <div key={"b" + i} />)}
                      {Array.from({ length: pcDaysInMonth }, (_, i) => i + 1).map((d) => {
                        const ds = ymd(pcY, pcM, d);
                        const past = ds < todayStr;
                        const isStart = pollRange.start === ds;
                        const isEnd = pollRange.end === ds;
                        const endpoint = isStart || isEnd;
                        const inBand = !!(pollRange.start && pollRange.end && ds > pollRange.start && ds < pollRange.end);
                        return (
                          <div key={d} onClick={() => { if (!past) tapRangeDay(ds); }} style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: endpoint ? "52% 48% 46% 54% / 50% 46% 54% 50%" : 10, cursor: past ? "default" : "pointer", background: endpoint ? hatch(CRAYON.red) : inBand ? `repeating-linear-gradient(52deg, rgba(${CRAYON.orange},0.35) 0 2.5px, rgba(${CRAYON.orange},0.12) 2.5px 5px, transparent 5px 7.5px)` : "transparent", border: endpoint ? `2px solid ${INK}` : "2px solid transparent", color: past ? "#D6D4CC" : endpoint ? "#fff" : inBand ? "#A8452C" : "#3A3633", fontSize: 15, fontWeight: endpoint || inBand ? 700 : 400 }}>
                            {d}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {pollRange.start && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "#FBF0DA" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#B4432E" }}>{fmtDate(pollRange.start)}{pollRange.end && pollRange.end !== pollRange.start ? ` ~ ${fmtDate(pollRange.end)}` : ""}<span style={{ color: "#514C44", fontWeight: 600 }}> · {pollRange.end ? Math.round((new Date(pollRange.end).getTime() - new Date(pollRange.start).getTime()) / 86400000) + 1 : 1}일</span></div>
                      <div onClick={() => setPollRange({ start: null, end: null })} style={{ fontSize: 12, fontWeight: 700, color: "#514C44", cursor: "pointer" }}>지우기</div>
                    </div>
                  )}
                </div>
                <div style={{ padding: "24px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>2. 투표 마감</div>
                  <div style={{ fontSize: 12, color: "#514C44", marginBottom: 12 }}>언제까지 투표받을까요</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[{ label: "3일 뒤", d: 3 }, { label: "5일 뒤", d: 5 }, { label: "일주일 뒤", d: 7 }, { label: "마감 없음", d: null }].map((o) => { const on = pollDeadlineDays === o.d; return (
                      <div key={o.label} onClick={() => setPollDeadlineDays(o.d)} style={{ padding: "6px 15px", borderRadius: WOBS[(o.d ?? 0) % 4], fontSize: 16, fontWeight: 700, cursor: "pointer", border: on ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: on ? HILITE : "#FFFEFA", color: on ? INK : "#514C44", transform: on ? "rotate(-0.8deg)" : "none" }}>{on ? "✓ " : ""}{o.label}</div>
                    ); })}
                  </div>
                </div>
                <div style={{ padding: "24px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>3. 암장 후보</div>
                  <div style={{ fontSize: 12, color: "#514C44", marginBottom: 12 }}>홈 암장 중 안 간 곳이 위에 · 안 골라도 돼요</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {homeGymCandidates.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>홈 암장이 없어요. 아래에서 검색해 추가하세요.</div>}
                    {homeGymCandidates.map((g) => { const sel = pollGymIds.includes(g.id); return (
                      <div key={g.id} onClick={() => toggleGymCandidate(g.id)} style={rowStyle(sel)}>
                        <div style={boxStyle(sel)}>{sel ? "✓" : ""}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{visitLabel(g)}{g.rating ? ` · ★${g.rating}` : ""}</div></div>
                        {g.due && <div style={{ fontSize: 10, fontWeight: 700, color: "#B5730A", background: "#FBEFD9", padding: "2px 6px", borderRadius: 999, flexShrink: 0 }}>추천</div>}
                      </div>
                    ); })}
                    {selectedOtherGyms.map((g) => (
                      <div key={g.id} onClick={() => toggleGymCandidate(g.id)} style={rowStyle(true)}>
                        <div style={boxStyle(true)}>✓</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{visitLabel(g)}</div></div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", background: "#F3EEDF", borderRadius: 12 }}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#514C44" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#514C44" strokeWidth="1.8" strokeLinecap="round" /></svg>
                      <input value={gymSearch} onChange={(e) => setGymSearch(e.target.value)} placeholder="다른 암장 검색해서 추가" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15 }} />
                    </div>
                    {searchedGyms.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        {searchedGyms.slice(0, 6).map((g) => (
                          <div key={g.id} onClick={() => { toggleGymCandidate(g.id); setGymSearch(""); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", ...cardStyle, borderRadius: WOBS[3], cursor: "pointer" }}>
                            <div style={{ width: 24, height: 24, borderRadius: 999, background: "#F3EEDF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#514C44" strokeWidth="2" strokeLinecap="round" /></svg></div>
                            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{g.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

        {bottomBar && (
          <div style={{ flexShrink: 0, padding: showTabBar ? "12px 16px 12px" : "14px 16px 26px", background: "#FFFDF6", borderTop: "2px dashed rgba(58,54,51,0.25)" }}>{bottomBar}</div>
        )}

        {showTabBar && (
          <div style={{ flexShrink: 0, display: "flex", background: "rgba(255,255,255,0.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTop: "2px dashed rgba(58,54,51,0.25)", padding: "8px 4px 26px" }}>
            <button aria-label="홈" onClick={() => tab("home")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", border: "none", background: "transparent", fontFamily: "inherit", padding: 0 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-7v6H4a1 1 0 0 1-1-1z" stroke={tc("home")} strokeWidth="1.8" strokeLinejoin="round" /></svg><div style={{ fontSize: 12, fontWeight: 700, color: tc("home") }}>홈</div></button>
            <button aria-label="탐색" onClick={() => tab("explore")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", border: "none", background: "transparent", fontFamily: "inherit", padding: 0 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke={tc("explore")} strokeWidth="1.8" /><path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" stroke={tc("explore")} strokeWidth="1.8" strokeLinejoin="round" /></svg><div style={{ fontSize: 12, fontWeight: 700, color: tc("explore") }}>탐색</div></button>
            <button aria-label={personal ? "기록 추가" : "새 투표"} onClick={() => { if (personal) { openRecordSheet(); return; } if (!activeCrewId) { showToast("먼저 크루를 선택해주세요"); return; } openCreatePoll(); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", cursor: "pointer", border: "none", background: "transparent", fontFamily: "inherit", padding: 0 }}><div style={{ width: 52, height: 52, borderRadius: "52% 48% 46% 54% / 50% 46% 54% 50%", background: hatch(personal ? CRAYON.green : CRAYON.red), display: "flex", alignItems: "center", justifyContent: "center", marginTop: -22, border: `2.5px solid ${INK}`, transform: "rotate(-3deg)" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 5.2 11.8 19M5.2 12.2 19 12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg></div><div style={{ fontSize: 12, fontWeight: 700, color: "#514C44", marginTop: 3 }}>{personal ? "기록 추가" : "새 투표"}</div></button>
            <button aria-label="캘린더" onClick={() => tab("calendar")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", border: "none", background: "transparent", fontFamily: "inherit", padding: 0 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke={tc("calendar")} strokeWidth="1.8" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke={tc("calendar")} strokeWidth="1.8" strokeLinecap="round" /></svg><div style={{ fontSize: 12, fontWeight: 700, color: tc("calendar") }}>캘린더</div></button>
            <button aria-label="프로필" onClick={() => tab("profile")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", border: "none", background: "transparent", fontFamily: "inherit", padding: 0 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.6" stroke={tc("profile")} strokeWidth="1.8" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke={tc("profile")} strokeWidth="1.8" strokeLinecap="round" /></svg><div style={{ fontSize: 12, fontWeight: 700, color: tc("profile") }}>프로필</div></button>
          </div>
        )}

        {switcherOpen && (
          <>
            <div onClick={() => setSwitcherOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 4px" }}>모드 전환</div>
              <div style={{ fontSize: 12, color: "#514C44", margin: "0 4px 14px" }}>개인 기록과 크루 일정은 따로 관리돼요</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* 개인 모드 — 사람은 무채 규칙 */}
                <div onClick={switchPersonal} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: WOBS[1], cursor: "pointer", border: personal ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: personal ? HILITE : "#FFFEFA" }}>
                  {me?.profileImg
                    ? <img src={me.profileImg} alt="" style={{ width: 44, height: 44, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", objectFit: "cover", flexShrink: 0, border: `2px solid ${INK}`, transform: "rotate(-2deg)" }} />
                    : <div style={{ width: 44, height: 44, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 19, background: hatch("58,54,51"), color: "#FFFDF6", border: `2px solid ${INK}`, transform: "rotate(-2deg)" }}>{(me?.nickname || "나")[0]}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>나의 클라이밍</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>내 기록 · 즐겨찾기 암장</div></div>
                  {personal && <svg width="22" height="22" viewBox="0 0 22 22" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="10" fill="#E24D3A" /><path d="M6.2 11.3 9.4 14.3 15.8 7.3" stroke="#fff" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                {crews.map((c) => { const active = !personal && c.id === activeCrewId; return (
                  <div key={c.id} onClick={() => switchCrew(c.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: WOBS[1], cursor: "pointer", border: active ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: active ? HILITE : "#FFFEFA" }}><div style={avatarStyle(crewColor(c.id))}>{c.name[0]}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{c.region || ""} · 멤버 {c._count?.members ?? 0}명</div></div>{active && <svg width="22" height="22" viewBox="0 0 22 22" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="10" fill="#E24D3A" /><path d="M6.2 11.3 9.4 14.3 15.8 7.3" stroke="#fff" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>
                ); })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}><button onClick={() => { setSwitcherOpen(false); go("create"); }} style={{ flex: 1, height: 46, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>새 크루 만들기</button><button onClick={() => { setSwitcherOpen(false); go("start"); }} style={{ flex: 1, height: 46, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>코드로 참여</button></div>
            </div>
          </>
        )}

        {closeSheetOpen && (
          <>
            <div onClick={() => setCloseSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 4px" }}>투표 마감</div>
              <div style={{ fontSize: 13, color: "#514C44", margin: "0 4px 12px", lineHeight: 1.5 }}>마감하면 아래 내용으로 확정되고 크루 일정에 등록돼요. 되돌릴 수 없어요.</div>
              <div style={{ margin: "0 0 14px", padding: "14px 16px", ...cardStyle, borderRadius: WOBS[2] }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#514C44" }}>이렇게 확정돼요 · 가장 적게 겹치는 날</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{closeWinDate ? fmtDate(closeWinDate.date) : "날짜 후보 없음"}{closeWinDate ? <span style={{ fontSize: 13, fontWeight: 700, color: "#514C44" }}> · 불가 {voteCnt(closeWinDate)}명</span> : null}</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: closeWinGym ? INK : "#514C44" }}>{closeWinGym ? <>{closeWinGym.name} <span style={{ fontSize: 13, color: "#514C44" }}>· 선호 {closeWinGym.count}표</span></> : "암장 후보 없음 · 날짜만 확정돼요"}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#514C44", lineHeight: 1.45 }}>X 하지 않은 크루원은 자동으로 참석 처리돼요.{respondedCount === 0 ? <b style={{ color: "#B4432E" }}> 아직 아무도 응답하지 않았어요 — 가장 이른 날짜로 확정돼요.</b> : null}</div>
              </div>
              <button onClick={closePoll} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>마감하고 확정</button>
              <button onClick={() => setCloseSheetOpen(false)} style={{ width: "100%", height: 46, marginTop: 8, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>취소</button>
            </div>
          </>
        )}
        {deletePollSheetOpen && (
          <>
            <div onClick={() => setDeletePollSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 4px" }}>투표 삭제</div>
              <div style={{ fontSize: 13, color: "#514C44", margin: "0 4px 16px", lineHeight: 1.5 }}>&apos;{openVote?.title ?? ""}&apos; 투표와 지금까지의 응답이 모두 지워져요. 되돌릴 수 없어요.</div>
              <button onClick={deletePoll} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>삭제하기</button>
              <button onClick={() => setDeletePollSheetOpen(false)} style={{ width: "100%", height: 46, marginTop: 8, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>취소</button>
            </div>
          </>
        )}
        {visitSheetOpen && (
          <>
            <div onClick={() => setVisitSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 2px" }}>방문 기록 추가</div>
              <div style={{ fontSize: 13, color: "#514C44", margin: "0 4px 14px" }}>{sg?.name ?? ""} · {personal ? "내 기록에 추가돼요 (크루와 무관)" : "크루 전체 일정에 추가돼요"}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#514C44", margin: "0 4px 8px" }}>언제 갔어요?</div>
              <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} style={{ width: "100%", height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none", marginBottom: 14 }} />
              <button onClick={recordVisit} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>방문 기록 추가</button>
              <button onClick={() => setVisitSheetOpen(false)} style={{ width: "100%", height: 46, marginTop: 8, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>취소</button>
            </div>
          </>
        )}
        {recordSheetOpen && (
          <>
            <div onClick={() => setRecordSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 24px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)", display: "flex", flexDirection: "column", maxHeight: "85%" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 12px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 2px" }}>기록 추가</div>
              <div style={{ fontSize: 13, color: "#514C44", margin: "0 4px 14px" }}>어디 갔었는지(또는 갈 건지) 남겨두세요 · 내 기록에만 저장돼요</div>
              {recordGymId ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: WOBS[1], border: `2px solid ${INK}`, background: HILITE, marginBottom: 10, flexShrink: 0 }}>
                  <div style={avatarStyle(gymById(recordGymId)?.color || "#E24D3A", 36)}>{(gymById(recordGymId)?.name || "?")[0]}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>{gymById(recordGymId)?.name}</div>
                  <button onClick={() => setRecordGymId(null)} style={{ height: 34, padding: "0 12px", border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>바꾸기</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", flexShrink: 0, background: "#fff", border: `2px solid ${INK}`, borderRadius: WOBS[2] }}>
                    <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#514C44" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#514C44" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    <input value={recordGymQ} onChange={(e) => setRecordGymQ(e.target.value)} placeholder="어느 암장이었어요?" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15, minWidth: 0 }} />
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
                    {(recordGymQ.trim() ? gyms.filter((g) => (g.name + " " + g.loc).toLowerCase().includes(recordGymQ.trim().toLowerCase())) : gyms.filter((g) => g.isHome)).slice(0, 30).map((g) => (
                      <div key={g.id} onClick={() => setRecordGymId(g.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", ...cardStyle, borderRadius: WOBS[3], cursor: "pointer", flexShrink: 0 }}>
                        <div style={avatarStyle(g.color, 32)}>{g.name[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{g.name}</div><div style={{ fontSize: 12, color: "#514C44" }}>{g.loc}</div></div>
                        {g.isFavorite && <span style={{ fontSize: 13, color: "#E0921A" }}>★</span>}
                      </div>
                    ))}
                    {!recordGymQ.trim() && !gyms.some((g) => g.isHome) && <div style={{ padding: 14, color: "#514C44", fontSize: 13, textAlign: "center" }}>검색해서 암장을 골라주세요</div>}
                  </div>
                </>
              )}
              {recordGymId && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#514C44", margin: "4px 4px 8px" }}>언제 갔어요? (미래 날짜면 일정이 돼요)</div>
                  <input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} style={{ width: "100%", height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none", marginBottom: 14, flexShrink: 0 }} />
                </>
              )}
              <button onClick={addPersonalVisit} disabled={!recordGymId} style={{ width: "100%", height: 52, marginTop: 4, flexShrink: 0, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.green, 0), opacity: recordGymId ? 1 : 0.5 }}>기록 추가</button>
            </div>
          </>
        )}
        {crewEditOpen && (
          <>
            <div onClick={() => setCrewEditOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)", maxHeight: "85%", overflowY: "auto" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 14px" }}>크루 정보 수정</div>
              {([["크루 이름", "name"], ["한 줄 소개", "bio"], ["주 활동 지역", "region"], ["오픈카톡 링크", "kakao"]] as const).map(([label, key]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#514C44", marginBottom: 6 }}>{label}</div>
                  <input value={(crewEdit as Any)[key]} onChange={(e) => setCrewEdit((f) => ({ ...f, [key]: e.target.value }))} style={{ width: "100%", height: 48, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none" }} />
                </div>
              ))}
              <button onClick={saveCrewEdit} style={{ width: "100%", height: 52, marginTop: 4, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>저장</button>
            </div>
          </>
        )}
        {leaveSheetOpen && (
          <>
            <div onClick={() => setLeaveSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 4px" }}>{myRole === "LEADER" && members.length <= 1 ? "크루 삭제" : "크루 탈퇴"}</div>
              <div style={{ fontSize: 13, color: "#514C44", margin: "0 4px 16px", lineHeight: 1.5 }}>
                {myRole === "LEADER" && members.length <= 1
                  ? `'${ac?.name ?? ""}' 크루와 투표·일정 기록이 모두 지워져요. 되돌릴 수 없어요.`
                  : myRole === "LEADER"
                    ? "크루장은 다른 멤버가 있는 동안 탈퇴할 수 없어요. (위임 기능 준비 중)"
                    : `'${ac?.name ?? ""}' 크루에서 나가요. 다시 들어오려면 초대 코드가 필요해요.`}
              </div>
              {!(myRole === "LEADER" && members.length > 1) && <button onClick={leaveCrew} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>{myRole === "LEADER" && members.length <= 1 ? "삭제하고 나가기" : "탈퇴하기"}</button>}
              <button onClick={() => setLeaveSheetOpen(false)} style={{ width: "100%", height: 46, marginTop: 8, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>{myRole === "LEADER" && members.length > 1 ? "확인" : "취소"}</button>
            </div>
          </>
        )}
        {shareSheetOpen && (
          <>
            <div onClick={() => setShareSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 4px" }}><svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#6BBF59" /><path d="M5.5 10.2 8.5 13 14.5 6.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg><div style={{ fontSize: 17, fontWeight: 800 }}>투표를 만들었어요</div></div>
              <div style={{ fontSize: 13, color: "#514C44", margin: "0 4px 16px", lineHeight: 1.5 }}>크루원들에게 공유해서 투표를 받아보세요.</div>
              <button onClick={doShare} style={{ width: "100%", height: 52, border: `2px solid ${INK}`, borderRadius: WOBS[0], background: "#FEE500", color: "#191600", fontSize: 17, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transform: "rotate(-0.3deg)" }}><svg width="20" height="20" viewBox="0 0 20 20" fill="#191600"><path d="M10 3C5.6 3 2 5.8 2 9.3c0 2.2 1.5 4.2 3.8 5.3-.2.6-.7 2.4-.8 2.8 0 .2.1.3.3.2.2-.1 2.5-1.7 3.5-2.4.4 0 .8.1 1.2.1 4.4 0 8-2.8 8-6.3S14.4 3 10 3z" /></svg>카카오톡으로 공유</button>
              <button onClick={copyPollLink} style={{ width: "100%", height: 46, marginTop: 8, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>링크 복사</button>
              <button onClick={() => setShareSheetOpen(false)} style={{ width: "100%", height: 44, marginTop: 4, border: "none", background: "transparent", color: "#514C44", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>나중에</button>
            </div>
          </>
        )}
        {reviewSheetOpen && (
          <>
            <div onClick={() => setReviewSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 2px" }}>리뷰 쓰기</div>
              <div style={{ fontSize: 12, color: "#514C44", margin: "0 4px 14px" }}>{sg?.name ?? ""} · 이번 셋 기준</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5].map((n) => (<div key={n} onClick={() => setReviewRating(n)} style={{ fontSize: 34, cursor: "pointer", color: n <= reviewRating ? "#E0921A" : "#C9C2B2", lineHeight: 1 }}>★</div>))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {REVIEW_TAGS.map((t, ti) => { const on = reviewTags.includes(t); return (<div key={t} onClick={() => toggleReviewTag(t)} style={{ padding: "5px 12px", borderRadius: WOBS[ti % 4], fontSize: 15, fontWeight: 700, cursor: "pointer", border: on ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: on ? HILITE : "#FFFEFA", color: on ? INK : "#514C44", transform: ti % 2 ? "rotate(0.6deg)" : "rotate(-0.6deg)" }}>{t}</div>); })}
              </div>
              <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="이번 셋 어땠어요? (예: 파랑 볼륨 꿀잼, 주말 저녁 붐빔)" style={{ width: "100%", height: 90, border: "2px solid #3A3633", borderRadius: 10, padding: "12px 14px", fontSize: 14, background: "#FFFDF6", outline: "none", resize: "none", lineHeight: 1.5, marginBottom: 14 }} />
              <button onClick={submitReview} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>등록</button>
            </div>
          </>
        )}
        {homeEditOpen && (
          <>
            <div onClick={() => setHomeEditOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 24px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)", display: "flex", flexDirection: "column", maxHeight: "82%" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 12px", transform: "rotate(-1deg)" }} />
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 4px 12px" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>홈 암장 편집</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: manageHomeIds.length >= 4 ? "#B4432E" : "#514C44" }}>{manageHomeIds.length}/4</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", flexShrink: 0, background: "#fff", border: `2px solid ${INK}`, borderRadius: WOBS[2] }}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#514C44" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#514C44" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <input value={manageQ} onChange={(e) => setManageQ(e.target.value)} placeholder="암장 검색" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15, minWidth: 0 }} />
                {manageQ && <div onClick={() => setManageQ("")} style={{ cursor: "pointer", padding: 4 }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#514C44" strokeWidth="2" strokeLinecap="round" /></svg></div>}
              </div>
              <div style={{ flex: 1, overflowY: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 120 }}>
                {(manageQ.trim() ? gyms.filter((g) => (g.name + " " + g.loc).toLowerCase().includes(manageQ.trim().toLowerCase())) : gyms.filter((g) => manageHomeIds.includes(g.id))).slice(0, 40).map((g) => { const sel = manageHomeIds.includes(g.id); return (
                  <div key={g.id} onClick={() => toggleManageHome(g.id)} style={{ ...rowStyle(sel), flexShrink: 0 }}>
                    <div style={boxStyle(sel)}>{sel ? "✓" : ""}</div>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{g.loc}</div></div>
                  </div>
                ); })}
                {!manageQ.trim() && manageHomeIds.length === 0 && <div style={{ padding: 14, color: "#514C44", fontSize: 14, textAlign: "center" }}>검색해서 홈 암장을 골라보세요</div>}
              </div>
              <button onClick={saveHomeGyms} style={{ width: "100%", height: 50, marginTop: 12, flexShrink: 0, fontSize: 17, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>저장</button>
            </div>
          </>
        )}
        {visitEdit && (
          <>
            <div onClick={() => setVisitEdit(null)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 24px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)", display: "flex", flexDirection: "column", maxHeight: "84%" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 12px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 18, fontWeight: 800, margin: "0 4px 12px" }}>일정 변경</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#514C44", marginBottom: 6 }}>날짜</div>
              <input type="date" value={visitEditDate} onChange={(e) => setVisitEditDate(e.target.value)} style={{ height: 46, border: `2px solid ${INK}`, borderRadius: WOBS[2], padding: "0 12px", fontSize: 15, background: "#fff", outline: "none", flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#514C44", margin: "14px 0 6px" }}>암장</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", flexShrink: 0, background: "#fff", border: `2px solid ${INK}`, borderRadius: WOBS[2] }}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#514C44" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#514C44" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <input value={visitEditGymQ} onChange={(e) => setVisitEditGymQ(e.target.value)} placeholder="암장 검색 (안 바꾸면 그대로)" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15, minWidth: 0 }} />
                {visitEditGymQ && <div onClick={() => setVisitEditGymQ("")} style={{ cursor: "pointer", padding: 4 }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#514C44" strokeWidth="2" strokeLinecap="round" /></svg></div>}
              </div>
              <div style={{ flex: 1, overflowY: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 100 }}>
                {(visitEditGymQ.trim() ? allGymsList.filter((g: Any) => (g.name + " " + (g.address || "")).toLowerCase().includes(visitEditGymQ.trim().toLowerCase())) : allGymsList.filter((g: Any) => g.id === visitEditGymId)).slice(0, 30).map((g: Any) => { const sel = g.id === visitEditGymId; return (
                  <div key={g.id} onClick={() => setVisitEditGymId(g.id)} style={{ ...rowStyle(sel), flexShrink: 0 }}>
                    <div style={boxStyle(sel)}>{sel ? "✓" : ""}</div>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#514C44", marginTop: 2 }}>{g.address || ""}</div></div>
                  </div>
                ); })}
              </div>
              <button onClick={saveVisitEdit} style={{ width: "100%", height: 50, marginTop: 12, flexShrink: 0, fontSize: 17, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>변경 저장</button>
            </div>
          </>
        )}
        {detailVisit && (() => {
          const v = detailVisit;
          const future = new Date(v.date).getTime() >= _todayMid0.getTime();
          const canEdit = !!me && (v.createdById === me.id || ac?.leaderId === me.id);
          const atts: Any[] = v.attendees ?? [];
          return (
            <>
              <div onClick={() => setDetailVisitId(null)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 24px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)", display: "flex", flexDirection: "column", maxHeight: "84%" }}>
                <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 12px", transform: "rotate(-1deg)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 2px 4px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: future ? "#FBF0DA" : "#E4F5EC", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="#E24D3A" strokeWidth="1.8" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="#E24D3A" strokeWidth="1.8" strokeLinecap="round" /></svg></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 19, fontWeight: 800 }}>{v.gym?.name}</div><div style={{ fontSize: 13, color: "#514C44", marginTop: 1 }}>{fmtDate(v.date)} · {v.personal ? "내 기록" : v.source === "VOTE" ? "투표로 확정" : "직접 추가"}</div></div>
                  {v.personal && <span style={{ fontSize: 11, fontWeight: 800, color: "#514C44", background: "#F3EEDF", border: "1.5px solid rgba(58,54,51,0.4)", borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}>개인</span>}
                  {!v.personal && v.crewName && personal && <span style={{ fontSize: 11, fontWeight: 800, color: "#2456B0", background: "#E6EEFB", border: "1.5px solid #2456B0", borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}>{v.crewName}</span>}
                  {!v.personal && v.mine && !personal && <span style={{ fontSize: 11, fontWeight: 800, color: "#2E6B22", background: "#CDEBD4", border: "1.5px solid #2E6B22", borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}>내가 가요</span>}
                </div>
                {v.personal ? (
                  <div style={{ margin: "16px 2px 0", padding: 14, ...cardStyle, fontSize: 13, color: "#514C44", lineHeight: 1.5 }}>크루와 무관한 내 기록이에요. 캘린더에서 언제든 지울 수 있어요.</div>
                ) : (<>
                <div style={{ ...sectionLabel, margin: "16px 2px 10px" }}>가는 사람 {atts.length}명</div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                  {atts.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#514C44", fontSize: 13 }}>아직 아무도 없어요. 먼저 참여해보세요!</div>}
                  {atts.map((a) => (
                    <div key={a.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", ...cardStyle, ...(a.userId === me?.id ? { border: "2px solid #2E6B22", background: "#EAF7EE" } : {}) }}>
                      {a.user?.profileImg ? <img src={a.user.profileImg} alt="" style={{ width: 30, height: 30, borderRadius: "50% 46% 52% 48% / 48% 52% 46% 50%", objectFit: "cover", border: `1.5px solid ${INK}` }} /> : <div style={{ width: 30, height: 30, borderRadius: "50% 46% 52% 48% / 48% 52% 46% 50%", background: hatch(CRAYON.red), border: `1.5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>{(a.user?.nickname || "?")[0]}</div>}
                      <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{a.user?.nickname}{a.userId === me?.id ? " (나)" : ""}</div>
                    </div>
                  ))}
                </div>
                {future && !personal && (
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexShrink: 0 }}>
                    <button onClick={() => attendVisit(v, !v.mine)} style={{ flex: 1, height: 48, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: v.mine ? "#FFFEFA" : HILITE, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>{v.mine ? "안 갈래요" : "나도 갈래요"}</button>
                    {canEdit && <button onClick={() => { openVisitEdit(v); setDetailVisitId(null); }} style={{ height: 48, padding: "0 16px", border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>변경</button>}
                    {canEdit && <button onClick={() => { if (typeof window !== "undefined" && window.confirm("이 일정을 취소할까요?")) { cancelVisit(v); setDetailVisitId(null); } }} style={{ height: 48, padding: "0 16px", border: "2px solid #C23A24", borderRadius: WOBS[2], background: "#FFFEFA", color: "#C23A24", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>취소</button>}
                  </div>
                )}
                </>)}
                {v.personal && (
                  <button onClick={() => { if (typeof window !== "undefined" && window.confirm("이 기록을 삭제할까요? 되돌릴 수 없어요.")) { deletePersonalVisit(v.id); setDetailVisitId(null); } }} style={{ marginTop: 14, height: 48, flexShrink: 0, border: "2px solid #C23A24", borderRadius: WOBS[2], background: "#FFFEFA", color: "#C23A24", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>기록 삭제</button>
                )}
              </div>
            </>
          );
        })()}
        {!!toast && (<div style={{ position: "absolute", left: "50%", bottom: 110, transform: "translateX(-50%) rotate(-0.6deg)", background: hatch("58,54,51"), color: "#FFFDF6", fontSize: 16, fontWeight: 700, padding: "10px 20px", border: `2px solid ${INK}`, borderRadius: WOBS[1], boxShadow: "0 8px 24px rgba(58,54,51,0.25)", maxWidth: "calc(100% - 32px)", width: "max-content", textAlign: "center", lineHeight: 1.4, animation: "cctoast .25s ease", zIndex: 100 }}>{toast}</div>)}
      </div>
    </div>
  );
}
