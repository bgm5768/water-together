# Water Together — 다음 작업자를 위한 인수인계

최종 정리: **2026-10-26, Asia/Seoul**. 이 문서는 현재 구현과 운영 상태를 빠르게 이해하기 위한 문서다. 향후 작업 후에도 변경 사항과 검증 결과를 갱신한다. 실제 코드, Git 상태, 배포 상태가 문서와 다르면 확인 후 문서를 수정한다.

## 1. 다음 작업 시작 순서

1. 이 문서와 `git status --short`, `git log -5 --oneline`을 읽는다. 사용자가 수정한 파일을 덮어쓰지 않는다.
2. 요청에 관련된 아래 소스와 문서를 확인한다. 새 요구가 없으면 이미 완료된 기능을 다시 만들거나 기존 Cloudflare 리소스를 새로 생성하지 않는다.
3. 변경에 맞는 검증을 수행한다. 런타임 변경은 기본적으로 `npm run check`; 문서만 바꾸면 문서/링크/차이 확인으로 충분하다.
4. 프론트엔드와 Worker 배포는 별개다. 필요한 대상만 배포하고 실제 결과를 확인한다.
5. 커밋·푸시, 운영 확인 결과와 남은 제약을 사용자에게 한국어로 간단히 보고한다. 비밀값을 문서나 출력에 남기지 않는다.

사용자는 이 프로젝트의 코드 수정, Git 커밋·푸시, GitHub Pages 및 Cloudflare Workers 직접 배포를 요청해 왔다. 통상적인 수정·검증·배포마다 재확인을 반복하지 않는다. 새 작업 범위와 현재 세션의 지침을 우선한다.

## 2. 서비스와 현재 상태

2026-10-26 목표/한 잔 설정 재작업: 설정 화면은 원래처럼 용량 숫자를 보여주는 간결한 버튼 형태이며, 누르면 물 마시기와 같은 전체 용량 선택창이 열린다. 공통 `AmountSheet.tsx`에서 컵 드래그·숫자 입력을 제공하고 `GoalAmount.tsx`는 선택창을 여는 버튼이다. 취소하면 값이 유지되고 적용하면 설정 초안만 바뀌며, 기존 하단 저장 버튼으로 서버에 저장한다. 하루 목표는 100–5,000ml, 기본 한 잔 및 실제 한 번의 물 기록/수정은 1–500ml로 프론트와 API 모두 제한한다. 과거 상한 초과 설정은 조회 시 새 상한으로 정규화하고 설정 저장 때 반영하며, 과거 섭취 기록과 합계는 수정하지 않는다. DB 마이그레이션은 없다. 아래 과거 “설정에 컵을 직접 표시” 구현을 대체한다.

검증: 운영 경로의 `npm run check`(39개 테스트·타입 검사·프론트/PWA·Worker dry-run) 통과. Chrome의 로컬 모의 API에서 버튼→선택창, 컵 드래그, 취소, 501/5,001ml 차단, 비정형 337ml 적용, 저장 전 API 미호출, 저장 실패/재시도, 물 마시기 초기값/500ml 기록, 390×844·320×568 배치를 확인했다. 실행 오류 0건. 화면은 `C:/Users/USER/water-ui-qa/amount-sheet-review/`.

알림 오른쪽 아이콘 수정 운영 반영: `18c5400`, Pages `40251516621` 및 Checks `40251516595` 성공. 공개 앱의 투명 아이콘과 물방울 badge가 로컬 파일과 일치하고, 배포 SW는 빌드별 캐시 리비전을 제외한 코드·캐시 목록이 일치한다. 투명 이미지 9,216개 픽셀의 alpha=0과 캐시 포함을 확인했다. 결과는 `C:/Users/USER/water-ui-qa/notification-empty-icon-production/results.json`. 휴대폰에서 앱을 열어 “새로 적용”한 뒤 새 테스트 알림으로 확인해야 한다.

2026-10-26 알림 오른쪽 `(B)` 제거: 사용자가 실기기 테스트에서 큰 아이콘 대신 `(B)`가 보인다고 보고했다. `icon` 생략 시 Android Chrome이 사이트 이니셜을 만드는 경로를 확인해, SW에서 완전 투명한 96×96 `notification-empty-icon.png`를 명시하도록 수정했다. 생성 스크립트와 PWA 캐시·콘텐츠 해시에 포함하고 기존 SW/PWA 검사도 새 정책에 맞췄다. 작은 물방울 badge는 유지한다. 운영 경로 환경의 `npm run check`(38개 테스트·타입·프론트/PWA·Worker dry-run)와 코드 형식 검사를 통과했다. 이 변경은 아래 과거 기록의 “icon 옵션 제거” 구현을 대체한다. 실제 휴대폰 표시는 새 버전 적용 후 다시 확인해야 한다.

2026-10-26 목표 설정 드래그: 하루 목표량과 기본 한 잔의 숫자 입력창을 물 마시기와 같은 컵 수면 드래그로 바꿨다. `MugSlider.tsx`를 물 마시기/설정에서 공유하며 `GoalAmount.tsx`는 읽기 전용 용량 표시와 ± 버튼을 제공한다. 목표는 100ml, 기본 한 잔은 10ml씩 드래그/버튼으로 조절하고, 방향키는 1ml(Shift 10ml)로 조절한다. 기존 범위 100–10,000ml / 1–3,000ml와 저장된 비정형 정수값을 유지한다. 컵 드래그는 설정 탭 스와이프와 충돌하지 않으며 설정 저장은 기존 변경 감지/명시적 저장 흐름을 유지한다. `npm run check`의 38개 테스트·타입·빌드와 Chrome 모의 API의 마우스/터치·6개 화면 크기·저장/실패/재시도·물 마시기 회귀 검증을 통과했다. Worker/DB 변경은 없다. 검증 스크립트와 결과는 `C:\Users\USER\water-ui-qa\goal-drag-review.mjs`, `goal-drag-review\results.json`.

목표 설정 드래그 운영 반영: `6dc057d`, Pages `40250232482` 및 Checks `40250232408` 성공. 공개 앱에서도 모의 API를 사용해 같은 6개 화면 크기와 마우스/터치·저장·실패/재시도·물 마시기 초기값/기록 흐름을 검증했고 실행 오류는 0건이었다. 결과와 PNG는 `C:\Users\USER\water-ui-qa\goal-drag-production\`에 있다.

2026-10-26 설정 저장 버튼: 편집 중인 설정과 클라이언트가 보유한 저장된 설정의 실제 값이 다를 때만 하단 저장 영역을 렌더링한다. 기본값 생략과 요일·알림 배열 순서 차이는 변경으로 취급하지 않는다. 원래 값으로 되돌리거나 저장에 성공하면 버튼이 사라지고 실패하면 유지된다. 변경 없는 폼 제출도 차단한다. `npm run check`(38개 테스트·타입 검사·양쪽 빌드), Prettier, 모의 API를 사용하는 Chrome의 17개 상태 확인을 통과했다. Worker/DB 변경은 없다.

설정 저장 버튼 배포: `178ca85`, Pages `40248577673` 및 Checks `40248577667` 성공. 공개 앱의 새 번들에서 모의 API로 최초 진입·편집·원복·저장 성공과 요일/알림 순서만 달라지는 7개 상태를 확인했다. 변경 없는 경우 버튼이 없고 브라우저 실행 오류는 0건이었다.

2026-10-26 아이콘 통일: 앱·favicon·Apple 아이콘과 알림 badge를 “물 마시기” 버튼의 Lucide `Droplet` 모양으로 맞췄다. 생성 스크립트가 같은 컴포넌트를 렌더링하며 앱 아이콘은 버튼과 같은 파랑, badge는 투명 배경의 흰색 실루엣이다. Manifest/SW는 캐시 구분을 위해 새 `icon-droplet-*`/`notification-droplet-badge.png` 경로를 사용하며 이전 경로도 같은 모양으로 유지한다. 알림 메시지 옆의 큰 이미지는 SW의 `icon` 옵션을 제거해 없앴다. 로딩 화면은 유지한다. `npm run check`의 38개 테스트·양쪽 빌드와 최종 운영 경로 프론트/PWA 빌드, 생성 이미지 육안 확인을 완료했다. Worker/DB는 변경하지 않았다. 설치된 기기의 런처 아이콘 갱신 및 실제 시스템 알림 모양은 실기기 검증이 필요하다.

최신 프론트 배포: 아이콘 통일 `eab013e`, Pages `40246310052` 및 Checks `40246310062` 성공. 공개 앱의 manifest·favicon·Apple 링크·6개 이미지 바이트가 로컬 결과와 일치하고, 배포 SW를 모의 실행한 3개 알림에서도 큰 이미지 없이 새 badge만 전달하는 것을 확인했다. badge의 흰색·투명 배경과 앱 아이콘의 파랑도 검사했다. 결과는 `C:\Users\USER\water-ui-qa\icon-unification-production\results.json`에 있다.

2026-10-26 자동 리마인더 시작: 알림 권한이 이미 허용됐고 브라우저 구독이 없으면 앱 로딩/온라인 복귀/권한 허용 후 복귀 시 자동 등록한다. 새 계정은 코드 보관 뒤 일반 “시작하기”에서 권한 요청과 등록을 이어서 처리한다. 아직 권한을 정하지 않은 기존 계정에는 첫 화면에 시작 안내를 자동 표시하므로 메인의 다음 리마인더를 먼저 누를 필요가 없다. 권한 요청 자체는 클릭 안에서만 실행한다. 나중에 하기·알림 없이 시작하기·기기/전체 구독 해제는 계정·앱 경로별 로컬 중지 값으로 기억해 자동 등록을 막는다. 기존 브라우저 구독은 서버에서 해제됐을 수 있으므로 자동 POST로 되살리지 않으며 필요한 경우 첫 화면에서 명시적 재연결을 안내한다. 중복 실행·오프라인·비활성 시간표·미지원·차단·계정 전환을 처리했다. 38개 기존 테스트와 24개 모의 브라우저 흐름 검증을 통과했다. 프론트 변경이며 Worker/DB는 변경하지 않았다.

자동 리마인더 시작 배포: `c317fbf`, Pages `40219035667` 및 Checks `40219035581` 성공. 공개 앱에서 모의 API·브라우저 알림으로 자동 시작 관련 24개 흐름을 다시 검증했으며 실행 오류는 0건이었다. 결과와 화면은 `C:\Users\USER\water-ui-qa\automatic-reminder-production\`에 저장했다. 실제 기기 푸시 수신은 별도 검사 대상이다.

2026-10-26 진행률 개선: 물방울과 가로 진행 막대는 실제 섭취 비율에 따라 0~100%를 연속으로 채운다. 25·50·75% 단계와 눈금은 제거했다. 숫자는 내림한 정수 백분율이며 내부 채움은 소수 비율까지 반영하고 650ms 동안 부드럽게 전환한다. 물 마시기 버튼의 “용량 선택” 문구를 없앴으며 매번 선택창을 여는 동작은 유지한다. 다음 리마인더는 구독 전에도 기본 시간표와 현재 기록으로 시간·권장량을 표시한다. 로컬 38개 테스트·최종 프론트 빌드·0~100% 101개 값·5개 화면 크기·알림 흐름 검증을 통과했다.

진행률 개선 배포는 `f313e4c`이며 Pages `40217636571` 및 Checks `40217636505`가 성공했다. 공개 앱의 새 번들에서 모의 API·알림으로 진행률 101개 값, 5개 화면 크기, 물 기록과 리마인더 갱신, 10개 알림/첫 시작 흐름을 확인했다. 브라우저 실행 오류 0건이며 실기기 알림 수신은 별도 검사 대상이다. 결과는 `docs/VERIFICATION.md`와 `C:\Users\USER\water-ui-qa\smooth-reminder-production\`에 남겼다.

2026-10-26 성취 UI: “오늘 나를 챙긴 순간 N번”, 목표 완료 시 체크·은은한 빛·“오늘의 물 챙기기 완료!”, 달력 완료일 물방울과 월간 개수를 유지한다. 성공한 물 마시기로 처음 100%를 넘을 때만 짧게 빛난다. 달성 여부는 저장된 섭취량과 **현재 목표**로 계산하며 기록 수정·목표 변경 시 재계산된다. 최초 네 단계 버전은 `7435575`의 Pages `40215214988`와 Checks `40215214950`로 배포됐으며, 위 연속 진행률 변경이 이를 대체한다.

2026-10-26 추가 작업: 물 마시기 저장 성공 후 약 1.4초 동안 물방울 낙하·두 겹 파문·작은 물튀김을 표시하고, 안내를 “한 잔 더, 나를 챙겼어요 💧 · N ml”로 바꿨다. 용량 선택창이 닫힌 뒤 수위와 숫자가 움직이도록 타이밍을 조정했다. 효과는 수위와 같은 레이어의 높이를 따라가며 클릭을 막지 않는다. 새로고침·취소·실패에는 새 효과가 없고 동작 줄이기에서는 문구만 표시한다. 프론트 변경이며 Worker/DB 변경은 없다. `fb5fac0`의 Pages `40213851315` 및 Checks `40213851428`가 성공했고 공개 앱에서 새 효과와 입력 흐름을 확인했다. 자세한 검증은 `docs/VERIFICATION.md`의 저장 보상 항목을 참고한다.

2026-10-26 작업: 물 마시기를 매번 용량 선택 → 저장으로 통일했다. 정기·테스트 알림은 현재 남은 목표와 남은 알림 횟수로 계산한 권장량을 제목·본문에 표시한다. 설정 시간표 미리보기도 실제 오늘 섭취량을 반영한다. 앱·계정에서 복구 코드 재조회·복사를 지원하며, 이전 계정은 명시적으로 새 코드를 한 번 발급한다. 코드·38개 테스트·브라우저 검증을 완료했다. Wrangler 인증 후 운영 migration `0005_recovery_codes.sql`과 Worker `8cf004cb-18e5-47f3-a698-3e0348119aac`를 배포했다. 운영 API에서 임시 검증 계정의 복구 코드 저장·조회·회전 및 이전 세션 차단을 확인하고 검증 데이터를 정리했다. 프론트엔드 `eb7a048`의 Pages `40211041703` 및 Checks `40211041838`가 성공했으며, 배포 화면의 용량 선택·계정 복구 코드 UI·남은 양 미리보기를 모의 API와 격리된 Chrome에서 확인했다. 실제 휴대폰 푸시 수신은 이번 변경에서 검증하지 않았다.

회원가입 없이 초대 코드로 두 사람이 연결되어 물 섭취량을 함께 기록하는 한국어 모바일 PWA다.

| 항목 | 값 |
| --- | --- |
| 저장소 | https://github.com/bgm5768/water-together |
| 기본 브랜치 | `main` |
| 현재 로컬 작업 경로 | `C:\Users\USER\water-together` |
| 운영 앱 | https://bgm5768.github.io/water-together/ |
| 운영 API | https://water-together-api.water-worker.workers.dev |
| 상태 확인 | https://water-together-api.water-worker.workers.dev/api/health |
| Worker 이름 | `water-together-api` |
| D1 이름 / 바인딩 | `water-together` / `DB` |
| D1 ID | `146432d7-ea69-4fb4-acf8-34d989f596e8` |

2026-10-25에는 `d7ba062`에서 이어서 메인 UI를 수정했다. 첫 화면은 물 트래킹 영역과 고정 하단 메뉴로 채우고, 오늘의 기록은 스크롤 아래에 둔다. `100dvh`와 하단 메뉴·안전 영역을 함께 계산하며, 짧은 화면에서는 숫자·여백·보조 설명을 줄인다. 물 마시기는 물방울 아이콘이 있는 세로형 버튼이고, 남은 양과 다른 용량 버튼은 옆에 배치한다. 물결은 고정 100px 높이의 3개 곡선이 서로 다른 속도로 움직인다. 백엔드 변경은 없다.

- 로컬 `npm run check` 통과: 타입 검사, 34개 테스트, 프론트/PWA·Worker dry-run 빌드.
- Chrome에서 7개 화면 크기 × 4개 섭취량, 긴 값·닉네임, 화면 높이 변경을 검증했다. 기본량 두 번 기록, 다른 용량 입력창, 기록 영역 스크롤, 파도 애니메이션과 reduced-motion도 확인했다.
- 상세 결과와 화면은 `docs/VERIFICATION.md`의 2026-10-25 항목을 참고한다. 실제 휴대폰의 주소창·노치 동작은 별도 실기기 확인 대상이다.

아래 배포 식별자는 **2026-10-18 당시** `c5506b0`의 기록이며 최신 프론트엔드 배포 식별자가 아니다.

- Worker 배포 버전: `d620e772-e14d-428c-9e8d-d256cb5450b6`.
- GitHub Pages 실행 `39114314720`, Checks 실행 `39114314712` 성공.
- 자동 테스트 **34개 통과**, 타입 검사, 프론트엔드 빌드/PWA 검사, Worker dry-run 빌드 성공.
- 운영 manifest, 아이콘, Service Worker 경로, 새 월간 기록/닉네임 기능을 포함한 번들 반영을 확인했다.
- 위 값은 작성 당시 스냅샷이다. 이후 작업에서는 최신 커밋/Actions/배포를 다시 확인한다.

잠금 화면 사용자 지정 알림음 제약은 아래에 설명하며, 미완료된 서버 발송 오류로 취급하지 않는다.

## 3. 기술 구조와 데이터 원칙

- npm workspaces: `frontend`, `worker`. Node `>=22.12`, CI는 Node 24. 최근 로컬 Node 24.21.0 / npm 11.19.0.
- 프론트: React 19, TypeScript, Vite 7, lucide-react. 정적 배포는 GitHub Pages.
- 백엔드: Cloudflare Workers, D1, Zod, Luxon, `@block65/webcrypto-web-push`. Wrangler 4 계열.
- 예약 알림: Worker의 1분 Cron → D1 발송 선점/중복 방지 → Web Push.
- D1이 기록의 기준이다. Service Worker는 정적 앱 리소스만 캐시한다. 민감한 API 응답 캐시나 오프라인 기록 전송 큐는 구현되어 있지 않다.
- 그룹은 최대 2인. 본인 기록만 수정·삭제할 수 있고 상대 기록은 읽기만 가능하다. 그룹 간 접근은 차단한다.
- 초대·세션·복구 코드는 강한 난수이며 검증에는 해시를 사용한다. 복구 코드 재조회용 원문은 별도 `recovery_codes` 테이블에 HKDF로 분리한 키와 AES-GCM으로 암호화한다. 복구 코드는 일회용이며 복구 시 세션과 코드가 원자적으로 회전한다. GET 조회는 코드를 바꾸지 않으며, 이전 계정의 최초 발급은 이전 코드를 만료시키되 현재 세션과 기록을 유지한다.
- 기기별 푸시 구독은 사용자당 활성 최대 3개. 암호화 키와 VAPID 키를 기존 운영 값 그대로 보존해야 한다.

## 4. 반드시 유지할 사용자 요구와 디자인 방향

### 메인/로딩/브랜딩

메인 화면의 **밝은 연보라·블루 배경, 흰색 둥근 카드, 파란 물결**과 일관된 디자인을 유지한다. 내 기록은 파랑, 상대는 민트로 구분한다. 모바일 앱처럼 보이는 것이 우선이다.

이전에 어두운 시네마틱 3D 유리 아이콘과 로딩을 만들었지만 사용자가 메인과의 불일치를 지적하여 되돌렸다. **요청 없이 어두운 3D 방향으로 복귀하지 않는다.** 현재 로딩은 두 물방울, 부드러운 부유/동심원/하단 물결 애니메이션과 흐린 안내 문구를 사용한다. reduced-motion을 존중한다.

앱·알림 아이콘은 “물 마시기” 버튼과 동일한 Lucide `Droplet`(채움, strokeWidth 1.5)을 사용한다. `scripts/generate-icons.mjs`가 React로 같은 컴포넌트를 SVG로 렌더링하고 sharp 0.35.2로 아래를 생성한다. 로딩 화면의 두 물방울 원본 `frontend/public/brand/water-mark.svg`는 유지한다.

- 현재 앱 아이콘: `icon-droplet-32.png`, `icon-droplet-180.png`, `icon-droplet-192.png`, `icon-droplet-512.png`, `favicon.ico`. 버튼과 같은 파랑 `#2888ef`와 배경 `#e4ebff`를 사용한다.
- 이전 경로 호환용 `icon-water-*.png`, `icon-192.png`, `icon-512.png`, `icon.svg`도 같은 모양으로 생성한다.
- 알림 메시지 옆의 큰 이미지는 보이지 않아야 한다. `icon`을 생략하면 Android Chrome이 사이트 이니셜 `(B)`를 대신 표시하므로 `notification-empty-icon.png`(96×96, 완전 투명)를 지정한다. 이 파일은 캐시에도 포함한다. 별도 `image`는 추가하지 않는다.
- **상태 표시줄 badge는 같은 물방울의 투명 배경 단색 `notification-droplet-badge.png`(96×96)**. 이전 `notification-badge.png` 경로도 유지한다. 불투명 컬러 아이콘을 badge로 쓰면 하얀 네모로 보이는 문제가 재발한다.
- Manifest·Apple·favicon PNG·SW 캐시에는 새 `droplet` 경로를 사용한다. 설치된 런처 아이콘의 갱신 시점과 시스템 기본 알림 표시는 기기/브라우저에 달려 있다.

과거 3D 원본과 `icon-cinematic*`, `water-glass.webp`는 이력/호환을 위해 남아 있으나 현재 디자인의 기준이 아니다. 자세한 내용은 `design/BRAND.md`.

### 물 마시기 입력

현재 “물 마시기” 세로 버튼은 매번 용량 선택창을 연다. 버튼의 보조 문구 “용량 선택”은 표시하지 않는다. 컵 수면을 **위아래로 드래그하여 실제 마신 양을 조절**하거나 숫자를 입력한 뒤 확정해야 저장된다. 별도의 “다른 용량 마시기” 버튼은 없다. 기본 용량은 설정에 저장하며 입력창은 매번 그 값부터 시작한다. 닫기·취소는 기록하지 않는다.

메인 하단은 채운 비율과 `MilestoneDrop.tsx`의 연속 수위 물방울, 한 줄 진행 막대를 표시한다. 백분율은 정수 ml에 100을 먼저 곱한 후 나누어 내림하며 100%에서 제한한다. 물방울과 막대는 내림 전 소수 비율을 사용한다. 목표 직전에 반올림으로 완성 처리하지 않으며 25% 단위로 나누지 않는다. 오늘의 횟수는 실제 본인 기록 개수이며 상대 기록을 포함하지 않는다. 달력의 완성 표시는 기존 현재 목표 기준 집계와 일치시킨다.

`100 / 150 / 200` 고정 버튼 나열이나 확인 없는 빠른 기록으로 되돌리지 않는다.

### 설정

`SettingsTabs.tsx`의 **목표 / 시간 / 알림 / 함께 / 앱·계정** 5개 탭으로 묶었다. 가로 스와이프, 키보드, ARIA 탐색을 지원한다. 세로 스크롤을 막지 않도록 `touch-action: pan-y`를 사용한다. 숨겨진 패널은 마운트된 상태를 유지하며 전체 설정은 하나의 폼에서 저장한다. 다른 탭에 잘못된 입력이 있으면 그 탭을 열어 준다.

- 목표/기본 한 잔, 시간표/요일/시간대, 기기 알림/소리, 상대 알림, 설치/계정 기능을 혼동 없이 유지한다.
- 목표/기본 한 잔은 기존 숫자 필드 모양의 버튼을 누르면 물 마시기와 같은 용량 선택창이 열린다. 컵 드래그·직접 입력·방향키로 조절하고 적용 뒤 변경사항 저장으로 확정한다. 하루 목표 최대 5,000ml, 한 잔/한 번의 물 기록 최대 500ml다.
- 알림 시작은 최초 “시작하기” 흐름에 포함한다. 권한이 허용된 기기의 새 구독은 앱 시작 시 자동 등록하고, 미결정인 기존 사용자는 첫 화면에 시작 안내를 자동 표시한다. 실제 브라우저 허용은 사용자의 클릭으로만 요청하며 자동 허용하지 않는다. 건너뛰기/구독 해제는 `water-reminders-paused:<BASE_URL>:<user_id>` 값으로 기억하고, 수동 재연결 성공 시 해제한다. 기존 endpoint를 자동 재활성화하지 않는다. 구독이 없어도 시간·권장량은 `nextHydration`으로 표시한다. 메인 리마인더의 수동 시작과 시간 설정도 유지한다.
- PWA 설치는 설정 안에 있다. 새 버전은 **“새로 적용”** 배너로 활성화할 수 있다.
- 설정 상단의 **이름 버튼** 또는 계정 이름을 누르면 닉네임 변경 모달이 열린다.

### 고정 시간표

사용자는 인터벌·사용자 모드 등 모드 탭을 원하지 않는다. **8개 기본 시간 행을 개별 수정/켜기/끄기** 하는 방식만 제공한다. 기본값은 참고 이미지 요청대로 아래와 같다.

| 항목 | 기본 시각 |
| --- | --- |
| 기상 이후 | 11:00 |
| 조식 전 | 11:20 |
| 아침 식사 후 | 12:30 |
| 점심 식사 전 | 11:00 |
| 점심 식사 후 | 13:00 |
| 저녁 식사 전 | 18:00 |
| 저녁 식사 후 | 20:00 |
| 취침 전 | 22:40 |

두 행의 11:00 중복은 현재 기본값이며 발송 시 같은 시각을 중복 제거한다. 임의로 다른 기본값으로 바꾸지 않는다. 일일 목표 기본 2,000ml, 한 잔 200ml, 시간대 Asia/Seoul, 모든 요일 활성, 목표 도달 시 중단, 상대 알림 켜짐이다. 코드 기준은 `shared/types.ts`.

추천 용량은 남은 목표량과 남은 활성 알림 시각 수로 나눈다. 목표 미달이라면 현재 진도보다 앞서 마셨다는 이유만으로 고정 알림을 건너뛰지 않는다. 예전 start/end/interval 필드는 스키마 호환을 위해 남아 있지만 화면에 인터벌 모드를 다시 만들지 않는다.

## 5. 최근 추가한 닉네임과 월간 기록

### 닉네임

- `PATCH /api/me`, 요청 `{ "display_name": "새 이름" }`.
- trim 후 1~24자. 인증된 본인만 수정하며 클라이언트가 사용자 ID/그룹 ID를 지정하지 않는다.
- 변경 직후 내 화면을 갱신하고 공유 조회 및 이후 상대 알림에도 새 이름이 반영된다.
- 이미 outbox에 들어간 상대 알림은 생성 당시 sender_name 스냅샷을 갖기 때문에 과거 대기 메시지까지 소급 변경된다고 설명하지 않는다.

### 월간 기록

`MonthHistory.tsx`와 `history.css`가 이전 단일 날짜 선택 중심 화면을 대체한다.

- 월 이동/오늘 이동, 두 사람의 월 총량·평균·목표 달성일 요약.
- 달력 각 날짜에서 내 양(파랑)과 상대 양(민트)을 동시에 볼 수 있다.
- 날짜를 누르면 두 사람의 시간/용량 기록을 최신순으로 함께 표시한다. 본인 기록만 수정·삭제한다.
- 미래 날짜/월은 탐색을 제한하고, 빈 상대/미래 값은 `—`로 구분한다.
- 평균은 해당 월의 경과 일수 기준이며 기록 없는 날도 포함한다. 목표 달성일은 **현재 목표 기준**이다. 과거 목표 스냅샷은 저장하지 않는다.

API는 `GET /api/month?month=YYYY-MM`. `shared/types.ts`의 `MonthData`를 사용한다. 본인 설정 시간대 기준으로 2020-01부터 현재 월까지 검증한다. 같은 그룹만 조회한다.

월별 집계는 28~31일의 UTC 시작/끝 범위를 CTE로 만들어 D1에서 SUM한다. Luxon 날짜 경계로 DST를 처리하며 전체 원시 기록을 브라우저로 가져오지 않는다. **31일 기준 바인딩 94개(31×3 + 그룹 1)**로 D1 한도 100개 이하를 유지한다. 파라미터를 늘리는 변경 시 이 한도를 주의한다.

App의 갱신은 `/api/me` 후 일별 및 필요한 월별 조회를 수행한다. requestVersion과 월/날짜/시간대 검사를 통해 오래된 응답이 화면을 덮지 않게 한다. 기록 변경 후 일별/월별 값을 함께 갱신한다.

## 6. 알림 문제의 실제 결론과 제한

### 정기 알림 시각

현재 Cron은 `* * * * *`이다. **지정한 분의 00초에 도착하는 정확한 초 단위 알람이 아니다.** 사용자도 17:03으로 설정한 알림이 17:03:40~50경 도착하는 것을 확인했다. Cron 실행 및 Push/OS 지연이 포함된다.

테스트 알림 성공은 즉시 전송 경로 확인이며 정기 스케줄러 검증과 다르다. 정기 문제가 재발하면 시간대, 요일, 활성 행, 목표 도달/중단 설정, 구독, delivery 로그의 scheduled_at/status/sent_at 순서로 확인한다. **푸시 제공자 accepted/sent는 휴대폰 실제 도착·확인 증거가 아니다.**

스케줄러에는 근접 시각 설정 변경 처리, 원자적 발송 선점, 중복 방지, 제한 재시도, 만료 구독 처리가 있다. 이 동작을 단순 타이머 하나로 대체하지 않는다.

### 상대가 물 마셨을 때 알림

`0004_partner_notifications.sql`의 물 기록 INSERT 트리거가 같은 그룹 상대방의 활성/수신 동의 구독에 대해 `partner_deliveries` outbox를 생성한다. 새 기록 API에서 `ctx.waitUntil`로 발송하고 Cron이 재시도를 처리한다.

- 수신자의 `partner_notifications`가 기준이며 정기 알림의 enabled/요일/목표와 별개다.
- 동일 기록 재전송, 수정, 삭제는 새 상대 알림을 만들지 않는다.
- 429/5xx는 제한적으로 재시도(최대 3회), 오래된 항목은 만료 처리한다. 전달 여부가 불확실한 결과를 무조건 다시 보내지 않는다.
- 알림 대상 이름은 생성 시점에 저장된다. 사용자 데이터 변경 시 outbox 의미를 보존한다.

### 캔 따고 물 따르는 소리 / 잠금 화면

사용자의 최종 확인은 **“알림은 도착하고 휴대폰 기본 알림음도 나지만, 지정한 캔/물 소리는 안 난다”**이다. 현재 증상을 무음이나 미수신으로 잘못 해석하지 않는다.

- `WaterSound.tsx`는 앱 루트에서 Web Audio를 관리한다. localStorage `water-reminder-sound`, 기본 켜짐. 사용자 동작으로 AudioContext를 해제해야 한다.
- 현재 음원 `frontend/public/audio/can-pour.mp3`는 약 3.63초의 실제 녹음 조합이다. 합성 물방울음으로 되돌리지 않는다.
- 캔 소리와 탄산수 붓기 소리는 CC0 원본이다. 출처와 편집 정보는 `frontend/public/audio/CREDITS.md`. 유튜브 영상의 음원을 라이선스 확인 없이 추출하지 않는다.
- SW는 `silent:false`, `renotify:true`, 진동 패턴으로 시스템 알림을 표시한다. 같은 앱 범위의 **첫 번째 보이는 클라이언트**에만 `WATER_REMINDER` 메시지를 보내 중복 재생을 막는다.
- 앱이 보이고 오디오가 허용되었을 때만 앱 내 음원을 재생할 수 있다. 잠기거나 닫힌 PWA는 휴대폰 알림 채널의 기본 소리를 사용한다.
- **표준 Web Push 알림에는 임의 MP3 URL로 잠금 화면 소리를 지정하는 지원 옵션이 없다.** `sound: url` 추가나 무음 오디오 반복으로 해결된다고 주장하지 않는다. PWA가 OS 알림 채널 설정을 읽거나 강제로 바꾸지도 못한다.
- 알림 설정에 설명, MP3 다운로드, Samsung 공식 안내 링크를 추가했다. 기기에서 파일을 Notifications 폴더에 넣고 해당 앱/사이트 알림 카테고리의 소리로 지정할 수 있는 경우 사용자가 직접 선택해야 한다. 메뉴/지원 여부는 기기와 브라우저에 따라 다르다.

근거와 분석은 `design/NOTIFICATION-SOUND.md`. 이 제약을 설명하지 않은 채 잠금 화면 사용자 지정 음원까지 구현 완료했다고 말하지 않는다.

## 7. 주요 파일 지도

| 경로 | 역할 |
| --- | --- |
| `frontend/src/App.tsx` | 상태/인증/API 갱신, 주요 탭, 설정 폼, 닉네임 모달, 기록 CRUD |
| `frontend/src/TodayScreen.tsx` | 오늘 합계/상대 진도/물결/기록 진입 |
| `frontend/src/DrinkSheet.tsx` | 수면 드래그 용량과 시간 입력 |
| `frontend/src/SettingsTabs.tsx` | 스와이프 설정 탭/키보드 접근성 |
| `frontend/src/ReminderSchedule.tsx`, `ReminderPlan.tsx` | 고정 시간표와 추천량 |
| `frontend/src/MonthHistory.tsx`, `history.css` | 월간 달력/요약/두 사람 시간별 기록 |
| `frontend/src/LaunchScreen.tsx`, `launch.css` | 밝은 로딩/전환/연결 오류 재시도 |
| `frontend/src/WaterSound.tsx`, `InstallApp.tsx` | 음원 및 설치 안내 |
| `frontend/src/style.css`, `app-design.css` | 기본 및 모바일 앱 테마 |
| `frontend/index.html` | React 이전 로딩, 테마색, favicon/apple 아이콘 |
| `frontend/vite.config.ts` | base 경로, manifest/CSP, SW 캐시 목록/콘텐츠 해시 |
| `frontend/src/sw.js` | 정적 캐시, 업데이트, push 표시/클라이언트 알림/열기 |
| `scripts/generate-icons.mjs` | SVG에서 PNG/ICO/단색 badge 생성 |
| `scripts/check-pwa.mjs` | 배포 경로/manifest/캐시/CSP/아이콘 검증 |
| `worker/src/index.ts` | API 라우팅/검증/인증/CORS/월간 집계/닉네임 |
| `worker/src/security.ts`, `models.ts` | 보안/인증 및 데이터 접근 |
| `worker/src/scheduler.ts`, `reminders.ts` | 정기 스케줄 발송/배분 |
| `worker/src/partner.ts`, `push.ts` | 상대 알림 outbox / Web Push |
| `shared/types.ts`, `shared/time.ts` | 공통 타입/기본값/시간대/날짜 경계 |
| `worker/migrations/` | DB 마이그레이션과 트리거 |
| `worker/test/` | API/시간/SW 테스트 및 Miniflare 하네스 |
| `docs/API.md`, `docs/ARCHITECTURE.md` | API 및 구조 참고 |
| `docs/VERIFICATION.md`, `docs/ANDROID-TEST.md` | 검증 이력/실기기 확인 절차 |
| `design/BRAND.md`, `design/NOTIFICATION-SOUND.md` | 현재 브랜드 방향/소리 제약 |

로딩은 네트워크를 즉시 시작하고 짧은 최소 표시(1.05초)/페이드(450ms)를 둔다. 가짜 퍼센트나 네트워크 시작 지연을 추가하지 않는다. 오류 재시도는 이전 오류를 지운다. 개발용 `?preview=launch`는 개발 모드에서만 로딩을 고정 표시하며 운영에는 포함되지 않는다.

정적 자산을 추가할 때 `vite.config.ts`의 `publicAssets` 및 콘텐츠 해시/캐시 목록을 함께 검토한다. badge 검사에는 투명 픽셀이 절반 이상이고 불투명 픽셀도 존재하는지 확인하는 회귀 방지가 있다.

## 8. 로컬 실행과 검증

아래 명령은 별도 표시가 없으면 저장소 루트의 PowerShell에서 실행한다.

```powershell
npm ci
npm run db:local
npm run dev -w frontend
```

프론트엔드는 `http://127.0.0.1:5173`. 별도 터미널에서 Worker를 실행한다.

```powershell
Set-Location C:\workspace\water\worker
npx wrangler dev --ip 127.0.0.1 --port 8787 --var ALLOWED_ORIGIN:http://127.0.0.1:5173
```

로컬 비밀값은 `worker/.dev.vars.example`을 참고해 **무시되는** `worker/.dev.vars`로 관리한다. 기존 파일의 값을 출력하거나 덮어쓰지 않는다. 새 환경의 로컬 키가 필요할 때만 별도로 생성하고 운영 키와 혼동하지 않는다. 프론트엔드 로컬 API 기본은 `http://localhost:8787`; 필요하면 무시되는 `frontend/.env.local`의 `VITE_API_URL`로 지정한다.

CORS origin에는 경로가 없으며 `localhost`와 `127.0.0.1`도 다르다. 로컬 실행은 위 `--var`로 덮어쓰고 운영 `ALLOWED_ORIGIN`을 로컬 주소로 바꾸지 않는다.

```powershell
npm run typecheck
npm test
npm run build
# 위 세 가지를 한 번에 실행:
npm run check
```

- `npm run build -w frontend`: 타입 검사 + Vite + PWA 검증.
- `npm run build -w worker`: **dry-run**이며 운영 배포가 아니다.
- 마지막 테스트 수는 34개. 월간 그룹 격리/빈 날/31일 바인딩/윤년/서울 자정/뉴욕 DST, 닉네임 검증·본인 제한·상대 반영 등을 포함한다.
- 테스트 Push는 모의 응답이다. 테스트 통과를 실제 휴대폰 수신 성공으로 설명하지 않는다.
- 테스트 하네스의 시계 고정은 분 경계 요청 제한 테스트의 불안정을 방지하기 위한 것이다. 테스트용 시계 제어를 운영 API에 노출하지 않는다.
- Vite 개발 모드는 실제 운영 SW 검증을 대체하지 않는다. SW는 production에서 등록한다.
- 모바일 수동 확인: 밝은 로딩→메인 일관성, 컵 드래그, 설정 스와이프/저장/닉네임, 월 이동과 양쪽 합계/날짜 상세, 큰 글씨/작은 화면, reduced-motion, 설치/업데이트.

현재 로컬 D1에는 UI 검증용 **가상 사용자 가람/나래와 10월 기록**이 들어 있다. 운영 사용자 데이터가 아니다. `.tools/month-calendar-viewport.png`, `.tools/launch-light.png`도 이 로컬 검증 자료다. `.tools`와 로컬 D1은 Git에 포함하지 않는다. 문서 작성 직전 실행 중이던 개발 서버와 임시 브라우저 탭은 정리했다.

## 9. DB/비밀값/배포 주의점

기존 로컬/운영 DB에 적용된 마이그레이션:

1. `0001_initial.sql`
2. `0002_default_drink.sql`
3. `0003_fixed_reminders.sql`
4. `0004_partner_notifications.sql`
5. `0005_recovery_codes.sql`

최근 월간 기록/닉네임 추가는 마이그레이션이 필요 없었다. 기존 migration을 수정하거나 DB를 재생성하지 말고 다음 스키마 변경은 새 migration으로 추가한다. 원격 migration은 배포 범위를 확인한 뒤 `npm run db:remote -w worker`로 적용한다.

운영 키는 이미 설정되어 있다. **`VAPID_PRIVATE_KEY`, `SUBSCRIPTION_KEY`를 재생성/회전하면 기존 구독에 영향을 준다.** 최초 설치 README 명령을 운영에 무조건 재실행하지 않는다. `.dev.vars`, `.env*`, 인증 토큰, 복구 코드, 세션 값, 구독 endpoint/keys를 출력하거나 커밋하지 않는다. `.tools/`, `.wrangler/`, `node_modules/`, `dist/`도 제외한다.

현재 `worker/wrangler.toml`:

- compatibility_date `2025-10-14`.
- 운영 CORS `https://bgm5768.github.io` (끝에 `/water-together/` 없음).
- Cron 매분, **observability.enabled=false**. 로그 관측이 활성화되어 있다고 가정하지 않는다.

### 프론트엔드 배포

`.github/workflows/pages.yml`은 main push 중 `frontend/**`, `shared/**`, `package*.json`, 해당 workflow 변경에만 자동 실행된다. **context.md/README 등 문서만 변경하면 Pages 배포는 실행되지 않는 것이 정상**이다. 수동 workflow_dispatch도 가능하다.

GitHub 변수 `VITE_API_URL`은 운영 HTTPS API 주소다. Pages base는 configure-pages 결과에서 설정한다. 로컬에서 운영 경로 빌드를 확인하려면:

```powershell
$env:VITE_BASE_PATH = '/water-together/'
$env:VITE_API_URL = 'https://water-together-api.water-worker.workers.dev'
npm run build -w frontend
```

이 환경값을 설정한 터미널에서 로컬 개발로 돌아갈 때는 필요에 따라 제거/변경한다.

### Worker 배포

로컬 Wrangler OAuth 로그인으로 배포해 왔다.

```powershell
npm run deploy -w worker
```

`.github/workflows/worker.yml`은 **수동 실행 전용**이다. Cloudflare API token/account Secrets 및 D1/origin Variables를 사용한다. Git push만으로 Worker가 배포된다고 가정하지 않는다. 로컬 OAuth에서 배포에 무관한 새 scope 경고가 뜬 적은 있지만 배포는 성공했으므로 경고만으로 불필요한 재로그인을 강요하지 않는다.

새 프론트엔드가 새 API에 의존하면 API 호환성을 확보한 뒤 Worker를 먼저 배포한다. 서버 응답과 Pages 실행 성공을 확인하고, 앱에서 새 버전을 적용한다. 설치된 홈 아이콘은 OS 캐시로 늦게 갱신될 수 있고 기존 알림의 이미지는 소급 변경되지 않는다.

### Git / CI

`.github/workflows/ci.yml`은 main push/PR에서 `npm run check`를 실행하며 문서 커밋도 대상이다. 문서 변경만으로 로컬 앱 테스트를 반복할 필요는 없지만 CI 결과는 확인할 수 있다.

이 환경에는 GitHub CLI가 무시되는 경로 `.tools/gh/bin/gh.exe`에 있다. 다른 환경에서는 설치된 `gh`를 사용한다. 로그인 토큰을 URL에 넣지 않는다. 현재 환경의 Git 인증이 필요하면 다음 형태를 사용해 왔다.

```powershell
git -c credential.helper= -c 'credential.helper=!C:/workspace/water/.tools/gh/bin/gh.exe auth git-credential' push
.tools/gh/bin/gh.exe run list --repo bgm5768/water-together --limit 5 --json databaseId,name,status,conclusion,headSha
```

새 브랜치가 필요하면 기본 접두사는 `codex/`. 이미 있는 사용자 변경을 되돌리거나 강제 push하지 않는다. 변경 후 이 문서의 현재 상태와 관련 문서도 맞춰 둔다.
