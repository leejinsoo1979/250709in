import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { onAuthStateChange } from '@/firebase/auth';
import { saveLoginHistory } from '@/firebase/userProfiles';
import { acceptLatestAgreements, getAgreementStatus } from '@/firebase/agreements';

// 인증 컨텍스트 타입
interface AuthContextType {
  user: User | null;
  loading: boolean;
  agreementLoading: boolean;
  agreementAccepted: boolean | null;
  isAuthenticated: boolean;
  refreshAgreementStatus: () => Promise<void>;
  acceptAgreements: () => Promise<{ error: string | null }>;
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
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState<boolean | null>(null);

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
    const isInIframe = window.self !== window.top;
    const urlParams = new URLSearchParams(window.location.search);
    const isReadOnly = urlParams.get('mode') === 'readonly';

    if (isInIframe && isReadOnly) {
      console.log('👁️ iframe readonly 모드 - Firebase Auth 리스너 차단 (로그인 상태는 부모에서 가져옴)');
      // Firebase Auth 리스너는 실행하지 않지만, 로딩은 완료 상태로 설정
      // 실제 user 상태는 onAuthStateChange를 실행하지 않으므로 null로 유지됨
      // 하지만 readonly 모드에서는 user 정보가 필요없으므로 문제없음
      setLoading(false);
      return;
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
        // 사용자 변경 감지 — 다른 계정으로 전환되면 메모리에 남은 탭/뷰 상태 정리
        // (탭바에 이전 사용자가 열었던 디자인이 그대로 남는 문제 차단)
        const previousUid = localStorage.getItem('userId');
        const newUid = user?.uid || null;
        if (previousUid && previousUid !== newUid) {
          try {
            const { useUIStore } = await import('@/store/uiStore');
            useUIStore.setState({ openTabs: [], activeTabId: null } as any);
            localStorage.removeItem('activeTeamId');
            console.log('🧹 사용자 변경 감지 — openTabs 초기화:', previousUid, '→', newUid);
          } catch (e) {
            console.warn('탭 초기화 실패:', e);
          }
        }

        setUser(user);
        setLoading(false);

        // localStorage에 userId와 activeTeamId 설정 (개발 모드 조건 제거!)
        if (user) {
          setAgreementLoading(true);
          setAgreementAccepted(null);
          console.log('🔐 사용자 로그인:', user.email);
          localStorage.setItem('userId', user.uid);
          const personalTeamId = `personal_${user.uid}`;
          const storedTeamId = localStorage.getItem('activeTeamId');
          if (!storedTeamId || (storedTeamId.startsWith('personal_') && storedTeamId !== personalTeamId)) {
            localStorage.setItem('activeTeamId', personalTeamId);
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
              // 기존 사용자 - lastLoginAt만 업데이트 (displayName/photoURL은 빈 값으로 덮어쓰지 않음)
              const { updateDoc } = await import('firebase/firestore');
              const lastLoginPatch: any = { lastLoginAt: serverTimestamp() };
              if (user.displayName) lastLoginPatch.displayName = user.displayName;
              if (user.photoURL) lastLoginPatch.photoURL = user.photoURL;
              await updateDoc(userRef, lastLoginPatch);
              console.log('✅ users 컬렉션 lastLoginAt 업데이트');
            }
          } catch (err) {
            console.error('❌ users 컬렉션 저장 실패:', err);
          }

          // 🔐 기업회원 plan 자동 동기화 (모든 로그인 경로 공통)
          // enterprise_inquiries 의 최신 status='approved' 인 경우 → users.plan='enterprise' 강제 set
          // 어떤 이유로 승인 시 users 문서 업데이트가 누락됐을 때도 다음 로그인 시점에 자동 복구됨
          try {
            const {
              doc: docRef,
              getDoc: getDocFn,
              setDoc: setDocFn,
              collection: collFn,
              query: qFn,
              where: whFn,
              getDocs: getDocsFn
            } = await import('firebase/firestore');
            const { db } = await import('@/firebase/config');

            const inqQ = qFn(
              collFn(db, 'enterprise_inquiries'),
              whFn('uid', '==', user.uid)
            );
            const inqSnap = await getDocsFn(inqQ);
            const valid = inqSnap.docs.filter(d => (d.data().status as string) !== 'superseded');
            if (valid.length > 0) {
              const sorted = valid.slice().sort((a, b) => {
                const ta = (a.data().createdAt?.toMillis?.() ?? 0) as number;
                const tb = (b.data().createdAt?.toMillis?.() ?? 0) as number;
                return tb - ta;
              });
              const latest = sorted[0].data() as { status?: string; companyName?: string };
              const truePlan: 'enterprise' | 'free' = latest.status === 'approved' ? 'enterprise' : 'free';

              // users 문서 현재 plan 확인 후 다르면 동기화
              const userRef2 = docRef(db, 'users', user.uid);
              const userDoc2 = await getDocFn(userRef2);
              const data = userDoc2.exists() ? (userDoc2.data() as { plan?: string; displayName?: string; role?: string }) : {};
              if (data.role !== 'superadmin' && data.plan !== truePlan) {
                const planPatch: Record<string, unknown> = { plan: truePlan };
                // 기업회원 승격 시 회사명을 displayName에도 동기화
                if (truePlan === 'enterprise' && latest.companyName && data.displayName !== latest.companyName) {
                  planPatch.displayName = latest.companyName;
                }
                await setDocFn(userRef2, planPatch, { merge: true });
                console.log('✅ users.plan 자동 동기화:', data.plan, '→', truePlan);
              }
            }
          } catch (err) {
            console.warn('⚠️ enterprise plan 자동 동기화 실패(무시):', err);
          }

          // 로그인 기록 저장
          try {
            const status = await getAgreementStatus(user.uid);
            setAgreementAccepted(status.accepted);
          } catch (err) {
            console.error('❌ 약관 동의 상태 확인 실패:', err);
            setAgreementAccepted(false);
          } finally {
            setAgreementLoading(false);
          }

          try {
            await saveLoginHistory();
            console.log('✅ 로그인 기록 저장 완료');
          } catch (err) {
            console.error('❌ 로그인 기록 저장 실패:', err);
          }
        } else {
          console.log('🔐 사용자 로그아웃');
          setAgreementLoading(false);
          setAgreementAccepted(null);
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

  const refreshAgreementStatus = useCallback(async () => {
    if (!user) {
      setAgreementAccepted(null);
      setAgreementLoading(false);
      return;
    }

    setAgreementLoading(true);
    try {
      const status = await getAgreementStatus(user.uid);
      setAgreementAccepted(status.accepted);
    } catch (err) {
      console.error('❌ 약관 동의 상태 새로고침 실패:', err);
      setAgreementAccepted(false);
    } finally {
      setAgreementLoading(false);
    }
  }, [user]);

  const acceptAgreements = useCallback(async (): Promise<{ error: string | null }> => {
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    try {
      await acceptLatestAgreements(user);
      setAgreementAccepted(true);
      return { error: null };
    } catch (err) {
      console.error('❌ 약관 동의 저장 실패:', err);
      return { error: '약관 동의 저장 중 오류가 발생했습니다.' };
    }
  }, [user]);

  const value: AuthContextType = {
    user,
    loading,
    agreementLoading,
    agreementAccepted,
    isAuthenticated: !!user,
    refreshAgreementStatus,
    acceptAgreements,
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
