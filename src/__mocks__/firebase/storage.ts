import { vi } from 'vitest';

const mockUploadTask = {
  snapshot: {
    bytesTransferred: 0,
    totalBytes: 100,
    state: 'running',
    metadata: {},
    task: null,
    ref: null
  },
  on: vi.fn((event, next, error, complete) => {
    // 즉시 완료 콜백 호출
    if (complete) complete();
    return vi.fn(); // unsubscribe
  }),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  then: vi.fn((onFulfilled) => {
    const snapshot = {
      bytesTransferred: 100,
      totalBytes: 100,
      state: 'success',
      metadata: { name: 'test-file' },
      ref: {
        getDownloadURL: vi.fn(() => Promise.resolve('https://mock-url.com/file'))
      }
    };
    if (onFulfilled) onFulfilled(snapshot);
    return Promise.resolve(snapshot);
  }),
  catch: vi.fn()
};

const mockStorageRef = {
  bucket: 'test-bucket',
  fullPath: 'test/path',
  name: 'file.jpg',
  parent: null,
  root: null,
  storage: null,
  toString: vi.fn(() => 'gs://test-bucket/test/path'),
  child: vi.fn((path) => ({ ...mockStorageRef, fullPath: `test/path/${path}` })),
  delete: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve('https://mock-url.com/file')),
  getMetadata: vi.fn(() => Promise.resolve({
    name: 'file.jpg',
    size: 1024,
    contentType: 'image/jpeg',
    timeCreated: new Date().toISOString(),
    updated: new Date().toISOString()
  })),
  list: vi.fn(() => Promise.resolve({
    items: [],
    prefixes: [],
    nextPageToken: null
  })),
  listAll: vi.fn(() => Promise.resolve({
    items: [],
    prefixes: []
  })),
  put: vi.fn(() => mockUploadTask),
  putString: vi.fn(() => mockUploadTask),
  updateMetadata: vi.fn(() => Promise.resolve())
};

export const getStorage = vi.fn(() => ({
  app: null,
  maxOperationRetryTime: 120000,
  maxUploadRetryTime: 600000
}));

export const ref = vi.fn((storage, path) => ({
  ...mockStorageRef,
  fullPath: path || '',
  storage
}));

export const uploadBytes = vi.fn(() => 
  Promise.resolve({
    metadata: { name: 'file.jpg' },
    ref: mockStorageRef
  })
);

export const uploadBytesResumable = vi.fn(() => mockUploadTask);

export const uploadString = vi.fn(() => 
  Promise.resolve({
    metadata: { name: 'file.txt' },
    ref: mockStorageRef
  })
);

export const getDownloadURL = vi.fn(() => 
  Promise.resolve('https://mock-url.com/file')
);

export const deleteObject = vi.fn(() => Promise.resolve());

export const list = vi.fn(() => 
  Promise.resolve({
    items: [],
    prefixes: [],
    nextPageToken: null
  })
);

export const listAll = vi.fn(() => 
  Promise.resolve({
    items: [],
    prefixes: []
  })
);

export const getMetadata = vi.fn(() => 
  Promise.resolve({
    name: 'file.jpg',
    size: 1024,
    contentType: 'image/jpeg',
    timeCreated: new Date().toISOString(),
    updated: new Date().toISOString()
  })
);

export const updateMetadata = vi.fn(() => Promise.resolve());
export const getBytes = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));
export const getStream = vi.fn();
export const connectStorageEmulator = vi.fn();