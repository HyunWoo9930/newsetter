// 개발용 시드 (node prisma/seed.mjs). tsx/esbuild 없이 순수 node 로 실행.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const day = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * day);

async function reset() {
  // child → parent 순서로 정리 (dev 전용, 반복 실행 안전)
  await prisma.climbLog.deleteMany();
  await prisma.problem.deleteMany();
  await prisma.colorGradeVote.deleteMany();
  await prisma.pollGymVote.deleteMany();
  await prisma.pollDateVote.deleteMany();
  await prisma.pollGymOption.deleteMany();
  await prisma.pollDateOption.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.review.deleteMany();
  await prisma.visit.deleteMany();
  await prisma.gymSetting.deleteMany();
  await prisma.crewMember.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.gymFavorite.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.crewHomeGym.deleteMany();
  await prisma.crew.deleteMany();
  await prisma.gym.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await reset();

  // ── 유저 ──
  const dev = await prisma.user.create({
    data: { id: "devuser", kakaoId: "dev-local", nickname: "김도현", referenceColor: "파랑", referenceGrade: 3 },
  });
  const [seoyeon, junho, yujin, minseok, jiwoo, sehun] = await Promise.all(
    ["이서연", "박준호", "최유진", "정민석", "한지우", "오세훈"].map((nickname, i) =>
      prisma.user.create({ data: { kakaoId: "u" + i, nickname } })
    )
  );

  // ── 암장 + 세팅 회차 ──
  const gymSpec = [
    { name: "더클라임 강남", address: "강남구 역삼동", instagram: "https://instagram.com/theclimb_gangnam", setAgo: 3 },
    { name: "클라이밍파크 성수", address: "성동구 성수동", instagram: "https://instagram.com/", setAgo: 12 },
    { name: "피크 클라이밍 잠실", address: "송파구 잠실동", instagram: "https://instagram.com/", setAgo: 2 },
    { name: "스톤에이지 홍대", address: "마포구 서교동", instagram: "https://instagram.com/", setAgo: 21 },
    { name: "락트리 건대", address: "광진구 화양동", instagram: "https://instagram.com/", setAgo: 5 },
  ];
  const gyms = {};
  for (const g of gymSpec) {
    const gym = await prisma.gym.create({
      data: {
        name: g.name, address: g.address, instagram: g.instagram, resetCycleWeeks: 4,
        settings: { create: { setDate: daysAgo(g.setAgo), reportedById: dev.id } },
      },
      include: { settings: true },
    });
    gyms[g.name] = { gym, setting: gym.settings[0] };
  }

  // ── 크루 ──
  const crew = await prisma.crew.create({
    data: {
      name: "볼더핏 크루", description: "주말마다 볼더링 치는 크루예요", region: "서울 성수 · 강남",
      inviteCode: "CLIMB-8H2K", leaderId: dev.id,
      members: {
        create: [
          { userId: dev.id, role: "LEADER", status: "APPROVED", joinedVia: "INVITE_LINK" },
          { userId: seoyeon.id, role: "MEMBER", status: "APPROVED", joinedVia: "INVITE_LINK" },
          { userId: junho.id, role: "MEMBER", status: "APPROVED", joinedVia: "INVITE_LINK" },
          { userId: yujin.id, role: "MEMBER", status: "APPROVED", joinedVia: "INVITE_LINK" },
          { userId: minseok.id, role: "MEMBER", status: "APPROVED", joinedVia: "INVITE_LINK" },
          { userId: jiwoo.id, role: "MEMBER", status: "PENDING", joinedVia: "REQUEST" },
          { userId: sehun.id, role: "MEMBER", status: "PENDING", joinedVia: "REQUEST" },
        ],
      },
    },
  });
  await prisma.user.update({ where: { id: dev.id }, data: { homeGymId: gyms["더클라임 강남"].gym.id } });

  // 크루 홈 암장 4곳 (스톤에이지 홍대는 제외 — 검색 추가 테스트용)
  await prisma.crewHomeGym.createMany({
    data: ["더클라임 강남", "클라이밍파크 성수", "피크 클라이밍 잠실", "락트리 건대"].map((n) => ({ crewId: crew.id, gymId: gyms[n].gym.id })),
  });

  // ── 방문 기록 (캘린더) ──
  const hongdae = gyms["스톤에이지 홍대"];
  const jamsil = gyms["피크 클라이밍 잠실"];
  await prisma.visit.createMany({
    data: [
      { crewId: crew.id, gymId: hongdae.gym.id, gymSettingId: hongdae.setting.id, date: daysAgo(4), source: "MANUAL" },
      { crewId: crew.id, gymId: jamsil.gym.id, gymSettingId: jamsil.setting.id, date: daysAgo(6), source: "MANUAL" },
    ],
  });

  // ── 문제 (더클라임 강남 이번 셋) ──
  const gangnam = gyms["더클라임 강남"];
  const probSpec = [
    { color: "노랑", tag: "슬랩", feel: "EASIER", sent: [dev, seoyeon, junho] },
    { color: "노랑", tag: "버티컬", feel: "EASIER", sent: [dev, seoyeon] },
    { color: "초록", tag: "볼륨", feel: "AS_EXPECTED", honey: true, sent: [dev, junho] },
    { color: "초록", tag: "슬랩", feel: "AS_EXPECTED", sent: [dev] },
    { color: "파랑", tag: "크림프", feel: "AS_EXPECTED", sent: [dev, seoyeon] },
    { color: "파랑", tag: "다이노", feel: "HARDER", honey: true, sent: [junho] },
    { color: "파랑", tag: "오버행", feel: "HARDER", sent: [junho] },
    { color: "빨강", tag: "컴프레션", feel: "HARDER", sent: [] },
    { color: "빨강", tag: "슬로퍼", feel: "HARDER", honey: true, sent: [] },
    { color: "검정", tag: "토우훅", feel: "HARDER", sent: [] },
  ];
  for (const p of probSpec) {
    const problem = await prisma.problem.create({
      data: { gymSettingId: gangnam.setting.id, color: p.color, label: `${p.color} · ${p.tag}`, createdById: dev.id },
    });
    // 완등 로그 (난이도 신호)
    const allMembers = [dev, seoyeon, junho, yujin];
    for (const u of allMembers) {
      const didSend = p.sent.some((x) => x.id === u.id);
      // 완등 안 한 사람 중 일부만 시도 기록 남김
      if (!didSend && u.id !== dev.id && Math.abs((p.color + p.tag + u.nickname).length % 2) === 0) continue;
      await prisma.climbLog.create({
        data: {
          problemId: problem.id, userId: u.id, sent: didSend, relativeFeel: p.feel,
          honey: !!p.honey && didSend, content: didSend && u.id === junho.id ? "첫 홀드 언더로 잡고 힙 넣기" : null,
          videoUrl: didSend && p.sent[0]?.id === u.id ? "https://youtube.com/watch?v=demo" : null,
        },
      });
    }
  }

  // ── 색→공통척도(vGrade) 투표: 더클라임 강남 ──
  const colorV = { 노랑: 1, 초록: 2, 파랑: 3, 빨강: 5, 검정: 7 };
  for (const [color, vGrade] of Object.entries(colorV)) {
    for (const u of [dev, seoyeon, junho]) {
      await prisma.colorGradeVote.create({ data: { gymId: gangnam.gym.id, color, userId: u.id, vGrade } });
    }
  }

  // ── 리뷰 ──
  await prisma.review.createMany({
    data: [
      { userId: seoyeon.id, gymId: gangnam.gym.id, gymSettingId: gangnam.setting.id, rating: 4, tags: ["세팅좋음", "초보친화"], content: "파랑 볼륨이 많아졌어요. 슬랩 위주라 초급자도 재밌게 칠 만합니다.", crewId: crew.id },
      { userId: junho.id, gymId: gangnam.gym.id, gymSettingId: gangnam.setting.id, rating: 5, tags: ["다이노"], content: "빨강 다이노 하나가 정말 시원합니다. 전반적으로 강도는 적당해요.", crewId: crew.id },
    ],
  });

  // ── 투표 ──
  await prisma.poll.create({
    data: {
      crewId: crew.id, creatorId: dev.id, title: "다음 세션 언제 · 어디?", deadline: daysAgo(-2), status: "OPEN",
      dateOptions: {
        create: [
          { date: daysAgo(-3), label: "토 오후" },
          { date: daysAgo(-4), label: "일 오전" },
          { date: daysAgo(-10), label: "토 오후" },
        ],
      },
      gymOptions: { create: [{ gymId: gangnam.gym.id }, { gymId: gyms["클라이밍파크 성수"].gym.id }, { gymId: gyms["락트리 건대"].gym.id }] },
    },
  });

  console.log("✅ seed done. DEV_USER_ID =", dev.id, "(.env 에 이미 설정)");
  console.log("   crew inviteCode = CLIMB-8H2K, gyms:", Object.keys(gyms).length, "problems: 10");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
