// 일회성: When2meet 데모용 투표 응답 시딩 + 잡음 투표 정리
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const POLL = "cmrbbqob1003uv7a4icn7wesm"; // "다음 세션 언제 · 어디?"
const U = {
  seoyeon: "cmrbbqo440000v7a4pcxape8m", // 이서연
  junho: "cmrbbqo6f0002v7a489wlwpmf",   // 박준호
  yujin: "cmrbbqo770003v7a4p85mhrc9",   // 최유진
  minseok: "cmrbbqo5f0001v7a4n68vv1i6", // 정민석
};
const D = { toAft: "cmrbbqob1003vv7a42pl315vy", suMorn: "cmrbbqob1003wv7a4qme2bx6u", toAft2: "cmrbbqob1003xv7a46xsf4fxf" };
const G = { climb: "cmrbbqob2003zv7a4t8dvezv7", park: "cmrbbqob20040v7a4tgsfqwyo", rock: "cmrbbqob20041v7a48lydnb73" };

async function dateVote(userId, dateOptionId) {
  await prisma.pollDateVote.upsert({
    where: { pollId_userId_dateOptionId: { pollId: POLL, userId, dateOptionId } },
    create: { pollId: POLL, userId, dateOptionId },
    update: {},
  }).catch(async () => { await prisma.pollDateVote.create({ data: { pollId: POLL, userId, dateOptionId } }); });
}
async function gymVote(userId, gymOptionId) {
  await prisma.pollGymVote.upsert({
    where: { pollId_userId_gymOptionId: { pollId: POLL, userId, gymOptionId } },
    create: { pollId: POLL, userId, gymOptionId },
    update: {},
  }).catch(async () => { await prisma.pollGymVote.create({ data: { pollId: POLL, userId, gymOptionId } }); });
}

async function main() {
  // 날짜: 토 오후에 3명, 일 오전에 2명
  await dateVote(U.seoyeon, D.toAft);
  await dateVote(U.junho, D.toAft);
  await dateVote(U.yujin, D.toAft);
  await dateVote(U.seoyeon, D.suMorn);
  await dateVote(U.minseok, D.suMorn);

  // 암장: 락트리 3명, 더클라임 1명, 클라이밍파크 0명 → 정렬 확인용
  await gymVote(U.seoyeon, G.rock);
  await gymVote(U.junho, G.rock);
  await gymVote(U.yujin, G.rock);
  await gymVote(U.minseok, G.climb);

  // 데모가 이 투표에서 보이도록, 앞에 있던 잡음 OPEN 투표들 CLOSED 처리
  const junk = ["cmrbjk5qa0006v7f0yaa3cv4a", "cmrbjcbll0001v7f01vh432gv", "cmrbfmzhe0001v7oo5yi7dlrl", "cmrbexiy7000jv7dk1xqm34ly"];
  await prisma.poll.updateMany({ where: { id: { in: junk } }, data: { status: "CLOSED" } });

  const d = await prisma.pollDateOption.findMany({ where: { pollId: POLL }, include: { _count: { select: { votes: true } } } });
  const g = await prisma.pollGymOption.findMany({ where: { pollId: POLL }, include: { gym: true, _count: { select: { votes: true } } } });
  console.log("dates:", d.map((x) => `${x.label}=${x._count.votes}`).join(", "));
  console.log("gyms:", g.map((x) => `${x.gym.name}=${x._count.votes}`).join(", "));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
