import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 개발용 유저 (DEV_USER_ID 로 .env 에 넣어 로그인 없이 API 테스트)
  const dev = await prisma.user.upsert({
    where: { kakaoId: "dev-local" },
    update: {},
    create: { kakaoId: "dev-local", nickname: "지훈(개발)" },
  });
  console.log("DEV_USER_ID =", dev.id);

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const gymSeed = [
    { name: "클라이밍파크 강남", address: "서울 강남구", instagram: "https://instagram.com/", setAgo: 3 },
    { name: "더클라임 사당", address: "서울 동작구", instagram: "https://instagram.com/", setAgo: 2 },
    { name: "피커스 홍대", address: "서울 마포구", instagram: "https://instagram.com/", setAgo: 5 },
  ];

  for (const g of gymSeed) {
    const gym = await prisma.gym.create({
      data: {
        name: g.name,
        address: g.address,
        instagram: g.instagram,
        resetCycleWeeks: 4,
        settings: { create: { setDate: daysAgo(g.setAgo), reportedById: dev.id } },
      },
    });
    console.log("gym:", gym.name);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
