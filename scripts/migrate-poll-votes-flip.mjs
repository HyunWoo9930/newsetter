// 1회성: 기존 PollDateVote 의미를 "가능"→"불가"로 뒤집는다.
// 각 (투표, 유저)에 대해 기존 표(=가능한 날)를 여집합(=안 되는 날)으로 교체.
// ⚠️ 정확히 한 번만 실행할 것. 두 번 돌리면 원상복귀됨.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const polls = await prisma.poll.findMany({
    include: {
      dateOptions: { select: { id: true } },
      dateVotes: { select: { userId: true, dateOptionId: true } },
    },
  });

  let flippedUsers = 0;
  for (const poll of polls) {
    const optionIds = poll.dateOptions.map((o) => o.id);
    // 유저별 기존(가능) 표 집합
    const byUser = new Map();
    for (const v of poll.dateVotes) {
      if (!byUser.has(v.userId)) byUser.set(v.userId, new Set());
      byUser.get(v.userId).add(v.dateOptionId);
    }
    for (const [userId, votedSet] of byUser) {
      const complement = optionIds.filter((id) => !votedSet.has(id)); // 안 되는 날
      await prisma.$transaction([
        prisma.pollDateVote.deleteMany({ where: { pollId: poll.id, userId } }),
        prisma.pollDateVote.createMany({
          data: complement.map((dateOptionId) => ({ pollId: poll.id, userId, dateOptionId })),
        }),
      ]);
      flippedUsers++;
      console.log(`  poll ${poll.title}: user ${userId} — 가능 ${votedSet.size} → 불가 ${complement.length}`);
    }
  }
  console.log(`\n완료: ${polls.length}개 투표, ${flippedUsers}명 응답 뒤집음.`);
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
