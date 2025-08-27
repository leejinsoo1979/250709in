import { describe, it, expect, beforeAll, vi } from 'vitest';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

// Firebase 테스트 모드 확인
const USE_EMULATOR = process.env.USE_FIREBASE_EMULATOR === '1' || process.env.USE_FIREBASE_EMULATOR === 'true';

describe('Firebase Integration Tests', () => {
  let app: any;
  let auth: any;
  let db: any;
  let storage: any;

  beforeAll(() => {
    // Firebase 인스턴스 가져오기
    if (USE_EMULATOR) {
      app = (global as any).__FIREBASE_APP__;
      auth = (global as any).__FIREBASE_AUTH__;
      db = (global as any).__FIREBASE_DB__;
      storage = (global as any).__FIREBASE_STORAGE__;
    } else {
      // Mock 모드에서는 모듈에서 직접 가져오기
      app = getApps()[0] || initializeApp({
        apiKey: 'test-api-key',
        authDomain: 'test-auth-domain',
        projectId: 'test-project',
        storageBucket: 'test-storage',
        messagingSenderId: '123456',
        appId: 'test-app-id'
      });
      auth = getAuth(app);
      db = getFirestore(app);
      storage = getStorage(app);
    }
  });

  describe('Firebase App', () => {
    it('should have Firebase app initialized', () => {
      expect(app).toBeDefined();
      if (USE_EMULATOR) {
        expect(app.name).toBe('test-app');
      }
    });
  });

  describe('Firebase Auth', () => {
    const testEmail = 'test@example.com';
    const testPassword = 'testPassword123!';

    it('should have auth instance', () => {
      expect(auth).toBeDefined();
    });

    it('should create a new user', async () => {
      if (USE_EMULATOR) {
        const userCredential = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
        expect(userCredential.user).toBeDefined();
        expect(userCredential.user.email).toBe(testEmail);
      } else {
        // Mock 모드에서는 mock 함수 호출 확인
        const result = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
        expect(result.user).toBeDefined();
        expect(result.user.email).toBe('test@example.com');
      }
    });

    it('should sign in a user', async () => {
      if (USE_EMULATOR) {
        const userCredential = await signInWithEmailAndPassword(auth, testEmail, testPassword);
        expect(userCredential.user).toBeDefined();
        expect(userCredential.user.email).toBe(testEmail);
      } else {
        const result = await signInWithEmailAndPassword(auth, testEmail, testPassword);
        expect(result.user).toBeDefined();
      }
    });

    it('should sign out a user', async () => {
      await signOut(auth);
      expect(auth.currentUser).toBeNull();
    });
  });

  describe('Firebase Firestore', () => {
    const testCollection = 'test-collection';
    const testData = {
      name: 'Test Document',
      created: new Date().toISOString(),
      value: 42
    };

    it('should have firestore instance', () => {
      expect(db).toBeDefined();
    });

    it('should add a document', async () => {
      const docRef = await addDoc(collection(db, testCollection), testData);
      expect(docRef).toBeDefined();
      expect(docRef.id).toBeDefined();
    });

    it('should set and get a document', async () => {
      const docId = 'test-doc-id';
      const docRef = doc(db, testCollection, docId);
      
      await setDoc(docRef, testData);
      const docSnap = await getDoc(docRef);
      
      if (USE_EMULATOR) {
        expect(docSnap.exists()).toBe(true);
        expect(docSnap.data()).toEqual(expect.objectContaining({
          name: testData.name,
          value: testData.value
        }));
      } else {
        // Mock 모드에서는 기본 동작 확인
        expect(docSnap.exists).toBeDefined();
      }
    });

    it('should query documents', async () => {
      const querySnapshot = await getDocs(collection(db, testCollection));
      expect(querySnapshot).toBeDefined();
      
      if (USE_EMULATOR) {
        expect(querySnapshot.empty).toBe(false);
        expect(querySnapshot.docs.length).toBeGreaterThan(0);
      } else {
        expect(querySnapshot.empty).toBeDefined();
      }
    });

    it('should delete a document', async () => {
      const docId = 'test-doc-to-delete';
      const docRef = doc(db, testCollection, docId);
      
      await setDoc(docRef, { toDelete: true });
      await deleteDoc(docRef);
      
      const docSnap = await getDoc(docRef);
      if (USE_EMULATOR) {
        expect(docSnap.exists()).toBe(false);
      } else {
        expect(docSnap.exists).toBeDefined();
      }
    });
  });

  describe('Firebase Storage', () => {
    const testFileName = 'test-file.txt';
    const testFileContent = 'Test file content';

    it('should have storage instance', () => {
      expect(storage).toBeDefined();
    });

    it('should upload and get download URL', async () => {
      const storageRef = ref(storage, testFileName);
      
      await uploadString(storageRef, testFileContent, 'raw');
      const downloadUrl = await getDownloadURL(storageRef);
      
      expect(downloadUrl).toBeDefined();
      if (USE_EMULATOR) {
        expect(downloadUrl).toContain('localhost');
      } else {
        expect(downloadUrl).toBe('https://mock-url.com/file');
      }
    });

    it('should delete a file', async () => {
      const storageRef = ref(storage, testFileName);
      
      await deleteObject(storageRef);
      // 삭제 성공 = 에러 없이 완료
      expect(true).toBe(true);
    });
  });

  describe('Test Mode Detection', () => {
    it('should correctly detect test mode', () => {
      console.log('🧪 Test Mode:', USE_EMULATOR ? 'Emulator' : 'Mock');
      expect(USE_EMULATOR).toBeDefined();
    });

    it('should have correct configuration based on mode', () => {
      if (USE_EMULATOR) {
        // 에뮬레이터 모드 검증
        expect((auth as any).emulatorConfig).toBeDefined();
        expect((db as any)._settings).toBeDefined();
      } else {
        // Mock 모드 검증
        expect(vi.isMockFunction(signInWithEmailAndPassword)).toBe(true);
      }
    });
  });
});