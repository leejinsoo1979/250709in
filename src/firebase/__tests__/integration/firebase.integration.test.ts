import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  resetFirebaseMocks, 
  createMockUser, 
  createMockProject,
  setupAuthMocks,
  setupFirestoreMocks,
  waitForAsync
} from '../testHelpers';

describe('Firebase Integration Tests', () => {
  beforeEach(() => {
    resetFirebaseMocks();
  });

  describe('Authentication Flow', () => {
    it('should handle complete login flow', async () => {
      const mockUser = createMockUser({ email: 'user@example.com' });
      setupAuthMocks(true, mockUser);
      
      const { signInWithEmailAndPassword, getAuth } = await import('firebase/auth');
      
      const result = await signInWithEmailAndPassword(
        getAuth(), 
        'user@example.com', 
        'password'
      );
      
      expect(result.user.email).toBe('user@example.com');
      expect(result.user.uid).toBe('test-uid');
      
      const auth = getAuth();
      expect(auth.currentUser).toBeTruthy();
      expect(auth.currentUser?.email).toBe('user@example.com');
    });

    it('should handle logout flow', async () => {
      setupAuthMocks(true, createMockUser());
      
      const { signOut, getAuth } = await import('firebase/auth');
      const auth = getAuth();
      
      expect(auth.currentUser).toBeTruthy();
      
      await signOut(auth);
      expect(signOut).toHaveBeenCalled();
    });

    it('should handle auth state changes', async () => {
      const { getAuth, onAuthStateChanged } = await import('firebase/auth');
      const auth = getAuth();
      
      const stateChanges: any[] = [];
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        stateChanges.push(user);
      });
      
      await waitForAsync();
      
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toBeNull();
      
      unsubscribe();
    });
  });

  describe('Firestore Operations', () => {
    it('should handle project CRUD operations', async () => {
      const mockProjects = [
        createMockProject({ id: 'proj1', name: 'Project 1' }),
        createMockProject({ id: 'proj2', name: 'Project 2' })
      ];
      
      setupFirestoreMocks(mockProjects);
      
      const { 
        getDocs, 
        getDoc, 
        addDoc, 
        updateDoc, 
        deleteDoc,
        collection,
        doc,
        getFirestore 
      } = await import('firebase/firestore');
      
      // Test getDocs
      const db = getFirestore();
      const snapshot = await getDocs(collection(db, 'projects'));
      expect(snapshot.size).toBe(2);
      expect(snapshot.docs[0].data().name).toBe('Project 1');
      
      // Test getDoc
      const docSnap = await getDoc(doc(db, 'projects', 'proj1'));
      expect(docSnap.exists()).toBe(true);
      expect(docSnap.data()?.name).toBe('Project 1');
      
      // Test addDoc
      const newProject = createMockProject({ name: 'New Project' });
      const docRef = await addDoc(collection(db, 'projects'), newProject);
      expect(docRef.id).toBe('test-id');
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'New Project' })
      );
      
      // Test updateDoc
      await updateDoc(doc(db, 'projects', 'proj1'), { name: 'Updated' });
      expect(updateDoc).toHaveBeenCalled();
      
      // Test deleteDoc
      await deleteDoc(doc(db, 'projects', 'proj1'));
      expect(deleteDoc).toHaveBeenCalled();
    });

    it('should handle real-time updates', async () => {
      const mockProjects = [createMockProject()];
      setupFirestoreMocks(mockProjects);
      
      const { onSnapshot, query, collection, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const updates: any[] = [];
      const unsubscribe = onSnapshot(
        query(collection(db, 'projects')),
        (snapshot) => {
          updates.push(snapshot.docs.map(d => d.data()));
        }
      );
      
      await waitForAsync();
      
      expect(updates).toHaveLength(1);
      expect(updates[0]).toHaveLength(1);
      expect(updates[0][0].name).toBe('Test Project');
      
      unsubscribe();
      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Storage Operations', () => {
    it('should handle file upload and download', async () => {
      const { 
        getStorage, 
        ref, 
        uploadBytes, 
        getDownloadURL 
      } = await import('firebase/storage');
      
      const storage = getStorage();
      const storageRef = ref(storage, 'files/test.pdf');
      
      // Test upload
      const file = new Blob(['test content'], { type: 'application/pdf' });
      const uploadResult = await uploadBytes(storageRef, file);
      
      expect(uploadBytes).toHaveBeenCalled();
      expect(uploadResult.ref.getDownloadURL).toBeDefined();
      
      // Test download URL
      const url = await getDownloadURL(storageRef);
      expect(url).toBe('https://example.com/file.pdf');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      const { signInWithEmailAndPassword, getAuth } = await import('firebase/auth');
      
      vi.mocked(signInWithEmailAndPassword).mockRejectedValueOnce(
        new Error('auth/invalid-email')
      );
      
      await expect(
        signInWithEmailAndPassword(getAuth(), 'invalid', 'password')
      ).rejects.toThrow('auth/invalid-email');
    });

    it('should handle Firestore errors', async () => {
      const { getDoc, doc, getFirestore } = await import('firebase/firestore');
      
      vi.mocked(getDoc).mockRejectedValueOnce(
        new Error('permission-denied')
      );
      
      const db = getFirestore();
      await expect(
        getDoc(doc(db, 'projects', 'invalid'))
      ).rejects.toThrow('permission-denied');
    });
  });

  describe('Cross-Service Integration', () => {
    it('should coordinate auth and Firestore', async () => {
      const mockUser = createMockUser({ uid: 'user123' });
      setupAuthMocks(true, mockUser);
      
      const mockProjects = [
        createMockProject({ userId: 'user123', name: 'User Project' })
      ];
      setupFirestoreMocks(mockProjects);
      
      const { getAuth } = await import('firebase/auth');
      const { getDocs, collection, query, where, getFirestore } = await import('firebase/firestore');
      
      const auth = getAuth();
      const userId = auth.currentUser?.uid;
      expect(userId).toBe('user123');
      
      const db = getFirestore();
      const q = query(
        collection(db, 'projects'),
        where('userId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      expect(snapshot.size).toBe(1);
      expect(snapshot.docs[0].data().userId).toBe('user123');
    });
  });
});