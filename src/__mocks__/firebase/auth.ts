import { vi } from 'vitest';

const mockUser = {
  uid: 'test-uid',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  emailVerified: true,
  getIdToken: vi.fn(() => Promise.resolve('mock-token'))
};

export const getAuth = vi.fn(() => ({
  currentUser: null,
  languageCode: null,
  settings: {
    appVerificationDisabledForTesting: true
  },
  onAuthStateChanged: vi.fn((callback) => {
    callback(null);
    return vi.fn(); // unsubscribe
  }),
  onIdTokenChanged: vi.fn((callback) => {
    callback(null);
    return vi.fn(); // unsubscribe
  }),
  updateCurrentUser: vi.fn(),
  useDeviceLanguage: vi.fn(),
  signOut: vi.fn(() => Promise.resolve())
}));

export const signInWithEmailAndPassword = vi.fn(() => 
  Promise.resolve({
    user: mockUser,
    providerId: 'password',
    operationType: 'signIn'
  })
);

export const createUserWithEmailAndPassword = vi.fn(() => 
  Promise.resolve({
    user: mockUser,
    providerId: 'password',
    operationType: 'signIn'
  })
);

export const signInWithPopup = vi.fn(() => 
  Promise.resolve({
    user: mockUser,
    providerId: 'google.com',
    operationType: 'signIn'
  })
);

export const signInWithCredential = vi.fn(() => 
  Promise.resolve({
    user: mockUser,
    providerId: 'google.com',
    operationType: 'signIn'
  })
);

export const sendPasswordResetEmail = vi.fn(() => Promise.resolve());
export const sendEmailVerification = vi.fn(() => Promise.resolve());
export const updateProfile = vi.fn(() => Promise.resolve());
export const updateEmail = vi.fn(() => Promise.resolve());
export const updatePassword = vi.fn(() => Promise.resolve());
export const deleteUser = vi.fn(() => Promise.resolve());
export const reauthenticateWithCredential = vi.fn(() => Promise.resolve());

export const GoogleAuthProvider = vi.fn(() => ({
  providerId: 'google.com',
  addScope: vi.fn(),
  setCustomParameters: vi.fn()
}));

export const GithubAuthProvider = vi.fn(() => ({
  providerId: 'github.com',
  addScope: vi.fn(),
  setCustomParameters: vi.fn()
}));

export const connectAuthEmulator = vi.fn();