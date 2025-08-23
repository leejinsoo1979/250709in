import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { wireFirebaseMocks } from '@/test/mocks/firebase';

// Setup Firebase mocks before imports
wireFirebaseMocks();

import { 
  doc, 
  getDoc, 
  setDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { FLAGS } from '@/flags';
import { 
  saveProject, 
  getProject
} from '@/services/projects.repo';
import {
  saveDesign,
  getDesign
} from '@/services/designs.repo';

// Mock missing functions
const getUserProjects = vi.fn();
const getUserDesigns = vi.fn();

describe('Migration Scenario Integration Tests', () => {
  const mockUserId = 'user_123';
  const mockTeamId = `personal_${mockUserId}`;
  const mockProjectId = 'project_456';
  const mockDesignId = 'design_789';

  const mockProjectData = {
    name: 'Legacy Project',
    description: 'Existing project from before migration',
    userId: mockUserId,
    createdAt: { seconds: 1234567000, nanoseconds: 0 },
    updatedAt: { seconds: 1234567890, nanoseconds: 0 }
  };

  const mockDesignData = {
    name: 'Legacy Design',
    projectId: mockProjectId,
    userId: mockUserId,
    state: { space: { width: 3000, height: 2400, depth: 600 } },
    createdAt: { seconds: 1234567000, nanoseconds: 0 },
    updatedAt: { seconds: 1234567890, nanoseconds: 0 }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Phase 1: Team Scope Disabled (Legacy Mode)', () => {
    beforeEach(() => {
      FLAGS.teamScope = false;
      FLAGS.dualWrite = false;
      FLAGS.newReadsFirst = false;
    });

    it('should read and write only to legacy paths', async () => {
      const mockDocRef = { id: mockProjectId };
      const mockDocSnap = {
        exists: () => true,
        data: () => mockProjectData
      };

      (doc as any).mockReturnValue(mockDocRef as any);
      (getDoc as any).mockResolvedValue(mockDocSnap as any);
      (setDoc as any).mockResolvedValue(undefined);

      // Read from legacy path
      const project = await getProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: mockProjectId
      });

      expect(doc).toHaveBeenCalledWith(undefined, 'projects', mockProjectId);
      expect(project).toEqual(mockProjectData);

      // Write to legacy path only
      await saveProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: mockProjectId,
        data: { ...mockProjectData, name: 'Updated Project' }
      });

      expect(setDoc).toHaveBeenCalledTimes(1);
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'Updated Project',
          userId: mockUserId
        }),
        { merge: true }
      );
    });

    it('should list user projects from legacy collection', async () => {
      const mockProjects = [
        { id: 'proj1', data: () => ({ ...mockProjectData, name: 'Project 1' }) },
        { id: 'proj2', data: () => ({ ...mockProjectData, name: 'Project 2' }) }
      ];

      (getDocs as any).mockResolvedValue({
        empty: false,
        docs: mockProjects
      } as any);

      const projects = await getUserProjects({
        teamId: mockTeamId,
        userId: mockUserId
      });

      expect(query).toHaveBeenCalled();
      expect(where).toHaveBeenCalledWith('userId', '==', mockUserId);
      expect(projects).toHaveLength(2);
    });
  });

  describe('Phase 2: Dual-Write Enabled', () => {
    beforeEach(() => {
      FLAGS.teamScope = false; // Still reading from legacy
      FLAGS.dualWrite = true;   // Writing to both
      FLAGS.newReadsFirst = false;
    });

    it('should write to both team and legacy paths', async () => {
      const teamDocRef = { id: mockProjectId, path: `teams/${mockTeamId}/projects/${mockProjectId}` };
      const legacyDocRef = { id: mockProjectId, path: `projects/${mockProjectId}` };

      (doc as any)
        .mockReturnValueOnce(teamDocRef as any)
        .mockReturnValueOnce(legacyDocRef as any);
      (setDoc as any).mockResolvedValue(undefined);

      await saveProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: mockProjectId,
        data: mockProjectData
      });

      // Verify dual writes
      expect(setDoc).toHaveBeenCalledTimes(2);
      
      // Team path write
      expect(setDoc).toHaveBeenNthCalledWith(1,
        teamDocRef,
        expect.objectContaining({
          ...mockProjectData,
          teamId: mockTeamId,
          userId: mockUserId
        }),
        { merge: true }
      );

      // Legacy path write
      expect(setDoc).toHaveBeenNthCalledWith(2,
        legacyDocRef,
        expect.objectContaining({
          ...mockProjectData,
          userId: mockUserId
        }),
        { merge: true }
      );
    });

    it('should still read from legacy path', async () => {
      const mockDocSnap = {
        exists: () => true,
        data: () => mockProjectData
      };

      (getDoc as any).mockResolvedValue(mockDocSnap as any);

      const project = await getProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: mockProjectId
      });

      // Should only read from legacy
      expect(doc).toHaveBeenCalledWith(undefined, 'projects', mockProjectId);
      expect(doc).not.toHaveBeenCalledWith(undefined, `teams/${mockTeamId}/projects`, mockProjectId);
      expect(project).toEqual(mockProjectData);
    });
  });

  describe('Phase 3: Team Scope with Fallback', () => {
    beforeEach(() => {
      FLAGS.teamScope = true;    // Read from team first
      FLAGS.dualWrite = true;     // Still writing to both
      FLAGS.newReadsFirst = true; // Try team path first
    });

    it('should read from team path first, fallback to legacy if not found', async () => {
      // Team path returns nothing
      const teamDocSnap = {
        exists: () => false,
        data: () => null
      };

      // Legacy path has data
      const legacyDocSnap = {
        exists: () => true,
        data: () => mockProjectData
      };

      (getDoc as any)
        .mockResolvedValueOnce(teamDocSnap as any)
        .mockResolvedValueOnce(legacyDocSnap as any);

      const project = await getProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: mockProjectId
      });

      // Should try team path first
      expect(getDoc).toHaveBeenCalledTimes(2);
      expect(project).toEqual(mockProjectData);
    });

    it('should return team data when available', async () => {
      const teamProjectData = {
        ...mockProjectData,
        teamId: mockTeamId,
        migratedAt: { seconds: 1234568000, nanoseconds: 0 }
      };

      const teamDocSnap = {
        exists: () => true,
        data: () => teamProjectData
      };

      (getDoc as any).mockResolvedValueOnce(teamDocSnap as any);

      const project = await getProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: mockProjectId
      });

      // Should not check legacy if team data exists
      expect(getDoc).toHaveBeenCalledTimes(1);
      expect(project).toEqual(teamProjectData);
    });

    it('should merge results when listing projects', async () => {
      // Team projects
      const teamProjects = [
        { id: 'new1', data: () => ({ name: 'New Project 1', teamId: mockTeamId }) }
      ];

      // Legacy projects
      const legacyProjects = [
        { id: 'old1', data: () => ({ name: 'Old Project 1', userId: mockUserId }) },
        { id: 'old2', data: () => ({ name: 'Old Project 2', userId: mockUserId }) }
      ];

      (getDocs as any)
        .mockResolvedValueOnce({ empty: false, docs: teamProjects } as any)
        .mockResolvedValueOnce({ empty: false, docs: legacyProjects } as any);

      const projects = await getUserProjects({
        teamId: mockTeamId,
        userId: mockUserId
      });

      // Should query both collections
      expect(getDocs).toHaveBeenCalledTimes(2);
      
      // Should merge and dedupe results
      expect(projects).toHaveLength(3);
      expect(projects.map(p => p.id)).toEqual(['new1', 'old1', 'old2']);
    });
  });

  describe('Phase 4: Full Migration Complete', () => {
    beforeEach(() => {
      FLAGS.teamScope = true;
      FLAGS.dualWrite = false;  // Stop writing to legacy
      FLAGS.newReadsFirst = true;
    });

    it('should only write to team path', async () => {
      const teamDocRef = { id: mockProjectId };
      (doc as any).mockReturnValue(teamDocRef as any);
      (setDoc as any).mockResolvedValue(undefined);

      await saveProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: mockProjectId,
        data: mockProjectData
      });

      // Should only write once (team path)
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect(doc).toHaveBeenCalledWith(
        undefined,
        `teams/${mockTeamId}/projects`,
        mockProjectId
      );
    });

    it('should still fallback to legacy for unmigrated data', async () => {
      // Simulate unmigrated legacy data
      (getDoc as any)
        .mockResolvedValueOnce({ exists: () => false } as any) // Team path empty
        .mockResolvedValueOnce({ 
          exists: () => true,
          data: () => mockDesignData
        } as any); // Legacy path has data

      const design = await getDesign({
        teamId: mockTeamId,
        userId: mockUserId,
        id: mockDesignId
      });

      expect(getDoc).toHaveBeenCalledTimes(2);
      expect(design).toEqual(mockDesignData);
    });
  });

  describe('Migration Validation', () => {
    it('should verify data integrity during migration', async () => {
      FLAGS.teamScope = true;
      FLAGS.dualWrite = true;
      FLAGS.newReadsFirst = true;

      const testData = {
        name: 'Test Project',
        settings: { theme: 'dark' },
        metadata: { version: 1 }
      };

      // Write with dual-write
      (setDoc as any).mockResolvedValue(undefined);
      
      await saveProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: 'test_project',
        data: testData
      });

      // Verify both writes have same data structure
      expect(setDoc).toHaveBeenCalledTimes(2);
      
      const [teamWrite, legacyWrite] = (setDoc as any).mock.calls;
      
      // Team write should have teamId
      expect(teamWrite[1]).toMatchObject({
        ...testData,
        teamId: mockTeamId,
        userId: mockUserId
      });

      // Legacy write should not have teamId
      expect(legacyWrite[1]).toMatchObject({
        ...testData,
        userId: mockUserId
      });
      expect(legacyWrite[1]).not.toHaveProperty('teamId');
    });

    it('should handle concurrent operations during migration', async () => {
      FLAGS.dualWrite = true;

      // Simulate concurrent saves
      const save1 = saveProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: 'proj1',
        data: { name: 'Project 1' }
      });

      const save2 = saveProject({
        teamId: mockTeamId,
        userId: mockUserId,
        id: 'proj2',
        data: { name: 'Project 2' }
      });

      (setDoc as any).mockResolvedValue(undefined);

      await Promise.all([save1, save2]);

      // Each save should trigger 2 writes (dual-write)
      expect(setDoc).toHaveBeenCalledTimes(4);
    });

    it('should track migration progress', async () => {
      // Simulate migration status check
      const checkMigrationStatus = async () => {
        const teamDocs = await getDocs(
          query(
            collection(undefined, `teams/${mockTeamId}/projects`),
            where('migratedAt', '!=', null)
          )
        );

        const legacyDocs = await getDocs(
          query(
            collection(undefined, 'projects'),
            where('userId', '==', mockUserId)
          )
        );

        return {
          migrated: teamDocs.size || 0,
          legacy: legacyDocs.size || 0,
          percentage: teamDocs.size / (teamDocs.size + legacyDocs.size) * 100
        };
      };

      (getDocs as any)
        .mockResolvedValueOnce({ size: 3 } as any) // 3 migrated
        .mockResolvedValueOnce({ size: 7 } as any); // 7 legacy

      const status = await checkMigrationStatus();

      expect(status).toEqual({
        migrated: 3,
        legacy: 7,
        percentage: 30
      });
    });
  });
});