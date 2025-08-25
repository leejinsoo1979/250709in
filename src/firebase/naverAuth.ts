import { signInWithCustomToken } from 'firebase/auth';
import { auth } from './config';

// 네이버 로그인 설정
const NAVER_CLIENT_ID = import.meta.env.VITE_NAVER_CLIENT_ID;
const NAVER_CALLBACK_URL = import.meta.env.VITE_NAVER_CALLBACK_URL || 'http://localhost:5173/auth/callback/naver';
const NAVER_AUTH_URL = 'https://nid.naver.com/oauth2.0/authorize';

// 프로덕션 환경에서는 프로덕션 URL 사용
const getCallbackUrl = () => {
  if (import.meta.env.PROD) {
    return 'https://250709in.vercel.app/auth/callback/naver';
  }
  return NAVER_CALLBACK_URL;
};

// 네이버 로그인 페이지로 리다이렉트
export const redirectToNaverLogin = () => {
  const state = generateRandomState();
  
  // state를 세션 스토리지에 저장 (CSRF 방지)
  sessionStorage.setItem('naver_auth_state', state);
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: NAVER_CLIENT_ID,
    redirect_uri: getCallbackUrl(),
    state: state
  });
  
  window.location.href = `${NAVER_AUTH_URL}?${params.toString()}`;
};

// 랜덤 state 생성 (CSRF 방지)
const generateRandomState = () => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// 네이버 콜백 처리
export const handleNaverCallback = async (code: string, state: string) => {
  try {
    console.log('🔐 [Naver Auth] Processing callback...');
    
    // State 검증 (CSRF 방지)
    const savedState = sessionStorage.getItem('naver_auth_state');
    if (state !== savedState) {
      throw new Error('Invalid state parameter');
    }
    
    // State 삭제
    sessionStorage.removeItem('naver_auth_state');
    
    // Firebase Functions URL 직접 사용
    const functionsUrl = import.meta.env.DEV 
      ? 'http://localhost:5001/in-f8873/us-central1'
      : 'https://us-central1-in-f8873.cloudfunctions.net';
    
    // 백엔드로 code 전송하여 access token 획득
    const tokenResponse = await fetch(`${functionsUrl}/naverToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code, state })
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token response error:', errorData);
      throw new Error('Failed to get access token');
    }
    
    const { accessToken } = await tokenResponse.json();
    
    // Access token으로 Firebase Custom Token 획득
    const authResponse = await fetch(`${functionsUrl}/naverAuth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accessToken })
    });
    
    if (!authResponse.ok) {
      const errorData = await authResponse.text();
      console.error('Auth response error:', errorData);
      throw new Error('Failed to authenticate with Firebase');
    }
    
    const { customToken, user } = await authResponse.json();
    
    // Firebase 로그인
    const userCredential = await signInWithCustomToken(auth, customToken);
    
    console.log('✅ [Naver Auth] Login successful:', userCredential.user.email);
    
    return {
      success: true,
      user: userCredential.user,
      naverUser: user
    };
    
  } catch (error) {
    console.error('❌ [Naver Auth] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed'
    };
  }
};

// 네이버 액세스 토큰으로 직접 인증 (개발용)
export const authenticateWithNaverToken = async (accessToken: string) => {
  try {
    console.log('🔐 [Naver Auth] Authenticating with access token...');
    
    // 로컬 개발 환경에서는 Firebase Functions 에뮬레이터 사용
    const baseUrl = import.meta.env.DEV 
      ? 'http://localhost:5001/in-f8873/us-central1'
      : 'https://us-central1-in-f8873.cloudfunctions.net';
    
    const response = await fetch(`${baseUrl}/naverAuth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accessToken })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Authentication failed');
    }
    
    const { customToken, user } = await response.json();
    
    // Firebase 로그인
    const userCredential = await signInWithCustomToken(auth, customToken);
    
    console.log('✅ [Naver Auth] Login successful:', userCredential.user.uid);
    
    return {
      success: true,
      user: userCredential.user,
      naverUser: user
    };
    
  } catch (error) {
    console.error('❌ [Naver Auth] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed'
    };
  }
};