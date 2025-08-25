import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase 설정 (환경변수에서 가져오기)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
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
  console.log('✅ [Firebase Init] Auth Domain:', firebaseConfig.authDomain);
  console.log('✅ [Firebase Init] Project ID:', firebaseConfig.projectId);
}

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Firebase 서비스 초기화
export const auth = getAuth(app);

// Firestore 초기화 - getFirestore 사용 (자동 캐싱 포함)
export const db = getFirestore(app);

export const storage = getStorage(app);

export default app; 