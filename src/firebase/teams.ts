import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp,
  setDoc,
  arrayUnion,
  arrayRemove,
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { Team, TeamMember, TeamInvitation, TeamSettings } from './types';
import { handleFirebaseError, createBusinessError } from './utils/error-handler';

// 컬렉션 참조
const TEAMS_COLLECTION = 'teams';
const TEAM_INVITATIONS_COLLECTION = 'teamInvitations';

// 새 팀 생성 (트랜잭션 사용)
export const createTeam = async (
  name: string, 
  description?: string,
  settings?: Partial<TeamSettings>
): Promise<{ teamId: string | null; error: string | null }> => {
  try {
    console.log('🔑 Firebase 팀 생성 시작:', { name, description });
    
    const user = await getCurrentUserAsync();
    if (!user) {
      throw createBusinessError('auth/unauthenticated', '로그인이 필요합니다.');
    }

    // 팀 이름 검증
    if (!name.trim() || name.length < 2) {
      throw createBusinessError('team/invalid-name', '팀 이름은 2글자 이상이어야 합니다.');
    }

    if (name.length > 50) {
      throw createBusinessError('team/invalid-name', '팀 이름은 50글자를 초과할 수 없습니다.');
    }
    
    console.log('✅ 사용자 인증 성공:', { uid: user.uid, email: user.email });

    const result = await runTransaction(db, async (transaction) => {
      // 1. 사용자의 팀 수 제한 확인 (예: 최대 10개)
      const userTeamsQuery = query(
        collection(db, TEAMS_COLLECTION),
        where('ownerId', '==', user.uid)
      );
      const userTeamsSnapshot = await getDocs(userTeamsQuery);
      
      if (userTeamsSnapshot.size >= 10) {
        throw createBusinessError('team/limit-exceeded', '최대 10개의 팀만 생성할 수 있습니다.');
      }

      // 2. 팀 생성
      const defaultSettings: TeamSettings = {
        isPublic: false,
        allowInvitations: true,
        defaultRole: 'viewer',
        maxMembers: 50,
        ...settings
      };

      const ownerMember: TeamMember = {
        userId: user.uid,
        email: user.email || '',
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: 'owner',
        joinedAt: Timestamp.fromDate(new Date()),
        status: 'active'
      };

      const teamRef = doc(collection(db, TEAMS_COLLECTION));
      const newTeam: Omit<Team, 'id'> = {
        name: name.trim(),
        description: description?.trim(),
        ownerId: user.uid,
        members: [ownerMember],
        settings: defaultSettings,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };

      transaction.set(teamRef, newTeam);

      // 3. 활동 로그 생성
      const activityRef = doc(collection(db, 'activityLogs'));
      transaction.set(activityRef, {
        userId: user.uid,
        resourceType: 'team',
        resourceId: teamRef.id,
        action: 'create',
        metadata: { teamName: name.trim() },
        timestamp: serverTimestamp()
      });

      return teamRef.id;
    });

    console.log('✅ 팀 생성 완료:', { teamId: result });
    return { teamId: result, error: null };
    
  } catch (error) {
    console.error('❌ 팀 생성 에러:', error);
    const appError = handleFirebaseError(error);
    return { teamId: null, error: appError.userMessage };
  }
};

// 팀 목록 가져오기 (사용자가 속한 팀들)
export const getUserTeams = async (): Promise<{ teams: Team[]; error: string | null }> => {
  try {
    console.log('🔍 사용자 팀 목록 조회 시작...');
    
    const user = await getCurrentUserAsync();
    if (!user) {
      console.error('❌ 사용자 인증 실패');
      return { teams: [], error: '로그인이 필요합니다.' };
    }
    
    console.log('✅ 사용자 인증 성공:', { uid: user.uid, email: user.email });

    // members 배열에 객체가 들어있으므로 모든 팀을 가져와서 필터링
    const querySnapshot = await getDocs(collection(db, TEAMS_COLLECTION));
    const teams: Team[] = [];

    console.log(`📄 총 ${querySnapshot.size}개의 팀 문서 발견`);

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log('🔍 팀 문서 확인:', { id: doc.id, name: data.name, membersCount: data.members?.length });
      
      // 사용자가 해당 팀의 멤버인지 확인
      const isMember = data.members?.some((member: TeamMember) => member.userId === user.uid);
      console.log(`👤 멤버 확인 (${data.name}):`, { isMember, userId: user.uid });
      
      if (isMember) {
        console.log('✅ 사용자가 속한 팀 발견:', data.name);
        teams.push({
          id: doc.id,
          ...data,
        } as Team);
      }
    });

    console.log(`📊 사용자가 속한 팀 개수: ${teams.length}`);

    // 업데이트 시간순으로 정렬
    teams.sort((a, b) => {
      const aTime = a.updatedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || 0;
      return bTime - aTime;
    });

    return { teams, error: null };
  } catch (error) {
    console.error('팀 목록 가져오기 에러:', error);
    return { teams: [], error: '팀 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 팀 정보 가져오기
export const getTeam = async (teamId: string): Promise<{ team: Team | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { team: null, error: '로그인이 필요합니다.' };
    }

    const docRef = doc(db, TEAMS_COLLECTION, teamId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return { team: null, error: '팀을 찾을 수 없습니다.' };
    }

    const data = docSnap.data();
    const team: Team = {
      id: docSnap.id,
      ...data,
    } as Team;

    // 사용자가 팀 멤버인지 확인
    const isMember = team.members.some(member => member.userId === user.uid);
    if (!isMember) {
      return { team: null, error: '팀에 접근할 권한이 없습니다.' };
    }

    return { team, error: null };
  } catch (error) {
    console.error('팀 정보 가져오기 에러:', error);
    return { team: null, error: '팀 정보를 가져오는 중 오류가 발생했습니다.' };
  }
};

// 팀 멤버 초대
export const inviteTeamMember = async (
  teamId: string,
  inviteeEmail: string,
  role: 'admin' | 'editor' | 'viewer'
): Promise<{ invitationId: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { invitationId: null, error: '로그인이 필요합니다.' };
    }

    // 팀 정보 확인
    const { team, error: teamError } = await getTeam(teamId);
    if (teamError || !team) {
      return { invitationId: null, error: teamError || '팀을 찾을 수 없습니다.' };
    }

    // 초대 권한 확인
    const currentMember = team.members.find(member => member.userId === user.uid);
    if (!currentMember || (currentMember.role !== 'owner' && currentMember.role !== 'admin')) {
      return { invitationId: null, error: '팀 멤버를 초대할 권한이 없습니다.' };
    }

    // 이미 팀 멤버인지 확인
    const isAlreadyMember = team.members.some(member => member.email === inviteeEmail);
    if (isAlreadyMember) {
      return { invitationId: null, error: '이미 팀 멤버입니다.' };
    }

    // 보류 중인 초대가 있는지 확인
    const existingInvitationQuery = query(
      collection(db, TEAM_INVITATIONS_COLLECTION),
      where('teamId', '==', teamId),
      where('inviteeEmail', '==', inviteeEmail),
      where('status', '==', 'pending')
    );
    const existingInvitations = await getDocs(existingInvitationQuery);
    if (!existingInvitations.empty) {
      return { invitationId: null, error: '이미 보류 중인 초대가 있습니다.' };
    }

    // 초대 토큰 생성
    const token = generateInvitationToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7일 후 만료

    const invitation: Omit<TeamInvitation, 'id'> = {
      teamId,
      teamName: team.name,
      inviterUserId: user.uid,
      inviterEmail: user.email || '',
      inviterDisplayName: user.displayName,
      inviteeEmail,
      role,
      status: 'pending',
      createdAt: serverTimestamp() as Timestamp,
      expiresAt: Timestamp.fromDate(expiresAt),
      token
    };

    const docRef = await addDoc(collection(db, TEAM_INVITATIONS_COLLECTION), invitation);
    return { invitationId: docRef.id, error: null };
  } catch (error) {
    console.error('팀 멤버 초대 에러:', error);
    return { invitationId: null, error: '팀 멤버 초대 중 오류가 발생했습니다.' };
  }
};

// 팀 초대 수락
export const acceptTeamInvitation = async (
  invitationId: string,
  token: string
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // 초대 정보 확인
    const invitationRef = doc(db, TEAM_INVITATIONS_COLLECTION, invitationId);
    const invitationSnap = await getDoc(invitationRef);

    if (!invitationSnap.exists()) {
      return { error: '초대를 찾을 수 없습니다.' };
    }

    const invitation = invitationSnap.data() as TeamInvitation;

    // 토큰 확인
    if (invitation.token !== token) {
      return { error: '유효하지 않은 초대입니다.' };
    }

    // 만료 확인
    if (invitation.expiresAt.toDate() < new Date()) {
      return { error: '만료된 초대입니다.' };
    }

    // 이메일 확인
    if (invitation.inviteeEmail !== user.email) {
      return { error: '초대받은 이메일과 로그인한 계정이 다릅니다.' };
    }

    // 초대 상태 확인
    if (invitation.status !== 'pending') {
      return { error: '이미 처리된 초대입니다.' };
    }

    // 팀에 멤버 추가
    const teamRef = doc(db, TEAMS_COLLECTION, invitation.teamId);
    const newMember: TeamMember = {
      userId: user.uid,
      email: user.email || '',
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: invitation.role,
      joinedAt: Timestamp.fromDate(new Date()),
      status: 'active',
      invitedBy: invitation.inviterUserId
    };

    await updateDoc(teamRef, {
      members: arrayUnion(newMember),
      updatedAt: serverTimestamp()
    });

    // 초대 상태 업데이트
    await updateDoc(invitationRef, {
      status: 'accepted'
    });

    return { error: null };
  } catch (error) {
    console.error('팀 초대 수락 에러:', error);
    return { error: '팀 초대 수락 중 오류가 발생했습니다.' };
  }
};

// 팀 멤버 제거
export const removeTeamMember = async (
  teamId: string,
  memberUserId: string
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // 팀 정보 확인
    const { team, error: teamError } = await getTeam(teamId);
    if (teamError || !team) {
      return { error: teamError || '팀을 찾을 수 없습니다.' };
    }

    // 권한 확인 (팀 소유자 또는 관리자, 또는 본인)
    const currentMember = team.members.find(member => member.userId === user.uid);
    const targetMember = team.members.find(member => member.userId === memberUserId);

    if (!currentMember || !targetMember) {
      return { error: '멤버를 찾을 수 없습니다.' };
    }

    // 팀 소유자는 제거할 수 없음
    if (targetMember.role === 'owner') {
      return { error: '팀 소유자는 제거할 수 없습니다.' };
    }

    // 권한 확인
    const canRemove = 
      currentMember.role === 'owner' ||
      currentMember.role === 'admin' ||
      currentMember.userId === memberUserId; // 본인 탈퇴

    if (!canRemove) {
      return { error: '멤버를 제거할 권한이 없습니다.' };
    }

    // 팀에서 멤버 제거
    const teamRef = doc(db, TEAMS_COLLECTION, teamId);
    await updateDoc(teamRef, {
      members: arrayRemove(targetMember),
      updatedAt: serverTimestamp()
    });

    return { error: null };
  } catch (error) {
    console.error('팀 멤버 제거 에러:', error);
    return { error: '팀 멤버 제거 중 오류가 발생했습니다.' };
  }
};

// 팀 업데이트
export const updateTeam = async (
  teamId: string,
  updates: {
    name?: string;
    description?: string;
    settings?: Partial<TeamSettings>;
  }
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // 팀 정보 확인
    const { team, error: teamError } = await getTeam(teamId);
    if (teamError || !team) {
      return { error: teamError || '팀을 찾을 수 없습니다.' };
    }

    // 권한 확인 (팀 소유자 또는 관리자)
    const currentMember = team.members.find(member => member.userId === user.uid);
    if (!currentMember || (currentMember.role !== 'owner' && currentMember.role !== 'admin')) {
      return { error: '팀을 수정할 권한이 없습니다.' };
    }

    const updateData: any = {
      updatedAt: serverTimestamp()
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.settings) {
      updateData.settings = { ...team.settings, ...updates.settings };
    }

    const teamRef = doc(db, TEAMS_COLLECTION, teamId);
    await updateDoc(teamRef, updateData);

    return { error: null };
  } catch (error) {
    console.error('팀 업데이트 에러:', error);
    return { error: '팀 업데이트 중 오류가 발생했습니다.' };
  }
};

// 팀 삭제
export const deleteTeam = async (teamId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // 팀 정보 확인
    const { team, error: teamError } = await getTeam(teamId);
    if (teamError || !team) {
      return { error: teamError || '팀을 찾을 수 없습니다.' };
    }

    // 팀 소유자만 삭제 가능
    if (team.ownerId !== user.uid) {
      return { error: '팀을 삭제할 권한이 없습니다.' };
    }

    // 관련된 초대들 삭제
    const invitationsQuery = query(
      collection(db, TEAM_INVITATIONS_COLLECTION),
      where('teamId', '==', teamId)
    );
    const invitationsSnapshot = await getDocs(invitationsQuery);
    
    const deleteInvitationPromises = invitationsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deleteInvitationPromises);

    // 팀 삭제
    const teamRef = doc(db, TEAMS_COLLECTION, teamId);
    await deleteDoc(teamRef);

    return { error: null };
  } catch (error) {
    console.error('팀 삭제 에러:', error);
    return { error: '팀 삭제 중 오류가 발생했습니다.' };
  }
};

// 사용자의 팀 초대 목록 가져오기
export const getUserTeamInvitations = async (): Promise<{ invitations: TeamInvitation[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { invitations: [], error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, TEAM_INVITATIONS_COLLECTION),
      where('inviteeEmail', '==', user.email),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const invitations: TeamInvitation[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // 만료되지 않은 초대만 포함
      if (data.expiresAt.toDate() > new Date()) {
        invitations.push({
          id: doc.id,
          ...data,
        } as TeamInvitation);
      }
    });

    return { invitations, error: null };
  } catch (error) {
    console.error('팀 초대 목록 가져오기 에러:', error);
    return { invitations: [], error: '팀 초대 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 팀 초대 거절
export const declineTeamInvitation = async (
  invitationId: string,
  token: string
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // 초대 정보 확인
    const invitationRef = doc(db, TEAM_INVITATIONS_COLLECTION, invitationId);
    const invitationSnap = await getDoc(invitationRef);

    if (!invitationSnap.exists()) {
      return { error: '초대를 찾을 수 없습니다.' };
    }

    const invitation = invitationSnap.data() as TeamInvitation;

    // 토큰 확인
    if (invitation.token !== token) {
      return { error: '유효하지 않은 초대입니다.' };
    }

    // 이메일 확인
    if (invitation.inviteeEmail !== user.email) {
      return { error: '초대받은 이메일과 로그인한 계정이 다릅니다.' };
    }

    // 초대 상태 확인
    if (invitation.status !== 'pending') {
      return { error: '이미 처리된 초대입니다.' };
    }

    // 초대 상태를 거절로 업데이트
    await updateDoc(invitationRef, {
      status: 'declined'
    });

    return { error: null };
  } catch (error) {
    console.error('팀 초대 거절 에러:', error);
    return { error: '팀 초대 거절 중 오류가 발생했습니다.' };
  }
};

// 초대 토큰 생성 유틸리티
function generateInvitationToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}