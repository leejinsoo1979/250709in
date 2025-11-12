/**
 * 현재 사용자를 슈퍼 관리자로 설정하는 스크립트
 *
 * 사용법:
 * 1. 브라우저 콘솔에서 실행하거나
 * 2. 개발 환경에서 직접 호출
 */

import { createAdmin } from '../src/firebase/admin';
import { getCurrentUser } from '../src/firebase/auth';

export async function setupSuperAdmin() {
  try {
    // 현재 로그인한 사용자 가져오기
    const user = getCurrentUser();

    if (!user) {
      console.error('❌ 로그인한 사용자가 없습니다. 먼저 로그인해주세요.');
      return false;
    }

    console.log('📋 현재 사용자 정보:');
    console.log('  - UID:', user.uid);
    console.log('  - Email:', user.email);
    console.log('  - Display Name:', user.displayName);

    // 슈퍼 관리자로 설정
    console.log('\n🔄 슈퍼 관리자 권한 부여 중...');
    await createAdmin(user.uid, 'super', [
      'users:read',
      'users:write',
      'users:delete',
      'organizations:read',
      'organizations:write',
      'organizations:delete',
      'billing:read',
      'billing:write',
      'plans:read',
      'plans:write',
      'analytics:read',
      'security:read',
      'security:write',
      'settings:read',
      'settings:write'
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
}

// 브라우저 콘솔에서 직접 실행 가능하도록 window에 노출
if (typeof window !== 'undefined') {
  (window as any).setupSuperAdmin = setupSuperAdmin;
}
