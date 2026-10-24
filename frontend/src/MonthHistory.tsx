import { DateTime } from 'luxon';
import { ArrowLeft, ArrowRight, Droplet, Pencil, Trash2 } from 'lucide-react';
import type { DayData, Me, MonthData, WaterLog } from '../../shared/types';
import './history.css';
const fmt = (n: number) => n.toLocaleString('ko-KR');
export function MonthHistory({
  me,
  month,
  day,
  selected,
  today,
  loading,
  busy,
  onSelect,
  onEdit,
  onDelete,
}: {
  me: Me;
  month: MonthData | null;
  day: DayData | null;
  selected: string;
  today: string;
  loading: boolean;
  busy: boolean;
  onSelect: (date: string) => void;
  onEdit: (log: WaterLog) => void;
  onDelete: (log: WaterLog) => void;
}) {
  const start = DateTime.fromISO(selected).startOf('month');
  const key = start.toFormat('yyyy-MM');
  const members = month
    ? [...month.members].sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id))
    : [];
  const partner = members.find((m) => m.id !== me.id);
  const days =
    month?.days ??
    Array.from({ length: start.daysInMonth! }, (_, i) => ({
      date: start.plus({ days: i }).toISODate()!,
      totals: {} as Record<string, number>,
    }));
  const logs = day ? [...day.logs].sort((a, b) => b.consumed_at.localeCompare(a.consumed_at)) : [];
  const shift = (delta: number) => {
    const next = start.plus({ months: delta });
    onSelect(next.toFormat('yyyy-MM') === today.slice(0, 7) ? today : next.toISODate()!);
  };
  return (
    <div className="month-history" aria-busy={loading}>
      <div className="month-toolbar">
        <button
          type="button"
          aria-label="이전 달"
          disabled={key <= '2020-01'}
          onClick={() => shift(-1)}
        >
          <ArrowLeft size={18} />
        </button>
        <h2>{start.toFormat('yyyy년 M월')}</h2>
        <button
          type="button"
          aria-label="다음 달"
          disabled={key >= today.slice(0, 7)}
          onClick={() => shift(1)}
        >
          <ArrowRight size={18} />
        </button>
        <button className="month-today" type="button" onClick={() => onSelect(today)}>
          오늘
        </button>
      </div>
      <div className="month-summary">
        {members.map((member) => {
          const total = days.reduce((sum, d) => sum + (d.totals[member.id] || 0), 0);
          const recordedDays = days.filter(
            (d) => d.date <= today && (d.totals[member.id] || 0) > 0,
          );
          const recordedAverage = Math.round(
            recordedDays.reduce((sum, d) => sum + (d.totals[member.id] || 0), 0) /
              Math.max(1, recordedDays.length),
          );
          const achieved = days.filter(
            (d) => d.date <= today && (d.totals[member.id] || 0) >= member.daily_goal_ml,
          ).length;
          return (
            <section
              key={member.id}
              className={member.id === me.id ? 'person-mine' : 'person-partner'}
            >
              <span className="person-label">
                <i />
                {member.display_name}
                <small>{member.id === me.id ? '나' : '상대'}</small>
              </span>
              <strong>
                {fmt(total)}
                <small> ml</small>
              </strong>
              <p>
                기록한 날 평균 <b>{fmt(recordedAverage)} ml</b>
              </p>
              <p>
                목표 달성 <b>{achieved}일</b>
              </p>
            </section>
          );
        })}
        {month && !partner && (
          <section className="month-no-partner">
            함께할 사람이 연결되면
            <br />두 사람의 기록이 나란히 보여요.
          </section>
        )}
      </div>
      <section className="month-calendar" aria-label="두 사람의 월간 섭취량 달력">
        <div className="calendar-legend">
          <span className="person-mine">
            <i />나
          </span>
          <span className="person-partner">
            <i />
            상대
          </span>
          <small>단위 ml</small>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {'일월화수목금토'.split('').map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: start.weekday % 7 }, (_, i) => (
            <div key={'blank' + i} />
          ))}
          {days.map((d) => {
            const future = d.date > today;
            const mine = d.totals[me.id] ?? 0;
            const theirs = partner ? (d.totals[partner.id] ?? 0) : null;
            return (
              <button
                type="button"
                key={d.date}
                className={`calendar-day ${d.date === selected ? 'selected' : ''} ${d.date === today ? 'is-today' : ''}`}
                disabled={future}
                aria-pressed={d.date === selected}
                aria-label={`${Number(d.date.slice(-2))}일${month && !future ? `, 나 ${mine}ml${theirs === null ? '' : `, 상대 ${theirs}ml`}` : ''}`}
                onClick={() => onSelect(d.date)}
              >
                <span className="calendar-number">{Number(d.date.slice(-2))}</span>
                <span
                  className={`calendar-amount person-mine ${mine >= me.settings.daily_goal_ml ? 'goal-met' : ''}`}
                >
                  {!month ? '·' : future ? '—' : fmt(mine)}
                </span>
                <span
                  className={`calendar-amount person-partner ${partner && theirs! >= partner.daily_goal_ml ? 'goal-met' : ''}`}
                >
                  {!month ? '·' : future || theirs === null ? '—' : fmt(theirs)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="calendar-note">
          {me.settings.timezone} 기준 · 평균은 1ml 이상 기록한 날만 계산 · 목표 달성은 현재 목표
          기준
        </p>
      </section>
      <section className="history-timeline">
        <div className="section-title">
          <h2>{DateTime.fromISO(selected).setLocale('ko').toFormat('M월 d일 cccc')}</h2>
          <span className="count">{day ? `${logs.length}회` : '…'}</span>
        </div>
        <p className="field-hint">날짜를 누르면 두 사람이 마신 시각과 양을 함께 볼 수 있어요.</p>
        {!day ? (
          <p className="empty">
            {loading ? '기록을 불러오고 있어요.' : '기록을 불러오지 못했어요. 새로고침해 주세요.'}
          </p>
        ) : logs.length === 0 ? (
          <p className="empty">이날은 아직 기록이 없어요.</p>
        ) : (
          <ol className="timeline-logs">
            {logs.map((log) => {
              const mine = log.user_id === me.id;
              return (
                <li key={log.id} className={mine ? 'person-mine' : 'person-partner'}>
                  <time dateTime={log.consumed_at}>
                    {DateTime.fromISO(log.consumed_at)
                      .setZone(me.settings.timezone)
                      .toFormat('HH:mm')}
                  </time>
                  <span className="timeline-drop">
                    <Droplet size={16} />
                  </span>
                  <div className="timeline-person">
                    <span>
                      {day.members.find((m) => m.id === log.user_id)?.display_name}
                      <small>{mine ? '나' : '상대'}</small>
                    </span>
                    <strong>
                      +{fmt(log.amount_ml)} <small>ml</small>
                    </strong>
                  </div>
                  {mine && (
                    <div className="log-actions">
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`${log.amount_ml}ml 기록 수정`}
                        onClick={() => onEdit(log)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`${log.amount_ml}ml 기록 삭제`}
                        onClick={() => onDelete(log)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
