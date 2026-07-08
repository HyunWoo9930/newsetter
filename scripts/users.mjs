// 유저 목록 확인 (관리용). node scripts/users.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const users = await prisma.user.findMany({
  orderBy: { createdAt: "asc" },
  include: { _count: { select: { memberships: true, climbLogs: true, reviews: true, ledCrews: true, createdPolls: true } } },
});

for (const u of users) {
  console.log(
    `${u.id} | kakaoId=${u.kakaoId} | nick=${u.nickname} | created=${u.createdAt.toISOString()} | ` +
    `crews=${u._count.memberships} led=${u._count.ledCrews} logs=${u._count.climbLogs} reviews=${u._count.reviews} polls=${u._count.createdPolls}`
  );
}
console.log(`\n총 ${users.length}명`);
await prisma.$disconnect();
