# 구현 검증 기록

## 원격 배포 준비

2026-10-18: Cloudflare 공식 Wrangler OAuth 연결 완료. APAC 리전에 `water-together` D1 데이터베이스를 생성하고 `0001_initial.sql`의 21개 명령을 적용했습니다. 허용 출처는 `https://bgm5768.github.io`로 설정했습니다.

- 공개 전 전체 검사 재실행: 타입 검사, 21개 테스트, 프론트엔드/PWA 및 Worker 빌드 통과.
- VAPID와 구독 암호화 키는 Git에서 제외된 `worker/.dev.vars`에 생성했습니다.
- Cloudflare 이메일: 만료된 링크를 재발급해 인증 성공 메시지 확인.
- Worker 게시: `https://water-together-api.water-worker.workers.dev`, 5분 Cron 및 4개 비밀 키 등록 완료.
- GitHub 인증과 공개 저장소 생성 완료. Pages를 Actions 방식으로 활성화하고 API 주소·D1 ID·허용 출처 변수 등록.
- 로컬 키와 CLI 파일은 `.gitignore`로 제외됨을 확인했습니다.

## 앱 디자인 변경 검증

2026-10-18: 참고 이미지에 맞춰 오늘 화면을 큰 섭취량 숫자, 목표·알림 카드, 컵 용량 선택 패널, 물결 배경, 하단 기록 버튼과 고정 메뉴로 변경했습니다. 기록·설정 화면과 진입 화면도 같은 앱 폭과 색상으로 맞췄습니다.

- 프론트엔드 TypeScript·production 빌드·PWA 경로 및 캐시 검사 통과.
- 브라우저에서 250ml 선택 → 기록 저장 → 350ml에서 600ml로 합계 갱신 확인.
- 기록 화면과 내 설정 이동 확인.
- 업데이트 적용 후 하단 직접 입력 버튼과 고정 메뉴의 겹침이 없는지 실제 DOM 위치로 확인.
- 저장 알림은 화면을 밀지 않는 안내로 표시하며 4.5초 뒤 사라집니다.

![앱 디자인 변경 화면](screenshots/app-redesign.png)

## 최초 구현 검증

검증일: 2026-10-18 (Asia/Seoul). Windows, Node 24.21.0. 실행한 결과만 기록합니다.

| 항목 | 결과 |
|---|---|
| npm run typecheck | 프론트엔드·Worker·공유 코드·테스트 타입 검사 통과 |
| npm test | 21개 통과, 실패/생략 0 |
| npm run build -w frontend | React/Vite production 빌드 통과 |
| npm run build -w worker | Wrangler dry-run 빌드 통과. 원격 배포 없음 |
| npm run check | 타입 검사 → 21개 테스트 → 양쪽 빌드 전체 통과 |
| npm run db:local | 로컬 D1 0001 마이그레이션 적용 성공 |
| VITE_BASE_PATH=/water-together/ 빌드 | 하위 경로용 Manifest/SW/정적 파일 경로 검사 통과 |
| 기본 / 빌드 | Manifest, 캐시 목록, CSP, PNG 192/512 크기 검사 통과 |
| 프론트엔드 번들 점검 | VAPID_PRIVATE_KEY/SUBSCRIPTION_KEY 식별자 없음 |

## 실제 브라우저에서 확인

Codex 내장 브라우저의 localhost production preview와 로컬 Wrangler API를 연결했습니다.

- 새 공간 생성 → 복구·초대 코드 안내 → 오늘 화면.
- 200ml 빠른 기록 → 서버 합계 200ml.
- 개별 기록을 350ml로 수정 → 합계 350ml 반영.
- 과거 화면에서 전날로 이동 → 0ml·빈 기록 표시.
- 목표 2,200ml 저장 → 오늘 화면의 목표와 달성률 16% 반영.
- Service Worker 새 버전 안내 → 적용 → 세션과 기존 기록 유지.
- 알림 권한 미요청, 브라우저 구독 없음, 서버 활성 기기 0대를 구분해 표시.

브라우저 검사에서 발견한 설정 응답의 내부 DB 필드 혼입을 수정했고, 조회한 설정을 그대로 수정·저장하는 회귀 검증을 추가했습니다.

![로컬 검증 화면](screenshots/today.png)

## 수행하지 않은 검증

- GitHub Actions의 실제 원격 실행 및 GitHub Pages 게시
- Cloudflare 원격 D1 마이그레이션, Worker 배포, 실제 무료 플랜 CPU 측정
- 실제 VAPID 키로 외부 푸시 서비스에 전송
- Android 기기의 PWA 설치, 화면 잠금/절전/앱 종료 시 수신
- 휴대폰 실제 화면 크기의 브라우저 시각 검사

자동 테스트는 로컬 workerd + D1을 사용하며 푸시 공급자 응답은 모의 처리합니다. 실제 기기 수신 결과는 [Android 체크리스트](ANDROID-TEST.md)에 따로 기록해야 합니다.

로컬 브라우저 검사 계정과 기록은 `worker/.wrangler/`의 개발 데이터에만 있습니다. 원격 배포에는 포함되지 않습니다. 다른 브라우저 프로필을 사용하면 새 게스트로 시작할 수 있습니다.
