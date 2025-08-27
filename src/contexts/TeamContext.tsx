/**
 * Team context for managing team state throughout the application
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { Team, TeamMember } from '@/firebase/types';
import { getUserTeams } from '@/firebase/teams';
import { getCurrentUserAsync } from '@/firebase/auth';
import { FLAGS } from '@/flags';

interface TeamContextValue {
  activeTeam: Team | null;
  userTeams: Team[];
  userRole: TeamMember['role'] | null;
  isLoading: boolean;
  switchTeam: (teamId: string) => Promise<void>;
  refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [userRole, setUserRole] = useState<TeamMember['role'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Load teams when user changes
  useEffect(() => {
    loadUserTeams();
  }, [currentUser]);

  // Listen to auth state changes
  useEffect(() => {
    getCurrentUserAsync().then(user => {
      setCurrentUser(user);
    });
  }, []);

  const loadUserTeams = async () => {
    if (!FLAGS.teamScope) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const user = await getCurrentUserAsync();
      
      if (!user) {
        setUserTeams([]);
        setActiveTeam(null);
        setUserRole(null);
        return;
      }

      const { teams, error } = await getUserTeams();
      
      if (error) {
        console.error('Failed to load teams:', error);
        return;
      }

      setUserTeams(teams);

      // Set the first team as active if no team is selected
      if (teams.length > 0 && !activeTeam) {
        const personalTeam = teams.find(t => t.id === `personal_${user.uid}`);
        const teamToActivate = personalTeam || teams[0];
        
        setActiveTeam(teamToActivate);
        
        // Find user's role in the active team
        const member = teamToActivate.members.find(m => m.userId === user.uid);
        setUserRole(member?.role || null);
        
        // Store active team ID in localStorage
        localStorage.setItem('activeTeamId', teamToActivate.id);
      }
    } catch (error) {
      console.error('Error loading teams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const switchTeam = async (teamId: string) => {
    const team = userTeams.find(t => t.id === teamId);
    if (team) {
      setActiveTeam(team);
      
      const user = await getCurrentUserAsync();
      if (user) {
        const member = team.members.find(m => m.userId === user.uid);
        setUserRole(member?.role || null);
      }
      
      // Store in localStorage
      localStorage.setItem('activeTeamId', teamId);
    }
  };

  const refreshTeams = async () => {
    await loadUserTeams();
  };

  const value: TeamContextValue = {
    activeTeam,
    userTeams,
    userRole,
    isLoading,
    switchTeam,
    refreshTeams
  };

  return (
    <TeamContext.Provider value={value}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
}

// Helper hook for checking permissions
export function useTeamPermission(requiredRole: TeamMember['role'][] = ['owner', 'admin']) {
  const { userRole } = useTeam();
  
  if (!userRole) return false;
  
  return requiredRole.includes(userRole);
}