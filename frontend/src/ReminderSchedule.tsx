import { defaultReminders, reminderLabels, type Reminder } from '../../shared/types';

export function ReminderSchedule({
  value,
  onChange,
}: {
  value?: Reminder[];
  onChange: (value: Reminder[]) => void;
}) {
  const rows = value ?? defaultReminders;
  return (
    <fieldset className="fixed-reminders">
      <legend>매일 물 마실 시간</legend>
      <p className="field-hint">
        각 시간을 누르면 수정할 수 있어요. 같은 시각은 한 번만 알려드려요.
      </p>
      {rows.map((row) => (
        <div className="reminder-row" key={row.id}>
          <label htmlFor={'reminder-' + row.id}>{reminderLabels[row.id]}</label>
          <input
            id={'reminder-' + row.id}
            type="time"
            required
            value={row.time}
            onChange={(event) =>
              onChange(
                rows.map((item) =>
                  item.id === row.id ? { ...item, time: event.target.value } : item,
                ),
              )
            }
          />
          <input
            type="checkbox"
            role="switch"
            aria-label={reminderLabels[row.id] + ' 알림'}
            checked={row.enabled}
            onChange={(event) =>
              onChange(
                rows.map((item) =>
                  item.id === row.id ? { ...item, enabled: event.target.checked } : item,
                ),
              )
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="schedule-reset"
        onClick={() => onChange(defaultReminders.map((row) => ({ ...row })))}
      >
        기본 시간으로 되돌리기
      </button>
    </fieldset>
  );
}
