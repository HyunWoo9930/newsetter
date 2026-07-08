// 서울·경기 클라이밍 암장 실데이터 수집 → Gym 테이블 적재.
// 소스: 네이버 지역검색 API (검수 없이 즉시 발급). 주소·좌표 정확.
// 인증: 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (또는 .env 에 추가).
//
//   node scripts/import-gyms-naver.mjs              # 수집 + JSON 캐시 + DB 적재
//   node scripts/import-gyms-naver.mjs --from-cache # 캐시로만 적재
//
// 지역검색은 쿼리당 최대 5개 → 구/시 × 키워드로 여러 번 돌려 모은 뒤 중복 제거.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;
const CACHE = new URL("../prisma/data/gyms.seoul-gyeonggi.json", import.meta.url);
const prisma = new PrismaClient();

const SEOUL = "강남 강동 강북 강서 관악 광진 구로 금천 노원 도봉 동대문 동작 마포 서대문 서초 성동 성북 송파 양천 영등포 용산 은평 종로 중구 중랑".split(" ").map((g) => `서울 ${g}`);
const GYEONGGI = "수원 성남 분당 용인 수지 기흥 고양 일산 부천 안양 안산 남양주 화성 동탄 평택 의정부 시흥 파주 김포 광명 광주시 군포 이천 오산 하남 양주 구리 안성 의왕 과천 위례".split(" ").map((g) => `경기 ${g}`);
const REGIONS = [...SEOUL, ...GYEONGGI];
const KEYWORDS = ["클라이밍", "볼더링", "클라이밍짐"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
const isClimbing = (t) => /클라이밍|볼더|암벽/.test(t);
const inTarget = (addr) => /^(서울|경기)/.test(addr || "");

async function naverLocal(query) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=comment`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
  if (res.status === 429) { await sleep(800); return naverLocal(query); }
  if (!res.ok) throw new Error(`Naver ${res.status} for "${query}": ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

// mapx/mapy = WGS84 경/위도 × 10^7 → 나눠서 좌표. 범위 벗어나면 null.
function coords(item) {
  const lng = item.mapx ? parseInt(item.mapx, 10) / 1e7 : null;
  const lat = item.mapy ? parseInt(item.mapy, 10) / 1e7 : null;
  const ok = lat && lng && lat > 33 && lat < 39 && lng > 124 && lng < 132;
  return ok ? { lat, lng } : { lat: null, lng: null };
}

async function collect() {
  if (!ID || !SECRET) throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 가 없어요 (환경변수 또는 .env).");
  const byKey = new Map();
  let reqs = 0;
  for (const region of REGIONS) {
    for (const kw of KEYWORDS) {
      const data = await naverLocal(`${region} ${kw}`);
      reqs++;
      for (const it of data.items || []) {
        const name = strip(it.title);
        const addr = it.roadAddress || it.address;
        if (!isClimbing(`${name} ${it.category}`) || !inTarget(addr)) continue;
        const key = `naver:${name}|${it.roadAddress || it.address}`;
        if (!byKey.has(key)) {
          const { lat, lng } = coords(it);
          byKey.set(key, { kakaoPlaceId: key, name, address: addr, lat, lng, phone: it.telephone || null, link: it.link || null });
        }
      }
      await sleep(110);
    }
    process.stdout.write(`\r수집 중… ${region.padEnd(10)} | 누적 ${byKey.size}곳 (요청 ${reqs})   `);
  }
  console.log("");
  const gyms = [...byKey.values()].sort((a, b) => (a.address || "").localeCompare(b.address || "", "ko"));
  mkdirSync(new URL("../prisma/data/", import.meta.url), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(gyms, null, 2));
  console.log(`캐시 저장: prisma/data/gyms.seoul-gyeonggi.json (${gyms.length}곳)`);
  return gyms;
}

async function upsertAll(gyms) {
  let created = 0, updated = 0, linked = 0;
  for (const g of gyms) {
    const data = { name: g.name, address: g.address, lat: g.lat, lng: g.lng, phone: g.phone };
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
  const withCoord = gyms.filter((g) => g.lat).length;
  const r = await upsertAll(gyms);
  const total = await prisma.gym.count();
  console.log(`\n적재 완료 — 신규 ${r.created} · 갱신 ${r.updated} · 시드연결 ${r.linked}`);
  console.log(`수집 ${gyms.length}곳 중 좌표 있음 ${withCoord}`);
  console.log(`Gym 테이블 총 ${total}곳`);
  console.log("샘플:");
  for (const g of gyms.slice(0, 10)) console.log(`  · ${g.name} — ${g.address || "(주소 미상)"}`);
}

main().catch((e) => { console.error("\n실패:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
