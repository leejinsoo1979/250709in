import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { vi } from 'vitest';

// Firebase 에뮬레이터 설정
const USE_FIREBASE_EMULATOR = process.env.USE_FIREBASE_EMULATOR === '1';

// 테스트용 Firebase 설정
const testFirebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'test-api-key',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'test-auth-domain',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'test-project-id',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'test-storage-bucket',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.VITE_FIREBASE_APP_ID || 'test-app-id'
};

let app: FirebaseApp;

// Firebase 초기화 및 에뮬레이터 연결
if (USE_FIREBASE_EMULATOR) {
  console.log('🧪 Firebase 에뮬레이터 모드 활성화');
  
  // Firebase 앱 초기화
  app = initializeApp(testFirebaseConfig, 'test-app');
  
  // Auth 에뮬레이터 연결
  const auth = getAuth(app);
  const authEmulatorPort = process.env.FIREBASE_AUTH_EMULATOR_PORT || '9099';
  connectAuthEmulator(auth, `http://localhost:${authEmulatorPort}`, { disableWarnings: true });
  
  // Firestore 에뮬레이터 연결
  const db = getFirestore(app);
  const firestoreEmulatorPort = process.env.FIREBASE_FIRESTORE_EMULATOR_PORT || '8080';
  connectFirestoreEmulator(db, 'localhost', parseInt(firestoreEmulatorPort, 10));
  
  // Storage 에뮬레이터 연결
  const storage = getStorage(app);
  const storageEmulatorPort = process.env.FIREBASE_STORAGE_EMULATOR_PORT || '9199';
  connectStorageEmulator(storage, 'localhost', parseInt(storageEmulatorPort, 10));
  
  console.log('✅ Firebase 에뮬레이터 연결 완료:', {
    auth: `localhost:${authEmulatorPort}`,
    firestore: `localhost:${firestoreEmulatorPort}`,
    storage: `localhost:${storageEmulatorPort}`
  });
} else {
  console.log('🔌 Firebase Mock 모드 (네트워크 접근 차단)');
  
  // 실제 네트워크 호출 차단
  vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({})),
    getApps: vi.fn(() => []),
    getApp: vi.fn(() => ({}))
  }));
  
  vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
      currentUser: null,
      onAuthStateChanged: vi.fn((callback) => {
        callback(null);
        return vi.fn(); // unsubscribe function
      }),
      signInWithEmailAndPassword: vi.fn(),
      createUserWithEmailAndPassword: vi.fn(),
      signOut: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      updateProfile: vi.fn(),
      signInWithPopup: vi.fn(),
      GoogleAuthProvider: vi.fn(),
      GithubAuthProvider: vi.fn()
    })),
    connectAuthEmulator: vi.fn()
  }));
  
  vi.mock('firebase/firestore', () => ({
    getFirestore: vi.fn(() => ({
      collection: vi.fn(),
      doc: vi.fn(),
      addDoc: vi.fn(),
      setDoc: vi.fn(),
      getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
      getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
      updateDoc: vi.fn(),
      deleteDoc: vi.fn(),
      query: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      onSnapshot: vi.fn(() => vi.fn()), // unsubscribe function
      serverTimestamp: vi.fn(() => new Date()),
      Timestamp: {
        now: vi.fn(() => ({ toDate: () => new Date() })),
        fromDate: vi.fn((date) => ({ toDate: () => date }))
      },
      runTransaction: vi.fn((callback) => callback({
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      })),
      writeBatch: vi.fn(() => ({
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn()
      }))
    })),
    connectFirestoreEmulator: vi.fn()
  }));
  
  vi.mock('firebase/storage', () => ({
    getStorage: vi.fn(() => ({
      ref: vi.fn(() => ({
        child: vi.fn(() => ({
          put: vi.fn(),
          putString: vi.fn(),
          getDownloadURL: vi.fn(() => Promise.resolve('https://mock-url.com/file')),
          delete: vi.fn(),
          getMetadata: vi.fn()
        }))
      })),
      uploadBytes: vi.fn(),
      uploadString: vi.fn(),
      getDownloadURL: vi.fn(() => Promise.resolve('https://mock-url.com/file')),
      deleteObject: vi.fn(),
      listAll: vi.fn(() => Promise.resolve({ items: [], prefixes: [] }))
    })),
    connectStorageEmulator: vi.fn()
  }));
}

// 테스트 환경 클린업
export const cleanupFirebaseTest = () => {
  if (USE_FIREBASE_EMULATOR && app) {
    // 에뮬레이터 데이터 정리 (필요시)
    console.log('🧹 Firebase 에뮬레이터 정리');
  }
};

// 각 테스트 후 정리
afterEach(() => {
  vi.clearAllMocks();
});

// 모든 테스트 후 정리
afterAll(() => {
  cleanupFirebaseTest();
});