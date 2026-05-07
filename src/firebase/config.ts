import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getAnalytics, Analytics } from 'firebase/analytics';

// Firebase 설정 (환경변수에서 가져오기)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'in-f8873.firebaseapp.com').trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim()
};

// Firebase 설정 확인 (개발 모드 및 프로덕션 모두)
console.log('🔥 Firebase Config Status:', {
  apiKey: firebaseConfig.apiKey ? '✅ Set' : '❌ Missing',
  authDomain: firebaseConfig.authDomain || '❌ Missing',
  projectId: firebaseConfig.projectId || '❌ Missing',
  storageBucket: firebaseConfig.storageBucket || '❌ Missing',
  messagingSenderId: firebaseConfig.messagingSenderId ? '✅ Set' : '❌ Missing',
  appId: firebaseConfig.appId ? '✅ Set' : '❌ Missing',
  measurementId: firebaseConfig.measurementId ? '✅ Set' : '❌ Missing',
  environment: import.meta.env.MODE,
  currentDomain: typeof window !== 'undefined' ? window.location.hostname : 'N/A'
});

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// Firebase 서비스 초기화
export const auth = getAuth(app);

// Firestore 초기화 - getFirestore 사용 (자동 캐싱 포함)
export const db = getFirestore(app);

// Firestore 설정 최적화
if (typeof window !== 'undefined') {
  // 오프라인 지속성 비활성화 (400 에러 방지)
  // enableIndexedDbPersistence는 사용하지 않음
}

export const storage = getStorage(app);

// Cloud Functions (region: asia-northeast3 - 서울)
export const functions = getFunctions(app, 'asia-northeast3');

// Firebase Analytics 초기화 (브라우저 환경에서만)
let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  try {
    analytics = getAnalytics(app);
    console.log('📊 Firebase Analytics initialized');
  } catch (error) {
    console.warn('⚠️ Firebase Analytics initialization failed:', error);
  }
}

export { analytics };

export default app;
