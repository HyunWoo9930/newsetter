// 서울·경기 클라이밍 암장 실데이터 수집 → Gym 테이블 적재.
// 소스: OpenStreetMap Overpass API (무료·무키·무심사). sport=climbing 장소.
//
//   node scripts/import-gyms-osm.mjs              # Overpass 수집 + JSON 캐시 + DB 적재
//   node scripts/import-gyms-osm.mjs --from-cache # 캐시로만 적재
//
// 이름/좌표는 대부분 확보. 주소/전화/인스타는 OSM 태그에 있을 때만(있는 곳만). 뉴셋 주기 기본 4주.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// .env 수동 로드(DATABASE_URL 용)
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const CACHE = new URL("../prisma/data/gyms.seoul-gyeonggi.json", import.meta.url);
const prisma = new PrismaClient();

const QUERY = `
[out:json][timeout:120];
area["name"="서울특별시"]["boundary"="administrative"]->.seoul;
area["name"="경기도"]["boundary"="administrative"]->.gg;
(
  nwr["sport"="climbing"](area.seoul);
  nwr["sport"="climbing"](area.gg);
  nwr["leisure"="sports_centre"]["name"~"클라이밍|볼더|클라밍"](area.seoul);
  nwr["leisure"="sports_centre"]["name"~"클라이밍|볼더|클라밍"](area.gg);
);
out center tags;
`;
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function buildAddr(t) {
  if (t["addr:full"]) return t["addr:full"];
  const parts = [t["addr:province"] || t["addr:city"], t["addr:district"] || t["addr:borough"], t["addr:subdistrict"] || t["addr:neighbourhood"], t["addr:street"], t["addr:housenumber"]].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
function igOf(t) {
  const v = t["contact:instagram"] || t["instagram"];
  if (!v) return null;
  return v.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "")}`;
}

async function overpass() {
  let lastErr;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "newsetter-gym-import/1.0" }, body: "data=" + encodeURIComponent(QUERY) });
      if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 120)}`);
      return res.json();
    } catch (e) { lastErr = e; console.log(`  (${ep} 실패, 다음 엔드포인트 시도) ${e.message}`); }
  }
  throw lastErr;
}

async function collect() {
  console.log("Overpass 로 서울·경기 클라이밍 장소 조회 중…");
  const data = await overpass();
  const byId = new Map();
  for (const el of data.elements) {
    const t = el.tags || {};
    const name = (t["name:ko"] || t.name || "").trim();
    if (!name) continue; // 이름 없는 건 제외
    const lat = el.lat ?? el.center?.lat ?? null;
    const lng = el.lon ?? el.center?.lon ?? null;
    const key = `osm:${el.type}/${el.id}`;
    byId.set(key, {
      kakaoPlaceId: key,
      name,
      address: buildAddr(t),
      lat, lng,
      phone: t.phone || t["contact:phone"] || null,
      instagram: igOf(t),
      website: t.website || t["contact:website"] || null,
    });
  }
  const gyms = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  mkdirSync(new URL("../prisma/data/", import.meta.url), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(gyms, null, 2));
  console.log(`캐시 저장: prisma/data/gyms.seoul-gyeonggi.json (${gyms.length}곳)`);
  return gyms;
}

async function upsertAll(gyms) {
  let created = 0, updated = 0, linked = 0;
  for (const g of gyms) {
    const data = { name: g.name, address: g.address, lat: g.lat, lng: g.lng, phone: g.phone, instagram: g.instagram };
    const byId = await prisma.gym.findUnique({ where: { kakaoPlaceId: g.kakaoPlaceId } });
    if (byId) { await prisma.gym.update({ where: { id: byId.id }, data }); updated++; continue; }
    const byName = await prisma.gym.findFirst({ where: { name: g.name, kakaoPlaceId: null } });
    if (byName) { await prisma.gym.update({ where: { id: byName.id }, data: { ...data, kakaoPlaceId: g.kakaoPlaceId } }); linked++; continue; }
    await prisma.gym.create({ data: { ...data, kakaoPlaceId: g.kakaoPlaceId } });
    created++;
  }
  return { created, updated, linked };
}

async function main() {
  const fromCache = process.argv.includes("--from-cache");
  let gyms;
  if (fromCache) {
    if (!existsSync(CACHE)) throw new Error("캐시가 없어요. --from-cache 없이 먼저 수집하세요.");
    gyms = JSON.parse(readFileSync(CACHE, "utf8"));
    console.log(`캐시 로드: ${gyms.length}곳`);
  } else {
    gyms = await collect();
  }
  const withAddr = gyms.filter((g) => g.address).length;
  const withIg = gyms.filter((g) => g.instagram).length;
  const r = await upsertAll(gyms);
  const total = await prisma.gym.count();
  console.log(`\n적재 완료 — 신규 ${r.created} · 갱신 ${r.updated} · 시드연결 ${r.linked}`);
  console.log(`수집 ${gyms.length}곳 중 주소 있음 ${withAddr} · 인스타 있음 ${withIg}`);
  console.log(`Gym 테이블 총 ${total}곳`);
  console.log("샘플:");
  for (const g of gyms.slice(0, 10)) console.log(`  · ${g.name}${g.address ? " — " + g.address : " (주소 미상)"}`);
}

main().catch((e) => { console.error("\n실패:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
