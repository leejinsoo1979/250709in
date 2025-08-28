import { vi } from 'vitest';
import type { User } from 'firebase/auth';

// Mock user factory
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  uid: 'test-uid',
  email: 'test@example.com',
  emailVerified: true,
  displayName: 'Test User',
  isAnonymous: false,
  photoURL: null,
  phoneNumber: null,
  providerId: 'firebase',
  refreshToken: 'mock-refresh-token',
  tenantId: null,
  metadata: {
    creationTime: '2024-01-01T00:00:00.000Z',
    lastSignInTime: '2024-01-01T00:00:00.000Z'
  },
  providerData: [],
  delete: vi.fn(),
  getIdToken: vi.fn(() => Promise.resolve('mock-token')),
  getIdTokenResult: vi.fn(() => Promise.resolve({
    authTime: '2024-01-01T00:00:00.000Z',
    expirationTime: '2024-01-01T01:00:00.000Z',
    issuedAtTime: '2024-01-01T00:00:00.000Z',
    signInProvider: 'password',
    signInSecondFactor: null,
    token: 'mock-token',
    claims: {}
  })),
  reload: vi.fn(() => Promise.resolve()),
  toJSON: vi.fn(() => ({})),
  ...overrides
});

// Mock project factory
export const createMockProject = (overrides: any = {}) => ({
  id: 'test-project-id',
  name: 'Test Project',
  description: 'Test Description',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  userId: 'test-uid',
  projectInfo: {
    projectNumber: 'PROJ-001',
    location: 'Seoul',
    client: 'Test Client'
  },
  spaceConfig: {
    width: 3000,
    depth: 2500,
    height: 2800
  },
  furniture: [],
  ...overrides
});

// Reset all Firebase mocks
export const resetFirebaseMocks = () => {
  vi.clearAllMocks();
};

// Setup Firebase mock responses
export const setupAuthMocks = (isAuthenticated = false, user: Partial<User> | null = null) => {
  const mockAuth = vi.mocked(await import('firebase/auth'));
  
  if (isAuthenticated && user) {
    const mockUser = createMockUser(user);
    mockAuth.getAuth = vi.fn(() => ({
      currentUser: mockUser,
      onAuthStateChanged: vi.fn((callback) => {
        callback(mockUser);
        return vi.fn();
      })
    } as any));
    
    mockAuth.signInWithEmailAndPassword = vi.fn(() => 
      Promise.resolve({ user: mockUser } as any)
    );
  } else {
    mockAuth.getAuth = vi.fn(() => ({
      currentUser: null,
      onAuthStateChanged: vi.fn((callback) => {
        callback(null);
        return vi.fn();
      })
    } as any));
  }
};

// Setup Firestore mock responses
export const setupFirestoreMocks = (documents: any[] = []) => {
  const mockFirestore = vi.mocked(await import('firebase/firestore'));
  
  const mockSnapshot = {
    docs: documents.map(doc => ({
      id: doc.id || 'test-id',
      data: () => doc,
      exists: () => true
    })),
    empty: documents.length === 0,
    size: documents.length,
    forEach: vi.fn((callback) => {
      mockSnapshot.docs.forEach(callback);
    })
  };
  
  mockFirestore.getDocs = vi.fn(() => Promise.resolve(mockSnapshot as any));
  mockFirestore.getDoc = vi.fn(() => Promise.resolve({
    id: documents[0]?.id || 'test-id',
    data: () => documents[0] || null,
    exists: () => documents.length > 0
  } as any));
  
  mockFirestore.onSnapshot = vi.fn((query, callback) => {
    callback(mockSnapshot as any);
    return vi.fn();
  });
};

// Wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Firebase error factory
export const createFirebaseError = (code: string, message: string) => {
  const error = new Error(message) as any;
  error.code = code;
  return error;
};