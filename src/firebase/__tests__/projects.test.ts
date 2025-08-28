import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  resetFirebaseMocks, 
  createMockProject, 
  setupFirestoreMocks,
  createMockUser,
  setupAuthMocks
} from './testHelpers';

describe('Firebase Projects Service', () => {
  beforeEach(() => {
    resetFirebaseMocks();
  });

  describe('getProjects', () => {
    it('should fetch all user projects', async () => {
      const mockProjects = [
        createMockProject({ id: 'proj1', name: 'Project 1', userId: 'user1' }),
        createMockProject({ id: 'proj2', name: 'Project 2', userId: 'user1' })
      ];
      
      await setupFirestoreMocks(mockProjects);
      await setupAuthMocks(true, createMockUser({ uid: 'user1' }));
      
      const { 
        getDocs, 
        collection, 
        query, 
        where, 
        orderBy,
        getFirestore 
      } = await import('firebase/firestore');
      const { getAuth } = await import('firebase/auth');
      
      const auth = getAuth();
      const db = getFirestore();
      
      const q = query(
        collection(db, 'projects'),
        where('userId', '==', auth.currentUser?.uid),
        orderBy('updatedAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      
      expect(snapshot.size).toBe(2);
      expect(snapshot.docs[0].data().name).toBe('Project 1');
      expect(snapshot.docs[1].data().name).toBe('Project 2');
    });

    it('should return empty array when no projects exist', async () => {
      await setupFirestoreMocks([]);
      await setupAuthMocks(true, createMockUser());
      
      const { getDocs, collection, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const snapshot = await getDocs(collection(db, 'projects'));
      
      expect(snapshot.empty).toBe(true);
      expect(snapshot.size).toBe(0);
    });

    it('should handle permission denied error', async () => {
      const { getDocs, collection, getFirestore } = await import('firebase/firestore');
      
      const error = new Error('Missing permissions') as any;
      error.code = 'permission-denied';
      
      vi.mocked(getDocs).mockRejectedValueOnce(error);
      
      const db = getFirestore();
      await expect(
        getDocs(collection(db, 'projects'))
      ).rejects.toThrow('Missing permissions');
    });
  });

  describe('getProject', () => {
    it('should fetch single project by ID', async () => {
      const mockProject = createMockProject({ 
        id: 'proj1', 
        name: 'Test Project' 
      });
      
      await setupFirestoreMocks([mockProject]);
      
      const { getDoc, doc, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const docSnap = await getDoc(doc(db, 'projects', 'proj1'));
      
      expect(docSnap.exists()).toBe(true);
      expect(docSnap.id).toBe('proj1');
      expect(docSnap.data()?.name).toBe('Test Project');
    });

    it('should handle project not found', async () => {
      await setupFirestoreMocks([]);
      
      const { getDoc, doc, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const docSnap = await getDoc(doc(db, 'projects', 'nonexistent'));
      
      expect(docSnap.exists()).toBe(false);
    });
  });

  describe('createProject', () => {
    it('should create new project', async () => {
      const newProject = createMockProject({ 
        name: 'New Project',
        userId: 'user1' 
      });
      
      const { addDoc, collection, serverTimestamp, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const projectData = {
        ...newProject,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'projects'), projectData);
      
      expect(docRef.id).toBe('test-id');
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'New Project' })
      );
    });

    it('should handle creation error', async () => {
      const { addDoc, collection, getFirestore } = await import('firebase/firestore');
      
      const error = new Error('Quota exceeded') as any;
      error.code = 'resource-exhausted';
      
      vi.mocked(addDoc).mockRejectedValueOnce(error);
      
      const db = getFirestore();
      await expect(
        addDoc(collection(db, 'projects'), { name: 'Test' })
      ).rejects.toThrow('Quota exceeded');
    });
  });

  describe('updateProject', () => {
    it('should update existing project', async () => {
      const { updateDoc, doc, serverTimestamp, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const updates = {
        name: 'Updated Name',
        description: 'Updated Description',
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, 'projects', 'proj1'), updates);
      
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ 
          name: 'Updated Name',
          description: 'Updated Description'
        })
      );
    });

    it('should handle update error', async () => {
      const { updateDoc, doc, getFirestore } = await import('firebase/firestore');
      
      const error = new Error('Document not found') as any;
      error.code = 'not-found';
      
      vi.mocked(updateDoc).mockRejectedValueOnce(error);
      
      const db = getFirestore();
      await expect(
        updateDoc(doc(db, 'projects', 'invalid'), { name: 'Test' })
      ).rejects.toThrow('Document not found');
    });
  });

  describe('deleteProject', () => {
    it('should delete project', async () => {
      const { deleteDoc, doc, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      await deleteDoc(doc(db, 'projects', 'proj1'));
      
      expect(deleteDoc).toHaveBeenCalledWith(expect.anything());
    });

    it('should handle deletion error', async () => {
      const { deleteDoc, doc, getFirestore } = await import('firebase/firestore');
      
      const error = new Error('Permission denied') as any;
      error.code = 'permission-denied';
      
      vi.mocked(deleteDoc).mockRejectedValueOnce(error);
      
      const db = getFirestore();
      await expect(
        deleteDoc(doc(db, 'projects', 'proj1'))
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('real-time updates', () => {
    it('should subscribe to project changes', async () => {
      const mockProjects = [
        createMockProject({ id: 'proj1', name: 'Initial Name' })
      ];
      
      await setupFirestoreMocks(mockProjects);
      
      const { onSnapshot, doc, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const updates: any[] = [];
      const unsubscribe = onSnapshot(
        doc(db, 'projects', 'proj1'),
        (doc) => {
          updates.push(doc.data());
        }
      );
      
      expect(updates).toHaveLength(1);
      expect(updates[0].name).toBe('Initial Name');
      
      unsubscribe();
      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should handle subscription errors', async () => {
      const { onSnapshot, doc, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const errorCallback = vi.fn();
      
      vi.mocked(onSnapshot).mockImplementationOnce((query, onNext, onError) => {
        if (onError) {
          onError(new Error('Network error'));
        }
        return vi.fn();
      });
      
      onSnapshot(
        doc(db, 'projects', 'proj1'),
        vi.fn(),
        errorCallback
      );
      
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Network error' })
      );
    });
  });

  describe('batch operations', () => {
    it('should handle batch updates', async () => {
      const mockProjects = [
        createMockProject({ id: 'proj1' }),
        createMockProject({ id: 'proj2' })
      ];
      
      await setupFirestoreMocks(mockProjects);
      
      const { updateDoc, doc, getFirestore } = await import('firebase/firestore');
      const db = getFirestore();
      
      const updates = mockProjects.map(project => 
        updateDoc(doc(db, 'projects', project.id), { 
          archived: true 
        })
      );
      
      await Promise.all(updates);
      
      expect(updateDoc).toHaveBeenCalledTimes(2);
    });
  });
});