import { vi } from 'vitest';

// Firebase 에뮬레이터 설정
const USE_FIREBASE_EMULATOR = process.env.USE_FIREBASE_EMULATOR === '1' || process.env.USE_FIREBASE_EMULATOR === 'true';

console.log('🔥 Firebase Test Mode:', USE_FIREBASE_EMULATOR ? 'Emulator' : 'Mock');

if (USE_FIREBASE_EMULATOR) {
  // 에뮬레이터 모드: 실제 Firebase SDK 사용
  console.log('🧪 Firebase 에뮬레이터 연결 중...');
  
  // 동적 import로 실제 Firebase 모듈 로드
  beforeAll(async () => {
    const { initializeApp } = await import('firebase/app');
    const { getAuth, connectAuthEmulator } = await import('firebase/auth');
    const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
    const { getStorage, connectStorageEmulator } = await import('firebase/storage');
    
    // 테스트용 Firebase 설정
    const testFirebaseConfig = {
      apiKey: process.env.VITE_FIREBASE_API_KEY || 'test-api-key',
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'test-auth-domain',
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-test-project',
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'test-storage-bucket',
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
      appId: process.env.VITE_FIREBASE_APP_ID || 'test-app-id'
    };
    
    // Firebase 앱 초기화
    const app = initializeApp(testFirebaseConfig, 'test-app');
    
    // Auth 에뮬레이터 연결
    const auth = getAuth(app);
    const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
    if (!auth.emulatorConfig) {
      connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
    }
    
    // Firestore 에뮬레이터 연결
    const db = getFirestore(app);
    const firestoreEmulatorHost = process.env.FIREBASE_FIRESTORE_EMULATOR_HOST || 'localhost:8080';
    const [host, port] = firestoreEmulatorHost.split(':');
    if (!(db as any)._settings?.host?.includes('localhost')) {
      connectFirestoreEmulator(db, host, parseInt(port, 10));
    }
    
    // Storage 에뮬레이터 연결
    const storage = getStorage(app);
    const storageEmulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';
    const [storageHost, storagePort] = storageEmulatorHost.split(':');
    if (!(storage as any)._customUrlOrRegion?.includes('localhost')) {
      connectStorageEmulator(storage, storageHost, parseInt(storagePort, 10));
    }
    
    console.log('✅ Firebase 에뮬레이터 연결 완료:', {
      auth: authEmulatorHost,
      firestore: firestoreEmulatorHost,
      storage: storageEmulatorHost
    });
    
    // 전역 객체에 저장 (테스트에서 사용)
    (global as any).__FIREBASE_APP__ = app;
    (global as any).__FIREBASE_AUTH__ = auth;
    (global as any).__FIREBASE_DB__ = db;
    (global as any).__FIREBASE_STORAGE__ = storage;
  });
  
  // 각 테스트 후 정리
  afterEach(async () => {
    // 에뮬레이터 데이터 초기화 (필요시)
    const auth = (global as any).__FIREBASE_AUTH__;
    const db = (global as any).__FIREBASE_DB__;
    
    if (auth?.currentUser) {
      await auth.signOut();
    }
    
    // Firestore 데이터 정리는 에뮬레이터 REST API 사용
    if (process.env.CLEAR_FIRESTORE_AFTER_TEST === 'true') {
      const firestoreEmulatorHost = process.env.FIREBASE_FIRESTORE_EMULATOR_HOST || 'localhost:8080';
      try {
        await fetch(`http://${firestoreEmulatorHost}/emulator/v1/projects/demo-test-project/databases/(default)/documents`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.warn('Firestore 정리 실패:', error);
      }
    }
  });
} else {
  // Mock 모드: vi.mock 사용
  console.log('🔌 Firebase Mock 모드 활성화');
  
  // Firebase 모듈 Mock
  vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({
      name: '[DEFAULT]',
      options: {},
      automaticDataCollectionEnabled: false
    })),
    getApps: vi.fn(() => []),
    getApp: vi.fn(() => ({
      name: '[DEFAULT]',
      options: {},
      automaticDataCollectionEnabled: false
    }))
  }));
  
  vi.mock('firebase/auth', () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true
    };
    
    return {
      getAuth: vi.fn(() => ({
        currentUser: null,
        onAuthStateChanged: vi.fn((callback) => {
          callback(null);
          return vi.fn();
        }),
        signInWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: mockUser })),
        createUserWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: mockUser })),
        signOut: vi.fn(() => Promise.resolve()),
        sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
        signInWithPopup: vi.fn(() => Promise.resolve({ user: mockUser }))
      })),
      connectAuthEmulator: vi.fn(),
      signInWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: mockUser })),
      createUserWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: mockUser })),
      signOut: vi.fn(() => Promise.resolve()),
      GoogleAuthProvider: vi.fn(() => ({
        providerId: 'google.com',
        addScope: vi.fn()
      })),
      GithubAuthProvider: vi.fn(() => ({
        providerId: 'github.com',
        addScope: vi.fn()
      }))
    };
  });
  
  vi.mock('firebase/firestore', () => {
    const mockRunTransaction = vi.fn((db, callback) => callback({
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }));
    
    // Add mockImplementation method
    mockRunTransaction.mockImplementation = vi.fn((impl) => {
      mockRunTransaction.mockReset();
      mockRunTransaction.mockImplementation(impl);
    });
    
    return {
      getFirestore: vi.fn(() => ({})),
      collection: vi.fn(),
      doc: vi.fn(),
      addDoc: vi.fn(() => Promise.resolve({ id: 'new-doc-id' })),
      setDoc: vi.fn(() => Promise.resolve()),
      getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
      getDocs: vi.fn(() => Promise.resolve({ docs: [], empty: true })),
      updateDoc: vi.fn(() => Promise.resolve()),
      deleteDoc: vi.fn(() => Promise.resolve()),
      query: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      startAfter: vi.fn(),
      onSnapshot: vi.fn(() => vi.fn()),
      serverTimestamp: vi.fn(() => new Date()),
      Timestamp: {
        now: vi.fn(() => ({ toDate: () => new Date() })),
        fromDate: vi.fn((date) => ({ toDate: () => date }))
      },
      runTransaction: mockRunTransaction,
      writeBatch: vi.fn(() => ({
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn(() => Promise.resolve())
      })),
      connectFirestoreEmulator: vi.fn()
    };
  });
  
  vi.mock('firebase/storage', () => {
    const mockUploadBytes = vi.fn(() => Promise.resolve({
      metadata: { name: 'test-file' },
      ref: { 
        fullPath: 'test/path',
        getDownloadURL: vi.fn(() => Promise.resolve('https://mock-url.com/file')) 
      }
    }));
    
    // Make mock functions accessible for tests
    mockUploadBytes.mockResolvedValue = vi.fn((value) => {
      mockUploadBytes.mockImplementation(() => Promise.resolve(value));
    });
    mockUploadBytes.mockRejectedValue = vi.fn((error) => {
      mockUploadBytes.mockImplementation(() => Promise.reject(error));
    });
    
    return {
      getStorage: vi.fn(() => ({})),
      ref: vi.fn(() => ({
        fullPath: 'test/path',
        child: vi.fn(() => ({
          put: vi.fn(),
          putString: vi.fn(),
          getDownloadURL: vi.fn(() => Promise.resolve('https://mock-url.com/file')),
          delete: vi.fn()
        }))
      })),
      uploadBytes: mockUploadBytes,
      uploadString: vi.fn(() => Promise.resolve()),
      getDownloadURL: vi.fn(() => Promise.resolve('https://mock-url.com/file')),
      deleteObject: vi.fn(() => Promise.resolve()),
      connectStorageEmulator: vi.fn()
    };
  });
}

// 테스트 환경 정리
afterEach(() => {
  vi.clearAllMocks();
});

export {};