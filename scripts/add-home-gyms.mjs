// 볼더핏 크루에 홈 암장 4곳 설정 (테스트용). node scripts/add-home-gyms.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const crew = await prisma.crew.findFirst({ where: { name: "볼더핏 크루" } });
if (!crew) { console.log("크루 없음"); process.exit(0); }

const names = ["더클라임 강남", "클라이밍파크 성수", "피크 클라이밍 잠실", "락트리 건대"];
const gyms = await prisma.gym.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });

await prisma.crewHomeGym.deleteMany({ where: { crewId: crew.id } });
for (const g of gyms) await prisma.crewHomeGym.create({ data: { crewId: crew.id, gymId: g.id } });

console.log("홈 암장 설정:", gyms.map((g) => g.name).join(", "));
await prisma.$disconnect();
