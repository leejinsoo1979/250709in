import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { ProjectShare, TeamInvitation, Team } from './types';

// 실시간 공유 프로젝트 리스너
export const subscribeToSharedProjects = async (
  callback: (shares: ProjectShare[]) => void
): Promise<Unsubscribe | null> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return null;
    }

    const q = query(
      collection(db, 'projectShares'),
      where('sharedWith', '==', user.email),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const shares: ProjectShare[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        shares.push({
          id: doc.id,
          ...data,
        } as ProjectShare);
      });
      callback(shares);
    }, (error) => {
      // 인덱스 에러인 경우 특별 처리
      if (error.message.includes('index')) {
        console.info('📌 공유 프로젝트 기능을 위한 Firestore 인덱스가 필요합니다.');
        console.info('Firebase Console에서 다음 인덱스를 생성해주세요:');
        console.info('Collection: projectShares');
        console.info('Fields: isActive (Ascending), sharedWith (Ascending), createdAt (Descending)');
      } else {
        console.error('공유 프로젝트 실시간 업데이트 에러:', error);
      }
      // 에러가 있어도 빈 배열로 계속 진행
      callback([]);
    });

    return unsubscribe;
  } catch (error) {
    console.error('공유 프로젝트 리스너 초기화 에러:', error);
    return null;
  }
};

// 실시간 팀 초대 리스너
export const subscribeToTeamInvitations = async (
  callback: (invitations: TeamInvitation[]) => void
): Promise<Unsubscribe | null> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return null;
    }

    const q = query(
      collection(db, 'teamInvitations'),
      where('inviteeEmail', '==', user.email),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
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
      callback(invitations);
    }, (error) => {
      // 인덱스 에러인 경우 특별 처리
      if (error.message.includes('index')) {
        console.info('📌 팀 초대 기능을 위한 Firestore 인덱스가 필요합니다.');
        console.info('Firebase Console에서 다음 인덱스를 생성해주세요:');
        console.info('Collection: teamInvitations');
        console.info('Fields: inviteeEmail (Ascending), status (Ascending), createdAt (Descending)');
      } else {
        console.error('팀 초대 실시간 업데이트 에러:', error);
      }
      // 에러가 있어도 빈 배열로 계속 진행
      callback([]);
    });

    return unsubscribe;
  } catch (error) {
    console.error('팀 초대 리스너 초기화 에러:', error);
    return null;
  }
}

// 실시간 팀 목록 리스너
export const subscribeToUserTeams = (
  callback: (teams: Team[]) => void
): Promise<Unsubscribe | null> => {
  return new Promise(async (resolve) => {
    try {
      const user = await getCurrentUserAsync();
      if (!user) {
        resolve(null);
        return;
      }

      // 사용자가 속한 팀들을 실시간으로 감시
      // Firebase의 array-contains-any는 실시간 리스너에서 제한이 있으므로
      // 전체 팀을 가져와서 클라이언트 측에서 필터링
      const q = query(
        collection(db, 'teams'),
        orderBy('updatedAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const teams: Team[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const team = {
            id: doc.id,
            ...data,
          } as Team;
          
          // 사용자가 해당 팀의 멤버인지 확인
          const isMember = team.members.some(member => member.userId === user.uid);
          if (isMember) {
            teams.push(team);
          }
        });
        callback(teams);
      }, (error) => {
        console.error('팀 목록 실시간 업데이트 에러:', error);
        callback([]);
      });

      resolve(unsubscribe);
    } catch (error) {
      console.error('팀 목록 리스너 초기화 에러:', error);
      resolve(null);
    }
  });
};

// 특정 팀의 실시간 업데이트 리스너
export const subscribeToTeam = (
  teamId: string,
  callback: (team: Team | null) => void
): Promise<Unsubscribe | null> => {
  return new Promise(async (resolve) => {
    try {
      const user = await getCurrentUserAsync();
      if (!user) {
        resolve(null);
        return;
      }

      const teamRef = doc(db, 'teams', teamId);
      
      const unsubscribe = onSnapshot(teamRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const team: Team = {
            id: doc.id,
            ...data,
          } as Team;
          
          // 사용자가 팀 멤버인지 확인
          const isMember = team.members.some(member => member.userId === user.uid);
          if (isMember) {
            callback(team);
          } else {
            callback(null);
          }
        } else {
          callback(null);
        }
      }, (error) => {
        console.error('팀 실시간 업데이트 에러:', error);
        callback(null);
      });

      resolve(unsubscribe);
    } catch (error) {
      console.error('팀 리스너 초기화 에러:', error);
      resolve(null);
    }
  });
};

// 실시간 알림 카운터 (초대 + 공유 알림)
export const subscribeToNotificationCount = (
  callback: (count: number) => void
): Promise<Unsubscribe[]> => {
  return new Promise(async (resolve) => {
    try {
      const user = await getCurrentUserAsync();
      if (!user) {
        resolve([]);
        return;
      }

      let invitationCount = 0;
      let shareCount = 0;
      const unsubscribes: Unsubscribe[] = [];

      // 팀 초대 알림 리스너
      const invitationUnsubscribe = await subscribeToTeamInvitations((invitations) => {
        invitationCount = invitations.length;
        callback(invitationCount + shareCount);
      });

      if (invitationUnsubscribe) {
        unsubscribes.push(invitationUnsubscribe);
      }

      // 공유 프로젝트 알림 리스너 (새로 받은 공유만)
      const shareUnsubscribe = await subscribeToSharedProjects((shares) => {
        // 최근 24시간 내 공유된 프로젝트만 알림으로 카운트
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        shareCount = shares.filter(share => 
          share.createdAt.toDate() > yesterday
        ).length;
        
        callback(invitationCount + shareCount);
      });

      if (shareUnsubscribe) {
        unsubscribes.push(shareUnsubscribe);
      }

      resolve(unsubscribes);
    } catch (error) {
      console.error('알림 카운터 리스너 초기화 에러:', error);
      resolve([]);
    }
  });
};

// 모든 리스너 해제를 위한 유틸리티 함수
export const unsubscribeAll = (unsubscribes: (Unsubscribe | null)[]) => {
  unsubscribes.forEach(unsubscribe => {
    if (unsubscribe) {
      unsubscribe();
    }
  });
};