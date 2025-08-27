import { vi } from 'vitest';

// Storage Mock Functions
export const uploadBytesMock = vi.fn(() => 
  Promise.resolve({
    metadata: { name: 'test-file' },
    ref: { 
      getDownloadURL: vi.fn(() => Promise.resolve('https://test-url.com/file'))
    }
  })
);

export const getDownloadURLMock = vi.fn(() => 
  Promise.resolve('https://test-url.com/file')
);

export const deleteObjectMock = vi.fn(() => Promise.resolve());

// Firestore Mock Functions  
export const addDocMock = vi.fn(() => 
  Promise.resolve({ id: 'new-doc-id' })
);

export const setDocMock = vi.fn(() => Promise.resolve());
export const updateDocMock = vi.fn(() => Promise.resolve());
export const deleteDocMock = vi.fn(() => Promise.resolve());

export const getDocMock = vi.fn(() => 
  Promise.resolve({
    id: 'mock-id',
    exists: () => true,
    data: () => ({ test: 'data' })
  })
);

export const getDocsMock = vi.fn(() => 
  Promise.resolve({
    docs: [],
    size: 0,
    empty: true,
    forEach: vi.fn()
  })
);

export const queryMock = vi.fn((...args) => ({ 
  type: 'query',
  constraints: args.slice(1) 
}));

export const whereMock = vi.fn((field, op, value) => ({ 
  type: 'where',
  field,
  op,
  value 
}));

export const orderByMock = vi.fn((field, direction = 'asc') => ({ 
  type: 'orderBy',
  field,
  direction 
}));

export const limitMock = vi.fn((n) => ({ 
  type: 'limit',
  value: n 
}));

export const onSnapshotMock = vi.fn((query, callback) => {
  callback({ docs: [], empty: true });
  return vi.fn(); // unsubscribe
});

export const serverTimestampMock = vi.fn(() => new Date());

export const runTransactionMock = vi.fn((db, updateFunction) => {
  const transaction = {
    get: vi.fn(() => Promise.resolve(getDocMock())),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  };
  return Promise.resolve(updateFunction(transaction));
});

export const writeBatchMock = vi.fn(() => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(() => Promise.resolve())
}));

// Auth Mock Functions
export const signInWithEmailAndPasswordMock = vi.fn(() => 
  Promise.resolve({
    user: {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User'
    }
  })
);

export const createUserWithEmailAndPasswordMock = vi.fn(() => 
  Promise.resolve({
    user: {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User'
    }
  })
);

export const signOutMock = vi.fn(() => Promise.resolve());

// Setup all mocks
export const setupFirebaseMocks = () => {
  // Storage mocks
  vi.mocked(uploadBytesMock).mockClear();
  vi.mocked(getDownloadURLMock).mockClear();
  vi.mocked(deleteObjectMock).mockClear();
  
  // Firestore mocks
  vi.mocked(addDocMock).mockClear();
  vi.mocked(setDocMock).mockClear();
  vi.mocked(updateDocMock).mockClear();
  vi.mocked(deleteDocMock).mockClear();
  vi.mocked(getDocMock).mockClear();
  vi.mocked(getDocsMock).mockClear();
  vi.mocked(queryMock).mockClear();
  vi.mocked(whereMock).mockClear();
  vi.mocked(orderByMock).mockClear();
  vi.mocked(limitMock).mockClear();
  vi.mocked(onSnapshotMock).mockClear();
  vi.mocked(serverTimestampMock).mockClear();
  vi.mocked(runTransactionMock).mockClear();
  vi.mocked(writeBatchMock).mockClear();
  
  // Auth mocks
  vi.mocked(signInWithEmailAndPasswordMock).mockClear();
  vi.mocked(createUserWithEmailAndPasswordMock).mockClear();
  vi.mocked(signOutMock).mockClear();
};