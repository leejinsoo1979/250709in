import { vi } from 'vitest';

export const mockServerTimestamp = () => new Date();

export const mockRunTransaction = async (_db: any, fn: any) => {
  const mockTransaction = {
    get: vi.fn().mockResolvedValue({ 
      exists: () => false, 
      data: () => ({}) 
    }),
    set: vi.fn(),
    update: vi.fn(),
  };
  
  const result = await fn(mockTransaction);
  return result;
};

export const mockUploadBytes = async (_ref: any, _data: any, _metadata?: any) => ({ 
  ref: { 
    fullPath: 'mock/path',
    name: 'mock-file'
  },
  metadata: {
    size: 1024,
    contentType: 'application/octet-stream',
    timeCreated: new Date().toISOString()
  }
});

export const mockGetDownloadURL = async (_ref: any) => 'https://example.com/mock.file';

export const mockDoc = vi.fn((db: any, ...pathSegments: string[]) => ({
  id: pathSegments[pathSegments.length - 1] || 'mock-id',
  path: pathSegments.join('/'),
}));

export const mockCollection = vi.fn((db: any, path: string) => ({
  id: path.split('/').pop() || 'mock-collection',
  path,
}));

export const mockGetDoc = vi.fn().mockResolvedValue({
  exists: () => true,
  data: () => ({ mock: 'data' }),
  id: 'mock-doc-id',
});

export const mockSetDoc = vi.fn().mockResolvedValue(undefined);

export const mockGetDocs = vi.fn().mockResolvedValue({
  empty: false,
  docs: [],
  size: 0,
});

export const mockQuery = vi.fn((...args) => args);
export const mockWhere = vi.fn((field: string, op: string, value: any) => ({ field, op, value }));
export const mockOrderBy = vi.fn((field: string, direction?: string) => ({ field, direction }));
export const mockLimit = vi.fn((limit: number) => ({ limit }));

export const mockWriteBatch = vi.fn(() => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
}));

export const mockRef = vi.fn((storage: any, path: string) => ({
  fullPath: path,
  name: path.split('/').pop() || 'mock-file',
}));

export const mockDeleteObject = vi.fn().mockResolvedValue(undefined);
export const mockGetMetadata = vi.fn().mockResolvedValue({
  size: 1024,
  contentType: 'application/octet-stream',
});

export function wireFirebaseMocks() {
  // Mock firebase/firestore
  vi.mock('firebase/firestore', () => ({
    doc: mockDoc,
    getDoc: mockGetDoc,
    setDoc: mockSetDoc,
    collection: mockCollection,
    getDocs: mockGetDocs,
    query: mockQuery,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    runTransaction: mockRunTransaction,
    serverTimestamp: mockServerTimestamp,
    writeBatch: mockWriteBatch,
    addDoc: vi.fn().mockResolvedValue({ id: 'mock-new-id' }),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    Timestamp: {
      now: vi.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
      fromMillis: vi.fn((millis) => ({ 
        seconds: Math.floor(millis / 1000), 
        nanoseconds: (millis % 1000) * 1000000 
      })),
      fromDate: vi.fn((date) => ({ 
        seconds: Math.floor(date.getTime() / 1000), 
        nanoseconds: 0 
      })),
    },
  }));

  // Mock firebase/storage
  vi.mock('firebase/storage', () => ({
    ref: mockRef,
    uploadBytes: mockUploadBytes,
    getDownloadURL: mockGetDownloadURL,
    deleteObject: mockDeleteObject,
    getMetadata: mockGetMetadata,
  }));

  // Mock firebase/auth
  vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({})),
    onAuthStateChanged: vi.fn((auth, callback) => {
      callback(null);
      return () => {};
    }),
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({ 
      user: { uid: 'mock-user-id' } 
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
    GoogleAuthProvider: vi.fn(() => ({})),
    signInWithPopup: vi.fn().mockResolvedValue({
      user: { uid: 'google-user-id' }
    }),
    signInWithRedirect: vi.fn().mockResolvedValue(undefined),
    getRedirectResult: vi.fn().mockResolvedValue({
      user: { uid: 'redirect-user-id' }
    }),
  }));

  // Mock config files
  vi.mock('@/firebase/config', () => ({
    db: {},
    storage: {},
    auth: {},
  }));

  vi.mock('../config', () => ({
    db: {},
    storage: {},
    auth: {},
  }));
}