/**
 * Team types for multi-tenancy support
 */

import { Timestamp } from 'firebase/firestore';

export interface Team {
  id: string;
  name: string;
  type: 'personal' | 'shared';
  owner_id: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  settings?: TeamSettings;
}

export interface TeamSettings {
  default_language?: string;
  timezone?: string;
  features?: {
    [key: string]: boolean;
  };
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joined_at: Timestamp;
  invited_by?: string;
  status: 'active' | 'invited' | 'suspended';
}

export interface TeamInvite {
  id: string;
  team_id: string;
  email: string;
  role: TeamMember['role'];
  invited_by: string;
  invited_at: Timestamp;
  expires_at: Timestamp;
  status: 'pending' | 'accepted' | 'expired';
}

// Helper type for team context
export interface TeamContext {
  activeTeamId: string | null;
  activeTeam: Team | null;
  userRole: TeamMember['role'] | null;
  isLoading: boolean;
}