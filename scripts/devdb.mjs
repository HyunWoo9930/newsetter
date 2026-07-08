// 로컬 개발용 임베디드 Postgres 실행기 (Docker 불필요).
// node scripts/devdb.mjs 로 띄우면 localhost:5432 에 climbcrew DB 가 뜬다.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dir = "./.devdb";
const fresh = !existsSync(dir);

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "climbcrew",
  password: "climbcrew",
  port: 5432,
  persistent: true,
});

if (fresh) {
  console.log("[devdb] initialising cluster (first run)...");
  await pg.initialise();
}

console.log("[devdb] starting postgres on :5432 ...");
await pg.start();

try {
  await pg.createDatabase("climbcrew");
  console.log("[devdb] database 'climbcrew' created");
} catch {
  console.log("[devdb] database 'climbcrew' already exists (ok)");
}

console.log("[devdb] READY — postgresql://climbcrew:climbcrew@localhost:5432/climbcrew");

const stop = async () => { try { await pg.stop(); } catch {} process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30); // keep alive
