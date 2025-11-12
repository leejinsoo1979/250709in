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

// 개발 환경에서 브라우저 콘솔에서 슈퍼 관리자 설정 함수 노출
if (import.meta.env.DEV) {
  (window as any).setupSuperAdmin = async () => {
    try {
      const user = getCurrentUser();
      if (!user) {
        console.error('❌ 로그인한 사용자가 없습니다. 먼저 로그인해주세요.');
        return false;
      }

      console.log('📋 현재 사용자 정보:');
      console.log('  - UID:', user.uid);
      console.log('  - Email:', user.email);
      console.log('  - Display Name:', user.displayName);

      console.log('\n🔄 슈퍼 관리자 권한 부여 중...');
      await createAdmin(user.uid, 'super', [
        'users:read', 'users:write', 'users:delete',
        'organizations:read', 'organizations:write', 'organizations:delete',
        'billing:read', 'billing:write',
        'plans:read', 'plans:write',
        'analytics:read',
        'security:read', 'security:write',
        'settings:read', 'settings:write'
      ]);

      console.log('✅ 슈퍼 관리자 권한이 성공적으로 부여되었습니다!');
      console.log('  - Role: super');
      console.log('  - Permissions: 모든 권한');
      console.log('\n🔄 페이지를 새로고침하면 관리자 페이지 버튼이 나타납니다.');
      return true;
    } catch (error) {
      console.error('❌ 슈퍼 관리자 설정 중 오류 발생:', error);
      return false;
    }
  };

  console.log('🔧 개발 모드: 브라우저 콘솔에서 setupSuperAdmin() 을 실행하여 현재 사용자를 슈퍼 관리자로 설정할 수 있습니다.');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
