import { useEffect, useState } from 'react';
import { Check, Download, Smartphone } from 'lucide-react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
// Capture before the settings screen is mounted, including on the welcome screen.
let pending: InstallPrompt | null = null;
const changed = () => window.dispatchEvent(new Event('water-install-change'));
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  pending = event as InstallPrompt;
  changed();
});
let wasInstalled = false;
window.addEventListener('appinstalled', () => {
  pending = null;
  wasInstalled = true;
  changed();
});
const standalone = () =>
  wasInstalled ||
  window.matchMedia('(display-mode: standalone)').matches ||
  !!(navigator as Navigator & { standalone?: boolean }).standalone;

export function InstallApp() {
  const [ready, setReady] = useState(!!pending);
  const [installed, setInstalled] = useState(standalone);
  const [working, setWorking] = useState(false);
  const [help, setHelp] = useState('');
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const update = () => {
      setReady(!!pending);
      setInstalled(standalone());
    };
    window.addEventListener('water-install-change', update);
    media.addEventListener('change', update);
    return () => {
      window.removeEventListener('water-install-change', update);
      media.removeEventListener('change', update);
    };
  }, []);
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  async function install() {
    if (!pending) {
      setHelp(
        ios
          ? 'Safari에서 이 페이지를 열고 공유 버튼 → 홈 화면에 추가 → 추가를 눌러 주세요. 설치한 앱에서 알림을 연결할 수 있어요.'
          : 'Chrome 또는 Edge의 브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택해 주세요. 이미 설치했다면 홈 화면이나 앱 목록에서 열 수 있어요.',
      );
      return;
    }
    setWorking(true);
    const prompt = pending;
    pending = null;
    changed();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setHelp(
        choice.outcome === 'accepted'
          ? '설치를 요청했어요. 홈 화면이나 앱 목록에서 함께 물을 열어 주세요.'
          : '나중에 브라우저 메뉴에서 다시 설치할 수 있어요.',
      );
    } catch {
      setHelp('브라우저 메뉴의 앱 설치 또는 홈 화면에 추가를 이용해 주세요.');
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="card settings-card install-card">
      <div className="install-heading">
        <span className="install-icon">
          <Smartphone size={25} />
        </span>
        <div>
          <h2>함께 물, 앱으로 만나기</h2>
          <p>홈 화면에서 한 번에, 매일 더 가깝게.</p>
        </div>
      </div>
      <button
        className="primary"
        type="button"
        disabled={installed || working}
        onClick={() => void install()}
      >
        {installed ? <Check size={18} /> : <Download size={18} />}
        {installed
          ? '앱으로 사용 중이에요'
          : working
            ? '설치 화면 여는 중…'
            : ready
              ? '앱 설치하기'
              : '앱 설치 · 홈 화면에 추가'}
      </button>
      {help && (
        <p className="install-help" role="status">
          {help}
        </p>
      )}
      <p className="field-hint">
        설치 후에도 같은 기록을 이어서 사용해요. iPhone은 Safari의 공유 메뉴를 이용해 주세요.
      </p>
    </section>
  );
}
