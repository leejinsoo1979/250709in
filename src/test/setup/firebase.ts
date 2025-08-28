import { vi } from 'vitest';

// Mock Firebase modules
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({
    name: '[DEFAULT]',
    options: {},
    automaticDataCollectionEnabled: false
  })),
  getApp: vi.fn(() => ({
    name: '[DEFAULT]',
    options: {},
    automaticDataCollectionEnabled: false
  })),
  getApps: vi.fn(() => [])
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
    sendEmailVerification: vi.fn()
  })),
  signInWithEmailAndPassword: vi.fn(() => Promise.resolve({
    user: {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true
    }
  })),
  createUserWithEmailAndPassword: vi.fn(() => Promise.resolve({
    user: {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: null,
      emailVerified: false
    }
  })),
  signOut: vi.fn(() => Promise.resolve()),
  sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
  updateProfile: vi.fn(() => Promise.resolve()),
  sendEmailVerification: vi.fn(() => Promise.resolve()),
  onAuthStateChanged: vi.fn((auth, callback) => {
    callback(null);
    return vi.fn();
  })
}));

vi.mock('firebase/firestore', () => {
  const mockDoc = {
    id: 'test-id',
    data: () => ({ name: 'Test', createdAt: new Date() }),
    exists: () => true
  };

  const mockSnapshot = {
    docs: [mockDoc],
    empty: false,
    size: 1,
    forEach: vi.fn((callback) => {
      [mockDoc].forEach(callback);
    })
  };

  return {
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn(() => ({})),
    doc: vi.fn(() => ({
      id: 'test-id',
      get: vi.fn(() => Promise.resolve(mockDoc)),
      set: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve())
    })),
    addDoc: vi.fn(() => Promise.resolve({ id: 'test-id' })),
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(() => Promise.resolve()),
    deleteDoc: vi.fn(() => Promise.resolve()),
    getDoc: vi.fn(() => Promise.resolve(mockDoc)),
    getDocs: vi.fn(() => Promise.resolve(mockSnapshot)),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    onSnapshot: vi.fn((query, callback) => {
      callback(mockSnapshot);
      return vi.fn(); // unsubscribe
    }),
    serverTimestamp: vi.fn(() => new Date()),
    Timestamp: {
      now: vi.fn(() => ({ toDate: () => new Date() })),
      fromDate: vi.fn((date) => ({ toDate: () => date }))
    }
  };
});

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({
    put: vi.fn(() => Promise.resolve({
      ref: {
        getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/file.pdf'))
      }
    })),
    getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/file.pdf')),
    delete: vi.fn(() => Promise.resolve())
  })),
  uploadBytes: vi.fn(() => Promise.resolve({
    ref: {
      getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/file.pdf'))
    }
  })),
  getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/file.pdf')),
  deleteObject: vi.fn(() => Promise.resolve())
}));

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn()
};