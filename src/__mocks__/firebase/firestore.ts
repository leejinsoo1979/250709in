import { vi } from 'vitest';

const mockDocSnapshot = {
  id: 'mock-id',
  exists: vi.fn(() => true),
  data: vi.fn(() => ({ name: 'Mock Data' })),
  get: vi.fn((field) => ({ name: 'Mock Data' })[field]),
  ref: { id: 'mock-id', path: 'mock/path' }
};

const mockQuerySnapshot = {
  docs: [],
  size: 0,
  empty: true,
  forEach: vi.fn(),
  docChanges: vi.fn(() => [])
};

export const getFirestore = vi.fn(() => ({
  type: 'firestore',
  toJSON: vi.fn(() => ({}))
}));

export const collection = vi.fn((db, path) => ({
  id: path,
  path,
  parent: null,
  firestore: db
}));

export const doc = vi.fn((collectionRef, id) => ({
  id: id || 'auto-id',
  path: `${collectionRef.path}/${id || 'auto-id'}`,
  parent: collectionRef,
  firestore: collectionRef.firestore
}));

export const addDoc = vi.fn(() => 
  Promise.resolve({ id: 'new-doc-id' })
);

export const setDoc = vi.fn(() => Promise.resolve());
export const updateDoc = vi.fn(() => Promise.resolve());
export const deleteDoc = vi.fn(() => Promise.resolve());

export const getDoc = vi.fn(() => Promise.resolve(mockDocSnapshot));
export const getDocs = vi.fn(() => Promise.resolve(mockQuerySnapshot));

export const query = vi.fn((...args) => ({ 
  type: 'query',
  constraints: args.slice(1) 
}));

export const where = vi.fn((field, op, value) => ({ 
  type: 'where',
  field,
  op,
  value 
}));

export const orderBy = vi.fn((field, direction = 'asc') => ({ 
  type: 'orderBy',
  field,
  direction 
}));

export const limit = vi.fn((n) => ({ 
  type: 'limit',
  value: n 
}));

export const startAfter = vi.fn((...values) => ({ 
  type: 'startAfter',
  values 
}));

export const onSnapshot = vi.fn((query, callback) => {
  // 즉시 빈 결과로 콜백 호출
  callback(mockQuerySnapshot);
  return vi.fn(); // unsubscribe
});

export const serverTimestamp = vi.fn(() => new Date());

export const Timestamp = {
  now: vi.fn(() => ({ 
    toDate: () => new Date(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0
  })),
  fromDate: vi.fn((date) => ({ 
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0
  }))
};

export const runTransaction = vi.fn((db, updateFunction) => {
  const transaction = {
    get: vi.fn(() => Promise.resolve(mockDocSnapshot)),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  };
  return Promise.resolve(updateFunction(transaction));
});

export const writeBatch = vi.fn(() => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(() => Promise.resolve())
}));

export const connectFirestoreEmulator = vi.fn();
export const enableNetwork = vi.fn(() => Promise.resolve());
export const disableNetwork = vi.fn(() => Promise.resolve());
export const clearIndexedDbPersistence = vi.fn(() => Promise.resolve());
export const enableIndexedDbPersistence = vi.fn(() => Promise.resolve());
export const enableMultiTabIndexedDbPersistence = vi.fn(() => Promise.resolve());