import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
  getRedirectResult,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithPopup,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from './config';
import { FLAGS } from '@/flags';

// Re-export auth for convenience
export { auth };

// Firebase 인증 상태 유지 설정 (브라우저 닫아도 유지)
// readonly 모드에서는 auth가 null이므로 체크
if (auth) {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error('❌ Firebase persistence 설정 실패:', error);
  });
} else {
  console.log('🚫 Firebase Auth null - persistence 설정 건너뜀 (readonly 모드)');
}

// 구글 인증 제공자 생성
const googleProvider = new GoogleAuthProvider();

// 구글 로그인 설정
googleProvider.setCustomParameters({
  prompt: 'select_account', // 항상 계정 선택 화면 표시
  auth_type: 'rerequest',
  access_type: 'offline'
});

// 추가 스코프 설정
googleProvider.addScope('profile');
googleProvider.addScope('email');

// 이메일/비밀번호로 로그인
export const signInWithEmail = async (email: string, password: string) => {
  try {
    // 인증 상태 유지 설정 (새로고침 시에도 로그인 유지)
    await setPersistence(auth, browserLocalPersistence);

    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    // 팀 자동 생성 (최초 로그인 시)
    if (FLAGS.teamScope) {
      await ensurePersonalTeam(userCredential.user);
    }

    return { user: userCredential.user, error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    return { user: null, error: firebaseError.message };
  }
};

// 구글로 로그인 (팝업 방식 - 데스크톱)
export const signInWithGoogle = async () => {
  try {
    // 인증 상태 유지 설정 (새로고침 시에도 로그인 유지)
    await setPersistence(auth, browserLocalPersistence);

    // 디버깅: 현재 환경 정보 출력
    console.log('🔐 구글 로그인 시도');
    console.log('🔐 현재 도메인:', window.location.hostname);
    console.log('🔐 Auth Domain:', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'in-f8873.firebaseapp.com');
    console.log('🔐 환경:', import.meta.env.MODE);

    // 모바일 환경 체크
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
      // 모바일에서는 리다이렉트 방식 사용
      const { signInWithRedirect } = await import('firebase/auth');
      await signInWithRedirect(auth, googleProvider);
      return { user: null, error: null }; // 리다이렉트되므로 결과는 나중에 처리
    } else {
      // 데스크톱에서는 팝업 방식 사용
      const result = await signInWithPopup(auth, googleProvider);
      
      // 개발 모드에서 로그 출력
      if (import.meta.env.DEV) {
        console.log('🔐 구글 로그인 성공:', result.user.email);
        console.log('🔐 사용자 정보:', {
          name: result.user.displayName,
          email: result.user.email,
          photo: result.user.photoURL
        });
      }
      
      // 팀 자동 생성 (최초 로그인 시)
      if (FLAGS.teamScope) {
        await ensurePersonalTeam(result.user);
      }
      
      return { user: result.user, error: null };
    }
  } catch (error) {
    const firebaseError = error as FirebaseError;
    
    // 에러 상세 로깅
    console.error('🔥 구글 로그인 에러 발생');
    console.error('🔥 에러 코드:', firebaseError.code);
    console.error('🔥 에러 메시지:', firebaseError.message);
    console.error('🔥 전체 에러:', error);
    
    // 구글 로그인 특정 에러 처리
    let errorMessage = firebaseError.message;
    
    switch (firebaseError.code) {
      case 'auth/popup-closed-by-user':
        errorMessage = '로그인이 취소되었습니다.';
        break;
      case 'auth/popup-blocked':
        errorMessage = '팝업이 차단되었습니다. 팝업을 허용해주세요.';
        break;
      case 'auth/cancelled-popup-request':
        errorMessage = '로그인 요청이 취소되었습니다.';
        break;
      case 'auth/account-exists-with-different-credential':
        errorMessage = '이미 다른 방법으로 가입된 이메일입니다.';
        break;
      case 'auth/unauthorized-domain':
        errorMessage = `인증되지 않은 도메인입니다. 현재 도메인: ${window.location.hostname}`;
        console.error('🔥 Firebase 인증 도메인 오류');
        console.error('🔥 현재 도메인:', window.location.hostname);
        console.error('🔥 현재 URL:', window.location.href);
        console.error('🔥 Auth Domain 설정:', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'in-f8873.firebaseapp.com');
        console.error('🔥 Firebase Console > Authentication > Settings > Authorized domains에 추가 필요');
        break;
      default:
        errorMessage = '구글 로그인 중 오류가 발생했습니다.';
    }
    
    return { user: null, error: errorMessage };
  }
};

// 이메일/비밀번호로 회원가입
export const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
  try {
    // 인증 상태 유지 설정 (새로고침 시에도 로그인 유지)
    await setPersistence(auth, browserLocalPersistence);

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // 사용자 이름 설정
    if (displayName && userCredential.user) {
      await updateProfile(userCredential.user, { displayName });
    }

    // 팀 자동 생성 (신규 가입 시)
    if (FLAGS.teamScope) {
      await ensurePersonalTeam(userCredential.user);
    }

    return { user: userCredential.user, error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    return { user: null, error: firebaseError.message };
  }
};

// 로그아웃
export const signOutUser = async () => {
  try {
    await signOut(auth);
    return { error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    return { error: firebaseError.message };
  }
};

// 인증 상태 변화 감지
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// 현재 사용자 가져오기 (동기적)
export const getCurrentUser = () => {
  return auth.currentUser;
};

// 현재 사용자 가져오기 (비동기적 - 인증 상태 확인 대기)
export const getCurrentUserAsync = (): Promise<User | null> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

// 리다이렉트 결과 처리
export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log('🔐 리다이렉트 로그인 성공:', result.user.email);
      
      // 팀 자동 생성 (최초 로그인 시)
      if (FLAGS.teamScope) {
        await ensurePersonalTeam(result.user);
      }
      
      return { user: result.user, error: null };
    }
    return { user: null, error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;
    console.error('리다이렉트 처리 오류:', firebaseError);
    return { user: null, error: firebaseError.message };
  }
};

// 개인 팀 자동 생성 헬퍼 함수
async function ensurePersonalTeam(user: User) {
  try {
    const { doc, getDoc, setDoc, serverTimestamp, Timestamp } = await import('firebase/firestore');
    const { db } = await import('./config');

    const teamId = `personal_${user.uid}`;
    const teamRef = doc(db, 'teams', teamId);

    // 이미 팀이 있는지 확인
    const teamDoc = await getDoc(teamRef);
    if (teamDoc.exists()) {
      return;
    }

    // 개인 팀 생성
    const team = {
      name: `${(user.email || 'User').split('@')[0]}'s Workspace`,
      description: 'Personal workspace',
      ownerId: user.uid,
      members: [{
        userId: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        role: 'owner',
        joinedAt: Timestamp.now(),
        status: 'active'
      }],
      settings: {
        isPublic: false,
        allowInvitations: true,
        defaultRole: 'viewer',
        maxMembers: 50
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(teamRef, team);

    // localStorage에 email 저장 (나중에 팀 생성 시 사용)
    if (user.email) {
      localStorage.setItem('userEmail', user.email);
    }

    console.log('✅ Personal team created:', teamId);
  } catch (error) {
    console.error('Failed to create personal team:', error);
  }
}

// 비밀번호 변경
export const changePassword = async (currentPassword: string, newPassword: string) => {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) {
      return { error: '로그인된 사용자가 없습니다.' };
    }

    // 이메일/비밀번호 제공자인지 확인
    const isEmailProvider = user.providerData.some(
      (provider) => provider.providerId === 'password'
    );

    if (!isEmailProvider) {
      return { error: '소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.' };
    }

    // 재인증
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // 비밀번호 업데이트
    await updatePassword(user, newPassword);

    return { error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;

    let errorMessage = '비밀번호 변경 중 오류가 발생했습니다.';
    switch (firebaseError.code) {
      case 'auth/wrong-password':
        errorMessage = '현재 비밀번호가 올바르지 않습니다.';
        break;
      case 'auth/weak-password':
        errorMessage = '새 비밀번호가 너무 약합니다. 6자 이상 입력해주세요.';
        break;
      case 'auth/requires-recent-login':
        errorMessage = '보안을 위해 다시 로그인해주세요.';
        break;
    }

    return { error: errorMessage };
  }
};

// 계정 삭제
export const deleteAccount = async (password?: string) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { error: '로그인된 사용자가 없습니다.' };
    }

    // 재인증 (이메일/비밀번호 사용자)
    const isEmailProvider = user.providerData.some(
      (provider) => provider.providerId === 'password'
    );

    if (isEmailProvider && password && user.email) {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    } else if (!isEmailProvider) {
      // 구글 사용자의 경우 팝업으로 재인증
      await reauthenticateWithPopup(user, googleProvider);
    }

    // 사용자 데이터 삭제 (Firestore)
    const { doc, deleteDoc, collection, query, where, getDocs } = await import('firebase/firestore');
    const { db } = await import('./config');

    // 사용자 프로필 삭제
    const userProfileRef = doc(db, 'userProfiles', user.uid);
    await deleteDoc(userProfileRef);

    // 사용자의 프로젝트 삭제
    const projectsRef = collection(db, 'projects');
    const projectsQuery = query(projectsRef, where('userId', '==', user.uid));
    const projectsSnapshot = await getDocs(projectsQuery);

    for (const projectDoc of projectsSnapshot.docs) {
      await deleteDoc(projectDoc.ref);
    }

    // 사용자 계정 삭제
    await deleteUser(user);

    return { error: null };
  } catch (error) {
    const firebaseError = error as FirebaseError;

    let errorMessage = '계정 삭제 중 오류가 발생했습니다.';
    switch (firebaseError.code) {
      case 'auth/wrong-password':
        errorMessage = '비밀번호가 올바르지 않습니다.';
        break;
      case 'auth/requires-recent-login':
        errorMessage = '보안을 위해 다시 로그인 후 시도해주세요.';
        break;
    }

    return { error: errorMessage };
  }
}; 