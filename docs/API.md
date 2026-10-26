# REST API 계약

기본 주소: Worker의 `/api`. 운영은 HTTPS. 모든 JSON은 UTF-8이며 요청 본문은 최대 8KB. 날짜·시각은 ISO 8601 UTC 또는 명시적인 offset으로 전달합니다. 기록은 서버에서 UTC 밀리초 표기로 정규화됩니다.

인증: `Authorization: Bearer <세션 토큰>`. API 응답은 `Cache-Control: no-store`. 오류는 `{ "error": "한국어 안내" }` 형태입니다. DB 예외나 비밀값을 응답에 넣지 않습니다.

| 메서드·경로 | 입력 | 결과 / 권한 |
|---|---|---|
| GET /api/health | 없음 | `{ok:true}` |
| POST /api/groups | `{display_name}` | 201, 새 게스트·그룹·세션·초대·복구 코드를 원자적으로 생성 |
| POST /api/join | `{display_name,invite_code}` | 201, 두 번째 멤버 생성. 정원 초과 409 |
| POST /api/recover | `{recovery_code}` | 새 token/recovery_code, 기존 세션 취소 |
| GET /api/recovery-code | 인증, 쿼리 없음 | 본인의 현재 `{recovery_code}`. 구버전 계정은 원문이 없으면 null, 코드 변경 없음 |
| POST /api/recovery-code | 인증, `{}` | 원문 보관이 없는 계정만 새 코드 발급. 이미 보관 중이면 같은 코드 반환. 기존 세션·기록 유지 |
| GET /api/me | 인증 | 본인, group_id, role, settings, 활성 기기 수, next_notification(섭취량을 반영한 다음 예약 후보), next_amount_ml(예상 ml, 없으면 null), 공개 VAPID 키 |
| POST /api/invite | 인증 | owner만 초대 코드 재발급. 정원 충족 시 409 |
| GET /api/day?date=YYYY-MM-DD | 인증 | 날짜 생략 시 내 시간대 오늘. 두 멤버·설정 목표·합계·개별 기록 |
| POST /api/logs | `{amount_ml,consumed_at}` | 201, 자신의 기록 생성. `Idempotency-Key` UUID 필수 |
| PATCH /api/logs/:id | `{amount_ml,consumed_at}` | 자신의 기록만 수정, `{ok:true}` |
| DELETE /api/logs/:id | 인증 | 자신의 기록만 삭제, `{ok:true}` |
| GET /api/settings | 인증 | 자신의 목표·알림 설정 |
| PUT /api/settings | 아래 전체 설정 | 검증 후 저장 및 대기 중 재시도 취소 |
| POST /api/push/subscribe | `{endpoint,keys:{p256dh,auth}}` | 현재 사용자와 기기 연결, 200 |
| DELETE /api/push/subscribe | `{endpoint}` 또는 `{all:true}` | 본인 기기만 비활성화 |
| POST /api/push/test | 인증 | `{accepted,total,results:[{status}]}`. 결과는 공급자 수락 기준 |
| Cloudflare scheduled handler | Cron 이벤트만 | 공개 HTTP 예약 실행 API는 없음 |

복구 코드 보관에는 migration `0005_recovery_codes.sql`이 필요합니다. `SUBSCRIPTION_KEY`로부터 HKDF-SHA-256으로 분리한 키를 사용해 AES-GCM으로 암호화하며, 검증용 해시와 암호문을 원자적으로 갱신합니다. 기존 계정의 코드는 조회만으로 교체하지 않습니다. 새 코드 발급 시 이전 코드는 만료되며, 복구 시에는 모든 이전 세션도 만료됩니다. `/api/me` 등 일반 조회에는 복구 코드를 포함하지 않습니다. 암호화 키가 없으면 기존 가입·복구는 해시만 보관하는 방식으로 동작하지만 재조회용 코드 발급은 503입니다.

정기 알림은 현재 시각까지 기록한 오늘 섭취량을 목표에서 빼고, 이번 안내와 앞으로 남은 활성 알림 시각 수로 나누어 올림한 권장 ml를 제목·본문에 표시합니다. 지난 시각과 중복 시각은 남은 횟수에 중복 포함하지 않습니다. 목표 2,000ml / 섭취 800ml / 남은 안내 3회이면 400ml입니다. 테스트 알림도 같은 계산 결과에 `[테스트]`를 붙여 보냅니다. 목표 달성 시의 알림 중지 설정과 기존 예약·재시도 중복 방지는 유지합니다.

가입 성공은 `{token,recovery_code,invite_code?}`를 반환합니다. 이미 인증된 사용자가 그룹 생성/참여를 다시 호출하면 `{already_joined:true,group_id}`로 응답하고 별도 계정을 만들지 않습니다. 네트워크 응답을 잃고 토큰도 받지 못한 최초 가입의 자동 복구는 보장하지 않습니다.

```json
{
  "enabled": true,
  "start_time": "09:00",
  "end_time": "22:00",
  "interval_minutes": 60,
  "active_days": [1, 2, 3, 4, 5, 6, 7],
  "stop_when_goal_reached": true,
  "timezone": "Asia/Seoul",
  "daily_goal_ml": 2000,
  "default_drink_ml": 200
}
```

- active_days는 ISO 요일: 월=1, 일=7. 중복과 범위 오류 거부.
- 목표는 정수 100~5,000ml. start_time/end_time/interval_minutes는 구버전 호환 필드이며 고정 시각 예약에 사용하지 않습니다.
- reminders: 8개 {id,time,enabled} 배열. id는 wake/before_breakfast/after_breakfast/before_lunch/after_lunch/before_dinner/after_dinner/bedtime을 중복 없이 포함하며 time은 HH:mm입니다. 생략하면 저장값을 유지합니다. 같은 시각은 한 번 발송합니다.
- GET /api/me의 last_scheduled_notification: 본인의 최근 {scheduled_at,sent_at,status} 또는 null. accepted는 공급자 수락이며 단말 수신 확인이 아닙니다.
- 기본 한 잔 용량(default_drink_ml)은 정수 1~500ml. 기존 사용자 기본값은 200ml이며, 구버전 클라이언트가 필드를 생략하면 새 상한 안에서 저장된 값을 유지합니다.
- 새 섭취 기록 및 수정의 섭취량은 정수 1~500ml, 소비 시각은 2020-01-01 이후·서버 현재 시각+1분 이내. 과거에 저장된 500ml 초과 기록의 조회·합계는 보존합니다.
- 이전의 상한 초과 목표/기본 용량은 설정·프로필·일/월 조회 및 알림 계산에서 각각 5,000/500ml로 정규화합니다. 다음 설정 저장 때 저장값에도 적용합니다. 일일 누적 섭취량을 잘라내는 제한은 아닙니다.
- 닉네임은 trim 후 1~24자. UI는 텍스트로 렌더링.
- user_id/group_id를 입력으로 받지 않음. 날짜 조회의 알 수 없는 쿼리 파라미터도 거부.
- 내 기록이 아니거나 다른 그룹의 ID면 수정·삭제에 404를 반환해 존재 여부를 숨김.
- 동일 Idempotency-Key와 동일 정규화 payload를 재전송하면 기존 기록 반환. 다른 payload는 409.

주요 상태: 400 검증 실패, 401 인증 실패, 403 출처/권한 실패, 404 경로/본인 기록 없음, 409 정원/충돌, 413 과대 본문, 415 JSON 아님, 429 제한 초과, 503 푸시 미설정, 500 내부 오류.

초대·복구 제한은 Cloudflare가 설정하는 `CF-Connecting-IP` 기준입니다. Cloudflare를 우회하는 프록시에 Worker를 노출하지 마세요. 로그에는 토큰/복구 코드/푸시 엔드포인트를 넣지 않습니다.

### 상대 기록 알림

- Settings에 partner_notifications?: boolean 추가. 기본 true, PUT에서 생략하면 저장값 유지. 내 기기에서 상대 기록 알림을 받을지 정하는 옵션입니다.
- POST /api/logs가 새 행을 생성하면 DB 트리거가 같은 그룹의 다른 사용자 중 수신 허용·활성 구독이 있는 기기에만 발송 대기를 생성합니다. log_id/subscription_id 기본키로 중복을 방지합니다. PATCH/DELETE에는 발송하지 않습니다.
- 기록 API 응답 후 waitUntil로 처리하고 매분 Cron이 놓친 대기 및 일시적 실패를 재시도합니다. partner_deliveries는 정기 notification_delivery_logs와 분리합니다. 구독 만료는 비활성화하고 30일 지난 발송 이력은 정리합니다.
