// 특정 카카오 유저 + 그가 만든 (혼자뿐인) 테스트 크루 삭제. node scripts/delete-kakao-user.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const KAKAO_ID = "4980831438"; // 지울 대상 (오현우)

const u = await prisma.user.findUnique({
  where: { kakaoId: KAKAO_ID },
  include: { ledCrews: { include: { _count: { select: { members: true, polls: true, visits: true } } } } },
});

if (!u) { console.log("대상 유저 없음 (이미 삭제됨)"); await prisma.$disconnect(); process.exit(0); }
console.log(`대상 유저: ${u.nickname} (${u.id}) kakaoId=${u.kakaoId}`);

// 안전장치: 그가 만든 크루가 '혼자만 있고 활동 없는' 테스트 크루인지 확인
const unsafe = u.ledCrews.filter((c) => c._count.members > 1 || c._count.polls > 0 || c._count.visits > 0);
if (unsafe.length) {
  console.log("⚠️ 중단: 아래 크루는 다른 멤버/활동이 있어 자동 삭제하지 않음:");
  for (const c of unsafe) console.log(`   - ${c.name} (members=${c._count.members}, polls=${c._count.polls}, visits=${c._count.visits})`);
  await prisma.$disconnect();
  process.exit(1);
}

for (const c of u.ledCrews) {
  console.log(`  크루 삭제: ${c.name} (혼자, 활동없음)`);
  await prisma.crew.delete({ where: { id: c.id } });
}
await prisma.user.delete({ where: { id: u.id } });
console.log("✅ 유저 + 테스트 크루 삭제 완료");
await prisma.$disconnect();
