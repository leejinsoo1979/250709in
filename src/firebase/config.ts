import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getAnalytics, Analytics } from 'firebase/analytics';

// iframe readonly 모드 체크
const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isReadOnlyMode = urlParams?.get('mode') === 'readonly';
const shouldBlockFirebase = isInIframe && isReadOnlyMode;

if (shouldBlockFirebase) {
  console.log('🚫 iframe readonly 모드 - Firebase 초기화 완전 차단 (COOP 에러 방지)');
}

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

// Firebase 설정 확인 (readonly 모드가 아닐 때만)
if (!shouldBlockFirebase) {
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
}

// Firebase 앱 초기화 (readonly 모드가 아닐 때만)
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (!shouldBlockFirebase) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  // readonly 모드에서는 null 객체 반환 (실제로는 사용되지 않음)
  app = null as any;
  auth = null as any;
  db = null as any;
  storage = null as any;
}

// Firebase Analytics 초기화 (readonly 모드가 아닐 때만)
let analytics: Analytics | null = null;
if (!shouldBlockFirebase && typeof window !== 'undefined' && firebaseConfig.measurementId) {
  try {
    analytics = getAnalytics(app);
    console.log('📊 Firebase Analytics initialized');
  } catch (error) {
    console.warn('⚠️ Firebase Analytics initialization failed:', error);
  }
}

export { auth, db, storage, analytics };
export default app; 