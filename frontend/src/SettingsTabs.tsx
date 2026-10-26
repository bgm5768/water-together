import { useEffect, useRef, type ReactNode } from 'react';
import { Target, Clock3, Bell, Users, Smartphone } from 'lucide-react';
export const settingsTabs = [
  { id: 'goal', label: '목표 설정', icon: Target },
  { id: 'schedule', label: '시간 설정', icon: Clock3 },
  { id: 'alerts', label: '알림 설정', icon: Bell },
  { id: 'together', label: '함께하기', icon: Users },
  { id: 'app', label: '앱·계정', icon: Smartphone },
] as const;
export type SettingsTab = (typeof settingsTabs)[number]['id'];
export function SettingsTabs({
  active,
  onChange,
  children,
}: {
  active: SettingsTab;
  onChange: (id: SettingsTab) => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    buttons.current[settingsTabs.findIndex((tab) => tab.id === active)]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [active]);
  function select(index: number, focus = false) {
    const tab = settingsTabs[index];
    if (!tab) return;
    onChange(tab.id);
    buttons.current[index]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto',
    });
    if (focus) buttons.current[index]?.focus();
  }
  return (
    <div className="settings-hub">
      <div className="settings-tabs" role="tablist" aria-label="설정 분류">
        {settingsTabs.map(({ id, label, icon: Icon }, index) => (
          <button
            type="button"
            key={id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            id={'settings-tab-' + id}
            role="tab"
            aria-selected={active === id}
            aria-controls={'settings-panel-' + id}
            tabIndex={active === id ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % settingsTabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + settingsTabs.length - 1) % settingsTabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? settingsTabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                select(next, true);
              }
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <p className="settings-swipe-hint">탭을 선택하거나 화면을 좌우로 넘겨보세요</p>
      <div
        className="settings-panels"
        onPointerDown={(event) => {
          if (
            (event.target as HTMLElement).closest(
              'input,button,select,textarea,a,label,[role="slider"]',
            )
          ) {
            start.current = null;
            return;
          }
          const point = event;
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = { x: point.clientX, y: point.clientY };
        }}
        onPointerUp={(event) => {
          const from = start.current;
          start.current = null;
          if (!from) return;
          const point = event,
            dx = point.clientX - from.x,
            dy = point.clientY - from.y;
          if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5)
            select(settingsTabs.findIndex((tab) => tab.id === active) + (dx < 0 ? 1 : -1));
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        {children}
      </div>
    </div>
  );
}
export function SettingsPanel({
  id,
  active,
  children,
}: {
  id: SettingsTab;
  active: SettingsTab;
  children: ReactNode;
}) {
  return (
    <section
      className="settings-panel"
      id={'settings-panel-' + id}
      data-settings-panel={id}
      role="tabpanel"
      aria-labelledby={'settings-tab-' + id}
      hidden={active !== id}
      tabIndex={0}
    >
      {children}
    </section>
  );
}
