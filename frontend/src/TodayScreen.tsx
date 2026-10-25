import { useEffect, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { ArrowRight, Droplet, Pencil, Trash2, Users } from 'lucide-react';
import type { Me, Member, WaterLog } from '../../shared/types';
import { DrinkSheet } from './DrinkSheet';
import { goalProgress, MilestoneDrop } from './MilestoneDrop';

interface Props {
  me: Me;
  own?: Member;
  partner?: Member;
  logs: WaterLog[];
  today: string;
  loading: boolean;
  busy: boolean;
  online: boolean;
  connected: boolean;
  onSettings: (section?: 'goal' | 'schedule' | 'alerts') => void;
  onHistory: () => void;
  onInvite: () => void;
  onAdd: (amount: number, when: string, key: string) => Promise<void>;
  onEdit: (log: WaterLog) => void;
  onDelete: (log: WaterLog) => void;
}
const fmt = (n: number) => n.toLocaleString('ko-KR');
const MIN_WATER_LEVEL = 18;
const MAX_WATER_LEVEL = 90;

export function TodayScreen(p: Props) {
  const cup = p.me.settings.default_drink_ml ?? 200;
  const [choosing, setChoosing] = useState(false);
  const [reward, setReward] = useState<{
    key: string;
    before: number;
    goal: number;
    day: string;
  } | null>(null);
  const total = p.own?.total_ml;
  const previous = useRef({ total, day: p.today });
  const [splash, setSplash] = useState<{ amount: number; key: number } | null>(null);
  const [displayTotal, setDisplayTotal] = useState(total ?? 0);
  const [waterTotal, setWaterTotal] = useState(total ?? 0);
  useEffect(() => {
    if (!reward) return;
    const timer = window.setTimeout(() => setReward(null), 1400);
    return () => window.clearTimeout(timer);
  }, [reward]);
  useEffect(() => {
    // Keep the visible response for when the amount dialog has closed.
    if (choosing) return;
    const before = previous.current;
    previous.current = { total, day: p.today };
    if (total === undefined) return;
    setWaterTotal(total);
    if (
      before.total === undefined ||
      before.day !== p.today ||
      total <= before.total ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplayTotal(total);
      setSplash(null);
      return;
    }
    setSplash({ amount: total - before.total, key: Date.now() });
    const start = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / 650);
      setDisplayTotal(
        Math.round(before.total! + (total - before.total!) * (1 - (1 - progress) ** 3)),
      );
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const timer = window.setTimeout(() => setSplash(null), 1700);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [total, p.today, choosing]);
  const progress = p.own ? goalProgress(p.own.total_ml, p.own.daily_goal_ml) : null;
  const percent = progress?.percent ?? null;
  const milestoneReached =
    reward &&
    progress &&
    p.own &&
    reward.day === p.today &&
    reward.goal === p.own.daily_goal_ml &&
    progress.stage > goalProgress(reward.before, reward.goal).stage;
  const progressMessage = [
    '한 모금씩 채워가요',
    '첫 물방울을 채웠어요',
    '벌써 절반을 채웠어요',
    '물방울이 거의 완성됐어요',
    '오늘의 물 챙기기 완료!',
  ][progress?.stage ?? 0];
  const waterLevel =
    MIN_WATER_LEVEL +
    (MAX_WATER_LEVEL - MIN_WATER_LEVEL) *
      Math.min(1, Math.max(0, waterTotal / (p.own?.daily_goal_ml || 2000)));
  const partnerPercent = p.partner
    ? Math.round((p.partner.total_ml / p.partner.daily_goal_ml) * 100)
    : 0;
  const reminder = !p.me.settings.enabled
    ? '알림 꺼짐'
    : !p.connected
      ? '알림 연결하기'
      : p.me.next_notification
        ? DateTime.fromISO(p.me.next_notification)
            .setZone(p.me.settings.timezone)
            .toFormat('a h:mm')
            .replace('AM', '오전')
            .replace('PM', '오후')
        : '예정 없음';

  return (
    <div className="water-today">
      <section className="water-stage" aria-label="오늘의 수분 섭취">
        <header className="day-toolbar">
          <span className="person-pill">
            <Droplet size={20} fill="currentColor" />
            <span>
              {p.me.display_name}
              <small>의 하루</small>
            </span>
          </span>
        </header>

        <div className="intake-hero">
          <h1>
            {DateTime.fromISO(p.today).setLocale('ko').toFormat('M월 d일 cccc')}
            <span>오늘 마신 물</span>
          </h1>
          <div
            className={
              'hero-number ' + (String(p.own?.total_ml || 0).length > 4 ? 'long-number' : '')
            }
            aria-label={total === undefined ? '기록 확인 중' : `오늘 ${fmt(total)} ml 마셨어요`}
          >
            <strong aria-hidden="true">{p.own ? fmt(displayTotal) : '—'}</strong>
            <span aria-hidden="true">ml</span>
          </div>
          {splash && (
            <span key={splash.key} className="intake-splash" aria-hidden="true">
              +{fmt(splash.amount)} ml <Droplet size={16} fill="currentColor" />
            </span>
          )}
          <p className="self-care-count">
            {percent === null ? (
              p.loading ? (
                '기록을 불러오는 중이에요'
              ) : (
                '새로고침으로 기록을 확인해 주세요'
              )
            ) : p.logs.length > 0 ? (
              <>
                오늘 나를 챙긴 순간 <strong>{fmt(p.logs.length)}번</strong>
              </>
            ) : (
              '나를 챙기는 첫 한 잔부터'
            )}
          </p>
        </div>

        <div className="today-metrics">
          <button
            className="metric-tile goal-tile"
            onClick={() => p.onSettings('goal')}
            aria-label="하루 목표 변경"
          >
            <span className="metric-label">하루 목표</span>
            <span className="metric-value">
              {fmt(p.me.settings.daily_goal_ml)}
              <small> ml</small>
              <span className="edit-badge">
                <Pencil size={13} />
              </span>
            </span>
            <span className="metric-sub">
              {percent === null ? '기록 확인 중' : `${percent}% 달성`}
            </span>
          </button>
          <button className="metric-tile reminder-tile" onClick={() => p.onSettings('schedule')}>
            <span className="metric-label">다음 리마인더</span>
            <span className="metric-value reminder-value">{reminder}</span>
            <span className="metric-sub">
              {p.connected && p.me.settings.enabled
                ? p.me.next_amount_ml
                  ? `약 ${fmt(p.me.next_amount_ml)} ml · 기록에 맞춰 조절`
                  : '마신 양에 맞춰 알림을 쉬어요'
                : '나만의 물 마시기 리듬'}
            </span>
          </button>
        </div>

        <div className="together-strip">
          <span className="together-avatar">
            {p.partner ? p.partner.display_name.slice(0, 1) : <Users size={20} />}
          </span>
          <div className="together-info">
            <span>
              {p.partner ? (
                <>
                  <strong>{p.partner.display_name}</strong>도 함께 마시는 중
                </>
              ) : (
                '함께할 한 사람을 초대해요'
              )}
            </span>
            {p.partner ? (
              <div
                className="partner-mini-track"
                role="progressbar"
                aria-label="상대방 목표 달성률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(partnerPercent, 100)}
                aria-valuetext={`${partnerPercent}%`}
              >
                <i style={{ width: Math.min(partnerPercent, 100) + '%' }} />
              </div>
            ) : (
              <small>둘이라서 더 꾸준해지는 습관</small>
            )}
          </div>
          {p.partner ? (
            <div className="partner-mini-total">
              <strong>
                {fmt(p.partner.total_ml)}
                <small> ml</small>
              </strong>
              <span>{partnerPercent}%</span>
            </div>
          ) : (
            <button
              className="invite-mini"
              disabled={p.busy || !p.own}
              onClick={p.onInvite}
              aria-label="초대 코드 발급"
            >
              <ArrowRight size={20} />
            </button>
          )}
        </div>

        <div className="water-space" aria-hidden="true">
          <span className="floating-drop drop-a" />
          <span className="floating-drop drop-b" />
        </div>

        <div className="drink-controls">
          <button
            type="button"
            className="cup-drink-button"
            disabled={p.busy || !p.online || !p.own}
            aria-label="물 마시기 · 용량 선택"
            aria-haspopup="dialog"
            onClick={() => setChoosing(true)}
          >
            <span className="cup-droplet" aria-hidden="true">
              <Droplet size={30} fill="currentColor" strokeWidth={1.5} />
            </span>
            <span className="cup-action-label">{p.busy ? '기록 중…' : '물 마시기'}</span>
            <span className="cup-volume">용량 선택</span>
          </button>
          <div
            className={`water-progress ${progress?.complete ? 'is-complete' : ''}`}
            role="progressbar"
            aria-label="오늘 목표를 채운 비율"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? 0}
            aria-valuetext={
              percent === null
                ? '기록 미확인'
                : `오늘 목표의 ${percent}%를 채웠어요. ${progressMessage}`
            }
          >
            <div className="daily-drop">
              {milestoneReached && (
                <span key={reward.key} className="milestone-glow" aria-hidden="true" />
              )}
              <MilestoneDrop stage={progress?.stage ?? 0} />
            </div>
            <div className="water-progress-copy">
              <span className="water-progress-label">
                {percent ?? '—'}
                <small>% 채웠어요</small>
              </span>
              <span className="water-progress-message">
                {progress ? progressMessage : '기록 확인 중'}
              </span>
            </div>
            <div className="drop-milestones" aria-hidden="true">
              {[25, 50, 75, 100].map((step, index) => (
                <span key={step} className={progress && progress.stage > index ? 'is-filled' : ''}>
                  <i />
                  {step}%
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="water-scene" style={{ height: `${waterLevel}%` }} aria-hidden="true">
          <div className="water-landscape">
            <svg viewBox="0 0 600 100" preserveAspectRatio="none">
              <path
                className="wave-back wave-flow"
                d="M0 28 C100 -6 200 -6 300 28 S500 62 600 28 S800 -6 900 28 S1100 62 1200 28 V100 H0Z"
              />
              <path
                className="wave-middle wave-flow"
                d="M0 42 C100 76 200 76 300 42 S500 8 600 42 S800 76 900 42 S1100 8 1200 42 V100 H0Z"
              />
              <path
                className="wave-front wave-flow"
                d="M0 58 C100 28 200 28 300 58 S500 88 600 58 S800 28 900 58 S1100 88 1200 58 V100 H0Z"
              />
            </svg>
            <span className="water-bubble bubble-one" />
            <span className="water-bubble bubble-two" />
            <span className="water-bubble bubble-three" />
          </div>
          {reward && (
            <div key={reward.key} className="drink-reward">
              <Droplet className="reward-drop" size={30} fill="currentColor" strokeWidth={1.5} />
              <span className="reward-ripple" />
              <span className="reward-ripple reward-ripple-delayed" />
              <span className="reward-spark reward-spark-left" />
              <span className="reward-spark reward-spark-right" />
            </div>
          )}
        </div>
      </section>

      <section className="today-log-panel">
        <div className="section-title">
          <h2>
            오늘의 기록 <span>{p.logs.length}회</span>
          </h2>
          <button className="text-button" onClick={p.onHistory}>
            모든 기록 <ArrowRight size={15} />
          </button>
        </div>
        {!p.own ? (
          <p className="empty">
            {p.loading ? '기록을 불러오는 중이에요.' : '기록을 불러오지 못했어요.'}
          </p>
        ) : p.logs.length === 0 ? (
          <p className="empty">아직 마신 물이 없어요. 첫 한 잔을 기록해 볼까요?</p>
        ) : (
          <ul className="logs">
            {[...p.logs].reverse().map((log) => (
              <li key={log.id}>
                <span className="log-drop">
                  <Droplet size={18} />
                </span>
                <div>
                  <strong>
                    +{fmt(log.amount_ml)} <small>ml</small>
                  </strong>
                  <p>
                    {DateTime.fromISO(log.consumed_at)
                      .setZone(p.me.settings.timezone)
                      .toFormat('HH:mm')}
                  </p>
                </div>
                <div className="log-actions">
                  <button
                    aria-label={`${log.amount_ml}ml 기록 수정`}
                    disabled={p.busy}
                    onClick={() => p.onEdit(log)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    aria-label={`${log.amount_ml}ml 기록 삭제`}
                    disabled={p.busy}
                    onClick={() => p.onDelete(log)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="today-zone">{p.me.settings.timezone} 기준</p>
      </section>

      {choosing && (
        <DrinkSheet
          initialAmount={cup}
          online={p.online}
          onClose={() => setChoosing(false)}
          onSave={async (amount, when, key) => {
            await p.onAdd(amount, when, key);
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
              setReward({
                key,
                before: total ?? 0,
                goal: p.own?.daily_goal_ml ?? p.me.settings.daily_goal_ml,
                day: p.today,
              });
          }}
        />
      )}
    </div>
  );
}
