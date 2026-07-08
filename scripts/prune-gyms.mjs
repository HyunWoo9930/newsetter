// 이름에 특정 단어가 들어간 암장을 DB + 캐시 JSON 에서 제거.
//   node scripts/prune-gyms.mjs 몽키즈
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const term = process.argv[2];
if (!term) { console.error("사용법: node scripts/prune-gyms.mjs <이름에_포함된_단어>"); process.exit(1); }

const path = new URL("../prisma/data/gyms.seoul-gyeonggi.json", import.meta.url);
const j = JSON.parse(readFileSync(path, "utf8"));
const kept = j.filter((g) => !g.name.includes(term));
writeFileSync(path, JSON.stringify(kept, null, 2));

const prisma = new PrismaClient();
const del = await prisma.gym.deleteMany({ where: { name: { contains: term } } });
const total = await prisma.gym.count();
console.log(`'${term}' 제거 — 캐시 ${j.length}→${kept.length}, DB 삭제 ${del.count}, 총 ${total}곳`);
await prisma.$disconnect();
