import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { DateTime } from 'luxon';
import {
  Droplet,
  Plus,
  History,
  Bell,
  Sun,
  ArrowRight,
  ArrowLeft,
  Check,
  RefreshCw,
  Settings2,
  Users,
  Copy,
  ShieldCheck,
  Trash2,
  Pencil,
  WifiOff,
  X,
} from 'lucide-react';
import type { DayData, Me, Settings, WaterLog, Member } from '../../shared/types';
import { localDate } from '../../shared/time';
import { api, ApiError, session, vapidBytes } from './api';
import { copy } from './copy';
import { TodayScreen } from './TodayScreen';
import { InstallApp } from './InstallApp';
import { ReminderPlan } from './ReminderPlan';
import { ReminderSchedule } from './ReminderSchedule';
import { useWaterSound } from './WaterSound';
import { SettingsTabs, SettingsPanel, type SettingsTab } from './SettingsTabs';
import { LaunchScreen } from './LaunchScreen';

type Codes = { recovery_code?: string; invite_code?: string };
const fmt = (n: number) => n.toLocaleString('ko-KR');
const time = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone).toFormat('HH:mm');
const supportsPush = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export function App() {
  const waterSound = useWaterSound();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('goal');
  const [token, setToken] = useState(() => session.get()),
    [me, setMe] = useState<Me | null>(null),
    [day, setDay] = useState<DayData | null>(null);
  const [tab, setTab] = useState<'today' | 'history' | 'settings'>('today'),
    [date, setDate] = useState(''),
    [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine),
    [codes, setCodes] = useState<Codes | null>(null),
    [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<WaterLog | 'new' | null>(null),
    [amount, setAmount] = useState('200'),
    [consumed, setConsumed] = useState('');
  const [deleting, setDeleting] = useState<WaterLog | null>(null),
    [draft, setDraft] = useState<Settings | null>(null),
    [device, setDevice] = useState(false);
  const [permission, setPermission] = useState(
      supportsPush() ? Notification.permission : 'unsupported',
    ),
    [update, setUpdate] = useState<ServiceWorker | null>(null);
  const requestVersion = useRef(0),
    mutation = useRef(false),
    newLogKey = useRef(crypto.randomUUID());
  const today = localDate(clock, me?.settings.timezone || 'Asia/Seoul');
  const selected = tab === 'history' ? date || today : today;
  const refresh = useCallback(async () => {
    if (!token) return;
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const current = await api<Me>('/api/me');
      const selectedDate =
        tab === 'history'
          ? date || localDate(Date.now(), current.settings.timezone)
          : localDate(Date.now(), current.settings.timezone);
      const result = await api<DayData>('/api/day?date=' + selectedDate);
      if (version !== requestVersion.current) return;
      setMe(current);
      setDay(result);
      setDraft((d) => d || current.settings);
      if (supportsPush()) {
        const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
        setDevice(!!(await reg?.pushManager.getSubscription()));
        setPermission(Notification.permission);
      }
    } catch (e) {
      if (version !== requestVersion.current) return;
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 401) {
        session.clear();
        setToken(null);
        setMe(null);
        setDay(null);
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [token, tab, date, today]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 60000);
    const on = () => {
        setOnline(true);
        void refresh();
      },
      off = () => setOnline(false),
      focus = () => {
        setClock(Date.now());
        void refresh();
      };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(tick);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    let disposed = false;
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        if (disposed) return;
        if (reg.waiting) setUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller)
              setUpdate(worker);
          });
        });
      })
      .catch(() => setNotice('앱 오프라인 준비에 실패했어요. 새로고침 후 다시 확인해 주세요.'));
    const alreadyControlled = !!navigator.serviceWorker.controller;
    const reload = () => {
      if (alreadyControlled) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', reload);
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function add(
    n: number,
    when = new Date().toISOString(),
    key: string = crypto.randomUUID(),
  ) {
    await api('/api/logs', 'POST', { amount_ml: n, consumed_at: when }, key);
    setNotice(`${fmt(n)}ml를 기록했어요.`);
    await refresh();
  }
  async function addFromCup(n: number, when: string, key: string) {
    if (mutation.current) throw new Error('다른 작업이 끝난 후 다시 시도해 주세요.');
    mutation.current = true;
    setBusy(true);
    setNotice('');
    try {
      await add(n, when, key);
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  function openEdit(log: WaterLog | 'new') {
    newLogKey.current = crypto.randomUUID();
    setEditing(log);
    setAmount(log === 'new' ? String(me?.settings.default_drink_ml ?? 200) : String(log.amount_ml));
    setConsumed(
      log === 'new'
        ? DateTime.now().setZone(me!.settings.timezone).toFormat("yyyy-MM-dd'T'HH:mm")
        : DateTime.fromISO(log.consumed_at)
            .setZone(me!.settings.timezone)
            .toFormat("yyyy-MM-dd'T'HH:mm"),
    );
  }
  async function enableDevice() {
    if (!supportsPush())
      throw new Error(
        '이 브라우저는 푸시 알림을 지원하지 않아요. Android Chrome에서 HTTPS 주소를 열어 주세요.',
      );
    if (!me?.vapid_public_key)
      throw new Error('서버 푸시 키 설정이 필요해요. README의 배포 절차를 확인해 주세요.');
    const permission = await Notification.requestPermission();
    setPermission(permission);
    if (permission !== 'granted')
      throw new Error('알림이 허용되지 않았어요. 브라우저의 사이트 설정 → 알림에서 허용해 주세요.');
    const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    if (!reg?.active)
      throw new Error(
        'PWA가 아직 준비되지 않았어요. 빌드된 앱을 HTTPS 또는 localhost에서 열고 새로고침해 주세요.',
      );
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(me.vapid_public_key),
      }));
    const value = sub.toJSON();
    await api('/api/push/subscribe', 'POST', { endpoint: value.endpoint, keys: value.keys });
    setDevice(true);
    setNotice('이 기기에 알림을 연결했어요. 테스트 알림으로 수신을 확인해 주세요.');
    await refresh();
  }
  const visibleDay = day?.date === selected && day.timezone === me?.settings.timezone ? day : null;
  const own = visibleDay?.members.find((m) => m.id === me?.id),
    partner = visibleDay?.members.find((m) => m.id !== me?.id);
  const dailyLogs = visibleDay?.logs.filter((l) => tab === 'history' || l.user_id === me?.id) || [];
  return (
    <div className={`app-shell ${token && me ? `signed-in tab-${tab}` : 'guest-app'}`}>
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">
            <Droplet size={23} fill="currentColor" />
          </span>
          {copy.name}
        </a>
        <span className="top-note">
          <span className="live-dot" /> 둘이서, 꾸준히
        </span>
      </header>
      <div className="app-notices">
        {!online && (
          <div className="banner warning" role="status">
            <WifiOff size={18} /> 오프라인이에요. 다시 연결하면 기록을 확인하고 저장할 수 있어요.
          </div>
        )}
        {update && (
          <div className="banner">
            새 버전이 준비되었어요.
            <button onClick={() => update.postMessage('SKIP_WAITING')}>새로 적용</button>
          </div>
        )}
        {error && (
          <div className="banner error" role="alert">
            {error}
            <button aria-label="오류 닫기" onClick={() => setError('')}>
              <X size={18} />
            </button>
          </div>
        )}
        {notice && (
          <div className="banner success" role="status">
            {notice}
            <button aria-label="안내 닫기" onClick={() => setNotice('')}>
              <X size={18} />
            </button>
          </div>
        )}
      </div>
      {!token ? (
        <Onboarding
          busy={busy}
          run={run}
          onSuccess={(r) => {
            session.set(r.token);
            setToken(r.token);
            setCodes(r);
            setSaved(false);
          }}
        />
      ) : !me ? (
        <main aria-label="공간 불러오는 중" />
      ) : (
        <>
          <main>
            {tab === 'today' ? (
              <TodayScreen
                me={me}
                own={own}
                partner={partner}
                logs={dailyLogs}
                today={today}
                loading={loading}
                busy={busy}
                online={online}
                connected={device && permission === 'granted' && me.subscription_count > 0}
                onRefresh={() => void refresh()}
                onSettings={(section = 'goal') => {
                  setSettingsTab(section);
                  setDraft((current) => current ?? me.settings);
                  setTab('settings');
                }}
                onHistory={() => {
                  setDate(today);
                  setTab('history');
                }}
                onInvite={() =>
                  void run(async () => {
                    const r = await api<Codes>('/api/invite', 'POST');
                    setCodes(r);
                    setSaved(false);
                  })
                }
                onAdd={addFromCup}
                onEdit={openEdit}
                onDelete={setDeleting}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">
                      {tab === 'history' ? '우리의 하루하루' : '나만의 건강한 리듬'}
                    </p>
                    <h1>{tab === 'history' ? '차곡차곡 쌓인 기록' : '나에게 맞는 물 마시기'}</h1>
                    <p className="muted">
                      {tab === 'history'
                        ? '함께 마신 하루를 돌아보세요.'
                        : '일상에 맞춰 알림과 목표를 설정해 보세요.'}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => void refresh()}
                    disabled={loading || busy}
                    aria-label="기록 새로고침"
                  >
                    <RefreshCw size={20} className={loading ? 'spin' : ''} />
                  </button>
                </div>
                {tab !== 'settings' ? (
                  <>
                    <div className="date-row">
                      <span>
                        <Sun size={18} />
                        {DateTime.fromISO(selected).setLocale('ko').toFormat('M월 d일 cccc')}
                      </span>
                      <div className="date-picker">
                        <button
                          aria-label="전날"
                          onClick={() =>
                            setDate(DateTime.fromISO(selected).minus({ days: 1 }).toISODate()!)
                          }
                        >
                          <ArrowLeft size={18} />
                        </button>
                        <input
                          aria-label="기록 날짜"
                          type="date"
                          value={selected}
                          max={today}
                          onChange={(e) => e.target.value && setDate(e.target.value)}
                        />
                        <button
                          aria-label="다음 날"
                          disabled={selected >= today}
                          onClick={() =>
                            setDate(DateTime.fromISO(selected).plus({ days: 1 }).toISODate()!)
                          }
                        >
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </div>
                    <p className="zone-note">
                      {me.settings.timezone} 기준 · 목표는 현재 설정값
                      {loading ? ' · 불러오는 중…' : ''}
                    </p>
                    <div className="dashboard-grid">
                      <section className="primary-column">
                        {own && <ProgressCard member={own} mine />}
                        <section className="card log-card">
                          <div className="section-title">
                            <h2>두 사람의 기록</h2>
                            <span className="count">{dailyLogs.length}회</span>
                          </div>
                          {!visibleDay ? (
                            <p className="empty">
                              {loading
                                ? '기록을 불러오는 중…'
                                : '이 날짜의 기록을 불러오지 못했어요.'}
                            </p>
                          ) : dailyLogs.length === 0 ? (
                            <div className="empty">
                              <Droplet size={28} />
                              <p>아직 기록된 한 잔이 없어요.</p>
                              <span>다른 날짜의 기록도 확인해 보세요.</span>
                            </div>
                          ) : (
                            <ul className="logs">
                              {dailyLogs.map((log) => (
                                <li key={log.id}>
                                  <span className="log-drop">
                                    <Droplet size={18} />
                                  </span>
                                  <div>
                                    <strong>
                                      +{fmt(log.amount_ml)} <small>ml</small>
                                    </strong>
                                    <p>
                                      {time(log.consumed_at, me.settings.timezone)}
                                      {tab === 'history'
                                        ? ' · ' +
                                          day?.members.find((m) => m.id === log.user_id)
                                            ?.display_name
                                        : ''}
                                    </p>
                                  </div>
                                  {log.user_id === me.id && (
                                    <div className="log-actions">
                                      <button
                                        disabled={busy}
                                        aria-label={`${time(log.consumed_at, me.settings.timezone)} ${log.amount_ml}ml 수정`}
                                        onClick={() => openEdit(log)}
                                      >
                                        <Pencil size={16} />
                                      </button>
                                      <button
                                        disabled={busy}
                                        aria-label={`${time(log.consumed_at, me.settings.timezone)} ${log.amount_ml}ml 삭제`}
                                        onClick={() => setDeleting(log)}
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                      </section>
                      <aside>
                        {partner ? (
                          <ProgressCard member={partner} />
                        ) : !visibleDay ? (
                          <section className="card">
                            <p className="muted">
                              {loading ? '기록을 불러오는 중…' : '새로고침으로 다시 불러와 주세요.'}
                            </p>
                          </section>
                        ) : (
                          <section className="card partner-empty">
                            <span className="round-icon">
                              <Users size={25} />
                            </span>
                            <h2>함께할 한 사람을 기다려요</h2>
                            <p>
                              초대 코드를 전하고
                              <br />
                              서로의 물 마시기를 응원해 주세요.
                            </p>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const r = await api<Codes>('/api/invite', 'POST');
                                  setCodes(r);
                                  setSaved(false);
                                })
                              }
                            >
                              초대 코드 발급 <ArrowRight size={16} />
                            </button>
                          </section>
                        )}
                        <section className="reminder-card">
                          <span className="small-icon">
                            <Bell size={20} />
                          </span>
                          <div>
                            <h3>
                              {me.settings.enabled && device && permission === 'granted'
                                ? '물 마실 때, 알려드릴게요'
                                : '나만의 물 마시기 리듬'}
                            </h3>
                            <p>
                              {me.settings.enabled
                                ? '예약 알림 켜짐 · 지정한 시각에 안내'
                                : '예약 알림 꺼짐'}
                              <br />
                              {device && permission === 'granted'
                                ? '이 기기 브라우저 구독 있음'
                                : '이 기기 알림 연결이 필요해요'}
                            </p>
                            <button
                              className="text-button"
                              onClick={() => {
                                setSettingsTab('alerts');
                                setTab('settings');
                              }}
                            >
                              알림 설정 <ArrowRight size={14} />
                            </button>
                          </div>
                        </section>
                        <div className="gentle-note">
                          <span>💧</span>
                          <p>
                            한 번에 많이보다,
                            <br />
                            <strong>조금씩 자주 마셔요.</strong>
                          </p>
                        </div>
                      </aside>
                    </div>
                  </>
                ) : (
                  draft && (
                    <SettingsTabs active={settingsTab} onChange={setSettingsTab}>
                      <form
                        className="settings-form"
                        onInvalidCapture={(event) => {
                          const panel = (event.target as HTMLElement)
                            .closest('[data-settings-panel]')
                            ?.getAttribute('data-settings-panel');
                          if (panel && panel !== settingsTab) {
                            event.preventDefault();
                            setSettingsTab(panel as SettingsTab);
                            const input = event.target as HTMLInputElement;
                            requestAnimationFrame(() => input.focus());
                            setError('입력한 값의 범위와 형식을 확인해 주세요.');
                          }
                        }}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(async () => {
                            const result = await api<Settings>('/api/settings', 'PUT', draft);
                            setDraft(result);
                            setMe({ ...me, settings: result });
                            setNotice('변경한 설정을 모두 저장했어요.');
                            await refresh();
                          });
                        }}
                      >
                        <SettingsPanel id="goal" active={settingsTab}>
                          <div className="card settings-card">
                            <h2>
                              <Droplet size={20} /> 하루의 목표
                            </h2>
                            <p className="field-hint">
                              하루 목표와 물 마시기를 열 때의 기본 용량을 정해요.
                            </p>
                            <label>
                              하루 목표량{' '}
                              <div className="input-unit">
                                <input
                                  type="number"
                                  min="100"
                                  max="10000"
                                  step="1"
                                  required
                                  value={draft.daily_goal_ml}
                                  onChange={(e) =>
                                    setDraft({ ...draft, daily_goal_ml: Number(e.target.value) })
                                  }
                                />
                                <span>ml</span>
                              </div>
                            </label>
                            <label>
                              기본 한 잔 용량
                              <div className="input-unit">
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  max="3000"
                                  step="1"
                                  required
                                  value={draft.default_drink_ml ?? 200}
                                  onChange={(event) =>
                                    setDraft({
                                      ...draft,
                                      default_drink_ml: Number(event.target.value),
                                    })
                                  }
                                />
                                <span>ml</span>
                              </div>
                              <small className="field-hint">
                                물 마시기를 열 때 이 양부터 시작해요. 매번 드래그로 조절할 수
                                있어요.
                              </small>
                            </label>
                          </div>
                        </SettingsPanel>
                        <SettingsPanel id="schedule" active={settingsTab}>
                          <div className="card settings-card">
                            <h2>
                              <Sun size={20} /> 나의 물 마시기 시간
                            </h2>
                            <p className="field-hint">
                              예약 시각과 요일을 정해요. 정각 도착은 보장되지 않으며 알림
                              켜기·끄기는 알림 설정에서 바꿔요.
                            </p>
                            <ReminderSchedule
                              value={draft.reminders}
                              onChange={(reminders) => setDraft({ ...draft, reminders })}
                            />
                            <fieldset>
                              <legend>알림 받을 요일</legend>
                              <div className="weekdays">
                                {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => (
                                  <label
                                    key={d}
                                    className={draft.active_days.includes(i + 1) ? 'selected' : ''}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={draft.active_days.includes(i + 1)}
                                      onChange={(e) =>
                                        setDraft({
                                          ...draft,
                                          active_days: e.target.checked
                                            ? [...draft.active_days, i + 1].sort()
                                            : draft.active_days.filter((x) => x !== i + 1),
                                        })
                                      }
                                    />
                                    {d}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <label>
                              시간대
                              <input
                                required
                                value={draft.timezone}
                                list="timezones"
                                onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                              />
                              <datalist id="timezones">
                                <option>Asia/Seoul</option>
                                <option>Asia/Tokyo</option>
                                <option>America/New_York</option>
                                <option>Europe/London</option>
                                <option>UTC</option>
                              </datalist>
                            </label>

                            <ReminderPlan settings={draft} now={clock} />
                          </div>
                        </SettingsPanel>
                        <SettingsPanel id="alerts" active={settingsTab}>
                          <div className="card settings-card">
                            <h2>
                              <Bell size={20} /> 어떤 알림을 받을까요?
                            </h2>
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={draft.enabled}
                                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                              />
                              <span>
                                예약 알림 활성화
                                <small>브라우저 권한과 기기 연결이 별도로 필요해요.</small>
                              </span>
                            </label>
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={draft.stop_when_goal_reached}
                                onChange={(e) =>
                                  setDraft({ ...draft, stop_when_goal_reached: e.target.checked })
                                }
                              />
                              <span>하루 목표를 채우면 알림 쉬기</span>
                            </label>

                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={draft.partner_notifications ?? true}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    partner_notifications: event.target.checked,
                                  })
                                }
                              />
                              <span>
                                상대가 물을 마시면 알림 받기
                                <small>
                                  상대가 새 기록을 남기면 이름과 마신 양을 알려드려요. 내 예약
                                  시간·목표 달성과 관계없이 받아요.
                                </small>
                              </span>
                            </label>
                            <p className="field-hint">
                              이 기기의 알림을 연결해야 받을 수 있어요. 물소리와 기기 연결은
                              아래에서 관리해요.
                            </p>
                          </div>
                          <section className="card settings-card">
                            <h2>
                              <Bell size={20} /> 이 기기의 알림
                            </h2>
                            <dl className="status-list">
                              <div>
                                <dt>브라우저 권한</dt>
                                <dd>
                                  {
                                    {
                                      granted: '허용됨',
                                      denied: '차단됨',
                                      default: '아직 요청하지 않음',
                                      unsupported: '지원하지 않음',
                                    }[permission]
                                  }
                                </dd>
                              </div>
                              <div>
                                <dt>이 기기 구독</dt>
                                <dd>{device ? '브라우저 구독 있음' : '연결 필요'}</dd>
                              </div>
                              <div>
                                <dt>서버의 활성 기기</dt>
                                <dd>{me.subscription_count}대</dd>
                              </div>
                              <div>
                                <dt>다음 예약 후보</dt>
                                <dd>
                                  {me.next_notification
                                    ? DateTime.fromISO(me.next_notification)
                                        .setZone(me.settings.timezone)
                                        .toFormat('M/d HH:mm')
                                    : '예정 없음'}
                                </dd>
                              </div>
                              <div>
                                <dt>최근 정기 발송</dt>
                                <dd>
                                  {me.last_scheduled_notification ? (
                                    <>
                                      {DateTime.fromISO(me.last_scheduled_notification.scheduled_at)
                                        .setZone(me.settings.timezone)
                                        .toFormat('M/d HH:mm')}
                                      <br />
                                      {{
                                        accepted: '푸시 서비스 수락',
                                        retry: '재시도 예정',
                                        failed: '발송 실패',
                                        expired: '구독 만료',
                                        cancelled: '설정·목표에 따라 취소',
                                        sending: '발송 중',
                                        unknown: '결과 확인 필요',
                                      }[me.last_scheduled_notification.status] ?? '결과 확인 필요'}
                                    </>
                                  ) : (
                                    '아직 발송 기록 없음'
                                  )}
                                </dd>
                              </div>
                            </dl>
                            <p className="field-hint">
                              {me.next_amount_ml
                                ? `다음에는 약 ${fmt(me.next_amount_ml)} ml를 안내해요. `
                                : ''}
                              기록에 따라 안내하는 양이 달라져요. 서버는 매분 확인하며,
                              기기·네트워크 상태에 따라 도착이 늦어질 수 있어요.
                            </p>
                            <p className="field-hint">
                              ‘푸시 서비스 수락’은 서버 발송 결과이며 휴대폰에서의 수신 확인은
                              아니에요.
                            </p>
                            {waterSound}
                            <button
                              type="button"
                              className="primary"
                              disabled={busy || !online}
                              onClick={() => void run(enableDevice)}
                            >
                              {device ? '이 기기 구독 다시 연결' : '이 기기 알림 허용·연결'}
                            </button>
                            <button
                              type="button"
                              disabled={busy || !online}
                              onClick={() =>
                                void run(async () => {
                                  const r = await api<{ accepted: number; total: number }>(
                                    '/api/push/test',
                                    'POST',
                                  );
                                  setNotice(
                                    `푸시 서비스가 ${r.total}개 중 ${r.accepted}개 요청을 수락했어요. 실제 알림 표시는 휴대폰에서 확인해 주세요.`,
                                  );
                                  await refresh();
                                })
                              }
                            >
                              테스트 알림 보내기
                            </button>
                            <button
                              type="button"
                              disabled={busy || !device}
                              onClick={() =>
                                void run(async () => {
                                  const reg = await navigator.serviceWorker.getRegistration(
                                      import.meta.env.BASE_URL,
                                    ),
                                    sub = await reg?.pushManager.getSubscription();
                                  if (sub) {
                                    await api('/api/push/subscribe', 'DELETE', {
                                      endpoint: sub.endpoint,
                                    });
                                    await sub.unsubscribe();
                                  }
                                  setDevice(false);
                                  setNotice('이 기기의 구독을 해제했어요.');
                                  await refresh();
                                })
                              }
                            >
                              이 기기 구독 해제
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy || !me.subscription_count}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    '이 사용자의 모든 기기에서 푸시 구독을 해제할까요?',
                                  )
                                )
                                  void run(async () => {
                                    await api('/api/push/subscribe', 'DELETE', { all: true });
                                    const reg = await navigator.serviceWorker.getRegistration(
                                      import.meta.env.BASE_URL,
                                    );
                                    await (await reg?.pushManager.getSubscription())?.unsubscribe();
                                    setDevice(false);
                                    setNotice('모든 기기의 서버 구독을 해제했어요.');
                                    await refresh();
                                  });
                              }}
                            >
                              분실 기기 포함 모든 구독 해제
                            </button>
                            {permission === 'denied' && (
                              <p className="field-hint">
                                Chrome 주소창의 사이트 정보 → 권한 → 알림에서 허용한 뒤 다시 연결해
                                주세요.
                              </p>
                            )}
                            <p className="field-hint">
                              절전 모드·브라우저 설정·네트워크에 따라 알림이 지연되거나 오지 않을 수
                              있어요.
                            </p>
                          </section>
                        </SettingsPanel>
                        <div
                          className="settings-save"
                          hidden={settingsTab === 'together' || settingsTab === 'app'}
                        >
                          <span>
                            {JSON.stringify(draft) === JSON.stringify(me.settings)
                              ? '설정이 저장되어 있어요'
                              : '저장하지 않은 변경사항이 있어요'}
                          </span>
                          <button className="primary" disabled={busy || !online}>
                            {busy ? '저장 중…' : '변경사항 모두 저장'}
                          </button>
                        </div>
                      </form>
                      <SettingsPanel id="together" active={settingsTab}>
                        <section className="card settings-card">
                          <h2>
                            <Users size={20} /> 함께하는 우리
                          </h2>
                          <p className="field-hint">
                            같은 공간의 두 사람이 물 마시는 습관을 함께 만들어요.
                          </p>
                          <ul className="settings-members">
                            {day?.members.map((member) => (
                              <li key={member.id}>
                                <span className="member-avatar">
                                  <Droplet size={20} />
                                </span>
                                <strong>{member.display_name}</strong>
                                <span>{member.id === me.id ? '나' : '함께하는 사람'}</span>
                              </li>
                            ))}
                          </ul>
                          {(day?.members.length ?? 1) < 2 ? (
                            <>
                              <p>아직 함께하는 사람이 없어요. 초대 코드를 전해 연결해 보세요.</p>
                              <button
                                type="button"
                                className="primary"
                                disabled={busy || !online}
                                onClick={() =>
                                  void run(async () => {
                                    const result = await api<Codes>('/api/invite', 'POST');
                                    setCodes(result);
                                    setSaved(false);
                                  })
                                }
                              >
                                초대 코드 발급 <ArrowRight size={16} />
                              </button>
                            </>
                          ) : (
                            <p className="field-hint">
                              두 사람이 연결됐어요. 새 물 기록은 상대의 알림 설정에 따라 알려드려요.
                            </p>
                          )}
                          <button type="button" onClick={() => setSettingsTab('alerts')}>
                            상대 기록 알림 설정하기
                          </button>
                        </section>
                      </SettingsPanel>
                      <SettingsPanel id="app" active={settingsTab}>
                        <InstallApp />
                        <section className="card settings-card">
                          <h2>
                            <ShieldCheck size={20} /> 내 계정
                          </h2>
                          <dl className="status-list">
                            <div>
                              <dt>내 이름</dt>
                              <dd>{me.display_name}</dd>
                            </div>
                          </dl>
                          <p className="field-hint">
                            가입 없이 이 기기에 연결되어 있어요. 새 기기에서는 보관한 복구 코드로
                            이어서 사용할 수 있어요.
                          </p>
                        </section>
                        <section className="recovery-note">
                          <ShieldCheck size={23} />
                          <div>
                            <h3>복구 코드는 안전한 곳에</h3>
                            <p>
                              브라우저 데이터를 지우거나 기기를 바꾸면 복구 코드가 필요해요. 코드와
                              세션을 모두 잃으면 자동 복구할 수 없어요.
                            </p>
                          </div>
                        </section>
                      </SettingsPanel>
                    </SettingsTabs>
                  )
                )}
              </>
            )}
          </main>
          <nav className="bottom-nav" aria-label="주 메뉴">
            {(
              [
                ['today', Droplet, '오늘'],
                ['history', History, '기록'],
                ['settings', Settings2, '내 설정'],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                aria-current={tab === key ? 'page' : undefined}
                className={tab === key ? 'active' : ''}
                onClick={() => {
                  setTab(key);
                  if (key === 'settings') setDraft((current) => current ?? me.settings);
                }}
              >
                <Icon size={21} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
      <footer>매일의 작은 습관, 둘이라서 더 꾸준하게.</footer>
      <LaunchScreen ready={!token || !!me} error={!me && !loading ? error : undefined} onRetry={() => void refresh()} />
      {codes && (
        <Modal
          error={error}
          title={codes.recovery_code ? '우리의 공간이 준비됐어요' : '함께할 사람을 초대해요'}
        >
          {codes.recovery_code && (
            <>
              <p>
                복구 코드는 다시 표시되지 않아요. 비밀번호 관리자 등 안전한 곳에 저장해 주세요.
                복구에 사용하면 기존 세션과 이전 코드는 만료돼요.
              </p>
              <CodeBox
                label="나만의 복구 코드 · 상대에게 보내지 마세요"
                value={codes.recovery_code}
                onError={setError}
              />
            </>
          )}
          {codes.invite_code && (
            <CodeBox
              label="상대방에게 보낼 초대 코드"
              value={codes.invite_code}
              onError={setError}
            />
          )}
          <label className="check-row">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>
              {codes.recovery_code
                ? '복구 코드를 안전한 곳에 저장했어요'
                : '초대 코드를 복사했어요'}
            </span>
          </label>
          <button className="primary" disabled={!saved} onClick={() => setCodes(null)}>
            시작하기 <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {editing && (
        <Modal
          error={error}
          title={editing === 'new' ? '직접 기록하기' : '기록 수정'}
          onClose={() => !busy && setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const when = DateTime.fromISO(consumed, { zone: me!.settings.timezone });
                if (!when.isValid) throw new Error('섭취 시각을 확인해 주세요.');
                const payload = { amount_ml: Number(amount), consumed_at: when.toUTC().toISO()! };
                if (editing === 'new')
                  await add(payload.amount_ml, payload.consumed_at, newLogKey.current);
                else {
                  await api('/api/logs/' + editing.id, 'PATCH', payload);
                  setNotice('기록을 수정했어요.');
                  await refresh();
                }
                setEditing(null);
              });
            }}
          >
            <label>
              마신 양 (ml)
              <input
                autoFocus
                required
                type="number"
                min="1"
                max="3000"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              섭취 시각 · {me?.settings.timezone}
              <input
                required
                type="datetime-local"
                value={consumed}
                onChange={(e) => setConsumed(e.target.value)}
              />
            </label>
            <p className="field-hint">1~3,000ml까지 기록할 수 있어요.</p>
            <button className="primary" disabled={busy || !online}>
              저장
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          error={error}
          title="이 기록을 삭제할까요?"
          onClose={() => !busy && setDeleting(null)}
        >
          <p>{fmt(deleting.amount_ml)}ml 기록이 삭제되어 합계에 반영돼요.</p>
          <button
            className="danger"
            disabled={busy || !online}
            onClick={() =>
              void run(async () => {
                await api('/api/logs/' + deleting.id, 'DELETE');
                setDeleting(null);
                setNotice('기록을 삭제했어요.');
                await refresh();
              })
            }
          >
            기록 삭제
          </button>
        </Modal>
      )}
    </div>
  );
}
function ProgressCard({ member, mine = false }: { member: Member; mine?: boolean }) {
  const percent = Math.round((member.total_ml / member.daily_goal_ml) * 100),
    remaining = Math.max(0, member.daily_goal_ml - member.total_ml);
  return (
    <section className={'card progress-card ' + (mine ? 'mine' : 'partner')}>
      <div className="member-heading">
        <span className="avatar">{member.display_name.slice(0, 1)}</span>
        <div>
          <h2>
            {member.display_name} <span>{mine ? '나' : '함께하는 사람'}</span>
          </h2>
          <p>{mine ? '나의 수분 충전' : '오늘도 함께 채우는 중'}</p>
        </div>
        {percent >= 100 && <Check className="goal-check" />}
      </div>
      <div className="water-total">
        <strong>{fmt(member.total_ml)}</strong>
        <span> / {fmt(member.daily_goal_ml)} ml</span>
      </div>
      <div className="progress-label">
        <span>목표 달성률</span>
        <strong>{percent}%</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${member.display_name} 목표 달성률`}
        aria-valuenow={Math.min(percent, 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${percent}%`}
      >
        <div style={{ width: Math.min(percent, 100) + '%' }} />
      </div>
      <p className="progress-note">
        {remaining ? (
          <>
            목표까지 <strong>{fmt(remaining)}ml</strong> 남았어요
          </>
        ) : (
          <>
            오늘의 목표를 채웠어요! <Check size={15} />
          </>
        )}
      </p>
    </section>
  );
}
function Onboarding({
  busy,
  run,
  onSuccess,
}: {
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onSuccess: (r: Codes & { token: string }) => void;
}) {
  const [mode, setMode] = useState<'create' | 'join' | 'recover'>('create'),
    [name, setName] = useState(''),
    [code, setCode] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const r = await api<Codes & { token: string }>(
        mode === 'create' ? '/api/groups' : mode === 'join' ? '/api/join' : '/api/recover',
        'POST',
        mode === 'recover'
          ? { recovery_code: code.trim() }
          : { display_name: name, ...(mode === 'join' ? { invite_code: code.trim() } : {}) },
      );
      onSuccess(r);
    });
  }
  return (
    <main className="welcome">
      <section className="welcome-copy">
        <span className="eyebrow">두 사람, 하나의 작은 습관</span>
        <h1>{copy.tagline}</h1>
        <p className="welcome-subtitle">
          물 마시는 일도,
          <br />
          함께하면 조금 더 쉬워져요.
        </p>
        <div className="water-art" aria-hidden="true">
          <div className="glass glass-one">
            <div className="water-fill" />
            <Droplet size={36} />
          </div>
          <div className="glass glass-two">
            <div className="water-fill" />
            <Droplet size={28} />
          </div>
          <span className="art-dot dot-one" />
          <span className="art-dot dot-two" />
          <span className="art-label">너도 한 잔, 나도 한 잔</span>
        </div>
        <div className="welcome-features">
          <span>
            <Check size={16} /> 가입 없이 간편하게
          </span>
          <span>
            <Users size={16} /> 오직 우리 두 사람
          </span>
          <span>
            <Bell size={16} /> 나만의 물 마시기 알림
          </span>
        </div>
      </section>
      <section className="card welcome-form">
        <span className="small-icon">
          <Droplet size={23} />
        </span>
        <h2>{mode === 'recover' ? '다시 만나서 반가워요' : '우리의 작은 습관 시작하기'}</h2>
        <p className="muted">
          {mode === 'recover' ? '저장해 둔 복구 코드로 내 기록을 연결해요.' : copy.subtitle}
        </p>
        <div className="segmented">
          {(
            [
              ['create', '새 공간 만들기'],
              ['join', '초대 코드 참여'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={mode === key ? 'selected' : ''}
              onClick={() => {
                setMode(key);
                setCode('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          {mode !== 'recover' && (
            <label>
              어떤 이름으로 불러드릴까요?
              <input
                autoComplete="nickname"
                maxLength={24}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="나의 닉네임"
              />
            </label>
          )}
          {mode !== 'create' && (
            <label>
              {mode === 'recover' ? '복구 코드' : '초대 코드'}
              <input
                autoComplete="off"
                spellCheck={false}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="코드를 붙여넣어 주세요"
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? '연결하는 중…'
              : mode === 'create'
                ? '새로운 공유 공간 만들기'
                : mode === 'join'
                  ? '함께 시작하기'
                  : '내 기록 복구하기'}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="guest-note">
          <ShieldCheck size={17} /> 이메일도, 비밀번호도 필요 없어요.
          <br />
          처음 발급되는 복구 코드는 꼭 보관해 주세요.
        </p>
        <button
          className="text-button recovery-link"
          onClick={() => {
            setMode('recover');
            setCode('');
          }}
        >
          이미 사용 중인가요? 복구 코드로 연결
        </button>
      </section>
    </main>
  );
}
function CodeBox({
  label,
  value,
  onError,
}: {
  label: string;
  value: string;
  onError: (e: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code-box">
      <label>
        {label}
        <textarea readOnly value={value} rows={2} />
      </label>
      <button
        onClick={() => {
          navigator.clipboard
            .writeText(value)
            .then(() => setCopied(true))
            .catch(() => onError('자동 복사에 실패했어요. 코드를 선택해서 직접 복사해 주세요.'));
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  error,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      className="modal"
      aria-label={title}
    >
      <div className="section-title">
        <h2>{title}</h2>
        {onClose && (
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>
      {error && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
