import {
  Auth,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  GithubAuthProvider,
  UserCredential,
  AuthError,
  Unsubscribe,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { auth as firebaseAuth } from '../../firebase/config';

export interface AuthServiceConfig {
  sessionPersistence?: 'local' | 'session' | 'none';
  autoRefreshToken?: boolean;
  requireEmailVerification?: boolean;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerId?: string;
  role?: 'admin' | 'editor' | 'viewer';
  metadata?: {
    creationTime?: string;
    lastSignInTime?: string;
  };
}

export class AuthService {
  private auth: Auth;
  private currentUser: User | null = null;
  private authStateListeners: Set<(user: AuthUser | null) => void> = new Set();
  private config: AuthServiceConfig;

  constructor(config: AuthServiceConfig = {}) {
    this.auth = firebaseAuth;
    this.config = {
      sessionPersistence: 'local',
      autoRefreshToken: true,
      requireEmailVerification: false,
      ...config
    };
    
    this.initializeAuthListener();
  }

  /**
   * 인증 상태 리스너 초기화
   */
  private initializeAuthListener(): void {
    onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      const authUser = user ? this.mapToAuthUser(user) : null;
      
      // 모든 등록된 리스너에 상태 변경 알림
      this.authStateListeners.forEach(listener => {
        listener(authUser);
      });
    });
  }

  /**
   * Firebase User를 AuthUser로 변환
   */
  private mapToAuthUser(user: User): AuthUser {
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
      providerId: user.providerId,
      metadata: {
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime
      }
    };
  }

  /**
   * 이메일/비밀번호로 회원가입
   */
  async signUpWithEmail(
    email: string,
    password: string,
    displayName?: string
  ): Promise<AuthUser> {
    try {
      const credential = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password
      );

      if (displayName && credential.user) {
        await updateProfile(credential.user, { displayName });
      }

      return this.mapToAuthUser(credential.user);
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * 이메일/비밀번호로 로그인
   */
  async signInWithEmail(email: string, password: string): Promise<AuthUser> {
    try {
      const credential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password
      );

      if (this.config.requireEmailVerification && !credential.user.emailVerified) {
        await signOut(this.auth);
        throw new Error('Email verification required');
      }

      return this.mapToAuthUser(credential.user);
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * Google 로그인
   */
  async signInWithGoogle(): Promise<AuthUser> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      const credential = await signInWithPopup(this.auth, provider);
      return this.mapToAuthUser(credential.user);
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * GitHub 로그인
   */
  async signInWithGitHub(): Promise<AuthUser> {
    try {
      const provider = new GithubAuthProvider();
      provider.addScope('user:email');

      const credential = await signInWithPopup(this.auth, provider);
      return this.mapToAuthUser(credential.user);
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * 로그아웃
   */
  async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
      this.currentUser = null;
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * 비밀번호 재설정 이메일 전송
   */
  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * 프로필 업데이트
   */
  async updateUserProfile(data: {
    displayName?: string;
    photoURL?: string;
  }): Promise<AuthUser> {
    if (!this.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      await updateProfile(this.currentUser, data);
      return this.mapToAuthUser(this.currentUser);
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * 이메일 변경
   */
  async updateUserEmail(newEmail: string, password: string): Promise<void> {
    if (!this.currentUser || !this.currentUser.email) {
      throw new Error('No authenticated user');
    }

    try {
      // 재인증
      const credential = EmailAuthProvider.credential(
        this.currentUser.email,
        password
      );
      await reauthenticateWithCredential(this.currentUser, credential);
      
      // 이메일 업데이트
      await updateEmail(this.currentUser, newEmail);
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * 비밀번호 변경
   */
  async updateUserPassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!this.currentUser || !this.currentUser.email) {
      throw new Error('No authenticated user');
    }

    try {
      // 재인증
      const credential = EmailAuthProvider.credential(
        this.currentUser.email,
        currentPassword
      );
      await reauthenticateWithCredential(this.currentUser, credential);
      
      // 비밀번호 업데이트
      await updatePassword(this.currentUser, newPassword);
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * 계정 삭제
   */
  async deleteAccount(password?: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error('No authenticated user');
    }

    try {
      // 이메일/비밀번호 사용자인 경우 재인증 필요
      if (password && this.currentUser.email) {
        const credential = EmailAuthProvider.credential(
          this.currentUser.email,
          password
        );
        await reauthenticateWithCredential(this.currentUser, credential);
      }

      await deleteUser(this.currentUser);
      this.currentUser = null;
    } catch (error) {
      this.handleAuthError(error as AuthError);
      throw error;
    }
  }

  /**
   * 현재 사용자 가져오기
   */
  getCurrentUser(): AuthUser | null {
    return this.currentUser ? this.mapToAuthUser(this.currentUser) : null;
  }

  /**
   * 인증 상태 구독
   */
  onAuthStateChange(callback: (user: AuthUser | null) => void): Unsubscribe {
    this.authStateListeners.add(callback);
    
    // 현재 상태 즉시 전달
    callback(this.getCurrentUser());
    
    // 구독 해제 함수 반환
    return () => {
      this.authStateListeners.delete(callback);
    };
  }

  /**
   * 토큰 새로고침
   */
  async refreshToken(): Promise<string | null> {
    if (!this.currentUser) {
      return null;
    }

    try {
      return await this.currentUser.getIdToken(true);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  /**
   * ID 토큰 가져오기
   */
  async getIdToken(): Promise<string | null> {
    if (!this.currentUser) {
      return null;
    }

    try {
      return await this.currentUser.getIdToken();
    } catch (error) {
      console.error('Failed to get ID token:', error);
      return null;
    }
  }

  /**
   * 인증 에러 처리
   */
  private handleAuthError(error: AuthError): void {
    const errorMessages: { [key: string]: string } = {
      'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
      'auth/invalid-email': '유효하지 않은 이메일 형식입니다.',
      'auth/operation-not-allowed': '이 작업은 허용되지 않습니다.',
      'auth/weak-password': '비밀번호가 너무 약합니다.',
      'auth/user-disabled': '비활성화된 계정입니다.',
      'auth/user-not-found': '사용자를 찾을 수 없습니다.',
      'auth/wrong-password': '잘못된 비밀번호입니다.',
      'auth/popup-closed-by-user': '로그인이 취소되었습니다.',
      'auth/account-exists-with-different-credential': '다른 로그인 방법으로 이미 가입된 계정입니다.',
      'auth/requires-recent-login': '재로그인이 필요합니다.',
      'auth/too-many-requests': '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
    };

    const message = errorMessages[error.code] || error.message;
    console.error(`Auth Error [${error.code}]:`, message);
  }

  /**
   * 세션 지속성 설정
   */
  async setSessionPersistence(persistence: 'local' | 'session' | 'none'): Promise<void> {
    // Firebase v9에서는 브라우저에서 자동으로 처리됨
    this.config.sessionPersistence = persistence;
  }

  /**
   * RBAC - 사용자 역할 확인 (커스텀 클레임 기반)
   */
  async getUserRole(): Promise<string | null> {
    if (!this.currentUser) {
      return null;
    }

    try {
      const tokenResult = await this.currentUser.getIdTokenResult();
      return tokenResult.claims.role as string || null;
    } catch (error) {
      console.error('Failed to get user role:', error);
      return null;
    }
  }

  /**
   * RBAC - 권한 확인
   */
  async hasPermission(requiredRole: 'admin' | 'editor' | 'viewer'): Promise<boolean> {
    const userRole = await this.getUserRole();
    
    if (!userRole) return false;
    
    const roleHierarchy: { [key: string]: number } = {
      admin: 3,
      editor: 2,
      viewer: 1
    };

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  }
}

// 싱글톤 인스턴스
export const authService = new AuthService();