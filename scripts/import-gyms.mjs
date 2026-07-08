// 서울·경기 클라이밍 암장 실데이터 수집 → Gym 테이블 적재.
// 소스: 카카오 로컬 API(키워드 검색). 인증 = .env 의 REST 키(KAKAO_CLIENT_ID).
//
//   node scripts/import-gyms.mjs                # 카카오에서 새로 수집 + JSON 캐시 + DB 적재
//   node scripts/import-gyms.mjs --from-cache   # 캐시 JSON 으로만 DB 적재(재수집 안 함)
//
// 이름/주소/좌표/전화는 자동. 인스타·뉴셋 주기는 API 에 없어 수동 보정(기본 4주).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// --- .env 수동 로드(순수 node 실행이라 자동 로드 안 됨) ---
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KAKAO_KEY = process.env.KAKAO_CLIENT_ID;
const CACHE = new URL("../prisma/data/gyms.seoul-gyeonggi.json", import.meta.url);
const prisma = new PrismaClient();

// 서울 25개 구 + 경기 주요 시/구
const SEOUL = "강남 강동 강북 강서 관악 광진 구로 금천 노원 도봉 동대문 동작 마포 서대문 서초 성동 성북 송파 양천 영등포 용산 은평 종로 중구 중랑".split(" ").map((g) => `서울 ${g}`);
const GYEONGGI = "수원 성남 분당 용인 수지 기흥 고양 일산 부천 안양 안산 남양주 화성 동탄 평택 의정부 시흥 파주 김포 광명 광주시 군포 이천 오산 하남 양주 구리 안성 의왕 과천 위례".split(" ").map((g) => `경기 ${g}`);
const REGIONS = [...SEOUL, ...GYEONGGI];
const KEYWORDS = ["클라이밍", "볼더링"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function kakaoSearch(query, page) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=15&page=${page}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  if (res.status === 429) { await sleep(1000); return kakaoSearch(query, page); }
  if (!res.ok) throw new Error(`Kakao ${res.status} for "${query}": ${await res.text()}`);
  return res.json();
}

// 클라이밍장으로 볼 만한지(오탐 제거): 이름/카테고리에 클라이밍 관련어가 있어야
const isClimbing = (d) => /클라이밍|볼더|clim/i.test(`${d.place_name} ${d.category_name}`);
const inTarget = (addr) => /^(서울|경기)/.test(addr || "");

async function collect() {
  if (!KAKAO_KEY) throw new Error(".env 에 KAKAO_CLIENT_ID(REST 키)가 없어요.");
  const byId = new Map();
  let reqs = 0;
  for (const region of REGIONS) {
    for (const kw of KEYWORDS) {
      for (let page = 1; page <= 3; page++) {
        const data = await kakaoSearch(`${region} ${kw}`, page);
        reqs++;
        for (const d of data.documents) {
          const addr = d.road_address_name || d.address_name;
          if (!isClimbing(d) || !inTarget(addr)) continue;
          if (!byId.has(d.id)) byId.set(d.id, {
            kakaoPlaceId: d.id,
            name: d.place_name.trim(),
            address: addr,
            lat: d.y ? parseFloat(d.y) : null,
            lng: d.x ? parseFloat(d.x) : null,
            phone: d.phone || null,
            placeUrl: d.place_url || null,
          });
        }
        if (data.meta.is_end) break;
        await sleep(120);
      }
    }
    process.stdout.write(`\r수집 중… ${region.padEnd(10)} | 누적 ${byId.size}곳 (요청 ${reqs})   `);
  }
  console.log("");
  const gyms = [...byId.values()].sort((a, b) => a.address.localeCompare(b.address, "ko"));
  mkdirSync(new URL("../prisma/data/", import.meta.url), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(gyms, null, 2));
  console.log(`캐시 저장: prisma/data/gyms.seoul-gyeonggi.json (${gyms.length}곳)`);
  return gyms;
}

async function upsertAll(gyms) {
  let created = 0, updated = 0, linked = 0;
  for (const g of gyms) {
    const data = { name: g.name, address: g.address, lat: g.lat, lng: g.lng, phone: g.phone };
    const existingById = await prisma.gym.findUnique({ where: { kakaoPlaceId: g.kakaoPlaceId } });
    if (existingById) { await prisma.gym.update({ where: { id: existingById.id }, data }); updated++; continue; }
    // 기존 시드 데이터(카카오 id 없음)와 이름이 겹치면 그 레코드에 붙임(중복 방지)
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
  const r = await upsertAll(gyms);
  const total = await prisma.gym.count();
  console.log(`\n적재 완료 — 신규 ${r.created} · 갱신 ${r.updated} · 시드연결 ${r.linked}`);
  console.log(`Gym 테이블 총 ${total}곳`);
  console.log("샘플:");
  for (const g of gyms.slice(0, 8)) console.log(`  · ${g.name} — ${g.address}`);
}

main().catch((e) => { console.error("\n실패:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
