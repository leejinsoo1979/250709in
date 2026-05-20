import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@/styles/variables.css'
import '@/styles/theme.css'
import './index.css'
import '@/styles/global.css'
import './i18n' // i18n 초기화
// import { disableAllConsole } from './utils/disableConsole'

const setupStaleAssetReload = () => {
  if (typeof window === 'undefined') return;

  const reloadKey = 'tttcraft:stale-asset-reloaded';
  const reloadOnce = () => {
    if (sessionStorage.getItem(reloadKey) === '1') return;
    sessionStorage.setItem(reloadKey, '1');
    window.location.reload();
  };

  window.addEventListener('load', () => {
    sessionStorage.removeItem(reloadKey);
  });

  window.addEventListener('error', (event) => {
    const target = event.target as HTMLElement | null;
    const src =
      target instanceof HTMLScriptElement ? target.src :
      target instanceof HTMLLinkElement ? target.href :
      '';

    if (src.includes('/assets/') && /\.(js|css)(\?|$)/.test(src)) {
      reloadOnce();
      return;
    }

    const message = String(event.message || '');
    if (
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Importing a module script failed')
    ) {
      reloadOnce();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const message = String(event.reason?.message || event.reason || '');
    if (message.includes('Failed to fetch dynamically imported module')) {
      reloadOnce();
    }
  });
};

setupStaleAssetReload();

const setupPlatformClass = () => {
  if (typeof window === 'undefined') return;

  const ua = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';
  const userAgentDataPlatform = (window.navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData?.platform || '';
  const platformText = `${ua} ${platform} ${userAgentDataPlatform}`;
  const root = document.documentElement;

  root.classList.toggle('platform-windows', /Windows/i.test(platformText));
  root.classList.toggle('platform-macos', /\bMac/i.test(platformText) && !/iPhone|iPad|iPod/i.test(platformText));
};

setupPlatformClass();

// 개발 모드에서 유틸리티 스크립트 로드
if (import.meta.env.DEV) {
  import('./scripts/fixUserCreatedAt');
}

// 모든 console 메시지 비활성화 - 디버깅을 위해 임시 비활성화
// disableAllConsole()

// PWA Service Worker는 vite-plugin-pwa의 injectRegister: 'auto' 가
// index.html 에 registerSW 스크립트를 자동 주입하여 등록됨 (vite.config.ts)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
