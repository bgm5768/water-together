# REST API 계약

기본 주소: Worker의 `/api`. 운영은 HTTPS. 모든 JSON은 UTF-8이며 요청 본문은 최대 8KB. 날짜·시각은 ISO 8601 UTC 또는 명시적인 offset으로 전달합니다. 기록은 서버에서 UTC 밀리초 표기로 정규화됩니다.

인증: `Authorization: Bearer <세션 토큰>`. API 응답은 `Cache-Control: no-store`. 오류는 `{ "error": "한국어 안내" }` 형태입니다. DB 예외나 비밀값을 응답에 넣지 않습니다.

| 메서드·경로 | 입력 | 결과 / 권한 |
|---|---|---|
| GET /api/health | 없음 | `{ok:true}` |
| POST /api/groups | `{display_name}` | 201, 새 게스트·그룹·세션·초대·복구 코드를 원자적으로 생성 |
| POST /api/join | `{display_name,invite_code}` | 201, 두 번째 멤버 생성. 정원 초과 409 |
| POST /api/recover | `{recovery_code}` | 새 token/recovery_code, 기존 세션 취소 |
| GET /api/me | 인증 | 본인, group_id, role, settings, 활성 기기 수, 다음 예약 후보, 공개 VAPID 키 |
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
  "daily_goal_ml": 2000
}
```

- active_days는 ISO 요일: 월=1, 일=7. 중복과 범위 오류 거부.
- 간격은 30/45/60/90/120분, 목표는 정수 100~10,000ml.
- 섭취량은 정수 1~3,000ml, 소비 시각은 2020-01-01 이후·서버 현재 시각+1분 이내.
- 닉네임은 trim 후 1~24자. UI는 텍스트로 렌더링.
- user_id/group_id를 입력으로 받지 않음. 날짜 조회의 알 수 없는 쿼리 파라미터도 거부.
- 내 기록이 아니거나 다른 그룹의 ID면 수정·삭제에 404를 반환해 존재 여부를 숨김.
- 동일 Idempotency-Key와 동일 정규화 payload를 재전송하면 기존 기록 반환. 다른 payload는 409.

주요 상태: 400 검증 실패, 401 인증 실패, 403 출처/권한 실패, 404 경로/본인 기록 없음, 409 정원/충돌, 413 과대 본문, 415 JSON 아님, 429 제한 초과, 503 푸시 미설정, 500 내부 오류.

초대·복구 제한은 Cloudflare가 설정하는 `CF-Connecting-IP` 기준입니다. Cloudflare를 우회하는 프록시에 Worker를 노출하지 마세요. 로그에는 토큰/복구 코드/푸시 엔드포인트를 넣지 않습니다.
