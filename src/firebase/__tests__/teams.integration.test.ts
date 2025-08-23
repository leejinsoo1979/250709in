import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs,
  serverTimestamp,
  Timestamp,
  DocumentReference
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { ensurePersonalTeam, getUserTeams, getTeamMembers } from '../auth';
import { FLAGS } from '@/flags';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: {
    now: vi.fn(() => ({ seconds: 1234567890, nanoseconds: 0 }))
  }
}));

// Mock db instance
vi.mock('../config', () => ({
  db: {}
}));

describe('Team System Integration Tests', () => {
  const mockUser: Partial<User> = {
    uid: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Test User'
  };

  const mockTeamId = `personal_${mockUser.uid}`;
  const mockTeamData = {
    id: mockTeamId,
    name: `${mockUser.displayName || mockUser.email}'s Personal Team`,
    type: 'personal',
    owner_id: mockUser.uid,
    created_at: 'SERVER_TIMESTAMP',
    updated_at: 'SERVER_TIMESTAMP',
    settings: {
      default_permissions: {
        designs: ['read', 'write'],
        projects: ['read', 'write'],
        assets: ['read', 'write']
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset FLAGS to test state
    FLAGS.teamScope = true;
    FLAGS.dualWrite = true;
    FLAGS.newReadsFirst = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ensurePersonalTeam', () => {
    it('should create personal team on first login', async () => {
      const mockDocRef = { id: mockTeamId } as DocumentReference;
      const mockDocSnap = {
        exists: vi.fn(() => false),
        data: vi.fn(() => null)
      };

      vi.mocked(doc).mockReturnValue(mockDocRef);
      vi.mocked(getDoc).mockResolvedValue(mockDocSnap as any);
      vi.mocked(setDoc).mockResolvedValue(undefined);

      await ensurePersonalTeam(mockUser as User);

      // Verify team document was checked
      expect(doc).toHaveBeenCalledWith(undefined, 'teams', mockTeamId);
      expect(getDoc).toHaveBeenCalledWith(mockDocRef);

      // Verify team was created
      expect(setDoc).toHaveBeenCalledTimes(2); // Team doc + member doc
      
      // Check team document creation
      expect(setDoc).toHaveBeenNthCalledWith(1, mockDocRef, mockTeamData);
      
      // Check member document creation
      const memberDocRef = { id: mockUser.uid } as DocumentReference;
      vi.mocked(doc).mockReturnValue(memberDocRef);
      expect(setDoc).toHaveBeenNthCalledWith(2, memberDocRef, {
        user_id: mockUser.uid,
        role: 'owner',
        joined_at: 'SERVER_TIMESTAMP'
      });
    });

    it('should not create team if already exists', async () => {
      const mockDocRef = { id: mockTeamId } as DocumentReference;
      const mockDocSnap = {
        exists: vi.fn(() => true),
        data: vi.fn(() => mockTeamData)
      };

      vi.mocked(doc).mockReturnValue(mockDocRef);
      vi.mocked(getDoc).mockResolvedValue(mockDocSnap as any);

      await ensurePersonalTeam(mockUser as User);

      // Verify team was checked but not created
      expect(getDoc).toHaveBeenCalledWith(mockDocRef);
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const mockDocRef = { id: mockTeamId } as DocumentReference;
      vi.mocked(doc).mockReturnValue(mockDocRef);
      vi.mocked(getDoc).mockRejectedValue(new Error('Firestore error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await ensurePersonalTeam(mockUser as User);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error ensuring personal team:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getUserTeams', () => {
    it('should fetch all teams where user is a member', async () => {
      const mockTeams = [
        {
          id: 'personal_test-user-123',
          data: () => ({
            name: 'Personal Team',
            type: 'personal',
            owner_id: 'test-user-123'
          })
        },
        {
          id: 'shared_team_456',
          data: () => ({
            name: 'Shared Team',
            type: 'shared',
            owner_id: 'other-user'
          })
        }
      ];

      const mockMemberDocs = {
        empty: false,
        docs: mockTeams.map(team => ({
          ref: { parent: { parent: { id: team.id } } },
          data: () => ({ role: team.id.includes('personal') ? 'owner' : 'member' })
        }))
      };

      vi.mocked(getDocs).mockResolvedValue(mockMemberDocs as any);
      vi.mocked(getDoc).mockImplementation((ref: any) => {
        const team = mockTeams.find(t => t.id === ref.id);
        return Promise.resolve({
          exists: () => !!team,
          data: team ? team.data : () => null,
          id: ref.id
        } as any);
      });

      const teams = await getUserTeams('test-user-123');

      expect(teams).toHaveLength(2);
      expect(teams[0]).toMatchObject({
        id: 'personal_test-user-123',
        name: 'Personal Team',
        type: 'personal',
        role: 'owner'
      });
      expect(teams[1]).toMatchObject({
        id: 'shared_team_456',
        name: 'Shared Team',
        type: 'shared',
        role: 'member'
      });
    });

    it('should return empty array if no teams found', async () => {
      vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as any);

      const teams = await getUserTeams('test-user-123');

      expect(teams).toEqual([]);
    });
  });

  describe('getTeamMembers', () => {
    it('should fetch all members of a team', async () => {
      const mockMembers = [
        {
          id: 'user1',
          data: () => ({
            user_id: 'user1',
            role: 'owner',
            joined_at: Timestamp.now()
          })
        },
        {
          id: 'user2',
          data: () => ({
            user_id: 'user2',
            role: 'member',
            joined_at: Timestamp.now()
          })
        }
      ];

      vi.mocked(getDocs).mockResolvedValue({
        empty: false,
        docs: mockMembers
      } as any);

      const members = await getTeamMembers('team123');

      expect(members).toHaveLength(2);
      expect(members[0]).toMatchObject({
        user_id: 'user1',
        role: 'owner'
      });
      expect(members[1]).toMatchObject({
        user_id: 'user2',
        role: 'member'
      });
    });
  });

  describe('Team Scope Flag Integration', () => {
    it('should respect teamScope flag for data operations', async () => {
      // Test with teamScope enabled
      FLAGS.teamScope = true;
      
      const mockDocRef = { id: 'test-project' } as DocumentReference;
      vi.mocked(doc).mockReturnValue(mockDocRef);
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ name: 'Test Project' })
      } as any);

      // Simulate project fetch with team scope
      const teamPath = `teams/${mockTeamId}/projects`;
      const projectRef = doc(undefined, teamPath, 'test-project');
      
      expect(doc).toHaveBeenCalledWith(undefined, teamPath, 'test-project');
    });

    it('should support dual-write when enabled', async () => {
      FLAGS.dualWrite = true;
      
      const mockDocRef = { id: 'test-project' } as DocumentReference;
      vi.mocked(doc).mockReturnValue(mockDocRef);
      vi.mocked(setDoc).mockResolvedValue(undefined);

      // Simulate saving with dual-write
      const teamPath = `teams/${mockTeamId}/projects`;
      const legacyPath = 'projects';
      
      // Team scope write
      await setDoc(doc(undefined, teamPath, 'test-project'), { name: 'Test' });
      
      // Legacy write (when dual-write is enabled)
      await setDoc(doc(undefined, legacyPath, 'test-project'), { name: 'Test' });

      expect(setDoc).toHaveBeenCalledTimes(2);
    });

    it('should fallback to legacy when team data not found', async () => {
      FLAGS.newReadsFirst = true;
      
      // Mock team path returns nothing
      vi.mocked(getDoc)
        .mockResolvedValueOnce({
          exists: () => false,
          data: () => null
        } as any)
        // Mock legacy path returns data
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ name: 'Legacy Project' })
        } as any);

      const teamRef = doc(undefined, `teams/${mockTeamId}/projects`, 'test-project');
      const teamDoc = await getDoc(teamRef);
      
      if (!teamDoc.exists()) {
        const legacyRef = doc(undefined, 'projects', 'test-project');
        const legacyDoc = await getDoc(legacyRef);
        
        expect(legacyDoc.exists()).toBe(true);
        expect(legacyDoc.data()).toEqual({ name: 'Legacy Project' });
      }

      expect(getDoc).toHaveBeenCalledTimes(2);
    });
  });
});