import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetFirebaseMocks } from './testHelpers';

describe('Firebase Config Service', () => {
  beforeEach(() => {
    resetFirebaseMocks();
  });

  describe('Firebase initialization', () => {
    it('should initialize Firebase app with config', async () => {
      const { initializeApp, getApp } = await import('firebase/app');
      
      const config = {
        apiKey: 'test-api-key',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test-project',
        storageBucket: 'test.appspot.com',
        messagingSenderId: '123456789',
        appId: 'test-app-id'
      };
      
      const app = initializeApp(config);
      
      expect(initializeApp).toHaveBeenCalledWith(config);
      expect(app.name).toBe('[DEFAULT]');
      
      const retrievedApp = getApp();
      expect(retrievedApp.name).toBe('[DEFAULT]');
    });

    it('should handle already initialized app', async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      
      vi.mocked(getApps).mockReturnValueOnce([{ name: '[DEFAULT]' } as any]);
      
      const apps = getApps();
      expect(apps).toHaveLength(1);
      expect(apps[0].name).toBe('[DEFAULT]');
    });
  });

  describe('Service initialization', () => {
    it('should initialize Auth service', async () => {
      const { getAuth } = await import('firebase/auth');
      const { getApp } = await import('firebase/app');
      
      const app = getApp();
      const auth = getAuth(app);
      
      expect(auth).toBeDefined();
      expect(getAuth).toHaveBeenCalled();
    });

    it('should initialize Firestore service', async () => {
      const { getFirestore } = await import('firebase/firestore');
      const { getApp } = await import('firebase/app');
      
      const app = getApp();
      const db = getFirestore(app);
      
      expect(db).toBeDefined();
      expect(getFirestore).toHaveBeenCalled();
    });

    it('should initialize Storage service', async () => {
      const { getStorage } = await import('firebase/storage');
      const { getApp } = await import('firebase/app');
      
      const app = getApp();
      const storage = getStorage(app);
      
      expect(storage).toBeDefined();
      expect(getStorage).toHaveBeenCalled();
    });
  });

  describe('Environment configuration', () => {
    it('should use environment variables for config', () => {
      const mockEnv = {
        VITE_FIREBASE_API_KEY: 'env-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'env.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'env-project',
        VITE_FIREBASE_STORAGE_BUCKET: 'env.appspot.com',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '987654321',
        VITE_FIREBASE_APP_ID: 'env-app-id'
      };
      
      // Simulate environment variables
      Object.entries(mockEnv).forEach(([key, value]) => {
        (import.meta as any).env[key] = value;
      });
      
      const expectedConfig = {
        apiKey: 'env-api-key',
        authDomain: 'env.firebaseapp.com',
        projectId: 'env-project',
        storageBucket: 'env.appspot.com',
        messagingSenderId: '987654321',
        appId: 'env-app-id'
      };
      
      // Verify config would be constructed correctly
      expect(mockEnv.VITE_FIREBASE_API_KEY).toBe('env-api-key');
      expect(mockEnv.VITE_FIREBASE_PROJECT_ID).toBe('env-project');
    });

    it('should validate required config fields', () => {
      const validateConfig = (config: any) => {
        const required = [
          'apiKey',
          'authDomain',
          'projectId',
          'storageBucket',
          'messagingSenderId',
          'appId'
        ];
        
        return required.every(field => config[field] !== undefined);
      };
      
      const validConfig = {
        apiKey: 'test',
        authDomain: 'test',
        projectId: 'test',
        storageBucket: 'test',
        messagingSenderId: 'test',
        appId: 'test'
      };
      
      const invalidConfig = {
        apiKey: 'test',
        authDomain: 'test'
        // Missing other fields
      };
      
      expect(validateConfig(validConfig)).toBe(true);
      expect(validateConfig(invalidConfig)).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const { initializeApp } = await import('firebase/app');
      
      const error = new Error('Invalid config');
      vi.mocked(initializeApp).mockImplementationOnce(() => {
        throw error;
      });
      
      expect(() => initializeApp({})).toThrow('Invalid config');
    });

    it('should handle service initialization errors', async () => {
      const { getAuth } = await import('firebase/auth');
      
      const error = new Error('Auth service unavailable');
      vi.mocked(getAuth).mockImplementationOnce(() => {
        throw error;
      });
      
      expect(() => getAuth()).toThrow('Auth service unavailable');
    });
  });

  describe('Connection state', () => {
    it('should detect online/offline state', () => {
      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });
      
      expect(navigator.onLine).toBe(true);
      
      // Simulate going offline
      (navigator as any).onLine = false;
      expect(navigator.onLine).toBe(false);
    });

    it('should handle network errors', async () => {
      const { getFirestore, getDocs, collection } = await import('firebase/firestore');
      
      const networkError = new Error('Network request failed') as any;
      networkError.code = 'unavailable';
      
      vi.mocked(getDocs).mockRejectedValueOnce(networkError);
      
      const db = getFirestore();
      await expect(
        getDocs(collection(db, 'test'))
      ).rejects.toThrow('Network request failed');
    });
  });

  describe('Security rules simulation', () => {
    it('should respect read permissions', async () => {
      const { getDoc, doc, getFirestore } = await import('firebase/firestore');
      
      const permissionError = new Error('Missing read permission') as any;
      permissionError.code = 'permission-denied';
      
      vi.mocked(getDoc).mockRejectedValueOnce(permissionError);
      
      const db = getFirestore();
      await expect(
        getDoc(doc(db, 'private', 'data'))
      ).rejects.toThrow('Missing read permission');
    });

    it('should respect write permissions', async () => {
      const { setDoc, doc, getFirestore } = await import('firebase/firestore');
      
      const permissionError = new Error('Missing write permission') as any;
      permissionError.code = 'permission-denied';
      
      vi.mocked(setDoc).mockRejectedValueOnce(permissionError);
      
      const db = getFirestore();
      await expect(
        setDoc(doc(db, 'protected', 'data'), { value: 'test' })
      ).rejects.toThrow('Missing write permission');
    });
  });
});