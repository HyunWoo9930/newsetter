# NewSetter

클라이밍 크루 암장 방문 트래킹 & 투표 서비스. 기획은 [docs/기획서.md](docs/기획서.md), 디자인 프롬프트는 [docs/디자인_프롬프트.md](docs/디자인_프롬프트.md) 참고.

## 스택
Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · NextAuth(카카오) · Tailwind

## 로컬 실행

```bash
# 1) DB 띄우기 — 이 PC엔 Docker가 없어 embedded-postgres 사용 (진짜 PG18, 로컬)
npm install
node node_modules/@embedded-postgres/windows-x64/scripts/hydrate-symlinks.js  # 최초 1회 (npm이 postinstall 막음)
node scripts/devdb.mjs   # 백그라운드로 실행 → localhost:5432 (데이터: ./.devdb)
#   docker가 있는 환경이면 대신 docker compose up -d db 도 가능

# 2) 스키마 반영 + 시드 (DEV_USER_ID=devuser 는 .env 에 이미 설정됨)
npx prisma generate
npx prisma db push
node prisma/seed.mjs

# 3) 개발 서버
npm run dev              # http://localhost:3000
```

> 시드는 `node prisma/seed.mjs` (tsx 아님). 이 PC는 npm이 install-script를 막아 esbuild/tsx가 세팅되지 않으므로 순수 node .mjs 로 실행.

> 참고: 이 PC는 Node가 `C:\Program Files\nodejs`에 있고 PATH에 없을 수 있음.
> 그럴 땐 각 셸에서 `$env:Path = "C:\Program Files\nodejs;$env:Path"` 먼저 실행.
> npm이 install-script를 막으므로 설치 후 `npx prisma generate`를 한 번 수동 실행해야 함.

## 인증
- 운영: 카카오 OAuth (`/api/auth/signin`). 카카오 개발자 콘솔에 redirect URI 등록 필요.
- 개발: `.env`의 `DEV_USER_ID`를 채우면 로그인 없이 그 유저로 API 호출됨 (운영에선 비움).

## API (구현 완료)

### 크루
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/crews` | 크루 생성 (생성자=크루장) |
| GET | `/api/crews` | 내 크루 목록 |
| GET | `/api/crews/:crewId` | 크루 상세 + 멤버 |
| PATCH | `/api/crews/:crewId` | 크루 정보 수정 (크루장) |
| POST | `/api/crews/:crewId/leave` | 크루 탈퇴 (크루장은 혼자일 때만 → 크루 삭제) |
| POST | `/api/crews/join` | 초대 코드로 즉시 가입 (승인 불필요) |
| POST | `/api/crews/:crewId/requests` | 가입 신청 (PENDING) |
| GET | `/api/crews/:crewId/requests` | 신청 목록 (크루장) |
| PATCH | `/api/crews/:crewId/requests/:userId` | 승인/거절 (크루장) |

### 암장 · 뉴셋 · 리뷰
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/gyms?q=` | 암장 검색 |
| POST | `/api/gyms` | 암장 추가 |
| GET | `/api/gyms/:gymId?crewId=` | 상세 + 크루 기준 뉴셋 방문 상태 |
| GET/POST | `/api/gyms/:gymId/settings` | 세팅 회차 히스토리 / 뉴셋 제보 |
| GET/POST | `/api/gyms/:gymId/reviews` | 리뷰 목록 / 작성 (세팅 회차 연결) |
| GET | `/api/crews/:crewId/gyms` | 크루 기준 "가야 할 암장" 정렬 목록 |

### 투표 · 방문
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST/GET | `/api/crews/:crewId/polls` | 투표 생성 / 목록 |
| GET | `/api/polls/:pollId` | 투표 상세 (후보별 득표 + 내 응답) |
| POST | `/api/polls/:pollId/responses` | 응답 제출/수정 (날짜·암장 선택) |
| POST | `/api/polls/:pollId/close` | 마감 → 불가 최소 날짜·선호 최다 암장 확정 → 일정 자동 생성 (생성자만) |
| DELETE | `/api/polls/:pollId` | 열린 투표 삭제 (생성자·크루장) |
| GET/POST | `/api/crews/:crewId/visits` | 일정 목록 / 수동 추가 (추가자 자동 참석) |
| PUT | `/api/visits/:visitId/attend` | 일정 참여/참여 취소 |
| PATCH/DELETE | `/api/visits/:visitId` | 일정 변경 / 취소·삭제 (만든 사람·크루장) |

### 문제 · 완등 로그 · 난이도 정규화 · 추천
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET/POST | `/api/gym-settings/:settingId/problems` | 문제 목록(색별·쉬운 순 정렬) / 문제 등록 |
| GET | `/api/problems/:problemId` | 문제 상세 (통계 + 완등 로그/영상 + 내 로그) |
| GET/POST | `/api/problems/:problemId/logs` | 완등 로그 목록 / 남기기·수정(영상 선택 첨부) |
| GET/POST | `/api/gyms/:gymId/color-grades` | 색→공통척도(vGrade) 집계 / 투표 (암장 간 보정) |
| GET | `/api/gym-settings/:settingId/recommendations` | "뭐부터 풀지" 추천 (`?growth=1` 성장 모드) |
| GET/PATCH | `/api/me` | 내 프로필+실력(θ)+개인 통계 / 홈짐·기준등급 수정 |

### 개인 모드 (크루 없이 사용)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/me/gyms` | 개인 기준 암장 목록 (즐겨찾기=홈 역할, 내 방문 recency) |
| GET/POST | `/api/me/visits` | 내 기록·일정 통합 목록 / 개인 기록 추가 (Visit.crewId=null) |
| DELETE | `/api/me/visits/:visitId` | 개인 기록 삭제 |
| PUT | `/api/gyms/:gymId/favorite` | 암장 즐겨찾기 ★ 토글 |

**난이도 로직 위치**: 체감 점수 [lib/difficulty.ts](lib/difficulty.ts) · 실력 추정 [lib/ability.ts](lib/ability.ts) · 색 보정 [lib/colorGrade.ts](lib/colorGrade.ts).
추천은 v1 규칙기반(내 실력 이하 미완등을 쉬운 순). v2에서 IRT/Elo로 고도화 예정.

## 프론트엔드 (UI) — API 연결 완료
- Claude Design 시안(`ClimbCrew.dc.html`)을 [components/ClimbCrewApp.tsx](components/ClimbCrewApp.tsx)로 이식. 15개 화면 + 탭바/크루전환/토스트.
- **테마: 크레파스/색연필 손그림** — 개구쟁이체(Gaegu), 종이(#FFFDF6) 위 연필(#3A3633) 삐뚤 테두리, 크레파스 빗금 채움. 토큰은 컴포넌트 상단 `INK/PAPER/CRAYON/hatch()/WOBS/wob()/crayonBtn()`. 시그니처: 날짜 선택=손그림 동그라미, 투표 겹침=빽빽한 색칠, 확정=노란 스티커.
- **모든 화면이 실제 API에 연결됨** ([lib/apiClient.ts](lib/apiClient.ts) 경유). 크루/투표/암장/문제/추천/방문이 DB 데이터로 동작.
- 로그인은 개발용 우회(`DEV_USER_ID=devuser`) — "카카오로 시작하기"가 devuser로 진입.
- 검증됨: 홈(크루·투표·가야할암장), 문제 목록(색별 정렬·체감·완등률·꿀·완등✓가 실제 완등 로그에서 계산), 탐색/상세.

## 카카오 로그인 켜기
코드는 이미 연결됨(NextAuth + 세션 프로바이더 + 로그인/로그아웃 버튼). 켜는 순서:
1. developers.kakao.com 에서 앱 생성 → 카카오 로그인 활성화
2. Redirect URI 등록: `http://localhost:3000/api/auth/callback/kakao`
3. REST API 키 → `.env`의 `KAKAO_CLIENT_ID`, Client Secret → `KAKAO_CLIENT_SECRET`
4. `.env`에서 `NEXT_PUBLIC_KAKAO_ENABLED="true"` 로 변경 (로그인 버튼이 실제 카카오로 전환)
5. 운영에선 `DEV_USER_ID` 비우기 → 세션 없으면 로그인 필요
- 앱 아이콘: `public/brand/climbcrew-icon-512.png` 업로드

## 개인 모드
- 전환 시트(홈 헤더 탭)에서 "나의 클라이밍" 선택 → 홈·캘린더·탐색이 내 기록·즐겨찾기 기준으로 동작 (URL `?m=me`)
- 크루 없는 유저는 개인 모드 홈으로 바로 진입 (start 강제 없음) + 크루 만들기/참여 유도 카드
- 탭바 가운데 버튼이 "기록 추가"로 바뀜 (암장 검색 + 날짜 → 개인 기록)
- 즐겨찾기 ★ = 개인의 홈 암장 — "가야 할 암장"이 ★ 기준으로 계산

## MVP 완료 (크루 · 투표 · 방문 · 리뷰)
- 크루 생성/초대/가입·승인/홈 암장/크루 관리
- 일정 투표(웬투밋 스타일): 만들 때 **날짜 범위**만 대략 지정(암장 선택사항) → 응답은 **캘린더에서 가능한 날 다중 선택**, 날짜 누르면 누가 가능한지 표시 → 암장은 다른 사람 표 많은 순 정렬 → 마감·확정 → 카톡 공유
- 방문 트래킹: "간 지 N주 / 또 갈 때"(방문 기준, 뉴셋 날짜 제보 불필요), 가야 할 암장(홈만), 캘린더
- 암장 리뷰: 읽기 + **쓰기**(별점·태그·텍스트, 세팅 회차 연결)
- 카카오 로그인, 프로필(카카오 사진)

## v2 (지금은 UI에서 "준비 중"으로 표시)
- 완등 기록 + 영상(호스팅: Cloudflare R2/Stream) — 기록 탭
- 문제 목록/베타/추천 — "이번 셋 문제", "오늘 추천"
- 난이도 정규화/지도(색→공통척도 투표) — "내 기준 난이도 보정"
- 추천 v2(IRT/Elo), 즐겨찾기, PWA "또 갈 때" 알림
> 위 v2 화면·엔드포인트 코드는 남아 있고, 진입점만 "준비 중" 처리(토스트/뱃지). 나중에 다시 켜면 됨.
