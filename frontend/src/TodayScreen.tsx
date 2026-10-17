import { useEffect, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { ArrowRight, Bell, Droplet, Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import type { Me, Member, WaterLog } from '../../shared/types';
import { DrinkSheet } from './DrinkSheet';

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
  onRefresh: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onInvite: () => void;
  onAdd: (amount: number, when: string, key: string) => Promise<void>;
  onEdit: (log: WaterLog) => void;
  onDelete: (log: WaterLog) => void;
}
const fmt = (n: number) => n.toLocaleString('ko-KR');

export function TodayScreen(p: Props) {
  const cup = p.me.settings.default_drink_ml ?? 200;
  const [choosing, setChoosing] = useState(false);
  const total = p.own?.total_ml;
  const previous = useRef({ total, day: p.today });
  const [splash, setSplash] = useState<{ amount: number; key: number } | null>(null);
  const [displayTotal, setDisplayTotal] = useState(total ?? 0);
  useEffect(() => {
    const before = previous.current;
    previous.current = { total, day: p.today };
    if (total === undefined) return;
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
  }, [total, p.today]);
  const percent = p.own ? Math.round((p.own.total_ml / p.own.daily_goal_ml) * 100) : null;
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
      <section
        className={'water-stage' + (splash ? ' just-drank' : '')}
        aria-label="오늘의 수분 섭취"
      >
        <header className="day-toolbar">
          <span className="person-pill">
            <Droplet size={20} fill="currentColor" />
            <span>
              {p.me.display_name}
              <small>의 하루</small>
            </span>
          </span>
          <div className="toolbar-actions">
            <button className="round-action" aria-label="알림 설정 열기" onClick={p.onSettings}>
              <Bell size={23} />
              {p.connected && p.me.settings.enabled && <i />}
            </button>
            <button
              className="round-action"
              aria-label="기록 새로고침"
              disabled={p.loading || p.busy}
              onClick={p.onRefresh}
            >
              <RefreshCw size={21} className={p.loading ? 'spin' : ''} />
            </button>
          </div>
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
          <p>
            {percent === null
              ? p.loading
                ? '기록을 불러오는 중이에요'
                : '새로고침으로 기록을 확인해 주세요'
              : percent >= 100
                ? '오늘의 목표를 채웠어요. 잘했어요!'
                : '가볍게 한 잔, 나를 위한 작은 습관'}
          </p>
        </div>

        <div className="today-metrics">
          <button
            className="metric-tile goal-tile"
            onClick={p.onSettings}
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
          <button className="metric-tile reminder-tile" onClick={p.onSettings}>
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
          <div className="cup-selector cup-preview" aria-hidden="true">
            <span className="cup-droplet">
              <Droplet size={15} fill="currentColor" />
            </span>
            <span className="drinking-glass" aria-hidden="true">
              <span
                className="glass-water"
                style={{ height: `${Math.min(38, 15 + cup / 22)}px` }}
              />
              <span className="glass-shine" />
            </span>
            <span className="cup-volume">
              {cup}
              <small> ml</small>
            </span>
          </div>
          <div
            className="water-progress"
            role="progressbar"
            aria-label="나의 목표 달성률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(percent || 0, 100)}
            aria-valuetext={percent === null ? '기록 미확인' : `${percent}%`}
          >
            <span className="water-progress-label">
              {percent ?? '—'}
              <small>%</small>
            </span>
            <span>
              {percent === null
                ? '기록 확인 중'
                : percent >= 100
                  ? '목표 달성!'
                  : `목표까지 ${fmt(Math.max(0, p.me.settings.daily_goal_ml - (p.own?.total_ml || 0)))} ml`}
            </span>
          </div>
          <button
            className="drink-button"
            disabled={p.busy || !p.online || !p.own}
            onClick={() => setChoosing(true)}
          >
            <Plus size={27} />
            <strong>{p.busy ? '저장하는 중…' : '물 마시기'}</strong>
            <span>양 조절하기</span>
          </button>
        </div>
        <div className="water-landscape" aria-hidden="true">
          <svg viewBox="0 0 600 240" preserveAspectRatio="none">
            <path
              className="wave-back wave-flow"
              d="M0 55 Q150 5 300 55 T600 55 T900 55 T1200 55 V240 H0Z"
            />
            <path
              className="wave-middle wave-flow"
              d="M0 80 Q150 130 300 80 T600 80 T900 80 T1200 80 V240 H0Z"
            />
            <path
              className="wave-front wave-flow"
              d="M0 95 Q150 60 300 95 T600 95 T900 95 T1200 95 V240 H0Z"
            />
          </svg>
          <span className="water-bubble bubble-one" />
          <span className="water-bubble bubble-two" />
          <span className="water-bubble bubble-three" />
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
          onSave={p.onAdd}
        />
      )}
    </div>
  );
}
