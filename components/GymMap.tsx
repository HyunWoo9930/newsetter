"use client";
import { useEffect, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export type MapGym = { id: string; name: string; lat: number | null; lng: number | null; due: boolean; color: string };

const CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
const INK = "#2B2825";
// 색은 브랜드(프랜차이즈) 기준으로 부모에서 지정 → 같은 체인끼리 같은 색
const hatch = (rgb: string) => `repeating-linear-gradient(48deg, rgba(${rgb},0.95) 0 3px, rgba(${rgb},0.7) 3px 5px, rgba(${rgb},0.9) 5px 7px)`;

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as Any).naver?.maps) return Promise.resolve();
  if (!CLIENT_ID) return Promise.reject(new Error("no client id"));
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { sdkPromise = null; reject(new Error("sdk load fail")); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

function iconHtml(g: MapGym, selected: boolean) {
  const rgb = g.color;
  const sz = selected ? 40 : 28;
  const blob = `<div style="width:${sz}px;height:${sz}px;border:${selected ? 3 : 2}px solid ${INK};border-radius:60% 45% 55% 50% / 50% 60% 45% 58%;background:${hatch(rgb)};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${selected ? 20 : 14}px;font-family:Gaegu,sans-serif;transform:rotate(-4deg)">${g.name[0] ?? "?"}</div>`;
  const due = g.due ? `<div style="position:absolute;top:-3px;right:-3px;width:12px;height:12px;border-radius:50%;background:#E24D3A;border:2px solid #FFFDF6"></div>` : "";
  const label = selected ? `<div style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:3px;white-space:nowrap;background:#FFFDF6;border:2px solid ${INK};border-radius:12px 6px 12px 6px;padding:1px 8px;font-size:13px;font-weight:700;font-family:Gaegu,sans-serif;color:${INK}">${g.name}</div>` : "";
  return `<div style="position:relative;cursor:pointer;filter:drop-shadow(0 2px 2px rgba(58,54,51,.3))">${label}<div style="position:relative">${blob}${due}</div><div style="width:2px;height:7px;background:${INK};margin:-1px auto 0"></div></div>`;
}
function makeIcon(naver: Any, g: MapGym, selected: boolean) {
  const sz = selected ? 40 : 28;
  return { content: iconHtml(g, selected), anchor: new naver.maps.Point(sz / 2 + (selected ? 3 : 2), sz + 7) };
}

export default function GymMap({ gyms, selectedId, onSelect }: { gyms: MapGym[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Any>(null);
  const byId = useRef<Map<string, { marker: Any; gym: MapGym }>>(new Map());
  const prevSel = useRef<string | null>(null);

  // 마커 (gyms 바뀔 때만 재구성)
  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    let cancelled = false;
    loadSdk().then(() => {
      if (cancelled || !ref.current) return;
      const naver = (window as Any).naver;
      if (!naver?.maps) return;
      if (!mapRef.current) {
        mapRef.current = new naver.maps.Map(ref.current, { center: new naver.maps.LatLng(37.5665, 126.978), zoom: 12, scaleControl: false, mapDataControl: false, logoControl: true });
        naver.maps.Event.addListener(mapRef.current, "click", () => onSelect(""));
      }
      const map = mapRef.current;
      byId.current.forEach((e) => e.marker.setMap(null));
      byId.current.clear();
      const pts = gyms.filter((g) => g.lat != null && g.lng != null);
      const bounds = new naver.maps.LatLngBounds();
      for (const g of pts) {
        const pos = new naver.maps.LatLng(g.lat, g.lng);
        const marker = new naver.maps.Marker({ position: pos, map, title: g.name, icon: makeIcon(naver, g, g.id === selectedId) });
        naver.maps.Event.addListener(marker, "click", () => onSelect(g.id));
        byId.current.set(g.id, { marker, gym: g });
        bounds.extend(pos);
      }
      prevSel.current = selectedId;
      // 검색 등으로 후보가 적으면 그 범위로 맞춤, 많으면 서울 기본 뷰
      if (pts.length && pts.length <= 25) map.fitBounds(bounds, { top: 60, right: 50, bottom: 180, left: 50 });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [gyms]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택 변경 시 해당 마커 2개만 갱신 (188개 재구성 안 함)
  useEffect(() => {
    const naver = (window as Any).naver;
    if (!naver?.maps) return;
    const update = (id: string | null, sel: boolean) => {
      if (!id) return;
      const e = byId.current.get(id);
      if (e) { e.marker.setIcon(makeIcon(naver, e.gym, sel)); e.marker.setZIndex(sel ? 1000 : 1); }
    };
    if (prevSel.current && prevSel.current !== selectedId) update(prevSel.current, false);
    update(selectedId, true);
    if (selectedId) { const e = byId.current.get(selectedId); if (e && mapRef.current) mapRef.current.panTo(e.marker.getPosition()); }
    prevSel.current = selectedId;
  }, [selectedId]);

  const locate = () => {
    const naver = (window as Any).naver;
    if (!naver?.maps || !navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((p) => {
      mapRef.current.setCenter(new naver.maps.LatLng(p.coords.latitude, p.coords.longitude));
      mapRef.current.setZoom(14);
    });
  };

  if (!CLIENT_ID) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 24, textAlign: "center", color: "#6E675C", fontSize: 15 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🗺️</div>
        지도 키가 아직 없어요.<br />NCP Maps Client ID 를 <code>.env</code> 의 <code>NEXT_PUBLIC_NAVER_MAP_CLIENT_ID</code> 에 넣어주세요.
      </div>
    );
  }
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
      <button onClick={locate} aria-label="내 위치" style={{ position: "absolute", right: 14, top: 14, width: 44, height: 44, borderRadius: "56% 44% 52% 48% / 48% 52% 44% 56%", border: `2px solid ${INK}`, background: "#FFFDF6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(58,54,51,.25)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke={INK} strokeWidth="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={INK} strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
