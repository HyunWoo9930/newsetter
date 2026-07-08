"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { api } from "@/lib/apiClient";
import GymMap from "./GymMap";

/* ===== 상수/헬퍼 ===== */
/* 크레파스 테마 토큰: 종이 위에 연필 테두리 + 크레파스 빗금 채움 */
const INK = "#3A3633"; // 연필 흑연 (순검정 금지)
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

const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
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
const sectionLabel: CSSProperties = { fontSize: 16, fontWeight: 700, color: "#6E675C" };
const H1: CSSProperties = { fontSize: 30, fontWeight: 700, letterSpacing: "0" };

const BackBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} style={{ width: 44, height: 44, marginLeft: -6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="뒤로"><svg width="13" height="21" viewBox="0 0 12 20" fill="none"><path d="M10 2 2 10l8 8" stroke="#3A3633" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
);
const ChevR = () => (<svg width="8" height="14" viewBox="0 0 8 14" style={{ flexShrink: 0 }}><path d="M1 1l6 6-6 6" stroke="#CFCCC2" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const PlayDot = () => (<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 2l7 4-7 4z" fill="#78756B" /></svg>);

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export default function ClimbCrewApp() {
  // 네비게이션 / 입력 상태
  const [screen, setScreen] = useState("login");
  const [hist, setHist] = useState<string[]>([]);
  const [selGym, setSelGym] = useState<string | null>(null);
  const [selSettingId, setSelSettingId] = useState<string | null>(null);
  const [selProb, setSelProb] = useState<string | null>(null);
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
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);
  const [allGymsList, setAllGymsList] = useState<Any[]>([]);
  const [crewHomeGymIds, setCrewHomeGymIds] = useState<string[]>([]);
  const [manageHomeIds, setManageHomeIds] = useState<string[]>([]);
  const [manageQ, setManageQ] = useState("");
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [pollCalOffset, setPollCalOffset] = useState(0);
  const [gymSearch, setGymSearch] = useState("");
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [sharePoll, setSharePoll] = useState<Any>(null);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState("");

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((m: string) => { setToast(m); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 1900); }, []);

  // 네비게이션
  const go = (sc: string) => { setHist((h) => [...h, screen]); setScreen(sc); };
  const tab = (sc: string) => { setHist([]); setScreen(sc); };
  const back = () => { setHist((h) => { const n = [...h]; const p = n.pop() || "home"; setScreen(p); return n; }); };
  const openGym = (id: string) => { setHist((h) => [...h, screen]); setSelGym(id); setScreen("gymDetail"); };
  const openProblems = (gymId: string, settingId: string | null) => { setHist((h) => [...h, screen]); setSelGym(gymId); setSelSettingId(settingId); setScreen("probList"); };
  const openProb = (id: string) => { setHist((h) => [...h, screen]); setSelProb(id); setScreen("probDetail"); };

  /* ===== 데이터 로딩 ===== */
  useEffect(() => {
    api.me().then(setMe).catch(() => {});
    api.crews().then((cs: Any) => { setCrews(cs); if (cs[0]) setActiveCrewId(cs[0].id); }).catch(() => {}).finally(() => setBootstrapped(true));
    api.gymsList().then(setAllGymsList).catch(() => {});
    const inv = new URLSearchParams(window.location.search).get("invite");
    if (inv) { setJoinCode(inv); setInvitePending(true); }
  }, []);

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

  // 카카오 세션이 확인되면 로그인 화면을 건너뜀
  useEffect(() => {
    if (status === "authenticated" && bootstrapped && screen === "login") { setHist([]); setScreen(invitePending || !crews.length ? "start" : "home"); }
  }, [status, bootstrapped, screen, crews.length, invitePending]);

  const reloadCrew = useCallback((id: string) => {
    api.crewGyms(id).then((rows: Any) => { setCrewGyms(rows); const first = rows.find((r: Any) => r.latestSetting); if (first) setSelSettingId((s) => s ?? first.latestSetting.id); }).catch(() => {});
    api.crewPolls(id).then(setPolls).catch(() => {});
    api.crewVisits(id).then(setVisits).catch(() => {});
    api.crew(id).then(setCrewDetail).catch(() => {});
    api.requests(id).then(setRequests).catch(() => setRequests([]));
  }, []);
  useEffect(() => { if (activeCrewId) reloadCrew(activeCrewId); }, [activeCrewId, reloadCrew]);

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

  // 투표 선택 초기화
  const openPoll = polls.find((p) => p.status === "OPEN");
  useEffect(() => {
    if (screen !== "vote" || !openPoll) return;
    api.poll(openPoll.id).then((p: Any) => {
      setPolls((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
      const d: Record<string, boolean> = {}; p.myVotes.dateOptionIds.forEach((id: string) => (d[id] = true));
      const gy: Record<string, boolean> = {}; p.myVotes.gymOptionIds.forEach((id: string) => (gy[id] = true));
      setVoteDates(d); setVoteGyms(gy); setVoteSubmitted(p.myVotes.dateOptionIds.length + p.myVotes.gymOptionIds.length > 0);
      setVoteTab("date"); setFocusDay(null);
    }).catch(() => {});
  }, [screen, openPoll?.id]);

  /* ===== 액션 ===== */
  const createCrew = async () => { if (!form.name.trim()) { showToast("크루 이름을 입력해주세요"); return; } try { const c: Any = await api.post("/api/crews", { name: form.name, description: form.bio, region: form.region, openChatUrl: form.kakao, homeGymIds: crewHomeGymIds }); const cs: Any = await api.crews(); setCrews(cs); setActiveCrewId(c.id); setCrewHomeGymIds([]); go("invite"); } catch (e: Any) { showToast(e.message); } };
  const joinByCode = async () => { if (!joinCode.trim()) { showToast("초대 코드를 입력해주세요"); return; } try { const r: Any = await api.post("/api/crews/join", { inviteCode: joinCode }); const cs: Any = await api.crews(); setCrews(cs); setActiveCrewId(r.crewId); tab("home"); showToast("크루에 참여했어요"); } catch (e: Any) { showToast(e.message); } };
  const handleReq = async (userId: string, name: string, ok: boolean) => { try { await api.patch(`/api/crews/${activeCrewId}/requests/${userId}`, { action: ok ? "approve" : "reject" }); showToast(ok ? `${name}님을 승인했어요` : `${name}님 신청을 거절했어요`); if (activeCrewId) reloadCrew(activeCrewId); } catch (e: Any) { showToast(e.message); } };
  const switchCrew = (id: string) => { const c = crews.find((x) => x.id === id); setActiveCrewId(id); setSwitcherOpen(false); tab("home"); showToast(`${c?.name ?? ""}(으)로 전환했어요`); };
  const submitVote = async () => { if (!openPoll) return; const dIds = Object.keys(voteDates).filter((k) => voteDates[k]); const gIds = Object.keys(voteGyms).filter((k) => voteGyms[k]); if (dIds.length + gIds.length === 0) { showToast("하나 이상 선택해주세요"); return; } try { await api.post(`/api/polls/${openPoll.id}/responses`, { dateOptionIds: dIds, gymOptionIds: gIds }); setVoteSubmitted(true); showToast("응답을 제출했어요"); if (activeCrewId) api.crewPolls(activeCrewId).then(setPolls); api.poll(openPoll.id).then((p: Any) => setPolls((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)))); } catch (e: Any) { showToast(e.message); } };
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
  const recordVisit = async () => { if (!activeCrewId || !selGym) return; try { await api.post(`/api/crews/${activeCrewId}/visits`, { gymId: selGym, date: new Date().toISOString() }); showToast("방문 기록을 추가했어요"); api.crewVisits(activeCrewId).then(setVisits); if (selGym) api.gym(selGym, activeCrewId).then(setGymDetail); } catch (e: Any) { showToast(e.message); } };

  const openCreatePoll = () => { setPollTitle(""); setPollRange({ start: null, end: null }); setPollDeadlineDays(5); setPollGymIds([]); setPickedDay(null); setPollCalOffset(0); setGymSearch(""); go("createPoll"); };
  // 범위 선택: 첫 탭=시작, 둘째 탭=끝(시작보다 빠르면 시작을 다시 잡음). 이미 범위가 있으면 새로 시작.
  const tapRangeDay = (ds: string) => setPollRange((r) => {
    if (!r.start || r.end) return { start: ds, end: null };
    if (ds < r.start) return { start: ds, end: null };
    return { start: r.start, end: ds };
  });
  const toggleHomeGym = (id: string) => {
    if (!crewHomeGymIds.includes(id) && crewHomeGymIds.length >= 4) showToast("홈 암장은 최대 4곳이에요");
    setCrewHomeGymIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : h.length >= 4 ? h : [...h, id]));
  };
  const openCrewManage = () => { setManageHomeIds(crewGyms.filter((g) => g.isHome).map((g) => g.id)); setManageQ(""); if (activeCrewId) reloadCrew(activeCrewId); go("crewManage"); };
  const toggleManageHome = (id: string) => {
    if (!manageHomeIds.includes(id) && manageHomeIds.length >= 4) showToast("홈 암장은 최대 4곳이에요");
    setManageHomeIds((h) => (h.includes(id) ? h.filter((x) => x !== id) : h.length >= 4 ? h : [...h, id]));
  };
  const saveHomeGyms = async () => {
    if (!activeCrewId) return;
    try { await api.put(`/api/crews/${activeCrewId}/home-gyms`, { gymIds: manageHomeIds }); api.crewGyms(activeCrewId).then(setCrewGyms); showToast("홈 암장을 저장했어요"); back(); } catch (e: Any) { showToast(e.message); }
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
  const doShare = async () => {
    const title = sharePoll?.title || "우리 크루 투표";
    const text = `우리 크루 다음 세션 투표: ${title} — 참여해줘!`;
    const url = window.location.origin;
    const w = window as Any;
    if (w.Kakao?.isInitialized?.() && w.Kakao.Share) {
      try { w.Kakao.Share.sendDefault({ objectType: "feed", content: { title, description: text, imageUrl: url + "/brand/climbcrew-icon-512.png", link: { mobileWebUrl: url, webUrl: url } }, buttons: [{ title: "투표 참여하기", link: { mobileWebUrl: url, webUrl: url } }] }); return; } catch { /* fall through */ }
    }
    if ((navigator as Any).share) { try { await (navigator as Any).share({ title, text, url }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(`${text} ${url}`); showToast("링크를 복사했어요"); } catch { showToast("공유를 지원하지 않는 브라우저예요"); }
  };
  const copyPollLink = async () => { try { await navigator.clipboard.writeText(window.location.origin); showToast("링크를 복사했어요"); } catch { showToast("복사에 실패했어요"); } };
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

  const gyms = crewGyms.map((r, i) => ({ id: r.id, name: r.name, loc: r.address || "", lat: r.lat ?? null, lng: r.lng ?? null, rating: r.rating ?? 0, reviews: r.reviewCount ?? 0, weeks: r.weeksSinceVisit, ever: !!r.everVisited, due: !!r.dueForReset, cycle: r.resetCycleWeeks ?? 4, hasSet: !!r.latestSetting, isHome: !!r.isHome, color: PALETTE[i % PALETTE.length], settingId: r.latestSetting?.id ?? null, instagram: r.instagram, lastVisit: r.lastVisit ?? null }));
  // 프랜차이즈 판별: 1차로 첫 토큰 브랜드 집계 → 2개 이상인 브랜드를 "체인 stem" 으로,
  // 띄어쓰기 없이 붙은 지점명("더클라임강남")도 그 stem 으로 흡수해서 같은 체인으로 묶음.
  const brand = useMemo(() => {
    const raw = new Map<string, number>();
    for (const r of crewGyms) { const b = brandOf(r.name); raw.set(b, (raw.get(b) ?? 0) + 1); }
    const stems = [...raw.entries()].filter(([, n]) => n >= 2).map(([b]) => b.replace(/\s/g, "")).filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);
    const of = (name: string) => { const r = (name || "").replace(/\s/g, ""); for (const s of stems) if (r.startsWith(s)) return s; for (const s of stems) if (s.length >= 3 && r.includes(s)) return s; return brandOf(name); };
    const counts = new Map<string, number>();
    for (const r of crewGyms) { const b = of(r.name); counts.set(b, (counts.get(b) ?? 0) + 1); }
    return { of, counts };
  }, [crewGyms]);
  const brandColorOf = (name: string) => { const b = brand.of(name); return PIN_RGB[[...b].reduce((a, c) => a + c.charCodeAt(0), 0) % PIN_RGB.length]; };
  const visitLabel = (g: Any) => (!g.ever ? "아직 안 가봄" : g.due ? `간 지 ${g.weeks}주 · 또 갈 때` : g.weeks === 0 ? "이번 주 방문" : `${g.weeks}주 전 방문`);
  // 투표 암장 후보: 홈 암장 먼저(오래 안 간 곳 최우선), 나머지는 검색으로 추가
  const homeGymCandidates = gyms.filter((g) => g.isHome).sort((a, b) => { if (a.due !== b.due) return a.due ? -1 : 1; const aw = a.weeks == null ? Infinity : a.weeks; const bw = b.weeks == null ? Infinity : b.weeks; return bw - aw; });
  const otherGyms = gyms.filter((g) => !g.isHome);
  const exploreGyms = exploreQ.trim() ? gyms.filter((g) => (g.name + " " + g.loc).toLowerCase().includes(exploreQ.trim().toLowerCase())) : gyms;
  // 지도 마커용(안정된 identity — crewGyms/검색어 바뀔 때만 재생성해서 188개 재구성 방지)
  const mapGyms = useMemo(() => {
    const q = exploreQ.trim().toLowerCase();
    return crewGyms
      .filter((r: Any) => r.lat != null && r.lng != null && (!q || (r.name + " " + (r.address || "")).toLowerCase().includes(q)))
      .map((r: Any) => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, due: !!r.dueForReset, color: brandColorOf(r.name) }));
  }, [crewGyms, exploreQ]); // eslint-disable-line react-hooks/exhaustive-deps
  const mapSelGym = mapSel ? gyms.find((g) => g.id === mapSel) : null;
  const mapSelBrand = mapSelGym ? brandOf(mapSelGym.name) : "";
  const mapSelBranches = mapSelGym ? brand.counts.get(brand.of(mapSelGym.name)) ?? 1 : 0;
  const selectedOtherGyms = otherGyms.filter((g) => pollGymIds.includes(g.id));
  const searchedGyms = gymSearch.trim() ? otherGyms.filter((g) => !pollGymIds.includes(g.id) && g.name.includes(gymSearch.trim())) : [];
  const gymById = (id: string | null) => gyms.find((g) => g.id === id) || null;
  const toGo = gyms.filter((g) => g.isHome && g.due).sort((a, b) => { const aw = a.weeks == null ? Infinity : a.weeks; const bw = b.weeks == null ? Infinity : b.weeks; return bw - aw; });

  const openVote = openPoll ? { id: openPoll.id, title: openPoll.title, deadline: fmtDeadline(openPoll.deadline), responded: openPoll.responderCount ?? 0, total: memberCount } : null;
  const respondedCount = (openVote?.responded ?? 0);
  const confirmedPoll = polls.find((p) => p.confirmedDate);
  const canClose = !!(me && openPoll && (openPoll.creatorId === me.id || ac?.leaderId === me.id));
  const upcoming = confirmedPoll ? { date: fmtDate(confirmedPoll.confirmedDate), gym: confirmedPoll.confirmedGymName || "", going: confirmedPoll.responderCount ?? 0 } : null;

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
  const visitedDays = new Set(visits.filter((v) => { const d = new Date(v.date); return d.getFullYear() === calY && d.getMonth() === calM; }).map((v) => new Date(v.date).getDate()));
  const calBase: CSSProperties = { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 999, margin: "0 auto", color: "#3A3633" };
  const calCells: { key: string; day: number | string; style: CSSProperties }[] = [];
  for (let i = 0; i < firstDow; i++) calCells.push({ key: "b" + i, day: "", style: calBase });
  for (let d = 1; d <= daysInMonth; d++) { let v: CSSProperties = {}; if (visitedDays.has(d)) v = { background: hatch(CRAYON.green), color: "#fff", fontWeight: 700, border: `2px solid ${INK}`, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", transform: "rotate(-3deg)" }; else if (isCurMonth && d === now.getDate()) v = { border: "2.5px solid #E24D3A", borderRadius: "52% 48% 46% 54% / 50% 46% 54% 50%", color: "#B4432E", fontWeight: 700, transform: "rotate(2deg)" }; calCells.push({ key: "d" + d, day: d, style: { ...calBase, ...v } }); }
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const futureVisits = visits.filter((v) => new Date(v.date).getTime() >= todayMid).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const pastVisits = visits.filter((v) => new Date(v.date).getTime() < todayMid).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const visitRow = (v: Any, future: boolean) => (
    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, ...cardStyle }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: future ? "#FBF0DA" : "#E4F5EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {future ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="#E24D3A" strokeWidth="1.8" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="#E24D3A" strokeWidth="1.8" strokeLinecap="round" /></svg>
                : <svg width="20" height="20" viewBox="0 0 20 20"><path d="M4 10.5 8 14.5 16 5.5" stroke="#6BBF59" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{v.gym.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{fmtDate(v.date)} · {v.source === "VOTE" ? "투표 확정" : "방문 기록"}</div></div>
    </div>
  );

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
  const rolePal: Record<string, CSSProperties> = { 크루장: { background: "#FBF0DA", color: "#B4432E" }, 멤버: { background: "#F3EEDF", color: "#78756B" } };

  // 선택 = 노랑 형광펜 칠 + 연필 테두리 / 미선택 = 점선 연필
  const rowStyle = (sel: boolean): CSSProperties => ({ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: WOBS[1], cursor: "pointer", border: sel ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.35)", background: sel ? HILITE : "#FFFEFA" });
  const boxStyle = (sel: boolean): CSSProperties => ({ width: 24, height: 24, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", border: `2px solid ${INK}`, background: sel ? hatch(CRAYON.red) : "#FFFEFA" });
  const segStyle = (active: boolean): CSSProperties => ({ flex: 1, textAlign: "center", padding: "9px 0", fontSize: 16, fontWeight: 700, borderRadius: 14, cursor: "pointer", border: active ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: active ? HILITE : "transparent", color: active ? INK : "#8A8477" });

  const recColors: [string, string][] = [["흰", "#EFEFE8"], ["노랑", "#F5C518"], ["주황", "#F07E1E"], ["초록", "#3AAE5A"], ["파랑", "#2F72E0"], ["빨강", "#E23B3B"], ["검정", "#2A2A2A"]];

  // 투표 옵션 어댑터
  const votePoll = openPoll;
  const votersOf = (o: Any) => (o.votes ?? []).map((v: Any) => ({ id: v.user?.id, name: v.user?.nickname || "?", img: v.user?.profileImg || null }));
  const gymOpts = (votePoll?.gymOptions ?? []).map((o: Any) => { const g = gyms.find((x) => x.id === o.gymId); return { id: o.id, name: o.gym?.name || "", meta: g ? visitLabel(g) : "", count: o._count?.votes ?? o.votes?.length ?? 0, voters: votersOf(o) }; }).sort((a: Any, b: Any) => b.count - a.count);
  const hasGymOpts = gymOpts.length > 0;

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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", fontSize: 11, color: "#78756B", marginBottom: 6 }}>{WD.map((d) => <div key={d}>{d}</div>)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
              {Array.from({ length: fd }).map((_, i) => <div key={"b" + i} />)}
              {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
                const k = ymd(y, m, d);
                const opt = respOptByDay.get(k);
                if (!opt) return <div key={d} style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#CDC6B5" }}>{d}</div>;
                const mine = !!voteDates[opt.id];
                const heat = opt.count / respMaxCount;
                // 겹침 = 크레파스 빗금(빽빽할수록 많이 겹침) / 내 선택 = 손으로 친 동그라미 — 채널 분리라 둘 다 동시에 보임
                const bg = opt.count > 0
                  ? `repeating-linear-gradient(52deg, rgba(${CRAYON.orange},${0.35 + heat * 0.5}) 0 2.5px, rgba(${CRAYON.orange},${0.1 + heat * 0.25}) 2.5px 5px, transparent 5px ${7.5 - heat * 1.5}px)`
                  : "#FFFEFA";
                return (
                  <div key={d} onClick={() => { setVoteDates((v) => ({ ...v, [opt.id]: !v[opt.id] })); setFocusDay(k); }} style={{ position: "relative", height: 48, borderRadius: 10, cursor: "pointer", background: bg, border: "2px dashed rgba(58,54,51,0.28)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#3A3633", lineHeight: 1 }}>{d}</div>
                    {opt.count > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: "#A8452C", marginTop: 1, lineHeight: 1 }}>{opt.count}명</div>}
                    {mine && <svg viewBox="0 0 40 44" style={{ position: "absolute", inset: -4, width: "calc(100% + 8px)", height: "calc(100% + 8px)", pointerEvents: "none" }}><path d="M20 3.5 C32 1.5 38.5 11 37.5 22 C36.5 34 28 41.5 17.5 40.5 C7.5 39.5 2 30 3.5 19.5 C5 10 11 4.5 23 3.8" fill="none" stroke="#3A3633" strokeWidth="2.6" strokeLinecap="round" /></svg>}
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

  const tc = (n: string) => (screen === n ? "#E24D3A" : "#78756B");
  const showTabBar = ["home", "explore", "calendar", "profile", "vote", "recommend"].includes(screen);
  const is = (n: string) => screen === n;

  // 하단 액션바 — 절대위치 대신 플렉스 흐름으로(콘텐츠 아래 고정, 어떤 화면 높이에서도 안 겹침)
  let bottomBar: ReactNode = null;
  if (is("createPoll")) bottomBar = <button onClick={createPoll} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>투표 만들기</button>;
  else if (is("crewManage")) bottomBar = <button onClick={saveHomeGyms} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>홈 암장 저장</button>;
  else if (is("record")) bottomBar = <button onClick={saveRecord} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>완등 기록 저장</button>;
  else if (is("probDetail") && pd) bottomBar = <button onClick={() => tab("record")} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>내 기록 남기기</button>;
  else if (is("gymDetail") && sg) bottomBar = (<div style={{ display: "flex", gap: 10 }}><button onClick={recordVisit} style={{ flex: 1, height: 50, border: `2px solid ${INK}`, borderRadius: WOBS[1], background: "#FFFEFA", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>방문 기록</button><button onClick={openReviewSheet} style={{ flex: 1.5, height: 50, fontSize: 17, fontWeight: 700, ...crayonBtn(CRAYON.red, 2) }}>리뷰 쓰기</button></div>);
  else if (is("vote") && openVote) bottomBar = voteSubmitted ? (<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "#3E7D2E" }}><svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#6BBF59" /><path d="M5.5 10.2 8.5 13 14.5 6.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>응답을 제출했어요</div><button onClick={() => setVoteSubmitted(false)} style={{ height: 42, padding: "0 16px", border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>수정하기</button></div>) : (<button onClick={submitVote} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>응답 제출</button>);

  const loginGo = () => { if (invitePending) { go("start"); return; } if (crews.length) tab("home"); else go("start"); };

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}>

          {is("login") && (
            <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px", animation: "ccfade .3s ease" }}>
              <div style={{ width: 80, height: 80, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", background: hatch(CRAYON.red), border: `2.5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-4deg)" }}><svg width="42" height="42" viewBox="0 0 40 40" fill="none"><path d="M9 30 18 12l5 9 4-6 4 15" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="28.5" cy="10.5" r="3" fill="#fff" /></svg></div>
              <div style={{ fontSize: 34, fontWeight: 700, marginTop: 20 }}>뉴세터</div>
              <div style={{ position: "relative", fontSize: 17, color: "#6E675C", marginTop: 4, fontWeight: 700 }}>우리 크루의 클라이밍, 한곳에서<svg viewBox="0 0 120 8" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: -7, width: "100%", height: 8 }}><path d="M2 5 C20 2 35 7 55 4 S95 6 118 3" fill="none" stroke={`rgba(${CRAYON.orange},0.85)`} strokeWidth="3" strokeLinecap="round" /></svg></div>
              <div style={{ height: 56 }} />
              <button onClick={kakaoEnabled ? () => signIn("kakao") : loginGo} style={{ width: "100%", height: 52, border: `2px solid ${INK}`, borderRadius: WOBS[0], background: "#FEE500", color: "#191600", fontSize: 17, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transform: "rotate(-0.4deg)" }}><svg width="20" height="20" viewBox="0 0 20 20" fill="#191600"><path d="M10 3C5.6 3 2 5.8 2 9.3c0 2.2 1.5 4.2 3.8 5.3-.2.6-.7 2.4-.8 2.8 0 .2.1.3.3.2.2-.1 2.5-1.7 3.5-2.4.4 0 .8.1 1.2.1 4.4 0 8-2.8 8-6.3S14.4 3 10 3z" /></svg>카카오로 시작하기</button>
              <div style={{ fontSize: 12, color: "#78756B", marginTop: 16, textAlign: "center" }}>{kakaoEnabled ? "가입하면 이용약관 및 개인정보처리방침에 동의하게 됩니다." : "개발 모드 · devuser 로 로그인됩니다"}</div>
              {kakaoEnabled && <div onClick={loginGo} style={{ fontSize: 12, color: "#78756B", marginTop: 10, textAlign: "center", cursor: "pointer", textDecoration: "underline" }}>개발자 모드로 계속</div>}
            </div>
          )}

          {is("start") && (
            <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", padding: "96px 24px 32px", animation: "ccfade .3s ease" }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>크루 시작하기</div>
              <div style={{ fontSize: 15, color: "#78756B", marginTop: 8, lineHeight: 1.5 }}>아직 소속된 크루가 없어요.<br />새로 만들거나 초대 코드로 참여해보세요.</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => go("create")} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>새 크루 만들기</button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}><div style={{ flex: 1, height: 1, background: "#C9C2B2" }} /><div style={{ fontSize: 13, color: "#78756B" }}>또는</div><div style={{ flex: 1, height: 1, background: "#C9C2B2" }} /></div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>초대 코드로 참여</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="예: CLIMB-8H2K" style={{ flex: 1, height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none" }} />
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
                <div><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>오픈카톡 링크 <span style={{ color: "#78756B", fontWeight: 400 }}>(선택)</span></div><input value={form.kakao} onChange={(e) => setForm((f) => ({ ...f, kakao: e.target.value }))} placeholder="https://open.kakao.com/..." style={{ width: "100%", height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none" }} /></div>
              </div>
              <div style={{ padding: "24px 16px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>홈 암장 <span style={{ color: "#78756B", fontWeight: 400 }}>(자주 가는 곳, 최대 4곳)</span></div>
                <div style={{ fontSize: 12, color: "#78756B", marginBottom: 10 }}>선택 {crewHomeGymIds.length}/4 · 투표할 때 후보로 먼저 떠요</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {allGymsList.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#78756B", fontSize: 13 }}>암장을 불러오는 중이에요</div>}
                  {allGymsList.map((g: Any) => { const sel = crewHomeGymIds.includes(g.id); return (
                    <div key={g.id} onClick={() => toggleHomeGym(g.id)} style={rowStyle(sel)}>
                      <div style={boxStyle(sel)}>{sel ? "✓" : ""}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{g.address || ""}</div></div>
                    </div>
                  ); })}
                </div>
              </div>
              <div style={{ padding: "28px 16px 0" }}><button onClick={createCrew} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>크루 만들기</button></div>
            </div>
          )}

          {is("invite") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 8px" }}><BackBtn onClick={back} /><div style={{ fontSize: 20, fontWeight: 700 }}>멤버 초대</div></div>
              <div style={{ margin: "12px 16px 0", padding: 18, ...cardStyle }}>
                <div style={{ fontSize: 13, color: "#78756B" }}>초대 코드</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.06em", marginTop: 4 }}>{crewDetail?.inviteCode ?? "…"}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}><button onClick={copyLink} style={{ flex: 1, height: 44, border: "2px solid #3A3633", borderRadius: 10, background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>링크 복사</button><button onClick={shareInvite} style={{ flex: 1, height: 44, border: "none", borderRadius: 10, background: "#FEE500", color: "#191600", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>카톡 공유</button></div>
              </div>
              {requests.length > 0 && (
                <div style={{ padding: "24px 16px 0" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>가입 신청 <span style={{ color: "#E24D3A" }}>{requests.length}</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {requests.map((r) => (
                      <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", ...cardStyle, borderRadius: WOBS[2] }}>
                        <div style={{ width: 38, height: 38, borderRadius: 999, background: "#F3EEDF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#78756B" }}>{r.user.nickname[0]}</div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{r.user.nickname}</div><div style={{ fontSize: 12, color: "#78756B" }}>{rel(r.createdAt)} 신청</div></div>
                        <button onClick={() => handleReq(r.userId, r.user.nickname, false)} style={{ height: 44, padding: "0 14px", border: "2px solid #3A3633", borderRadius: 10, background: "#fff", color: "#78756B", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>거절</button>
                        <button onClick={() => handleReq(r.userId, r.user.nickname, true)} style={{ height: 44, padding: "0 16px", border: "none", borderRadius: 10, background: "#6BBF59", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>승인</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ padding: "24px 16px 0" }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>멤버 <span style={{ color: "#78756B" }}>{members.length}</span></div>
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
                  <div style={{ width: 32, height: 32, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", background: hatch(hexRgb(ac ? crewColor(ac.id) : "#E24D3A")), border: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-3deg)" }}><svg width="17" height="17" viewBox="0 0 40 40" fill="none"><path d="M9 30 18 12l5 9 4-6 4 15" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{ac?.name ?? "…"}</div>
                  <svg width="12" height="12" viewBox="0 0 12 12" style={{ marginTop: 2 }}><path d="M2 4.5 6 8.5 10 4.5" stroke="#78756B" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <div onClick={openCrewManage} aria-label="크루 관리" style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.2" stroke="#3A3633" strokeWidth="1.8" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.8 5.8l1.6 1.6M16.6 16.6 18.2 18.2M18.2 5.8 16.6 7.4M7.4 16.6 5.8 18.2" stroke="#3A3633" strokeWidth="1.8" strokeLinecap="round" /></svg></div>
                  <div style={{ position: "relative", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="#3A3633" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 20a2 2 0 0 0 4 0" stroke="#3A3633" strokeWidth="1.8" strokeLinecap="round" /></svg><div style={{ position: "absolute", top: 8, right: 9, width: 8, height: 8, borderRadius: 999, background: "#E24D3A", border: "1.5px solid #FFFDF6" }} /></div>
                </div>
              </div>

              <div style={{ padding: "14px 16px 0" }}>
                {upcoming ? (
                  <div style={{ position: "relative", padding: "16px 18px 14px", background: "#FFFEFA", border: `2.5px solid #4E9D57`, borderRadius: WOBS[0], transform: "rotate(-0.4deg)" }}>
                    <span style={{ position: "absolute", top: -12, right: 12, transform: "rotate(7deg)", fontSize: 16, fontWeight: 700, padding: "0 12px", color: INK, background: `repeating-linear-gradient(50deg, rgba(${CRAYON.yellow},0.85) 0 4px, rgba(${CRAYON.yellow},0.6) 4px 7px)`, border: `2px solid ${INK}`, borderRadius: WOBS[2] }}>확정!</span>
                    <div style={{ fontSize: 15, color: "#8C857B", fontWeight: 700 }}>다음 세션</div>
                    <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.05, margin: "4px 0 2px" }}>{upcoming.date}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19, fontWeight: 700, marginTop: 2 }}><span style={{ width: 18, height: 18, flexShrink: 0, border: `2px solid ${INK}`, borderRadius: "170px 40px 190px 30px / 30px 190px 40px 170px", background: hatchSoft(CRAYON.green) }} />{upcoming.gym}</div>
                    {upcoming.going > 0 && <div style={{ fontSize: 16, fontWeight: 700, color: "#6E675C", marginTop: 8 }}>{upcoming.going}명이나 가요!</div>}
                  </div>
                ) : (
                  <div style={{ padding: "16px 18px", border: "2.5px dashed rgba(58,54,51,0.4)", borderRadius: WOBS[0], background: "#FFFEFA", transform: "rotate(-0.3deg)" }}>
                    <div style={{ fontSize: 15, color: "#8C857B", fontWeight: 700 }}>다음 세션</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 2px" }}>아직 미정이에요</div>
                    <div style={{ fontSize: 15, color: "#6E675C", lineHeight: 1.45 }}>투표로 날짜랑 암장을 정해봐요.</div>
                    <button onClick={openCreatePoll} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, height: 44, padding: "0 18px", fontSize: 16, fontWeight: 700, ...crayonBtn(CRAYON.red, 1) }}>새 투표 만들기</button>
                  </div>
                )}
              </div>

              <div style={{ padding: "22px 16px 0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={sectionLabel}>진행 중인 투표</div>
                  <div onClick={openCreatePoll} style={{ fontSize: 12, fontWeight: 700, color: "#E24D3A", cursor: "pointer" }}>+ 새 투표</div>
                </div>
                {openVote ? (
                  <div style={{ padding: 18, ...cardStyle }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ fontSize: 17, fontWeight: 700 }}>{openVote.title}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#B4432E", background: "#FBF0DA", padding: "3px 8px", borderRadius: 999 }}>{openVote.deadline}</div></div>
                    <div style={{ fontSize: 13, color: "#78756B", marginTop: 8 }}>{respondedCount}/{openVote.total}명 응답 완료</div>
                    <div style={{ height: 6, borderRadius: 999, background: "#F3EEDF", marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: (openVote.total ? respondedCount / openVote.total : 0) * 100 + "%", background: "#E24D3A", borderRadius: 999 }} /></div>
                    <button onClick={() => go("vote")} style={{ width: "100%", height: 46, marginTop: 14, fontSize: 17, fontWeight: 700, ...crayonBtn(CRAYON.red, 3) }}>참여하기</button>
                  </div>
                ) : (
                  <div style={{ padding: 16, ...cardStyle, color: "#78756B", fontSize: 14 }}>진행 중인 투표가 없어요. <span onClick={openCreatePoll} style={{ color: "#E24D3A", fontWeight: 700, cursor: "pointer" }}>새로 만들기</span></div>
                )}
              </div>

              <div style={{ padding: "22px 16px 0" }}>
                <div style={sectionLabel}>가야 할 암장</div>
                <div style={{ fontSize: 12, color: "#78756B", margin: "2px 0 10px" }}>간 지 오래됐거나 안 가본 홈 암장</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {toGo.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#78756B", fontSize: 13 }}>다 다녀왔어요! 🎉</div>}
                  {toGo.map((gg) => (
                    <div key={gg.id} onClick={() => openGym(gg.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, ...cardStyle, cursor: "pointer" }}>
                      <div style={avatarStyle(gg.color)}>{gg.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{gg.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{gg.loc}{gg.rating ? ` · ★ ${gg.rating}` : ""}</div><div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#FBEFD9", color: "#B5730A" }}>{visitLabel(gg)}</div></div>
                      <ChevR />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: "22px 16px 0" }}>
                <div style={sectionLabel}>오늘 추천</div>
                <div style={{ fontSize: 12, color: "#78756B", margin: "2px 0 10px" }}>내 실력에 맞는 문제 추천</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, ...cardStyle }}><div style={{ flex: 1, fontSize: 13, color: "#78756B" }}>완등 기록이 쌓이면 내 수준에 맞는 문제를 추천해드려요.</div><div style={{ fontSize: 11, fontWeight: 700, color: "#78756B", background: "#F3EEDF", padding: "3px 9px", borderRadius: 999 }}>준비 중</div></div>
              </div>
            </div>
          )}

          {is("explore") && (
            <div style={{ animation: "ccfade .3s ease", height: "100%", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "52px 14px 10px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 700, flexShrink: 0 }}>탐색</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 14px", background: "#FFFEFA", border: `2px solid ${INK}`, borderRadius: WOBS[2] }}>
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#78756B" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#78756B" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  <input value={exploreQ} onChange={(e) => { setExploreQ(e.target.value); setMapSel(null); }} placeholder="암장 · 지역 검색" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15, minWidth: 0 }} />
                  {exploreQ && <div onClick={() => { setExploreQ(""); setMapSel(null); }} style={{ cursor: "pointer", padding: 4 }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#78756B" strokeWidth="2" strokeLinecap="round" /></svg></div>}
                </div>
              </div>
              <div style={{ flex: 1, position: "relative", margin: "0 12px 12px", ...wob(0), overflow: "hidden", minHeight: 0 }}>
                <GymMap gyms={mapGyms} selectedId={mapSel} onSelect={(id) => setMapSel(id || null)} />
                {exploreQ.trim() && mapGyms.length === 0 && (
                  <div style={{ position: "absolute", top: 14, left: 14, right: 14, padding: "10px 14px", background: "#FFFEFA", border: `2px solid ${INK}`, borderRadius: WOBS[1], fontSize: 14, color: "#6E675C", textAlign: "center" }}>&apos;{exploreQ.trim()}&apos; 에 맞는 암장이 없어요</div>
                )}
                {mapSelGym && (
                  <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, padding: "13px 14px", background: "#FFFEFA", border: `2.5px solid ${INK}`, borderRadius: WOBS[0], boxShadow: "0 6px 18px rgba(58,54,51,0.22)", animation: "ccfade .18s ease" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={avatarStyle(mapSelGym.color)}>{mapSelGym.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {mapSelBranches >= 2 && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 4, padding: "1px 8px 1px 6px", borderRadius: 999, background: `rgba(${brandColorOf(mapSelGym.name)},0.18)`, fontSize: 12, fontWeight: 700, color: INK }}><span style={{ width: 10, height: 10, borderRadius: "60% 45% 55% 50%", background: hatch(brandColorOf(mapSelGym.name)) }} />{mapSelBrand} · {mapSelBranches}개 지점</div>}
                        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.15 }}>{mapSelGym.name}</div>
                        <div style={{ fontSize: 13, color: "#78756B", marginTop: 2 }}>{mapSelGym.loc}{mapSelGym.rating ? ` · ★ ${mapSelGym.rating}` : ""}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: mapSelGym.due ? "#FBEFD9" : "#E4F5EC", color: mapSelGym.due ? "#B5730A" : "#3E7D2E" }}>{visitLabel(mapSelGym)}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#78756B" }}>{mapSelGym.lastVisit ? `마지막 방문 ${fmtDate(mapSelGym.lastVisit)}` : "우리 크루 방문 기록 없음"}</div>
                        </div>
                      </div>
                      <div onClick={() => setMapSel(null)} style={{ cursor: "pointer", padding: 4, flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#78756B" strokeWidth="2" strokeLinecap="round" /></svg></div>
                    </div>
                    <button onClick={() => openGym(mapSelGym.id)} style={{ width: "100%", height: 44, marginTop: 12, fontSize: 16, fontWeight: 700, ...crayonBtn(CRAYON.red, 1) }}>상세 보기</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {is("vote") && (
            <>
              <div style={{ animation: "ccfade .3s ease", paddingBottom: 24 }}>
                <div style={{ padding: "56px 16px 8px" }}>
                  <div onClick={() => setSwitcherOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 5px", background: hatch(hexRgb(ac ? crewColor(ac.id) : "#E24D3A")), border: `2px solid ${INK}`, borderRadius: WOBS[0], cursor: "pointer", marginBottom: 14, transform: "rotate(-0.8deg)" }}><div style={{ width: 24, height: 24, borderRadius: "50% 46% 52% 48% / 48% 52% 46% 50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, background: "#FFFDF6", color: INK }}>{ac?.name?.[0] ?? "?"}</div><span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{ac?.name ?? ""}</span><svg width="12" height="12" viewBox="0 0 12 12" style={{ marginLeft: -1 }}><path d="M2 4.5 6 8.5 10 4.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                  <div style={H1}>{openVote?.title ?? "진행 중인 투표 없음"}</div>
                  {openVote && <div style={{ fontSize: 13, color: "#78756B", marginTop: 6 }}>{openVote.deadline} · {respondedCount}/{openVote.total}명 응답</div>}
                  {canClose && openVote && <button onClick={() => setCloseSheetOpen(true)} style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, height: 42, padding: "0 16px", border: `2px solid ${INK}`, borderRadius: WOBS[3], background: HILITE, fontSize: 16, fontWeight: 700, color: INK, cursor: "pointer", transform: "rotate(-0.5deg)" }}>투표 마감하고 확정 →</button>}
                </div>
                {!openVote && <div style={{ padding: "0 16px", color: "#78756B", fontSize: 14 }}>이 크루엔 진행 중인 투표가 없어요.</div>}
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
                      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>되는 날에 동그라미 쳐주세요</div>
                      <div style={{ fontSize: 14, color: "#78756B", marginBottom: 16 }}>여러 날도 좋아요 · 누르면 아래에 누가 되는지 나와요</div>
                      {respMonths.length === 0 ? <div style={{ color: "#78756B", fontSize: 15 }}>날짜 후보가 없어요.</div> : respondCalendar()}
                      {respMonths.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, fontSize: 13, fontWeight: 700, color: "#6E675C", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="17" height="17" viewBox="0 0 40 44"><path d="M20 3.5 C32 1.5 38.5 11 37.5 22 C36.5 34 28 41.5 17.5 40.5 C7.5 39.5 2 30 3.5 19.5 C5 10 11 4.5 23 3.8" fill="none" stroke="#3A3633" strokeWidth="3.4" strokeLinecap="round" /></svg>내가 고른 날</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 15, height: 15, borderRadius: 6, background: `repeating-linear-gradient(52deg, rgba(${CRAYON.orange},0.8) 0 2.5px, rgba(${CRAYON.orange},0.3) 2.5px 5px, transparent 5px 6.5px)`, display: "inline-block" }} />빽빽할수록 많이 겹쳐요</div>
                        </div>
                      )}
                      {focusDay && respOptByDay.get(focusDay) && (
                        <div style={{ marginTop: 16, padding: 14, ...cardStyle, borderRadius: WOBS[3] }}>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: respOptByDay.get(focusDay)!.voters.length ? 8 : 0 }}>{fmtDate(focusDay)} · {respOptByDay.get(focusDay)!.count}명 가능</div>
                          {respOptByDay.get(focusDay)!.voters.length ? voterRow(respOptByDay.get(focusDay)!.voters) : <div style={{ fontSize: 12, color: "#78756B" }}>아직 아무도 안 골랐어요 · 먼저 골라보세요</div>}
                        </div>
                      )}
                    </div>
                  )}
                  {hasGymOpts && voteTab === "gym" && (
                    <div style={{ padding: "18px 16px 0" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>선호 암장을 골라주세요</div>
                      <div style={{ fontSize: 12, color: "#78756B", marginBottom: 14 }}>다른 사람이 많이 고른 곳이 위에 · 여러 곳 가능</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {gymOpts.map((o: Any) => { const sel = !!voteGyms[o.id]; return (
                          <div key={o.id} onClick={() => setVoteGyms((v) => ({ ...v, [o.id]: !v[o.id] }))} style={{ ...rowStyle(sel), alignItems: "flex-start" }}><div style={{ ...boxStyle(sel), marginTop: 1 }}>{sel ? "✓" : ""}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{o.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{o.meta}</div>{voterRow(o.voters)}</div><div style={{ fontSize: 13, fontWeight: 700, color: "#78756B" }}>{o.count}표</div></div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 8px" }}><BackBtn onClick={back} /><div style={{ fontSize: 18, fontWeight: 700 }}>{sg.name}</div></div>
                <div style={{ padding: "8px 16px 0" }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={avatarStyle(sg.color, 60)}>{sg.initial}</div><div><div style={{ fontSize: 22, fontWeight: 800 }}>{sg.name}</div><div style={{ fontSize: 13, color: "#78756B", marginTop: 4 }}>{sg.loc}</div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>{sg.reviews ? (<><span style={{ color: "#E0921A", fontSize: 15 }}>★</span><span style={{ fontSize: 15, fontWeight: 700 }}>{sg.rating}</span><span style={{ fontSize: 13, color: "#78756B" }}>리뷰 {sg.reviews}개</span></>) : (<span style={{ fontSize: 13, color: "#78756B" }}>아직 리뷰 없음</span>)}</div></div></div></div>
                <div style={{ padding: "18px 16px 0" }}>
                  <div style={{ padding: 14, borderRadius: WOBS[1], background: sg.due ? "#FBEFD9" : "#E4F5EC", border: `2px solid ${INK}`, transform: "rotate(-0.4deg)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: "#fff", border: `2px solid ${INK}`, background: hatch(sg.due ? CRAYON.orange : CRAYON.green), transform: "rotate(-3deg)" }}>{sg.due ? "!" : "✓"}</div><div><div style={{ fontSize: 15, fontWeight: 700, color: sg.due ? "#B5730A" : "#3E7D2E" }}>{!sg.ever ? "아직 안 가봤어요" : sg.due ? "또 갈 때가 됐어요" : "최근 다녀왔어요"}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{!sg.ever ? `보통 ${sg.cycle}주 주기예요` : `${sg.weeks}주 전 방문 · 보통 ${sg.cycle}주 주기`}</div></div></div>
                  </div>
                </div>
                <div style={{ padding: "14px 16px 0" }}><a href={`https://map.naver.com/p/search/${encodeURIComponent((sg.name || "") + " " + (sg.loc || ""))}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, ...cardStyle, borderRadius: WOBS[3], textDecoration: "none", color: "#3A3633" }}><div style={{ width: 34, height: 34, borderRadius: 9, background: "#03C75A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, color: "#fff", fontFamily: "sans-serif" }}>N</div><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>네이버 지도에서 보기</div><div style={{ fontSize: 12, color: "#78756B" }}>길찾기 · 위치 · 영업시간</div></div><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M9 7h8v8" stroke="#78756B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></a></div>
                {sg.instagram && (
                  <div style={{ padding: "14px 16px 0" }}><a href={sg.instagram} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, ...cardStyle, borderRadius: WOBS[2], textDecoration: "none", color: "#3A3633" }}><div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#F58529,#DD2A7B)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="#fff" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.8" /><circle cx="17" cy="7" r="1.2" fill="#fff" /></svg></div><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>인스타 뉴셋 공지 보기</div><div style={{ fontSize: 12, color: "#78756B" }}>{handleOf(sg.instagram) || "인스타그램 열기"}</div></div><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M9 7h8v8" stroke="#78756B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></a></div>
                )}
                <div style={{ padding: "18px 0 0" }}>
                  <div style={{ padding: "0 16px", fontSize: 16, fontWeight: 700, marginTop: 12 }}>세팅 회차별 리뷰</div>
                  {reviewSets.length === 0 && <div style={{ padding: "12px 16px 0", color: "#78756B", fontSize: 13 }}>아직 리뷰가 없어요.</div>}
                  {reviewSets.map((set: Any) => (
                    <div key={set.header} style={{ padding: "0 16px", marginTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#78756B", marginBottom: 8, letterSpacing: "0.02em" }}>{set.header}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {set.items.map((r: Any, i: number) => (
                          <div key={i} style={{ padding: 14, ...cardStyle, borderRadius: WOBS[2] }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 999, background: r.bg, color: r.c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{r.user[0]}</div><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{r.user}</div><div style={{ fontSize: 12, color: "#E0921A", letterSpacing: 1 }}>{r.stars}</div></div><div style={{ fontSize: 12, color: "#78756B" }}>{r.date}</div></div><div style={{ fontSize: 14, color: "#3C3A34", lineHeight: 1.55, marginTop: 10 }}>{r.text}</div></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div onClick={() => showToast("문제·난이도 기능은 준비 중이에요")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 12, background: "#F5F3EE", cursor: "pointer" }}>
                    <div style={{ flex: 1, fontSize: 13, color: "#78756B" }}>이번 셋 문제 · 내 기준 난이도 보정</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#78756B" }}>준비 중</div>
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
                  <div onClick={() => setCalMonthOffset((o) => o - 1)} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><svg width="9" height="16" viewBox="0 0 9 16"><path d="M7 1 1 8l6 7" stroke="#78756B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{calMonth}</div>
                  <div onClick={() => setCalMonthOffset((o) => o + 1)} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><svg width="9" height="16" viewBox="0 0 9 16"><path d="M2 1l6 7-6 7" stroke="#78756B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", fontSize: 11, color: "#78756B", marginBottom: 8 }}>{WD.map((d) => <div key={d}>{d}</div>)}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 6, fontSize: 14 }}>{calCells.map((c) => <div key={c.key} style={c.style}>{c.day}</div>)}</div>
                <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "2px dashed rgba(58,54,51,0.25)", fontSize: 14, fontWeight: 700, color: "#6E675C" }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", background: hatch(CRAYON.green), border: `1.5px solid ${INK}`, display: "inline-block" }} />간 날</div><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: "52% 48% 46% 54%", border: "2px solid #E24D3A", display: "inline-block" }} />오늘</div></div>
              </div>
              {visits.length === 0 && <div style={{ padding: "22px 16px 0" }}><div style={{ padding: 14, ...cardStyle, color: "#78756B", fontSize: 13 }}>방문 기록이 아직 없어요.</div></div>}
              {futureVisits.length > 0 && (
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ ...sectionLabel, marginBottom: 10 }}>다가오는 일정</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{futureVisits.map((v) => visitRow(v, true))}</div>
                </div>
              )}
              {pastVisits.length > 0 && (
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ ...sectionLabel, marginBottom: 10 }}>지난 방문</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{pastVisits.slice(0, 8).map((v) => visitRow(v, false))}</div>
                </div>
              )}
            </div>
          )}

          {is("profile") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 96 }}>
              <div style={{ padding: "56px 16px 8px" }}><div style={H1}>프로필</div></div>
              <div style={{ padding: "14px 16px 0" }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}>{me?.profileImg ? <img src={me.profileImg} alt="" style={{ width: 66, height: 66, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", objectFit: "cover", flexShrink: 0, border: `2.5px solid ${INK}`, transform: "rotate(-2deg)" }} /> : <div style={{ width: 66, height: 66, borderRadius: "60% 45% 55% 50% / 50% 60% 45% 58%", background: hatch(CRAYON.red), border: `2.5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#fff", flexShrink: 0, transform: "rotate(-2deg)" }}>{(me?.nickname || "?")[0]}</div>}<div><div style={{ fontSize: 20, fontWeight: 800 }}>{me?.nickname ?? "…"}</div><div style={{ fontSize: 13, color: "#78756B", marginTop: 2 }}>{ac?.name ?? ""}</div><div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "5px 11px", borderRadius: 999, background: "#FBF0DA", fontSize: 12, fontWeight: 800, color: "#B4432E" }}><span style={{ width: 10, height: 10, borderRadius: 999, background: "#2F72E0", display: "inline-block" }} />{thetaChip}</div></div></div></div>
              <div style={{ padding: "18px 16px 0" }}><div style={{ display: "flex", ...cardStyle, overflow: "hidden" }}>{[[String(gyms.filter((g) => g.ever).length), "방문 암장"], [String(gymReviews.length || 0), "작성 리뷰"], [String(visits.length), "방문 기록"]].map(([n, l], i) => (<div key={l} style={{ flex: 1, textAlign: "center", padding: "16px 0", borderLeft: i ? "2px dashed rgba(58,54,51,0.25)" : "none" }}><div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{l}</div></div>))}</div></div>
              <div style={{ padding: "24px 16px 0" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}><div style={sectionLabel}>내 완등 로그</div><div style={{ fontSize: 11, fontWeight: 700, color: "#78756B", background: "#F3EEDF", padding: "3px 9px", borderRadius: 999 }}>준비 중</div></div><div style={{ padding: 14, ...cardStyle, color: "#78756B", fontSize: 13 }}>완등 기록 기능은 준비 중이에요.</div></div>
              <div style={{ padding: "22px 16px 0" }}><div style={{ ...cardStyle, overflow: "hidden" }}>
                <div onClick={() => showToast("알림 설정은 준비 중이에요")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "15px 16px", borderBottom: "2px dashed rgba(58,54,51,0.2)", cursor: "pointer" }}><div style={{ flex: 1, fontSize: 15, color: "#78756B" }}>알림 설정</div><div style={{ fontSize: 11, fontWeight: 700, color: "#78756B", background: "#F3EEDF", padding: "3px 9px", borderRadius: 999 }}>준비 중</div></div>
                <div onClick={openCrewManage} style={{ display: "flex", alignItems: "center", gap: 8, padding: "15px 16px", borderBottom: "2px dashed rgba(58,54,51,0.2)", cursor: "pointer" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke={INK} strokeWidth="1.8" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" stroke={INK} strokeWidth="1.8" strokeLinecap="round" /></svg><div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>크루 관리</div><div style={{ fontSize: 12, color: "#78756B" }}>멤버 · 초대 · 홈 암장</div><ChevR /></div>
                <div onClick={() => { if (status === "authenticated") signOut({ redirect: false }); tab("login"); }} style={{ display: "flex", alignItems: "center", padding: "15px 16px", cursor: "pointer" }}><div style={{ flex: 1, fontSize: 15, color: "#D14343" }}>로그아웃</div></div>
              </div></div>
            </div>
          )}

          {is("crewManage") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 100 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 4px" }}><BackBtn onClick={back} /><div><div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>크루 관리</div><div style={{ fontSize: 13, color: "#78756B" }}>{ac?.name ?? ""}</div></div></div>

              {/* 초대 코드 */}
              <div style={{ padding: "18px 16px 0" }}>
                <div style={{ ...sectionLabel, marginBottom: 8 }}>초대</div>
                <div style={{ padding: 16, ...cardStyle, borderRadius: WOBS[0] }}>
                  <div style={{ fontSize: 13, color: "#78756B" }}>초대 코드</div>
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
                        <div style={{ width: 36, height: 36, borderRadius: "56% 44% 52% 48%", background: "#EAE4D4", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#78756B" }}>{r.user.nickname[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{r.user.nickname}</div><div style={{ fontSize: 12, color: "#78756B" }}>{rel(r.createdAt)} 신청</div></div>
                        <button onClick={() => handleReq(r.userId, r.user.nickname, false)} style={{ height: 40, padding: "0 13px", border: `2px solid ${INK}`, borderRadius: WOBS[3], background: "#FFFEFA", color: "#78756B", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>거절</button>
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

              {/* 홈 암장 (검색으로 추가) */}
              <div style={{ padding: "26px 16px 0" }}>
                <div style={{ ...sectionLabel, marginBottom: 2 }}>홈 암장 · {manageHomeIds.length}/4</div>
                <div style={{ fontSize: 13, color: "#78756B", marginBottom: 12 }}>자주 가는 곳. 투표 후보와 &quot;가야 할 암장&quot;에 떠요</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {manageHomeIds.length === 0 && <div style={{ padding: 13, ...cardStyle, color: "#78756B", fontSize: 14, borderRadius: WOBS[2] }}>아직 없어요. 아래에서 검색해 추가하세요.</div>}
                  {gyms.filter((g) => manageHomeIds.includes(g.id)).map((g) => (
                    <div key={g.id} onClick={() => toggleManageHome(g.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: WOBS[1], border: `2px solid ${INK}`, background: `rgba(${CRAYON.yellow},0.16)`, cursor: "pointer" }}>
                      <div style={avatarStyle(g.color, 34)}>{g.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{g.loc}</div></div>
                      <svg width="18" height="18" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#78756B" strokeWidth="2" strokeLinecap="round" /></svg>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", background: "#FFFEFA", border: `2px solid ${INK}`, borderRadius: WOBS[2] }}>
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#78756B" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#78756B" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  <input value={manageQ} onChange={(e) => setManageQ(e.target.value)} placeholder="암장 검색해서 홈으로 추가" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15, minWidth: 0 }} />
                  {manageQ && <div onClick={() => setManageQ("")} style={{ cursor: "pointer", padding: 4 }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#78756B" strokeWidth="2" strokeLinecap="round" /></svg></div>}
                </div>
                {manageQ.trim() && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {gyms.filter((g) => !manageHomeIds.includes(g.id) && (g.name + " " + g.loc).toLowerCase().includes(manageQ.trim().toLowerCase())).slice(0, 20).map((g) => (
                      <div key={g.id} onClick={() => { toggleManageHome(g.id); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", ...cardStyle, borderRadius: WOBS[2], cursor: "pointer" }}>
                        <div style={{ width: 30, height: 30, borderRadius: "56% 44% 52% 48%", background: "#EFEBDD", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#78756B" strokeWidth="2.4" strokeLinecap="round" /></svg></div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{g.loc}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {is("probList") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 96 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 2px" }}><BackBtn onClick={back} /><div style={{ fontSize: 15, fontWeight: 700, color: "#78756B" }}>{probGym?.name ?? ""}</div></div>
              <div style={{ padding: "2px 16px 0" }}><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>이번 셋 문제</div><div style={{ fontSize: 13, color: "#78756B", marginTop: 6 }}>색이 곧 난이도예요</div></div>
              <div style={{ padding: "16px 16px 0" }}><div style={{ display: "flex", gap: 4, padding: 4, background: "#F3EEDF", borderRadius: 11 }}><div onClick={() => setSort("easy")} style={segStyle(sort === "easy")}>쉬운 순</div><div onClick={() => setSort("hard")} style={segStyle(sort === "hard")}>어려운 순</div></div></div>
              {probGroups.length === 0 && <div style={{ padding: "22px 16px", color: "#78756B", fontSize: 14 }}>아직 등록된 문제가 없어요.</div>}
              {probGroups.map((grp: Any) => (
                <div key={grp.color} style={{ padding: "22px 16px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><div style={dotStyle(grp.items[0].hex, grp.color, 18)} /><div style={{ fontSize: 16, fontWeight: 800 }}>{grp.color}</div><div style={{ fontSize: 12, color: "#78756B" }}>{grp.items.length}개</div></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {grp.items.map((p: Any) => (
                      <div key={p.id} onClick={() => openProb(p.id)} style={{ padding: "13px 14px", ...cardStyle, borderRadius: WOBS[2], cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={dotStyle(p.hex, p.color)} /><div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{p.color}{p.tag ? ` · ${p.tag}` : ""}</div>{p.honey && <div style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#FBEFD9", color: "#B5730A" }}>꿀</div>}{p.mine && <div style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#E4F5EC", color: "#3E7D2E" }}>완등 ✓</div>}</div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 11 }}><div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#78756B", marginBottom: 3 }}><span>체감</span><span>{feelLabel(p.feel)}</span></div><div style={{ position: "relative", height: 6, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={meterFill(p.feel)} /></div></div><div style={{ width: 62 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#78756B", marginBottom: 3 }}><span>완등</span><span>{p.send}%</span></div><div style={{ height: 6, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={{ width: p.send + "%", height: "100%", background: "#6BBF59", borderRadius: 999 }} /></div></div><div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "#78756B", paddingBottom: 1 }}><PlayDot />{p.videos}</div></div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 2px" }}><BackBtn onClick={back} /><div style={{ fontSize: 15, fontWeight: 700, color: "#78756B" }}>{pd.gymName}</div></div>
                <div style={{ padding: "8px 16px 0" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={dotStyle(pd.hex, pd.color, 24)} /><div style={{ flex: 1 }}><div style={{ fontSize: 24, fontWeight: 800 }}>{pd.color}{pd.tag ? ` · ${pd.tag}` : ""}</div><div style={{ fontSize: 13, color: "#78756B", marginTop: 2 }}>{pd.gymName} · 이번 셋</div></div>{pd.honey && <div style={{ padding: "5px 11px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: "#FBEFD9", color: "#B5730A" }}>꿀 문제</div>}</div></div>
                <div style={{ padding: "18px 16px 0" }}><div style={{ padding: 16, ...cardStyle }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#78756B", marginBottom: 6 }}><span>크루 합의 체감</span><span style={{ fontWeight: 700, color: "#3A3633" }}>{feelLabel(pd.feel)}</span></div><div style={{ position: "relative", height: 8, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={meterFill(pd.feel)} /></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#78756B", margin: "16px 0 6px" }}><span>완등률</span><span style={{ fontWeight: 700, color: "#3E7D2E" }}>{pd.send}%</span></div><div style={{ height: 8, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={{ width: pd.send + "%", height: "100%", background: "#6BBF59", borderRadius: 999 }} /></div></div></div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>완등 영상 <span style={{ color: "#78756B", fontWeight: 600, fontSize: 14 }}>{pdVideos.length}개</span></div>
                  {pdVideos.length === 0 ? <div style={{ padding: 14, ...cardStyle, color: "#78756B", fontSize: 13 }}>아직 영상이 없어요. 기록 탭에서 올려보세요.</div> : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{pdVideos.map((v: Any, i: number) => (<div key={i} style={{ position: "relative", aspectRatio: "3/4", borderRadius: 14, overflow: "hidden", background: "#EEEDE7", display: "flex", alignItems: "center", justifyContent: "center", color: "#78756B", fontSize: 12 }}>{v.user.nickname}<div style={{ position: "absolute", left: 8, bottom: 8, width: 30, height: 30, borderRadius: 999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 2l7 4-7 4z" fill="#fff" /></svg></div></div>))}</div>
                  )}
                </div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>베타 · 공략</div>
                  {pdBetas.length === 0 ? <div style={{ padding: 14, ...cardStyle, color: "#78756B", fontSize: 13 }}>아직 베타가 없어요.</div> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{pdBetas.map((b: Any, i: number) => (<div key={i} style={{ padding: 14, ...cardStyle, borderRadius: WOBS[2] }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: 999, background: b.bg, color: b.c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{b.user[0]}</div><div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{b.user}</div><div style={{ fontSize: 12, color: "#78756B" }}>{b.date}</div></div><div style={{ fontSize: 14, color: "#3C3A34", lineHeight: 1.55, marginTop: 10 }}>{b.text}</div></div>))}</div>
                  )}
                </div>
              </div>
            </>
          )}

          {is("record") && (
            <>
              <div style={{ animation: "ccfade .3s ease", paddingBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "56px 16px 2px" }}><div style={{ fontSize: 24, fontWeight: 800 }}>완등 기록</div><button onClick={() => tab("home")} style={{ width: 36, height: 36, border: "none", borderRadius: 999, background: "#F3EEDF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12" stroke="#78756B" strokeWidth="2" strokeLinecap="round" /></svg></button></div>
                <div style={{ padding: "2px 16px 0", fontSize: 13, color: "#78756B" }}>올린 영상에 문제 정보만 붙이면 끝이에요</div>
                <div style={{ padding: "18px 16px 0" }}><div style={{ ...sectionLabel, marginBottom: 8 }}>어디서 풀었어요?</div><div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>{gyms.map((gg) => { const sel = gg.id === (recGym || gyms[0]?.id); return (<div key={gg.id} onClick={() => setRecGym(gg.id)} style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", border: sel ? "1.5px solid #E24D3A" : "1px solid #C9C2B2", background: sel ? "#FBF0DA" : "#fff", color: sel ? "#B4432E" : "#78756B" }}>{gg.name}</div>); })}</div></div>
                <div style={{ padding: "22px 16px 0" }}><div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>1. 영상·사진 올리기</div><div style={{ fontSize: 12, color: "#78756B", marginBottom: 10 }}>완등 순간을 끌어다 놓으세요</div><div style={{ height: 220, borderRadius: 16, background: "#EEEDE7", display: "flex", alignItems: "center", justifyContent: "center", color: "#78756B", fontSize: 14 }}>여기로 영상·사진을 끌어다 놓으세요</div></div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>2. 이 영상은 어떤 문제였어요?</div>
                  <div style={{ padding: 16, ...cardStyle }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#78756B", marginBottom: 10 }}>문제 색 (난이도)</div>
                    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>{recColors.map(([name, hex]) => { const sel = recColor === name; return (<div key={name} onClick={() => setRecColor(name)} style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}><div style={{ width: 40, height: 40, borderRadius: 12, background: hex, cursor: "pointer", border: name === "흰" ? "1.5px solid #D6D4CC" : "none", boxShadow: sel ? "0 0 0 2px #fff, 0 0 0 4px #E24D3A" : "none" }} /><div style={{ fontSize: 11, marginTop: 6, textAlign: "center", fontWeight: sel ? 800 : 600, color: sel ? "#3A3633" : "#78756B" }}>{name}</div></div>); })}</div>
                    <div style={{ height: 1, background: "#F3EEDF", margin: "16px 0" }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#78756B", marginBottom: 8 }}>체감 난이도</div>
                    <div style={{ display: "flex", gap: 4, padding: 4, background: "#F3EEDF", borderRadius: 10 }}>{["쉬움", "적정", "어려움"].map((f) => <div key={f} onClick={() => setRecFeel(f)} style={segStyle(recFeel === f)}>{f}</div>)}</div>
                    <div style={{ marginTop: 16 }}><div onClick={() => setRecHoney((h) => !h)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: recHoney ? "none" : "1px solid #C9C2B2", background: recHoney ? "#FBEFD9" : "#fff", color: recHoney ? "#B5730A" : "#78756B" }}><span style={{ width: 8, height: 8, borderRadius: 999, background: "#E0921A", display: "inline-block" }} />꿀 문제로 표시</div></div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#78756B", margin: "18px 0 8px" }}>한 줄 설명 · 베타</div>
                    <textarea value={recMemo} onChange={(e) => setRecMemo(e.target.value)} placeholder="어떻게 풀었는지, 베타 한 줄" style={{ width: "100%", height: 80, border: "2px solid #3A3633", borderRadius: 10, padding: "12px 14px", fontSize: 14, background: "#FFFDF6", outline: "none", resize: "none", lineHeight: 1.5 }} />
                  </div>
                </div>
              </div>
            </>
          )}

          {is("recommend") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 96 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 2px" }}><BackBtn onClick={back} /><div style={{ fontSize: 15, fontWeight: 700, color: "#78756B" }}>오늘 추천</div></div>
              <div style={{ padding: "2px 16px 0" }}><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>이거 지금 풀 만해요</div><div style={{ fontSize: 13, color: "#78756B", marginTop: 6 }}>{thetaChip} · 미완등 문제를 쉬운 순으로</div></div>
              <div style={{ padding: "16px 16px 0" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, ...cardStyle, borderRadius: WOBS[2] }}><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>성장 모드</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>한 단계 위 난이도까지 추천</div></div><div onClick={() => setGrowthMode((g) => !g)} style={{ width: 46, height: 28, borderRadius: 999, flexShrink: 0, cursor: "pointer", position: "relative", transition: "background .15s", background: growthMode ? "#E24D3A" : "#DAD8D0" }}><div style={{ position: "absolute", top: 3, left: growthMode ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} /></div></div></div>
              <div style={{ padding: "18px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
                {recoList.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#78756B", fontSize: 13 }}>{recos == null ? "계산 중이에요" : growthMode ? "추천할 문제가 없어요." : "지금 딱 맞는 문제가 없어요 · 성장 모드를 켜보세요."}</div>}
                {recoList.map((p: Any) => (
                  <div key={p.id} onClick={() => openProb(p.id)} style={{ padding: 16, ...cardStyle, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={dotStyle(p.hex, p.color, 20)} /><div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{p.color}{p.tag ? ` · ${p.tag}` : ""}</div>{p.honey && <div style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#FBEFD9", color: "#B5730A" }}>꿀</div>}</div>
                    <div style={{ marginTop: 12 }}><div style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: p.tone === 0 ? "#3E7D2E" : p.tone === 1 ? "#B5730A" : "#B4432E", background: p.tone === 0 ? "#E4F5EC" : p.tone === 1 ? "#FBEFD9" : "#FBF0DA" }}>{p.phrase}</div></div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 12 }}><div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#78756B", marginBottom: 3 }}><span>체감</span><span>{feelLabel(p.feel)}</span></div><div style={{ position: "relative", height: 6, background: "#EEEDE7", borderRadius: 999, overflow: "hidden" }}><div style={meterFill(p.feel)} /></div></div></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {is("gradeMap") && (
            <div style={{ animation: "ccfade .3s ease", paddingBottom: 60 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 2px" }}><BackBtn onClick={back} /><div style={{ fontSize: 15, fontWeight: 700, color: "#78756B" }}>난이도 지도</div></div>
              <div style={{ padding: "2px 16px 0" }}><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>내 기준 난이도 지도</div><div style={{ fontSize: 13, color: "#78756B", marginTop: 6, lineHeight: 1.5 }}>암장마다 색-난이도가 달라요.<br />같은 척도 위에 놓고 비교합니다.</div></div>
              <div style={{ padding: "24px 16px 0" }}><div style={{ padding: 16, background: "#FBF0DA", borderRadius: 14, fontSize: 14, color: "#B4432E", lineHeight: 1.55 }}><b>난이도 지도는 준비 중이에요.</b> 색→공통척도 투표가 더 쌓이면 암장 간 비교를 여기에 그려줄게요.</div></div>
            </div>
          )}

          {is("createPoll") && (
            <>
              <div style={{ animation: "ccfade .3s ease", paddingBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "56px 12px 8px" }}><BackBtn onClick={back} /><div style={{ fontSize: 20, fontWeight: 700 }}>투표 만들기</div></div>
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>제목</div>
                  <input value={pollTitle} onChange={(e) => setPollTitle(e.target.value)} placeholder="예: 이번 주말 어디 갈까?" style={{ width: "100%", height: 50, border: "2px solid #3A3633", borderRadius: 10, padding: "0 14px", fontSize: 15, background: "#fff", outline: "none" }} />
                </div>
                <div style={{ padding: "22px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>1. 날짜 범위</div>
                  <div style={{ fontSize: 12, color: "#78756B", marginBottom: 12 }}>가고 싶은 기간의 시작·끝 날짜를 눌러요 (하루면 같은 날 한 번)</div>
                  <div style={{ padding: 14, ...cardStyle }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div onClick={() => setPollCalOffset((o) => Math.max(0, o - 1))} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: pollCalOffset > 0 ? "pointer" : "default", opacity: pollCalOffset > 0 ? 1 : 0.3 }}><svg width="9" height="16" viewBox="0 0 9 16"><path d="M7 1 1 8l6 7" stroke="#78756B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{pcMonthLabel}</div>
                      <div onClick={() => setPollCalOffset((o) => Math.min(2, o + 1))} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: pollCalOffset < 2 ? "pointer" : "default", opacity: pollCalOffset < 2 ? 1 : 0.3 }}><svg width="9" height="16" viewBox="0 0 9 16"><path d="M2 1l6 7-6 7" stroke="#78756B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", fontSize: 11, color: "#78756B", marginBottom: 6 }}>{WD.map((d) => <div key={d}>{d}</div>)}</div>
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
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#B4432E" }}>{fmtDate(pollRange.start)}{pollRange.end && pollRange.end !== pollRange.start ? ` ~ ${fmtDate(pollRange.end)}` : ""}<span style={{ color: "#78756B", fontWeight: 600 }}> · {pollRange.end ? Math.round((new Date(pollRange.end).getTime() - new Date(pollRange.start).getTime()) / 86400000) + 1 : 1}일</span></div>
                      <div onClick={() => setPollRange({ start: null, end: null })} style={{ fontSize: 12, fontWeight: 700, color: "#78756B", cursor: "pointer" }}>지우기</div>
                    </div>
                  )}
                </div>
                <div style={{ padding: "24px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>2. 투표 마감</div>
                  <div style={{ fontSize: 12, color: "#78756B", marginBottom: 12 }}>언제까지 투표받을까요</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[{ label: "3일 뒤", d: 3 }, { label: "5일 뒤", d: 5 }, { label: "일주일 뒤", d: 7 }, { label: "마감 없음", d: null }].map((o) => { const on = pollDeadlineDays === o.d; return (
                      <div key={o.label} onClick={() => setPollDeadlineDays(o.d)} style={{ padding: "6px 15px", borderRadius: WOBS[(o.d ?? 0) % 4], fontSize: 16, fontWeight: 700, cursor: "pointer", border: on ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: on ? HILITE : "#FFFEFA", color: on ? INK : "#78756B", transform: on ? "rotate(-0.8deg)" : "none" }}>{on ? "✓ " : ""}{o.label}</div>
                    ); })}
                  </div>
                </div>
                <div style={{ padding: "24px 16px 0" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>3. 암장 후보</div>
                  <div style={{ fontSize: 12, color: "#78756B", marginBottom: 12 }}>홈 암장 중 안 간 곳이 위에 · 안 골라도 돼요</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {homeGymCandidates.length === 0 && <div style={{ padding: 14, ...cardStyle, color: "#78756B", fontSize: 13 }}>홈 암장이 없어요. 아래에서 검색해 추가하세요.</div>}
                    {homeGymCandidates.map((g) => { const sel = pollGymIds.includes(g.id); return (
                      <div key={g.id} onClick={() => toggleGymCandidate(g.id)} style={rowStyle(sel)}>
                        <div style={boxStyle(sel)}>{sel ? "✓" : ""}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{visitLabel(g)}{g.rating ? ` · ★${g.rating}` : ""}</div></div>
                        {g.due && <div style={{ fontSize: 10, fontWeight: 700, color: "#B5730A", background: "#FBEFD9", padding: "2px 6px", borderRadius: 999, flexShrink: 0 }}>추천</div>}
                      </div>
                    ); })}
                    {selectedOtherGyms.map((g) => (
                      <div key={g.id} onClick={() => toggleGymCandidate(g.id)} style={rowStyle(true)}>
                        <div style={boxStyle(true)}>✓</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{g.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{visitLabel(g)}</div></div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", background: "#F3EEDF", borderRadius: 12 }}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6.2" stroke="#78756B" strokeWidth="1.8" /><path d="M14 14l4 4" stroke="#78756B" strokeWidth="1.8" strokeLinecap="round" /></svg>
                      <input value={gymSearch} onChange={(e) => setGymSearch(e.target.value)} placeholder="다른 암장 검색해서 추가" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15 }} />
                    </div>
                    {searchedGyms.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        {searchedGyms.slice(0, 6).map((g) => (
                          <div key={g.id} onClick={() => { toggleGymCandidate(g.id); setGymSearch(""); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", ...cardStyle, borderRadius: WOBS[3], cursor: "pointer" }}>
                            <div style={{ width: 24, height: 24, borderRadius: 999, background: "#F3EEDF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#78756B" strokeWidth="2" strokeLinecap="round" /></svg></div>
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
            <div onClick={() => tab("home")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-7v6H4a1 1 0 0 1-1-1z" stroke={tc("home")} strokeWidth="1.8" strokeLinejoin="round" /></svg><div style={{ fontSize: 12, fontWeight: 700, color: tc("home") }}>홈</div></div>
            <div onClick={() => tab("explore")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke={tc("explore")} strokeWidth="1.8" /><path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" stroke={tc("explore")} strokeWidth="1.8" strokeLinejoin="round" /></svg><div style={{ fontSize: 12, fontWeight: 700, color: tc("explore") }}>탐색</div></div>
            <div onClick={() => { if (!activeCrewId) { showToast("먼저 크루를 선택해주세요"); return; } openCreatePoll(); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", cursor: "pointer" }}><div style={{ width: 52, height: 52, borderRadius: "52% 48% 46% 54% / 50% 46% 54% 50%", background: hatch(CRAYON.red), display: "flex", alignItems: "center", justifyContent: "center", marginTop: -22, border: `2.5px solid ${INK}`, transform: "rotate(-3deg)" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 5.2 11.8 19M5.2 12.2 19 12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></svg></div><div style={{ fontSize: 12, fontWeight: 700, color: "#78756B", marginTop: 3 }}>새 투표</div></div>
            <div onClick={() => tab("calendar")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke={tc("calendar")} strokeWidth="1.8" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke={tc("calendar")} strokeWidth="1.8" strokeLinecap="round" /></svg><div style={{ fontSize: 12, fontWeight: 700, color: tc("calendar") }}>캘린더</div></div>
            <div onClick={() => tab("profile")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.6" stroke={tc("profile")} strokeWidth="1.8" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke={tc("profile")} strokeWidth="1.8" strokeLinecap="round" /></svg><div style={{ fontSize: 12, fontWeight: 700, color: tc("profile") }}>프로필</div></div>
          </div>
        )}

        {switcherOpen && (
          <>
            <div onClick={() => setSwitcherOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 4px" }}>크루 전환</div>
              <div style={{ fontSize: 12, color: "#78756B", margin: "0 4px 14px" }}>투표와 일정은 크루마다 따로 관리돼요</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {crews.map((c) => { const active = c.id === activeCrewId; return (
                  <div key={c.id} onClick={() => switchCrew(c.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: WOBS[1], cursor: "pointer", border: active ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: active ? HILITE : "#FFFEFA" }}><div style={avatarStyle(crewColor(c.id))}>{c.name[0]}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: 12, color: "#78756B", marginTop: 2 }}>{c.region || ""} · 멤버 {c._count?.members ?? 0}명</div></div>{active && <svg width="22" height="22" viewBox="0 0 22 22" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="10" fill="#E24D3A" /><path d="M6.2 11.3 9.4 14.3 15.8 7.3" stroke="#fff" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>
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
              <div style={{ fontSize: 13, color: "#78756B", margin: "0 4px 16px", lineHeight: 1.5 }}>최다 득표 날짜·암장으로 확정되고, 크루 방문 일정으로 등록돼요. 되돌릴 수 없어요.</div>
              <button onClick={closePoll} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>마감하고 확정</button>
              <button onClick={() => setCloseSheetOpen(false)} style={{ width: "100%", height: 46, marginTop: 8, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>취소</button>
            </div>
          </>
        )}
        {shareSheetOpen && (
          <>
            <div onClick={() => setShareSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 4px" }}><svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#6BBF59" /><path d="M5.5 10.2 8.5 13 14.5 6.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg><div style={{ fontSize: 17, fontWeight: 800 }}>투표를 만들었어요</div></div>
              <div style={{ fontSize: 13, color: "#78756B", margin: "0 4px 16px", lineHeight: 1.5 }}>크루원들에게 공유해서 투표를 받아보세요.</div>
              <button onClick={doShare} style={{ width: "100%", height: 52, border: `2px solid ${INK}`, borderRadius: WOBS[0], background: "#FEE500", color: "#191600", fontSize: 17, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transform: "rotate(-0.3deg)" }}><svg width="20" height="20" viewBox="0 0 20 20" fill="#191600"><path d="M10 3C5.6 3 2 5.8 2 9.3c0 2.2 1.5 4.2 3.8 5.3-.2.6-.7 2.4-.8 2.8 0 .2.1.3.3.2.2-.1 2.5-1.7 3.5-2.4.4 0 .8.1 1.2.1 4.4 0 8-2.8 8-6.3S14.4 3 10 3z" /></svg>카카오톡으로 공유</button>
              <button onClick={copyPollLink} style={{ width: "100%", height: 46, marginTop: 8, border: `2px solid ${INK}`, borderRadius: WOBS[2], background: "#FFFEFA", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>링크 복사</button>
              <button onClick={() => setShareSheetOpen(false)} style={{ width: "100%", height: 44, marginTop: 4, border: "none", background: "transparent", color: "#78756B", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>나중에</button>
            </div>
          </>
        )}
        {reviewSheetOpen && (
          <>
            <div onClick={() => setReviewSheetOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(28,28,26,0.42)", zIndex: 120, animation: "ccfade .2s ease" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 130, background: "#FFFEFA", borderTop: `2.5px solid ${INK}`, borderRadius: "28px 22px 0 0 / 24px 28px 0 0", padding: "10px 16px 30px", boxShadow: "0 -8px 30px rgba(58,54,51,0.16)", animation: "ccsheet .28s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(58,54,51,0.3)", margin: "6px auto 14px", transform: "rotate(-1deg)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, margin: "0 4px 2px" }}>리뷰 쓰기</div>
              <div style={{ fontSize: 12, color: "#78756B", margin: "0 4px 14px" }}>{sg?.name ?? ""} · 이번 셋 기준</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
                {[1, 2, 3, 4, 5].map((n) => (<div key={n} onClick={() => setReviewRating(n)} style={{ fontSize: 34, cursor: "pointer", color: n <= reviewRating ? "#E0921A" : "#C9C2B2", lineHeight: 1 }}>★</div>))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {REVIEW_TAGS.map((t, ti) => { const on = reviewTags.includes(t); return (<div key={t} onClick={() => toggleReviewTag(t)} style={{ padding: "5px 12px", borderRadius: WOBS[ti % 4], fontSize: 15, fontWeight: 700, cursor: "pointer", border: on ? `2px solid ${INK}` : "2px dashed rgba(58,54,51,0.3)", background: on ? HILITE : "#FFFEFA", color: on ? INK : "#78756B", transform: ti % 2 ? "rotate(0.6deg)" : "rotate(-0.6deg)" }}>{t}</div>); })}
              </div>
              <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="이번 셋 어땠어요? (예: 파랑 볼륨 꿀잼, 주말 저녁 붐빔)" style={{ width: "100%", height: 90, border: "2px solid #3A3633", borderRadius: 10, padding: "12px 14px", fontSize: 14, background: "#FFFDF6", outline: "none", resize: "none", lineHeight: 1.5, marginBottom: 14 }} />
              <button onClick={submitReview} style={{ width: "100%", height: 52, fontSize: 18, fontWeight: 700, ...crayonBtn(CRAYON.red, 0) }}>등록</button>
            </div>
          </>
        )}
        {!!toast && (<div style={{ position: "absolute", left: "50%", bottom: 110, transform: "translateX(-50%) rotate(-0.6deg)", background: hatch("58,54,51"), color: "#FFFDF6", fontSize: 16, fontWeight: 700, padding: "10px 20px", border: `2px solid ${INK}`, borderRadius: WOBS[1], boxShadow: "0 8px 24px rgba(58,54,51,0.25)", whiteSpace: "nowrap", animation: "cctoast .25s ease", zIndex: 100 }}>{toast}</div>)}
      </div>
    </div>
  );
}
