import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp,
  setDoc
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { UserProfile } from './types';

// 컬렉션 참조
const USER_PROFILES_COLLECTION = 'userProfiles';

// 사용자 프로필 생성/업데이트
export const createOrUpdateUserProfile = async (
  profileData: Partial<Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>>
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const profileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
    
    // 기존 프로필 확인
    const existingProfile = await getDoc(profileRef);
    
    const defaultProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || undefined,
      photoURL: user.photoURL || undefined,
      bio: '',
      company: '',
      website: '',
      location: '',
      teamNotifications: true,
      shareNotifications: true,
      emailNotifications: true,
      isPublicProfile: false,
      allowTeamInvitations: true,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp
    };

    if (existingProfile.exists()) {
      // 기존 프로필 업데이트
      const updateData = {
        ...profileData,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(profileRef, updateData);
    } else {
      // 새 프로필 생성
      const newProfile = {
        ...defaultProfile,
        ...profileData
      };
      
      await setDoc(profileRef, newProfile);
    }

    return { error: null };
  } catch (error) {
    console.error('사용자 프로필 생성/업데이트 에러:', error);
    return { error: '사용자 프로필 처리 중 오류가 발생했습니다.' };
  }
};

// 사용자 프로필 가져오기
export const getUserProfile = async (userId?: string): Promise<{ profile: UserProfile | null; error: string | null }> => {
  try {
    let targetUserId = userId;
    
    if (!targetUserId) {
      const user = await getCurrentUserAsync();
      if (!user) {
        return { profile: null, error: '로그인이 필요합니다.' };
      }
      targetUserId = user.uid;
    }

    const profileRef = doc(db, USER_PROFILES_COLLECTION, targetUserId);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      // 프로필이 없으면 자동으로 생성 (현재 사용자인 경우만)
      if (!userId) { // 현재 사용자 프로필 요청인 경우
        const { error: createError } = await createOrUpdateUserProfile({});
        if (createError) {
          return { profile: null, error: createError };
        }
        
        // 다시 가져오기
        const newProfileSnap = await getDoc(profileRef);
        if (newProfileSnap.exists()) {
          const profileData = newProfileSnap.data() as UserProfile;
          return { profile: profileData, error: null };
        }
      }
      
      return { profile: null, error: '사용자 프로필을 찾을 수 없습니다.' };
    }

    const profileData = profileSnap.data() as UserProfile;
    
    // 다른 사용자의 프로필을 요청한 경우 공개 설정 확인
    if (userId && userId !== (await getCurrentUserAsync())?.uid) {
      if (!profileData.isPublicProfile) {
        return { profile: null, error: '비공개 프로필입니다.' };
      }
    }

    return { profile: profileData, error: null };
  } catch (error) {
    console.error('사용자 프로필 가져오기 에러:', error);
    return { profile: null, error: '사용자 프로필을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 사용자 프로필 업데이트
export const updateUserProfile = async (
  updates: Partial<Omit<UserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>>
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const profileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
    
    // 프로필 존재 확인
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      // 프로필이 없으면 생성
      return await createOrUpdateUserProfile(updates);
    }

    const updateData = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    await updateDoc(profileRef, updateData);
    return { error: null };
  } catch (error) {
    console.error('사용자 프로필 업데이트 에러:', error);
    return { error: '사용자 프로필 업데이트 중 오류가 발생했습니다.' };
  }
};

// 사용자 검색 (이메일 또는 이름으로)
export const searchUsers = async (
  searchTerm: string,
  limit: number = 10
): Promise<{ users: UserProfile[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { users: [], error: '로그인이 필요합니다.' };
    }

    // 이메일로 검색
    const emailQuery = query(
      collection(db, USER_PROFILES_COLLECTION),
      where('email', '>=', searchTerm.toLowerCase()),
      where('email', '<=', searchTerm.toLowerCase() + '\uf8ff'),
      where('isPublicProfile', '==', true)
    );

    // 이름으로 검색 (displayName이 있는 경우)
    const nameQuery = query(
      collection(db, USER_PROFILES_COLLECTION),
      where('displayName', '>=', searchTerm),
      where('displayName', '<=', searchTerm + '\uf8ff'),
      where('isPublicProfile', '==', true)
    );

    const [emailResults, nameResults] = await Promise.all([
      getDocs(emailQuery),
      getDocs(nameQuery)
    ]);

    const foundUsers = new Map<string, UserProfile>();

    // 이메일 검색 결과 추가
    emailResults.forEach((doc) => {
      const userData = doc.data() as UserProfile;
      if (userData.uid !== user.uid) { // 자신은 제외
        foundUsers.set(userData.uid, userData);
      }
    });

    // 이름 검색 결과 추가 (중복 제거)
    nameResults.forEach((doc) => {
      const userData = doc.data() as UserProfile;
      if (userData.uid !== user.uid && !foundUsers.has(userData.uid)) {
        foundUsers.set(userData.uid, userData);
      }
    });

    const users = Array.from(foundUsers.values()).slice(0, limit);
    return { users, error: null };
  } catch (error) {
    console.error('사용자 검색 에러:', error);
    return { users: [], error: '사용자 검색 중 오류가 발생했습니다.' };
  }
};

// 이메일로 사용자 찾기 (정확한 매치)
export const findUserByEmail = async (email: string): Promise<{ user: UserProfile | null; error: string | null }> => {
  try {
    const currentUser = await getCurrentUserAsync();
    if (!currentUser) {
      return { user: null, error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, USER_PROFILES_COLLECTION),
      where('email', '==', email.toLowerCase())
    );

    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return { user: null, error: '사용자를 찾을 수 없습니다.' };
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data() as UserProfile;

    // 자신인 경우 또는 공개 프로필인 경우만 반환
    if (userData.uid === currentUser.uid || userData.isPublicProfile) {
      return { user: userData, error: null };
    }

    return { user: null, error: '해당 사용자의 프로필에 접근할 수 없습니다.' };
  } catch (error) {
    console.error('이메일로 사용자 찾기 에러:', error);
    return { user: null, error: '사용자 검색 중 오류가 발생했습니다.' };
  }
};

// 알림 설정 업데이트
export const updateNotificationSettings = async (settings: {
  teamNotifications?: boolean;
  shareNotifications?: boolean;
  emailNotifications?: boolean;
}): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const profileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
    
    const updateData = {
      ...settings,
      updatedAt: serverTimestamp()
    };

    await updateDoc(profileRef, updateData);
    return { error: null };
  } catch (error) {
    console.error('알림 설정 업데이트 에러:', error);
    return { error: '알림 설정 업데이트 중 오류가 발생했습니다.' };
  }
};

// 개인정보 설정 업데이트
export const updatePrivacySettings = async (settings: {
  isPublicProfile?: boolean;
  allowTeamInvitations?: boolean;
}): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const profileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
    
    const updateData = {
      ...settings,
      updatedAt: serverTimestamp()
    };

    await updateDoc(profileRef, updateData);
    return { error: null };
  } catch (error) {
    console.error('개인정보 설정 업데이트 에러:', error);
    return { error: '개인정보 설정 업데이트 중 오류가 발생했습니다.' };
  }
};

// 사용자 프로필 삭제 (계정 삭제 시)
export const deleteUserProfile = async (): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const profileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
    await deleteDoc(profileRef);
    
    return { error: null };
  } catch (error) {
    console.error('사용자 프로필 삭제 에러:', error);
    return { error: '사용자 프로필 삭제 중 오류가 발생했습니다.' };
  }
};

// 사용자 통계 가져오기
export const getUserStats = async (): Promise<{
  totalUsers: number;
  publicProfiles: number;
  error: string | null
}> => {
  try {
    // 전체 사용자 수
    const totalUsersSnapshot = await getDocs(collection(db, USER_PROFILES_COLLECTION));
    const totalUsers = totalUsersSnapshot.size;

    // 공개 프로필 수
    const publicProfilesQuery = query(
      collection(db, USER_PROFILES_COLLECTION),
      where('isPublicProfile', '==', true)
    );
    const publicProfilesSnapshot = await getDocs(publicProfilesQuery);
    const publicProfiles = publicProfilesSnapshot.size;

    return {
      totalUsers,
      publicProfiles,
      error: null
    };
  } catch (error) {
    console.error('사용자 통계 가져오기 에러:', error);
    return {
      totalUsers: 0,
      publicProfiles: 0,
      error: '사용자 통계를 가져오는 중 오류가 발생했습니다.'
    };
  }
};

// 로그인 기록 인터페이스
export interface LoginHistory {
  id: string;
  userId: string;
  timestamp: Timestamp;
  ipAddress?: string;
  userAgent: string;
  location?: string;
  device: string;
  browser: string;
  os: string;
  isCurrent?: boolean;
}

// 로그인 기록 저장
export const saveLoginHistory = async (): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // User Agent 파싱
    const ua = navigator.userAgent;
    const device = /Mobile|Android|iPhone|iPad/.test(ua) ? 'Mobile' : 'Desktop';

    let browser = 'Unknown';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';

    let os = 'Unknown';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    const loginData: Omit<LoginHistory, 'id'> = {
      userId: user.uid,
      timestamp: Timestamp.now(),
      userAgent: ua,
      device,
      browser,
      os,
      location: 'Seoul, South Korea' // 실제로는 IP 기반 위치 서비스 사용
    };

    const loginHistoryRef = collection(db, 'loginHistory');
    await setDoc(doc(loginHistoryRef), loginData);

    return { error: null };
  } catch (error) {
    console.error('로그인 기록 저장 에러:', error);
    return { error: '로그인 기록 저장 중 오류가 발생했습니다.' };
  }
};

// 로그인 기록 가져오기
export const getLoginHistory = async (limit: number = 10): Promise<{
  history: LoginHistory[];
  error: string | null
}> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { history: [], error: '로그인이 필요합니다.' };
    }

    const historyQuery = query(
      collection(db, 'loginHistory'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const querySnapshot = await getDocs(historyQuery);
    const history: LoginHistory[] = [];

    querySnapshot.forEach((doc, index) => {
      const data = doc.data();
      history.push({
        id: doc.id,
        ...data,
        isCurrent: index === 0 // 첫 번째가 현재 세션
      } as LoginHistory);
    });

    return { history: history.slice(0, limit), error: null };
  } catch (error) {
    console.error('로그인 기록 가져오기 에러:', error);
    return { history: [], error: '로그인 기록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// 사용량 통계 인터페이스
export interface UsageStats {
  projectCount: number;
  storageUsed: number; // bytes
  teamMemberCount: number;
  maxProjects: number;
  maxStorage: number; // bytes
  maxTeamMembers: number;
}

// 사용량 통계 가져오기
export const getUsageStats = async (): Promise<{
  stats: UsageStats | null;
  error: string | null;
}> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { stats: null, error: '로그인이 필요합니다.' };
    }

    // 프로젝트 수 계산
    const projectsQuery = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid)
    );
    const projectsSnapshot = await getDocs(projectsQuery);
    const projectCount = projectsSnapshot.size;

    // 저장 공간 계산 (썸네일 크기 합산)
    let storageUsed = 0;
    projectsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.thumbnail) {
        // Base64 썸네일 크기 계산 (대략적)
        storageUsed += data.thumbnail.length * 0.75; // Base64는 원본의 약 133%
      }
    });

    // 팀 멤버 수 계산
    const teamsQuery = query(
      collection(db, 'teams'),
      where('ownerId', '==', user.uid)
    );
    const teamsSnapshot = await getDocs(teamsQuery);
    let teamMemberCount = 1; // 본인 포함

    teamsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.members && Array.isArray(data.members)) {
        teamMemberCount = Math.max(teamMemberCount, data.members.length);
      }
    });

    // 무료 플랜 제한
    const stats: UsageStats = {
      projectCount,
      storageUsed,
      teamMemberCount,
      maxProjects: 5,
      maxStorage: 500 * 1024 * 1024, // 500MB
      maxTeamMembers: 1
    };

    return { stats, error: null };
  } catch (error) {
    console.error('사용량 통계 가져오기 에러:', error);
    return { stats: null, error: '사용량 통계를 가져오는 중 오류가 발생했습니다.' };
  }
};