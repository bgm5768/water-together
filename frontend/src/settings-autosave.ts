import type { Settings } from '../../shared/types';
import { settingsEqual } from './settings';

export type SettingsSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (scope: string, id: string) => `water-settings-pending:${scope}:${id}`;

function readPending(store: Store, scope: string, id: string): Settings | null {
  try {
    const value = JSON.parse(store.getItem(key(scope, id)) || 'null');
    const settings = value?.version === 1 ? value.settings : null;
    return settings &&
      typeof settings === 'object' &&
      typeof settings.enabled === 'boolean' &&
      typeof settings.timezone === 'string' &&
      typeof settings.daily_goal_ml === 'number' &&
      Array.isArray(settings.active_days) &&
      Array.isArray(settings.reminders)
      ? (settings as Settings)
      : null;
  } catch {
    return null;
  }
}

export class SettingsAutosave {
  private userId: string | null = null;
  private saved: Settings | null = null;
  private draft: Settings | null = null;
  private sending: Settings | null = null;
  private inFlight: Promise<boolean> | null = null;

  constructor(
    private store: Store,
    private send: (settings: Settings) => Promise<Settings>,
    private onStatus: (status: SettingsSaveStatus, error?: string) => void,
    private onSaved: (settings: Settings) => void,
    private scope = '/',
  ) {}

  acceptServer(id: string, settings: Settings): Settings {
    if (this.userId !== id) {
      this.userId = id;
      this.saved = settings;
      this.draft = readPending(this.store, this.scope, id) ?? settings;
    } else {
      const wasClean = !this.hasPending();
      this.saved = settings;
      if (wasClean) this.draft = settings;
    }
    if (this.hasPending()) this.onStatus('pending');
    else {
      this.removePending();
      this.onStatus('idle');
    }
    return this.draft!;
  }

  clearActive() {
    this.userId = null;
    this.saved = null;
    this.draft = null;
    this.sending = null;
    this.inFlight = null;
    this.onStatus('idle');
  }

  update(settings: Settings) {
    if (!this.userId || !this.saved) return;
    this.draft = settings;
    if (this.hasPending()) {
      this.storePending();
      this.onStatus('pending');
    } else {
      this.removePending();
      this.onStatus('idle');
    }
  }

  current(): Settings | null {
    return this.draft;
  }

  hasPending(): boolean {
    return !!(
      this.draft &&
      this.saved &&
      (!settingsEqual(this.draft, this.saved) ||
        (this.sending && !settingsEqual(this.draft, this.sending)))
    );
  }

  async flush(): Promise<boolean> {
    if (!this.userId || !this.hasPending()) return true;
    if (this.inFlight) {
      const previousSucceeded = await this.inFlight;
      return previousSucceeded ? this.flush() : false;
    }
    const id = this.userId;
    const snapshot = this.draft!;
    this.sending = snapshot;
    this.onStatus('saving');
    const task = this.send(snapshot)
      .then((result) => {
        if (this.userId !== id) return false;
        this.saved = result;
        this.onSaved(result);
        if (this.hasPending()) {
          this.storePending();
          this.onStatus('pending');
        } else {
          this.removePending();
          this.onStatus('saved');
        }
        return true;
      })
      .catch((error: unknown) => {
        if (this.userId === id) {
          if (this.draft && this.saved && settingsEqual(this.draft, this.saved)) {
            this.removePending();
            this.onStatus('idle');
          } else this.onStatus('error', (error as Error).message || '설정을 저장하지 못했어요.');
        }
        return false;
      })
      .finally(() => {
        if (this.inFlight === task) {
          this.inFlight = null;
          this.sending = null;
        }
      });
    this.inFlight = task;
    const succeeded = await task;
    return succeeded && this.hasPending() ? this.flush() : succeeded;
  }

  private storePending() {
    if (!this.userId || !this.draft) return;
    try {
      this.store.setItem(
        key(this.scope, this.userId),
        JSON.stringify({ version: 1, settings: this.draft }),
      );
    } catch {
      // A live save can still succeed when local storage is unavailable.
    }
  }

  private removePending() {
    if (!this.userId) return;
    try {
      this.store.removeItem(key(this.scope, this.userId));
    } catch {
      // Ignore storage restrictions.
    }
  }
}
