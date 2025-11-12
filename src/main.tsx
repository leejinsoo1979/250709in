import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@/styles/theme.css'
import './index.css'
import '@/styles/global.css'
import './i18n' // i18n 초기화
import { createAdmin } from './firebase/admin'
import { getCurrentUser } from './firebase/auth'
// import { disableAllConsole } from './utils/disableConsole'

// 모든 console 메시지 비활성화 - 디버깅을 위해 임시 비활성화
// disableAllConsole()

// 개발 환경에서 슈퍼 관리자 설정 함수 노출
if (import.meta.env.DEV) {
  (window as any).makeAdmin = async () => {
    const user = getCurrentUser();
    if (!user) {
      console.error('❌ 먼저 로그인하세요');
      return;
    }

    await createAdmin(user.uid, 'super', []);
    console.log('✅ 슈퍼 관리자 권한 부여 완료!');
    console.log('페이지를 새로고침하세요.');
  };

  console.log('💡 콘솔에서 makeAdmin() 실행 → 슈퍼 관리자 권한 부여');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
