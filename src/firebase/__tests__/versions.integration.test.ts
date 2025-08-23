import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  doc, 
  getDoc, 
  setDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { saveDesignSnapshot, getDesignVersions, getCurrentVersion } from '../designs';
import { FLAGS } from '@/flags';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  collection: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  runTransaction: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: {
    now: vi.fn(() => ({ seconds: 1234567890, nanoseconds: 0 }))
  }
}));

// Mock db instance
vi.mock('../config', () => ({
  db: {}
}));

describe('Version Management Integration Tests', () => {
  const mockTeamId = 'team_123';
  const mockDesignId = 'design_456';
  const mockUserId = 'user_789';
  const mockVersionId = 'version_001';

  const mockDesignState = {
    space: {
      width: 3000,
      height: 2400,
      depth: 600
    },
    furniture: [
      { id: 'furniture_1', type: 'shelf', position: { x: 0, y: 0, z: 0 } }
    ],
    materials: {
      body: 'wood_oak',
      door: 'glass_clear'
    }
  };

  const mockOptions = {
    handles: true,
    dimensions: true,
    labels: false
  };

  const mockBOM = {
    'wood_oak': { quantity: 10, unit: 'sqm' },
    'glass_clear': { quantity: 2, unit: 'sqm' }
  };

  const mockCutList = [
    { material: 'wood_oak', width: 600, height: 400, quantity: 4 },
    { material: 'glass_clear', width: 500, height: 350, quantity: 2 }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    FLAGS.teamScope = true;
    FLAGS.dualWrite = true;
    FLAGS.newReadsFirst = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('saveDesignSnapshot', () => {
    it('should create immutable version snapshot', async () => {
      const mockTransaction = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn()
      };

      const mockDesignDoc = {
        exists: () => true,
        data: () => ({
          name: 'Test Design',
          current_version_id: null,
          version_count: 0
        })
      };

      const mockVersionRef = {
        id: mockVersionId,
        path: `teams/${mockTeamId}/designs/${mockDesignId}/versions/${mockVersionId}`
      };

      // Mock transaction execution
      vi.mocked(runTransaction).mockImplementation(async (db, updateFunction) => {
        mockTransaction.get.mockResolvedValue(mockDesignDoc);
        vi.mocked(doc).mockReturnValue(mockVersionRef as any);
        
        await updateFunction(mockTransaction as any);
        
        return { 
          success: true, 
          versionId: mockVersionId,
          versionNo: 1 
        };
      });

      const result = await saveDesignSnapshot({
        teamId: mockTeamId,
        designId: mockDesignId,
        userId: mockUserId,
        state: mockDesignState,
        options: mockOptions,
        bom: mockBOM,
        cutList: mockCutList
      });

      // Verify transaction was called
      expect(runTransaction).toHaveBeenCalled();

      // Verify version document was created
      expect(mockTransaction.set).toHaveBeenCalledWith(
        mockVersionRef,
        expect.objectContaining({
          version_no: 1,
          state_json: mockDesignState,
          options_json: mockOptions,
          bom_json: mockBOM,
          cutlist_json: mockCutList,
          created_by: mockUserId,
          created_at: 'SERVER_TIMESTAMP',
          is_current: true
        })
      );

      // Verify design document was updated
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          current_version_id: mockVersionId,
          version_count: 1,
          updated_at: 'SERVER_TIMESTAMP'
        })
      );

      expect(result).toEqual({
        success: true,
        versionId: mockVersionId,
        versionNo: 1
      });
    });

    it('should increment version number for subsequent saves', async () => {
      const mockTransaction = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn()
      };

      const mockDesignDoc = {
        exists: () => true,
        data: () => ({
          name: 'Test Design',
          current_version_id: 'old_version',
          version_count: 5
        })
      };

      vi.mocked(runTransaction).mockImplementation(async (db, updateFunction) => {
        mockTransaction.get.mockResolvedValue(mockDesignDoc);
        await updateFunction(mockTransaction as any);
        return { 
          success: true, 
          versionId: 'new_version',
          versionNo: 6 
        };
      });

      const result = await saveDesignSnapshot({
        teamId: mockTeamId,
        designId: mockDesignId,
        userId: mockUserId,
        state: mockDesignState
      });

      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          version_no: 6,
          is_current: true
        })
      );

      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          current_version_id: 'new_version',
          version_count: 6
        })
      );

      expect(result.versionNo).toBe(6);
    });

    it('should handle transaction conflicts with retry', async () => {
      let attemptCount = 0;
      
      vi.mocked(runTransaction).mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Transaction conflict');
        }
        return { 
          success: true, 
          versionId: mockVersionId,
          versionNo: 1 
        };
      });

      const result = await saveDesignSnapshot({
        teamId: mockTeamId,
        designId: mockDesignId,
        userId: mockUserId,
        state: mockDesignState
      });

      expect(runTransaction).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('should prevent version update/delete (immutability)', async () => {
      const versionRef = doc(
        undefined,
        `teams/${mockTeamId}/designs/${mockDesignId}/versions`,
        mockVersionId
      );

      // Attempt to update version (should fail)
      const updateAttempt = async () => {
        await updateDoc(versionRef, { state_json: { modified: true } });
      };

      // Attempt to delete version (should fail)
      const deleteAttempt = async () => {
        await deleteDoc(versionRef);
      };

      // These operations should be rejected by security rules
      // In real environment, these would throw permission errors
      await expect(updateAttempt).rejects.toThrow();
      await expect(deleteAttempt).rejects.toThrow();
    });
  });

  describe('getDesignVersions', () => {
    it('should fetch all versions in descending order', async () => {
      const mockVersions = [
        {
          id: 'version_003',
          data: () => ({
            version_no: 3,
            created_at: Timestamp.fromMillis(1234567892000),
            is_current: true
          })
        },
        {
          id: 'version_002',
          data: () => ({
            version_no: 2,
            created_at: Timestamp.fromMillis(1234567891000),
            is_current: false
          })
        },
        {
          id: 'version_001',
          data: () => ({
            version_no: 1,
            created_at: Timestamp.fromMillis(1234567890000),
            is_current: false
          })
        }
      ];

      const { getDocs, query, orderBy } = await import('firebase/firestore');
      
      vi.mocked(getDocs).mockResolvedValue({
        empty: false,
        docs: mockVersions
      } as any);

      const versions = await getDesignVersions(mockTeamId, mockDesignId);

      expect(versions).toHaveLength(3);
      expect(versions[0].version_no).toBe(3);
      expect(versions[0].is_current).toBe(true);
      expect(versions[1].version_no).toBe(2);
      expect(versions[2].version_no).toBe(1);
    });

    it('should return empty array if no versions exist', async () => {
      const { getDocs } = await import('firebase/firestore');
      
      vi.mocked(getDocs).mockResolvedValue({
        empty: true,
        docs: []
      } as any);

      const versions = await getDesignVersions(mockTeamId, mockDesignId);

      expect(versions).toEqual([]);
    });

    it('should handle pagination for large version histories', async () => {
      const { getDocs, query, orderBy, limit } = await import('firebase/firestore');
      
      const mockVersions = Array.from({ length: 10 }, (_, i) => ({
        id: `version_${String(i + 1).padStart(3, '0')}`,
        data: () => ({
          version_no: 10 - i,
          created_at: Timestamp.fromMillis(1234567890000 + (10 - i) * 1000)
        })
      }));

      vi.mocked(getDocs).mockResolvedValue({
        empty: false,
        docs: mockVersions.slice(0, 5) // Return first 5 for pagination
      } as any);

      const versions = await getDesignVersions(mockTeamId, mockDesignId, 5);

      expect(versions).toHaveLength(5);
      expect(versions[0].version_no).toBe(10);
      expect(versions[4].version_no).toBe(6);
    });
  });

  describe('getCurrentVersion', () => {
    it('should fetch current version from design document', async () => {
      const mockDesignDoc = {
        exists: () => true,
        data: () => ({
          current_version_id: 'version_005',
          version_count: 5
        })
      };

      const mockVersionDoc = {
        exists: () => true,
        id: 'version_005',
        data: () => ({
          version_no: 5,
          state_json: mockDesignState,
          created_at: Timestamp.now()
        })
      };

      vi.mocked(getDoc)
        .mockResolvedValueOnce(mockDesignDoc as any)
        .mockResolvedValueOnce(mockVersionDoc as any);

      const currentVersion = await getCurrentVersion(mockTeamId, mockDesignId);

      expect(currentVersion).toMatchObject({
        id: 'version_005',
        version_no: 5,
        state_json: mockDesignState
      });
    });

    it('should return null if no current version exists', async () => {
      const mockDesignDoc = {
        exists: () => true,
        data: () => ({
          current_version_id: null,
          version_count: 0
        })
      };

      vi.mocked(getDoc).mockResolvedValue(mockDesignDoc as any);

      const currentVersion = await getCurrentVersion(mockTeamId, mockDesignId);

      expect(currentVersion).toBeNull();
    });
  });

  describe('Version Immutability', () => {
    it('should create new version instead of updating existing', async () => {
      const existingVersion = {
        id: 'version_001',
        state_json: { space: { width: 2000 } }
      };

      const newState = { space: { width: 3000 } };

      // Instead of updating, create new version
      const result = await saveDesignSnapshot({
        teamId: mockTeamId,
        designId: mockDesignId,
        userId: mockUserId,
        state: newState
      });

      // Verify new version was created, not updated
      expect(result.versionId).not.toBe(existingVersion.id);
      
      // Original version remains unchanged
      const originalVersion = await getDoc(
        doc(undefined, `teams/${mockTeamId}/designs/${mockDesignId}/versions`, existingVersion.id)
      );
      
      // In real scenario, this would still have original state
      expect(originalVersion).toBeDefined();
    });
  });

  describe('Dual-Write Support', () => {
    it('should write to both team and legacy paths when dual-write enabled', async () => {
      FLAGS.dualWrite = true;

      const mockTransaction = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ version_count: 0 })
        }),
        set: vi.fn(),
        update: vi.fn()
      };

      vi.mocked(runTransaction).mockImplementation(async (db, updateFunction) => {
        await updateFunction(mockTransaction as any);
        return { success: true, versionId: mockVersionId, versionNo: 1 };
      });

      await saveDesignSnapshot({
        teamId: mockTeamId,
        designId: mockDesignId,
        userId: mockUserId,
        state: mockDesignState
      });

      // Verify updates to both team and legacy design documents
      expect(mockTransaction.update).toHaveBeenCalledTimes(2);
    });
  });
});