import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from './api';
import { CodeBox } from './CodeBox';

type Recovery = { recovery_code: string | null };

export function RecoveryCode({ online }: { online: boolean }) {
  const [data, setData] = useState<Recovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<Recovery>('/api/recovery-code')
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  async function issue() {
    if (issuing) return;
    setIssuing(true);
    setError('');
    try {
      setData(await api<Recovery>('/api/recovery-code', 'POST', {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIssuing(false);
    }
  }
  return (
    <section className="card settings-card" aria-label="내 복구 코드">
      <h2>
        <ShieldCheck size={20} /> 내 복구 코드
      </h2>
      {loading ? (
        <p className="field-hint" role="status">
          복구 코드를 확인하고 있어요.
        </p>
      ) : data?.recovery_code ? (
        <>
          <p className="field-hint">
            새 기기에서 내 기록을 연결할 때 사용해요. 상대방에게 공유하지 마세요.
          </p>
          <CodeBox label="나만의 복구 코드" value={data.recovery_code} onError={setError} />
          <p className="field-hint">
            복구에 사용하면 새 코드로 바뀌며, 이 탭에서 다시 복사할 수 있어요.
          </p>
        </>
      ) : data ? (
        <>
          <p className="field-hint">
            이전 버전에서 받은 코드는 다시 표시할 수 없어요. 새 코드를 한 번 발급하면 이 탭에서
            언제든 복사할 수 있어요.
          </p>
          <p className="field-hint">
            새 코드를 발급하면 이전 복구 코드는 만료돼요. 현재 연결과 기록은 유지돼요.
          </p>
          <button type="button" disabled={issuing || !online} onClick={() => void issue()}>
            {issuing ? '발급 중…' : '새 복구 코드 발급'}
          </button>
        </>
      ) : (
        <button type="button" disabled={!online} onClick={() => setRetry((n) => n + 1)}>
          다시 확인
        </button>
      )}
      {error && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
