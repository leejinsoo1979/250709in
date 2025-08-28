import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetFirebaseMocks, createMockUser, setupAuthMocks } from './testHelpers';

describe('Firebase Auth Service', () => {
  beforeEach(() => {
    resetFirebaseMocks();
  });

  describe('signIn', () => {
    it('should successfully sign in with valid credentials', async () => {
      const mockUser = createMockUser({ 
        email: 'test@example.com',
        displayName: 'Test User'
      });
      setupAuthMocks(true, mockUser);
      
      const { signInWithEmailAndPassword, getAuth } = await import('firebase/auth');
      
      const result = await signInWithEmailAndPassword(
        getAuth(),
        'test@example.com',
        'password123'
      );
      
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.displayName).toBe('Test User');
    });

    it('should handle invalid email error', async () => {
      const { signInWithEmailAndPassword, getAuth } = await import('firebase/auth');
      
      const error = new Error('Invalid email format') as any;
      error.code = 'auth/invalid-email';
      
      vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(error);
      
      await expect(
        signInWithEmailAndPassword(getAuth(), 'invalid-email', 'password')
      ).rejects.toThrow('Invalid email format');
    });

    it('should handle wrong password error', async () => {
      const { signInWithEmailAndPassword, getAuth } = await import('firebase/auth');
      
      const error = new Error('Wrong password') as any;
      error.code = 'auth/wrong-password';
      
      vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(error);
      
      await expect(
        signInWithEmailAndPassword(getAuth(), 'test@example.com', 'wrong')
      ).rejects.toThrow('Wrong password');
    });
  });

  describe('signUp', () => {
    it('should create new user account', async () => {
      const { createUserWithEmailAndPassword, getAuth } = await import('firebase/auth');
      
      const mockUser = createMockUser({
        email: 'new@example.com',
        emailVerified: false
      });
      
      vi.mocked(createUserWithEmailAndPassword).mockResolvedValueOnce({
        user: mockUser
      } as any);
      
      const result = await createUserWithEmailAndPassword(
        getAuth(),
        'new@example.com',
        'password123'
      );
      
      expect(result.user.email).toBe('new@example.com');
      expect(result.user.emailVerified).toBe(false);
    });

    it('should handle email already in use error', async () => {
      const { createUserWithEmailAndPassword, getAuth } = await import('firebase/auth');
      
      const error = new Error('Email already in use') as any;
      error.code = 'auth/email-already-in-use';
      
      vi.mocked(createUserWithEmailAndPassword).mockRejectedValueOnce(error);
      
      await expect(
        createUserWithEmailAndPassword(getAuth(), 'existing@example.com', 'password')
      ).rejects.toThrow('Email already in use');
    });

    it('should handle weak password error', async () => {
      const { createUserWithEmailAndPassword, getAuth } = await import('firebase/auth');
      
      const error = new Error('Password is too weak') as any;
      error.code = 'auth/weak-password';
      
      vi.mocked(createUserWithEmailAndPassword).mockRejectedValueOnce(error);
      
      await expect(
        createUserWithEmailAndPassword(getAuth(), 'test@example.com', '123')
      ).rejects.toThrow('Password is too weak');
    });
  });

  describe('signOut', () => {
    it('should successfully sign out', async () => {
      setupAuthMocks(true, createMockUser());
      
      const { signOut, getAuth } = await import('firebase/auth');
      const auth = getAuth();
      
      await signOut(auth);
      
      expect(signOut).toHaveBeenCalledWith(auth);
    });
  });

  describe('password reset', () => {
    it('should send password reset email', async () => {
      const { sendPasswordResetEmail, getAuth } = await import('firebase/auth');
      
      await sendPasswordResetEmail(getAuth(), 'test@example.com');
      
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com'
      );
    });

    it('should handle user not found error', async () => {
      const { sendPasswordResetEmail, getAuth } = await import('firebase/auth');
      
      const error = new Error('User not found') as any;
      error.code = 'auth/user-not-found';
      
      vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(error);
      
      await expect(
        sendPasswordResetEmail(getAuth(), 'nonexistent@example.com')
      ).rejects.toThrow('User not found');
    });
  });

  describe('auth state', () => {
    it('should track auth state changes', async () => {
      const { getAuth, onAuthStateChanged } = await import('firebase/auth');
      const auth = getAuth();
      
      const states: any[] = [];
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        states.push(user);
      });
      
      expect(typeof unsubscribe).toBe('function');
      expect(onAuthStateChanged).toHaveBeenCalled();
      
      // Should initially be null
      expect(states[0]).toBeNull();
      
      unsubscribe();
    });

    it('should get current user', async () => {
      const mockUser = createMockUser();
      setupAuthMocks(true, mockUser);
      
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      
      expect(auth.currentUser).toBeTruthy();
      expect(auth.currentUser?.email).toBe('test@example.com');
    });
  });

  describe('profile update', () => {
    it('should update user profile', async () => {
      const mockUser = createMockUser();
      setupAuthMocks(true, mockUser);
      
      const { updateProfile, getAuth } = await import('firebase/auth');
      const auth = getAuth();
      
      await updateProfile(auth.currentUser!, {
        displayName: 'New Name',
        photoURL: 'https://example.com/photo.jpg'
      });
      
      expect(updateProfile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          displayName: 'New Name',
          photoURL: 'https://example.com/photo.jpg'
        })
      );
    });
  });

  describe('email verification', () => {
    it('should send email verification', async () => {
      const mockUser = createMockUser({ emailVerified: false });
      setupAuthMocks(true, mockUser);
      
      const { sendEmailVerification, getAuth } = await import('firebase/auth');
      const auth = getAuth();
      
      await sendEmailVerification(auth.currentUser!);
      
      expect(sendEmailVerification).toHaveBeenCalledWith(auth.currentUser);
    });
  });
});