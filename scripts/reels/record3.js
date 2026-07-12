// record2.js — NewSetter 앱 화면 녹화 v2 (폰 목업 프레임 + zoom 2x 고해상도)
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join('C:/Users/SSAFY/Desktop/projects/climbing crew', 'node_modules', 'playwright'));

const OUT = 'C:/Users/SSAFY/Desktop/projects/climbing crew/public/brand/screencap';
const BASE = 'http://localhost:3000';

async function newClip(browser, name) {
  const context = await browser.newContext({
    viewport: { width: 780, height: 1780 },
    recordVideo: { dir: OUT, size: { width: 780, height: 1780 } },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const apply = () => {
      if (!document.documentElement) return;
      document.documentElement.style.zoom = '2';
      document.documentElement.style.overflow = 'hidden';
      if (document.body) document.body.style.overflow = 'hidden';
      window.scrollTo(0, 0);
      if (!document.getElementById('rec-vhfix')) {
        const s = document.createElement('style');
        s.id = 'rec-vhfix';
        // zoom:2와 100dvh 충돌 보정 — 실제 프레임(1780px)에 셸을 꽉 채움
        s.textContent = '.app-shell{height:890px !important;} .app-frame{height:850px !important;max-height:850px !important;}';
        document.documentElement.appendChild(s);
      }
    };
    apply();
    document.addEventListener('DOMContentLoaded', apply);
    setInterval(() => {
      document.querySelectorAll('nextjs-portal,[data-nextjs-dev-tools-button],#__next-build-watcher').forEach(e => e.remove());
    }, 200);
  });
  return { context, page, name };
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const dev = page.getByText('개발자 모드로 계속', { exact: true });
  if (await dev.count()) await dev.first().click();
  await page.getByText('진행 중인 투표', { exact: true }).first().waitFor({ timeout: 20000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
}

async function wheel(page, total, stepPx = 14, stepMs = 16) {
  await page.mouse.move(390, 900);
  const steps = Math.abs(Math.round(total / stepPx));
  const dir = total > 0 ? stepPx : -stepPx;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dir);
    await page.waitForTimeout(stepMs);
  }
}

async function saveClip({ context, page, name }) {
  const video = page.video();
  await context.close();
  const p = await video.path();
  const dest = path.join(OUT, name + '.webm');
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(p, dest);
  console.log('saved', dest);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ---- C1: 홈 — 확정 카드 + 가야 할 암장 ----
  {
    const clip = await newClip(browser, 'c1-home');
    const { page } = clip;
    try {
      await login(page);
      await page.waitForTimeout(1800);           // 확정! 카드 감상
      await wheel(page, 620);                    // 가야 할 암장까지
      await page.waitForTimeout(1800);
      await wheel(page, -620);
      await page.waitForTimeout(1500);
    } catch (e) { console.error('c1', e.message); }
    await saveClip(clip);
  }

  // ---- C2: 투표 — X체크 → 겹침 → 제출 ----
  {
    const clip = await newClip(browser, 'c2-poll');
    const { page } = clip;
    try {
      await login(page);
      await page.getByText('참여하기', { exact: true }).first().click();
      await page.waitForTimeout(2000);
      const edit = page.getByText('수정하기', { exact: true });
      if (await edit.count()) { await edit.first().click(); await page.waitForTimeout(900); }
      for (const d of ['18', '12']) {            // 후보 범위 내 날짜 X 체크
        try { await page.getByText(d, { exact: true }).last().click({ timeout: 3000 }); } catch (err) { console.error('date', d, err.message); }
        await page.waitForTimeout(900);
      }
      await page.waitForTimeout(600);
      const submit = page.getByText('응답 제출', { exact: true });
      if (await submit.count()) { await submit.first().click(); await page.waitForTimeout(1800); }
      try { await page.getByText('11', { exact: true }).last().click({ timeout: 3000 }); } catch {}
      await page.waitForTimeout(2000);           // 누가 안 되는지 표시
    } catch (e) { console.error('c2', e.message); }
    await saveClip(clip);
  }

  // ---- C3: 탐색 지도 → 캘린더 ----
  {
    const clip = await newClip(browser, 'c3-map-calendar');
    const { page } = clip;
    try {
      await login(page);
      await page.getByText('탐색', { exact: true }).first().click();
      await page.waitForTimeout(2800);           // 지도 + 핀 로딩 감상
      await page.getByText('캘린더', { exact: true }).first().click();
      await page.waitForTimeout(2200);
      await wheel(page, 400);
      await page.waitForTimeout(1500);
    } catch (e) { console.error('c3', e.message); }
    await saveClip(clip);
  }

  await browser.close();
  console.log('done');
})();
