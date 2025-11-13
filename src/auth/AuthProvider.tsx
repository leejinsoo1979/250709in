import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { onAuthStateChange } from '@/firebase/auth';
import { saveLoginHistory } from '@/firebase/userProfiles';

// 인증 컨텍스트 타입
interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
}

// 인증 컨텍스트 생성
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 인증 Provider 컴포넌트
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Firebase 설정 확인
  const isFirebaseConfigured = () => {
    return !!(
      import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID
    );
  };

  useEffect(() => {
    // iframe 내부에서 readonly 모드로 실행되는 경우
    // COOP 에러는 방지하지만, 기존 로그인 상태는 확인
    const isInIframe = window.self !== window.top;
    const urlParams = new URLSearchParams(window.location.search);
    const isReadOnly = urlParams.get('mode') === 'readonly';

    // iframe readonly 모드에서는 팝업 등 인증 액션은 차단하지만,
    // 기존 세션 확인은 허용 (COOP 에러 발생 안함)
    if (isInIframe && isReadOnly) {
      console.log('👁️ iframe readonly 모드 - 팝업 차단, 세션 확인은 허용');
      // Firebase Auth 초기화는 진행 (세션만 확인)
    }

    // Firebase 설정이 안되어 있으면 로딩 즉시 종료
    if (!isFirebaseConfigured()) {
      console.warn('⚠️ Firebase 환경변수가 설정되지 않았습니다. 로딩을 종료합니다.');
      setLoading(false);
      return;
    }

    try {
      // Firebase 인증 상태 변화 감지
      const unsubscribe = onAuthStateChange(async (user) => {
        setUser(user);
        setLoading(false);

        // localStorage에 userId와 activeTeamId 설정 (개발 모드 조건 제거!)
        if (user) {
          console.log('🔐 사용자 로그인:', user.email);
          localStorage.setItem('userId', user.uid);
          if (!localStorage.getItem('activeTeamId')) {
            localStorage.setItem('activeTeamId', `personal_${user.uid}`);
          }

          // users 컬렉션에 사용자 정보 저장 (관리자 페이지용)
          try {
            const { doc, setDoc, getDoc, serverTimestamp, Timestamp } = await import('firebase/firestore');
            const { db } = await import('@/firebase/config');

            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
              // users 컬렉션에 문서가 없는 경우 - Firebase Auth의 실제 가입일 사용
              const authCreationTime = user.metadata.creationTime
                ? Timestamp.fromDate(new Date(user.metadata.creationTime))
                : serverTimestamp();

              await setDoc(userRef, {
                email: user.email,
                displayName: user.displayName || '',
                photoURL: user.photoURL || '',
                createdAt: authCreationTime, // Firebase Auth의 실제 가입일 사용
                lastLoginAt: serverTimestamp()
              });
              console.log('✅ users 컬렉션에 사용자 정보 동기화 (실제 가입일 사용)');
            } else {
              // 기존 사용자 - lastLoginAt만 업데이트
              const { updateDoc } = await import('firebase/firestore');
              await updateDoc(userRef, {
                lastLoginAt: serverTimestamp(),
                displayName: user.displayName || '',
                photoURL: user.photoURL || ''
              });
              console.log('✅ users 컬렉션 lastLoginAt 업데이트');
            }
          } catch (err) {
            console.error('❌ users 컬렉션 저장 실패:', err);
          }

          // 로그인 기록 저장
          try {
            await saveLoginHistory();
            console.log('✅ 로그인 기록 저장 완료');
          } catch (err) {
            console.error('❌ 로그인 기록 저장 실패:', err);
          }
        } else {
          console.log('🔐 사용자 로그아웃');
          // 로그아웃 시 localStorage 정리
          localStorage.removeItem('userId');
          localStorage.removeItem('activeTeamId');
        }
      });

      // 타임아웃 안전장치: 5초 후 강제로 로딩 끝 (실제 상태 체크)
      const timeoutId = setTimeout(() => {
        setLoading(currentLoading => {
          if (currentLoading) {
            console.warn('⚠️ Firebase 인증 상태 확인 타임아웃 - 로딩 강제 종료');
            return false;
          }
          return currentLoading; // 이미 false면 그대로 유지
        });
      }, 5000);

      return () => {
        unsubscribe();
        clearTimeout(timeoutId);
      };
    } catch (error) {
      console.error('❌ Firebase 인증 설정 에러:', error);
      setLoading(false); // 에러 발생 시 로딩 종료
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// 인증 상태를 사용하는 커스텀 훅
// eslint-disable-next-line
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth는 AuthProvider 내에서 사용해야 합니다.');
  }
  return context;
}; 