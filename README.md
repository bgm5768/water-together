# Water Together · 함께, 한 잔씩

두 사람이 회원가입 없이 초대 코드로 연결하는 한국어 수분 섭취 PWA입니다. React + TypeScript + Vite 프론트엔드를 GitHub Pages에, API와 예약 알림을 Cloudflare Workers + D1에 각각 배포합니다.

다음 작업을 시작하는 개발자·AI는 [현재 상태와 인수인계(context.md)](context.md)를 먼저 읽어 주세요. 최근 기능, 디자인 결정, 알림음 제약, 배포 및 검증 방법을 정리했습니다.

- 앱: https://bgm5768.github.io/water-together/
- API 상태: https://water-together-api.water-worker.workers.dev/api/health

이 저장소의 `main`에서 프론트엔드·공유 코드 등 Pages 워크플로 대상 경로를 변경하면 GitHub Actions를 통해 프론트엔드에 자동 반영됩니다. 문서만 변경하면 프론트엔드는 재배포하지 않습니다. 현재 Worker는 로컬 Wrangler OAuth로 배포했습니다. 백엔드 GitHub Actions 배포는 별도의 Cloudflare API 토큰을 저장소 Secrets에 등록한 경우에 사용할 수 있습니다.

배포 진행 및 검증 결과는 [검증 기록](docs/VERIFICATION.md)에 기록합니다. 로컬 자동 테스트의 푸시 서비스는 모의 응답이며, 실제 휴대폰 수신 성공을 의미하지 않습니다.

## 포함 기능

- 2인 공유 공간, 256비트 초대·게스트 세션·일회용 복구 코드
- 본인/상대방 목표·합계·달성률, 컵 수면을 위아래로 드래그하는 용량 입력, 정확한 숫자 입력, 본인 기록 수정·삭제
- 물 마시기 → 매번 용량 선택 → 기록하기. 기본 한 잔 용량은 내 설정에 저장하며 매번 이 값부터 시작합니다.
- 내 설정 → 앱·계정에서 본인의 복구 코드를 다시 복사. 구버전 계정은 한 번 새 코드를 발급한 뒤 이용합니다.
- 날짜 이동, 과거 기록, 시간대별 날짜 경계, 빈 상태와 요청 오류 안내
- 개인 목표·시간대·요일·8개 고정 알림 시각과 개별 켜기/끄기, 목표 달성 시 중단
- 기기별 Web Push 등록·해제, 테스트 전송, 다음 예약 후보, 구독/권한 상태
- 1분 Cron, D1 원자적 발송 선점, 제한 재시도, 만료 구독 비활성화
- PWA 설치, 정적 화면 오프라인 캐시, 새 버전 적용 안내
- 프론트엔드 자동 배포와 백엔드 수동 실행 배포 워크플로 분리

## 구조

```text
frontend/               React 화면, 스타일, PWA 빌드 플러그인
  src/sw.js             빌드 시 경로·버전·캐시 목록을 넣는 Service Worker
  public/               SVG 및 192/512px PNG 아이콘
worker/
  src/index.ts          REST API, 검증, 인증 및 CORS
  src/security.ts       난수, 해시, AES-GCM, 요청 제한
  src/push.ts           표준 VAPID 인증과 암호화 Web Push
  src/scheduler.ts      Cron 예약, 중복 방지, 재시도
  migrations/           D1 스키마, 인덱스, 2인/기기 제한 트리거
  test/                 workerd + D1 통합 테스트, 시간대 테스트
shared/                 공통 타입, 기본 설정, 날짜·알림 계산
scripts/                키·아이콘 생성, CI 배포 설정
.github/workflows/      ci.yml, pages.yml, worker.yml
docs/                   API, 설계·보안, Android 검증 체크리스트
```

회원과 공간은 하나의 D1 트랜잭션으로 생성합니다. 임시 무소속 계정을 만들지 않기 때문에 별도 가입 단계가 없습니다. 서버 D1이 기록의 원본이며, 브라우저에는 세션만 저장합니다. 민감한 API 응답을 Service Worker나 IndexedDB에 캐시하지 않습니다.

## Windows PowerShell에서 시작

Node.js **24 LTS**, npm, Git을 설치합니다. 이미 설치되어 있으면 업데이트가 필요하지 않을 수 있습니다.

```powershell
Set-Location C:\workspace\water
node --version
npm --version
npm ci
Copy-Item .env.example frontend/.env.local
npm run db:local
```

개발용 창 두 개를 열어 각각 실행합니다.

```powershell
# 첫 창: 로컬 Workers + D1, http://localhost:8787
npm run dev:worker
```

```powershell
# 둘째 창: React 개발 서버, http://localhost:5173
npm run dev
```

브라우저는 `http://localhost:5173`으로 열어 주세요. `127.0.0.1:5173`은 별도 출처라 기본 CORS 설정과 다릅니다. 개발 서버에서는 Service Worker를 등록하지 않습니다. 기록·초대·복구 API는 키 없이도 실행됩니다.

PWA를 로컬에서 검사할 때는 개발 서버를 종료하고 다음을 실행합니다. Worker 서버는 계속 실행합니다.

```powershell
npm run build -w frontend
npm run preview -w frontend -- --port 5173 --host localhost
```

로컬 상태는 `worker/.wrangler/`에 있습니다. 로컬 테스트는 원격 D1에 접근하지 않습니다. 모바일은 PC의 localhost에 접근할 수 없으므로 실제 푸시는 HTTPS 배포 후 검사합니다.

## 검사와 독립 빌드

```powershell
npm run typecheck
npm test
npm run build
# 전체 검사
npm run check
# 각각 따로 빌드
npm run build -w frontend
npm run build -w worker
```

Worker 빌드는 `wrangler deploy --dry-run`입니다. 이름에 deploy가 있어도 업로드하거나 배포하지 않습니다. 프론트엔드 결과는 `frontend/dist`, Worker 빌드 결과는 `worker/dist`입니다.

테스트는 workerd 런타임과 실제 로컬 D1 SQL을 사용합니다. 가입·동시 참여·인증·복구 경쟁·다른 그룹 격리·CRUD·합계·시간대·설정·속도 제한·암호화 구독·VAPID 서명·Cron 중복·목표 중단·만료·재시도를 확인합니다. Android 화면 꺼짐은 별도 수동 검증 대상입니다.

## 1. GitHub 계정과 저장소 준비

1. GitHub에 로그인하고 **공개 저장소** `water-together`를 만듭니다. GitHub Free에서 공개 저장소 Pages를 사용하면 별도 도메인이 필요 없습니다. 이 코드를 올릴 때 README 자동 생성은 선택하지 않아도 됩니다.
2. `.env.local`, `.dev.vars`, `.wrangler`가 제외되는지 확인합니다. D1 ID와 공개 VAPID 키는 비밀이 아니지만 VAPID 개인 키, 암호화 키, API 토큰은 비밀입니다.
3. 로컬에서 아래 명령을 실행합니다. `YOUR_NAME`을 실제 계정명으로 바꿉니다.

```powershell
git init
git branch -M main
git add .
git status
git commit -m "Build Water Together PWA"
git remote add origin https://github.com/YOUR_NAME/water-together.git
git push -u origin main
```

아직 `VITE_API_URL`을 설정하지 않았다면 최초 Pages 작업은 배포를 중단합니다. 아래 Worker 배포 후 변수를 설정하고 다시 실행하면 됩니다. 토큰을 원격 URL에 넣지 말고 GitHub의 일반 인증 흐름을 사용하세요.

## 2. Cloudflare 무료 계정과 D1 생성

Cloudflare 계정에서 Workers Free를 사용합니다. 별도 도메인을 구입하지 않고 `workers.dev` 주소를 사용합니다. 유료 Workers 구독·결제 수단 등록은 이 프로젝트의 필수 단계가 아닙니다. 결제 요구가 나타나면 선택한 상품/플랜을 먼저 확인하세요.

```powershell
Set-Location C:\workspace\water\worker
npx wrangler login
npx wrangler d1 create water-together
```

명령이 출력한 `database_id`를 `worker/wrangler.toml`의 영(0)으로 채워진 ID 대신 넣습니다. 같은 파일의 출처도 변경합니다.

```toml
[vars]
ALLOWED_ORIGIN = "https://YOUR_NAME.github.io"
```

출처에는 `/water-together/` 경로와 마지막 `/`를 넣지 않습니다. 정확히 한 출처만 허용하며 와일드카드는 없습니다. 운영 설정 후 로컬 개발 시에는 해당 값을 `http://localhost:5173`으로 되돌려야 합니다.

```powershell
npx wrangler d1 migrations apply water-together --remote
npm run deploy
```

원격 마이그레이션과 배포는 이 단계에서 실제 서비스에 반영됩니다. 새 스키마 변경은 기존 SQL을 수정하는 대신 `0002_...sql`처럼 새 파일을 추가합니다. 중요한 운영 변경 전 D1 export 또는 Time Travel 복구 가능 여부를 확인하세요.

## 3. VAPID와 암호화 Secret 등록

```powershell
Set-Location C:\workspace\water
npm run keys
notepad worker/.dev.vars
```

생성기는 `.dev.vars`가 있으면 덮어쓰지 않습니다. 파일 안 `VAPID_SUBJECT`를 본인이 관리하는 실제 이메일의 `mailto:...`로 수정합니다. 생성된 키 값은 화면에 출력하지 않고 Git 제외 파일에 저장합니다.

아래 명령은 각 값을 대화형 입력으로 받습니다. `.dev.vars`의 해당 값만 붙여넣으세요. 명령줄 인수나 GitHub 공개 변수에 개인 키를 넣지 마세요.

```powershell
Set-Location C:\workspace\water\worker
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npx wrangler secret put SUBSCRIPTION_KEY
```

- VAPID 공개 키는 브라우저가 `/api/me`로 받습니다. 프론트엔드에 별도 복사할 필요가 없습니다.
- `SUBSCRIPTION_KEY`는 32바이트 AES-GCM 키입니다. 푸시 엔드포인트와 키 전체를 암호화해 D1에 저장합니다. 인덱스에는 엔드포인트의 SHA-256만 저장합니다. 복구 코드는 이 Secret에서 HKDF로 분리한 키로 암호화합니다. 키를 바꾸면 기존 복구 코드의 재조회도 영향을 받으므로 유지해야 합니다.
- 키를 변경하면 기존 구독이 작동하지 않을 수 있습니다. 보관 후 관리하세요. 암호화 키 분실 시 기존 구독은 복호화할 수 없으며 모든 기기의 구독을 해제하고 재등록해야 합니다.
- 현재 지원 엔드포인트는 Chrome/FCM, Firefox/Mozilla, Safari/Apple입니다. 다른 푸시 공급자는 허용 목록 검토와 실제 테스트 후 추가하세요.

## 4. GitHub Pages 자동 배포

1. GitHub 저장소 → **Settings → Pages → Source → GitHub Actions**를 선택합니다.
2. **Settings → Secrets and variables → Actions → Variables**에 `VITE_API_URL`을 만듭니다. 값은 배포된 `https://water-together-api.YOUR_SUBDOMAIN.workers.dev` 주소입니다.
3. Actions → **Deploy frontend to GitHub Pages → Run workflow**를 실행합니다. 이후 frontend/shared 변경을 main에 push하면 자동 배포됩니다.
4. 완료되면 `https://YOUR_NAME.github.io/water-together/`를 엽니다.

프로젝트 경로는 `actions/configure-pages` 결과로 자동 설정합니다. 직접 빌드할 때는 다음과 같이 지정합니다.

```powershell
Set-Location C:\workspace\water
$env:VITE_API_URL = 'https://water-together-api.YOUR_SUBDOMAIN.workers.dev'
$env:VITE_BASE_PATH = '/water-together/'
npm run build -w frontend
Remove-Item Env:VITE_API_URL
Remove-Item Env:VITE_BASE_PATH
```

앱은 한 URL 안에서 화면을 바꾸므로 Pages의 SPA 경로 404를 피합니다. Manifest, 아이콘, SW scope/start URL도 같은 base를 사용합니다. GitHub Pages는 정적 파일만 제공합니다. API, D1, Cron은 Cloudflare에서 실행됩니다.

## 5. Worker 배포 자동화 설정 (선택)

프론트엔드 push가 백엔드를 자동 변경하지 않도록 **Deploy Cloudflare Worker**는 수동 `workflow_dispatch`로 분리했습니다. 사용자가 Actions에서 실행하면 검사 → 원격 마이그레이션 → 배포가 실행됩니다.

- GitHub `production` 환경을 만들고 필요하면 사용자 승인 규칙을 지정합니다.
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Variables: `D1_DATABASE_ID`, `ALLOWED_ORIGIN` (`https://YOUR_NAME.github.io`)
- API 토큰은 해당 계정으로 제한하고 Workers Scripts 편집과 D1 편집에 필요한 권한만 부여합니다. Global API Key를 사용하지 마세요.
- VAPID/암호화 키는 앞 단계에서 Worker Secret으로 등록합니다. 이 워크플로는 기존 Secrets를 유지합니다.

## 사용법: 초대와 복구

1. 첫 사람은 닉네임으로 새 공간을 만듭니다. **복구 코드는 본인만 보관**하고 초대 코드만 상대에게 전달합니다.
2. 상대는 자신의 브라우저에서 초대 코드와 닉네임을 입력합니다. 두 사람이 찬 공간은 세 번째 참여를 거부합니다.
3. 복구 코드는 **설정 → 앱·계정**에서 언제든 다시 확인·복사할 수 있습니다. 이전 계정은 새 코드를 한 번 발급해야 합니다. 초대 코드는 공간 생성자가 상대 참여 전 새로 발급할 수 있습니다.
4. 새 기기에서는 첫 화면 아래 **복구 코드로 연결**을 선택합니다. 기록·목표·알림 설정이 이어지고 모든 이전 세션이 만료됩니다. 새 복구 코드를 다시 저장해야 합니다.
5. 코드 보관 후 **알림 받고 시작하기**를 누르면 설정 이동 없이 기기 알림을 허용할 수 있습니다. 건너뛴 경우 메인의 **다음 리마인더 → 알림 받기**를 누릅니다. 복구 후 새 기기도 같은 흐름으로 연결합니다. 기존 기기 푸시 구독은 남아 있으므로 분실 기기는 **모든 구독 해제** 후 현재 기기를 재등록합니다.

브라우저 데이터와 복구 코드를 모두 잃으면 자동 복구할 수 없습니다. 초대 코드는 세션이나 복구 코드 대신 사용할 수 없습니다. 하나의 브라우저 프로필은 하나의 사용자로 사용하세요. 상대방은 별도 기기 또는 브라우저 프로필을 사용합니다.

## 알림의 동작과 한계

- 기본 시간표는 처음부터 켜져 있으며 메인에 다음 시간과 권장량을 표시합니다. 첫 시작의 **알림 받고 시작하기** 또는 메인 리마인더의 **알림 받기**에서 브라우저 권한을 허용하면 실제 알림이 시작됩니다. 알림 없이도 기록과 예정 시간은 볼 수 있고, 설정 탭에서는 시간·요일을 조정할 수 있습니다.
- Cron은 UTC 기준 `* * * * *`로 하루 1,440번 실행합니다. 개인 시간대의 고정 시각을 매분 확인하며, 10분 이상 지난 일정은 발송하지 않습니다. 서버 실행·네트워크·기기 상태에 따라 실제 도착은 지연될 수 있습니다.
- 기본 시각은 11:00, 11:20, 12:30, 11:00, 13:00, 18:00, 20:00, 22:40입니다. 각 항목 수정·끄기가 가능하고 같은 시각은 한 번만 발송합니다. 해당 현지 날짜의 요일을 사용하며 아무 요일도 선택하지 않으면 보내지 않습니다.
- DST가 있는 지역도 현지 시각을 사용합니다. 없는 현지 시각은 Luxon의 다음 유효 시각 처리에 따릅니다. Asia/Seoul에는 DST가 없습니다.
- 날짜 비교 화면의 두 사람 기록은 **보는 사람의 시간대**로 묶습니다. 개인 알림은 각자의 시간대입니다. 과거 날짜의 달성률은 현재 목표를 사용합니다. 과거 목표 스냅샷은 저장하지 않습니다.
- 기기별 `(subscription_id, scheduled_at)` 고유 키를 D1에서 선점합니다. 동시 실행은 한 번만 전송 시도합니다. 기기는 사용자당 최대 3대입니다.
- HTTP 404/410은 구독 비활성화, 429/5xx는 5분 간격 최대 총 3회입니다. 설정 변경 시 대기 재시도를 취소합니다. 목표 달성·시간 범위도 재검사합니다.
- 네트워크 타임아웃이나 작업 중단은 이미 수락되었는지 알 수 없으므로 `unknown`으로 처리하고 자동 재전송하지 않습니다. 외부 푸시 서비스와 DB 사이의 정확히 한 번 전달은 보장할 수 없습니다. 중복 억제를 위해 이 경우 누락 가능성을 택합니다.
- 매 발송 시 `ceil(남은 목표 / 남은 횟수)` ml를 안내합니다. 계획보다 앞서 마셔도 고정 알림을 생략하지 않습니다. 기본 7개 고유 시각에 2,000ml → 처음 286ml. 목표 달성 후 쉬기 옵션이 꺼져 있으면 추가 섭취량 대신 달성 안내를 보냅니다.
- 재시도 전에도 기록을 다시 확인하여 목표 달성 후 쉬기가 켜져 있고 목표를 달성했으면 취소합니다. 자정이 지나면 전날 재시도는 취소하며, 야간 일정도 현지 날짜별 목표와 횟수로 나눕니다.
- 권장량·남은 목표를 담은 제목과 본문은 **RFC 8291 aes128gcm**으로 수신 기기만 복호화하도록 암호화합니다. `@block65/webcrypto-web-push`로 VAPID 인증과 암호화를 수행하며 공급자에게 평문 수분 정보나 개인 식별자를 보내지 않습니다. SW는 이전 버전의 본문 없는 푸시도 처리합니다.
- 테스트 성공은 **푸시 서비스의 요청 수락**입니다. 휴대폰 표시 확인이 아닙니다. 화면 꺼짐·절전·네트워크·알림 설정에 따라 지연/누락될 수 있습니다. Chrome 강제 중지 후의 수신을 보장하지 않습니다.
- 다음 예정 표시는 예약 후보입니다. 서버의 목표 달성 판단으로 생략될 수 있습니다. 상대방 데이터는 화면 진입·포커스 복귀·수동 새로고침 때 갱신합니다. 상시 폴링은 없습니다.

## Android Chrome PWA 설치와 검증

1. 실제 HTTPS Pages 주소를 Android Chrome에서 엽니다.
2. 앱의 **내 설정 → 함께 물, 앱으로 만나기 → 앱 설치하기**를 선택합니다. 설치 창을 지원하지 않는 환경에서는 브라우저 메뉴 안내를 표시합니다. iPhone은 Safari 공유 → 홈 화면에 추가를 이용합니다.
3. 앱을 열고 본인 공간에 참여하거나 복구합니다.
4. 알림 설정에서 **이 기기 알림 허용·연결**을 누르고 Android/Chrome 알림을 허용합니다.
5. 테스트 알림 → 실제 알림 표시와 탭 시 앱 열림을 확인합니다.
6. 고정 알림 두 개를 가까운 미래 시각으로 수정하고 오늘 요일을 활성화해 저장합니다. 목표 달성 상태라면 테스트 동안 중단 옵션을 끕니다.
7. 앱을 백그라운드로 보내고 화면을 잠급니다. 설정 시각마다 실제 수신을 기록하고 최근 정기 발송 상태와 비교합니다.
8. Wi-Fi/모바일 데이터, 절전 모드, 앱 닫힘, 권한 차단·복구, 두 기기 독립 설정을 검증합니다.

자세한 기록 양식과 실패 시 분기: [Android 검증 체크리스트](docs/ANDROID-TEST.md).

## 무료 플랜과 비용

2026-10-18 공식 문서 확인 기준입니다. 가입 당시 정책도 다시 확인하세요.

| 항목 | 무료 제한 / 설계 |
|---|---|
| Workers | 하루 100,000 요청, HTTP·Cron 호출당 CPU 10ms, 메모리 128MB |
| Cron | 계정당 5개, 이 앱은 1개 사용, 하루 1,440회 실행 |
| D1 | 하루 읽기 500만 행·쓰기 10만 행, 계정 총 5GB 저장 |
| GitHub Pages | 게시 사이트 최대 1GB, 월 100GB 대역폭 soft limit |
| 이 앱 | 2인·각 3기기 이내 개인 사용 목표, 정기 상시 폴링 없음, 발송 로그 30일 보관 |

출처: [Workers 제한](https://developers.cloudflare.com/workers/platform/limits/), [D1 가격](https://developers.cloudflare.com/d1/platform/pricing/), [Cron 설정](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [GitHub Pages 제한](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

두 사람의 보통 사용량은 한도보다 작도록 설계했지만 **무료 플랜에서의 CPU 10ms 이내 실행과 알림 전달 SLA는 보장하지 않습니다.** 로컬 실행 시간은 클라우드 CPU 한도 검증을 대신하지 못합니다. VAPID 서명, 시간대 계산, 여러 기기 발송을 포함한 실제 Cron의 CPU/실패 지표를 배포 후 확인하세요. 1102가 발생하면 기기 수 축소와 작업 분산/최적화가 필요하며, 이 코드는 자동으로 유료 플랜을 활성화하지 않습니다.

D1 무료 한도를 초과하면 쿼리가 실패할 수 있습니다. 읽기/쓰기 제한은 매일 UTC 00:00에 초기화됩니다. 무료 사용을 유지하려면 Workers Paid를 선택하지 말고 다른 유료 리소스도 활성화하지 마세요. 공개 API 악용·대규모 공개 가입 방어는 2인 개인 사용 범위를 벗어나며, 요청 제한이 DDoS나 비용 공격 전체를 막아주지는 않습니다.

## 보안 요약

세션/초대/복구 코드는 각각 독립된 32바이트 난수이며 SHA-256만 DB에 저장합니다. 세션 유효기간은 365일이며 복구로 즉시 취소 가능합니다. 초대·복구는 IP당 합산 10회/10분, 인증 API는 사용자당 120회/분, 테스트 푸시는 3회/10분입니다. 인증된 API는 클라이언트 user_id/group_id를 신뢰하지 않습니다. 쿼리는 바인딩하고 JSON 크기를 8KB로 제한합니다.

Pages와 workers.dev가 다른 사이트라 제3자 쿠키 차단을 피하기 위해 Bearer 토큰을 사용합니다. 브라우저 재시작 후 유지하려고 localStorage에 저장하며 **HttpOnly의 보호를 받지 못합니다**. XSS 발생 시 토큰이 노출될 수 있습니다. React 텍스트 이스케이프, production CSP 메타, 외부 스크립트·폰트 미사용, 비밀값 미포함, 정확한 CORS 출처 제한을 적용합니다. CSP style-src의 unsafe-inline은 진행률 스타일에만 필요하며 script-src에는 없습니다. GitHub Pages 정적 호스팅 특성상 프레임 차단 HTTP 헤더는 설정하지 않습니다.

인증 토큰은 URL/쿼리/일반 로그에 기록하지 않습니다. Authorization을 브라우저가 자동 첨부하지 않아 일반적인 쿠키 기반 CSRF를 피합니다. CORS는 서버 접근 자체의 인증 수단이 아니므로 모든 보호 API가 토큰과 멤버십을 확인합니다. 더 자세한 내용은 [설계와 보안](docs/ARCHITECTURE.md), [API 계약](docs/API.md)을 참고하세요.

## 문제 해결

| 증상 | 확인할 항목 |
|---|---|
| 화면은 열리는데 서버 연결 실패 | VITE_API_URL, Worker 배포 상태, https 사용, ALLOWED_ORIGIN의 정확한 출처 |
| 잘못된 코드/401 | 초대·복구 코드 혼동, 복구 후 이전 코드/세션 만료, 공백 확인 |
| 세 번째 참여 거절 | 정상 동작입니다. 기존 사용자라면 초대가 아니라 복구를 사용하세요. |
| 알림 권한 차단 | Chrome 사이트 설정과 Android의 앱 알림 설정에서 모두 허용 |
| 서버 푸시 설정 필요 | VAPID 3개 값과 SUBSCRIPTION_KEY Secret을 등록한 Worker인지 확인 |
| 구독은 있는데 알림이 없음 | 예약 켜짐/요일/시간대/목표 달성/종료 제외/기기 절전/서비스 수락 여부 |
| VAPID 변경 후 실패 | 모든 구독 해제 후 각 기기에서 다시 연결 |
| 다른 사용자에게 연결된 기기 | 해당 프로필의 기존 계정에서 구독 해제 또는 별도 프로필 사용 |
| API 429 | 제한 시간이 지난 뒤 다시 시도. 빠르게 반복 클릭하지 않기 |
| Worker 1102 / D1 한도 오류 | 대시보드 CPU 및 D1 읽기·쓰기 확인. 자동 과금 업그레이드는 하지 않음 |
| Pages 아이콘/JS 404 | VITE_BASE_PATH 마지막 `/`, repo 이름, Actions base_path 확인 |
| 새 배포가 바로 안 보임 | 새 버전 배너에서 적용. SW 파일 자체는 캐시 목록에 넣지 않음 |
| Cron이 바로 실행되지 않음 | Cloudflare Cron 변경 전파에 최대 약 15분 소요 가능 |
| 오프라인 | 앱 껍데기만 열림. 새로고침 뒤 개인 기록 조회와 저장은 네트워크 필요 |

문구 변경: `frontend/src/copy.ts`, 화면 문구는 `App.tsx`, Manifest 이름은 `vite.config.ts`, 푸시 문구는 `src/sw.js`입니다. 앱 코드는 사용자의 의료적 필요량을 판단하지 않으며 목표값은 개인이 설정합니다.

### 고정 알림 및 소리 (2026-10-18)

- 푸시 우선순위 high, TTL 15분. 반복 알림에도 renotify=true, silent=false와 진동을 요청합니다. 무음·방해금지 등 기기 정책은 우회하지 않습니다.
- 앱이 보이는 상태에서 사용자 조작으로 오디오가 활성화되면 물방울 소리를 재생합니다. 설정에서 켜기/끄기·미리 듣기가 가능합니다. 닫힌 PWA의 알림음을 특정 음원으로 강제 지정하는 표준 웹 API는 없습니다.
- 내 설정의 최근 정기 발송은 공급자 수락 결과이며 휴대폰 표시 증명이 아닙니다.
- 0003 마이그레이션은 기존 사용자의 알림 목록에 위 기본 시각을 넣고 목표·요일·구독·기존 기록을 유지합니다. 구버전 API 필드 start_time/end_time/interval_minutes는 호환용이며 예약 계산에서는 사용하지 않습니다.

### 설정 분류와 상대 기록 알림 (2026-10-18)

- 내 설정은 목표 설정 / 시간 설정 / 알림 설정 / 함께하기 / 앱·계정으로 나뉩니다. 가로 탭, 화면 좌우 드래그, 방향키·Home·End로 이동하며 입력 중인 값은 탭을 바꿔도 유지됩니다. 목표·시간·알림의 변경사항은 한 번에 저장합니다.
- 목표: 하루 목표·기본 한 잔. 시간: 고정 시각·요일·시간대·분배 미리보기. 알림: 예약 활성화·목표 달성 시 중단·상대 기록 수신·기기 연결·물소리. 함께하기: 참여자·초대. 앱·계정: PWA 설치·계정·복구 안내.
- 새 물 기록을 추가하면 같은 공간의 상대 기기에 이름과 기록한 ml를 알려줍니다. 수정·삭제·중복 요청은 새 알림을 만들지 않습니다. 과거 기록도 새로 입력하면 ‘기록했어요’로 안내합니다.
- 받는 사람의 partner_notifications는 기본 true이며 알림 설정에서 끌 수 있습니다. 예약 알림 활성화·요일·목표 달성과 독립적입니다. 기기 권한과 푸시 구독은 필요합니다.
- migration 0004의 INSERT 트리거로 기록과 상대 발송 대기를 함께 저장합니다. 응답 뒤 waitUntil에서 즉시 발송하고, 대기·429/5xx는 매분 Cron에서 최대 총 3회 재시도합니다. 15분 지난 대기는 취소하며 모호한 네트워크 결과는 중복 방지를 위해 unknown으로 남깁니다. 알림 실패가 물 기록 저장을 취소하지 않습니다.
- 상대 알림은 정기 알림과 별도 tag로 표시해 서로 덮어쓰지 않습니다. 단말의 절전·무음·네트워크에 따른 지연 가능성은 동일합니다.
