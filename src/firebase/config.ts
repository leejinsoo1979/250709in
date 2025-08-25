import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Helper function to clean environment variables
const cleanEnvVar = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  // Remove all whitespace characters including newlines, tabs, etc.
  return value.trim().replace(/[\r\n\t]/g, '');
};

// Firebase 설정 (환경변수에서 가져오기 - 모든 공백 문자 제거)
const firebaseConfig = {
  apiKey: cleanEnvVar(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnvVar(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnvVar(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnvVar(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnvVar(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnvVar(import.meta.env.VITE_FIREBASE_APP_ID)
};

// 런타임 환경 체크 및 로깅
const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;
const deploymentEnv = import.meta.env.VITE_VERCEL_ENV || 'unknown';

console.log('🔥 [Firebase Init] Runtime Environment:', {
  isProduction,
  isDevelopment,
  deploymentEnv,
  url: typeof window !== 'undefined' ? window.location.href : 'N/A'
});

// Firebase 설정 검증
const requiredFields = [
  'apiKey',
  'authDomain', 
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId'
] as const;

const missingFields = requiredFields.filter(field => !firebaseConfig[field]);

if (missingFields.length > 0) {
  console.error('🔴 [Firebase Init] Missing required fields:', missingFields);
  console.error('🔴 [Firebase Init] Current config:', {
    ...firebaseConfig,
    apiKey: firebaseConfig.apiKey ? '***' + firebaseConfig.apiKey.slice(-4) : undefined
  });
} else {
  console.log('✅ [Firebase Init] All required fields present');
  
  // Check for problematic characters in URLs
  const authDomainCheck = firebaseConfig.authDomain;
  if (authDomainCheck?.includes('\n') || authDomainCheck?.includes('\r')) {
    console.error('🔴 [Firebase Init] Auth Domain contains newline characters!');
    console.error('🔴 [Firebase Init] Raw value:', JSON.stringify(authDomainCheck));
    console.error('🔴 [Firebase Init] Cleaned value would be:', authDomainCheck.replace(/[\r\n]/g, ''));
  } else {
    console.log('✅ [Firebase Init] Auth Domain (clean):', firebaseConfig.authDomain);
  }
  
  console.log('✅ [Firebase Init] Project ID:', firebaseConfig.projectId);
  
  // Log the actual auth domain being used
  console.log('📋 [Firebase Init] Config being used:', {
    authDomain: firebaseConfig.authDomain,
    authDomainLength: firebaseConfig.authDomain?.length,
    authDomainEncoded: encodeURIComponent(firebaseConfig.authDomain || '')
  });
}

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Firebase 서비스 초기화
export const auth = getAuth(app);

// Firestore 초기화 - getFirestore 사용 (자동 캐싱 포함)
export const db = getFirestore(app);

export const storage = getStorage(app);

export default app; 