import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from './config';

// 공유 링크 타입 정의
export type SharePermission = 'viewer' | 'editor';

export interface ShareLink {
  id: string;
  token: string;
  projectId: string;
  projectName: string;
  designFileId?: string; // 디자인파일 ID 추가
  designFileName?: string; // 디자인파일명 추가
  createdBy: string;
  createdByName: string;
  permission: SharePermission;
  expiresAt: Timestamp;
  password?: string;
  usageCount: number;
  maxUsage?: number;
  createdAt: Timestamp;
  isActive: boolean;
}

export interface ShareLinkAccess {
  linkId: string;
  userId: string;
  userName: string;
  userEmail: string;
  accessedAt: Timestamp;
  permission: SharePermission;
}

// 고유한 공유 토큰 생성 (8자리 영숫자)
function generateShareToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// 토큰 중복 확인
async function isTokenUnique(token: string): Promise<boolean> {
  const q = query(collection(db, 'shareLinks'), where('token', '==', token));
  const snapshot = await getDocs(q);
  return snapshot.empty;
}

// 고유한 토큰 생성 (중복 체크)
async function generateUniqueToken(): Promise<string> {
  let token = generateShareToken();
  let attempts = 0;
  const maxAttempts = 10;

  while (!(await isTokenUnique(token)) && attempts < maxAttempts) {
    token = generateShareToken();
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error('고유한 토큰을 생성할 수 없습니다.');
  }

  return token;
}

/**
 * 공유 링크 생성
 */
export async function createShareLink(
  projectId: string,
  projectName: string,
  userId: string,
  userName: string,
  permission: SharePermission,
  expiresInDays: number = 7,
  password?: string,
  maxUsage?: number,
  designFileId?: string,
  designFileName?: string
): Promise<ShareLink> {
  try {
    // 고유 토큰 생성
    const token = await generateUniqueToken();
    const linkId = doc(collection(db, 'shareLinks')).id;

    // 만료 날짜 계산
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    );

    const shareLink: ShareLink = {
      id: linkId,
      token,
      projectId,
      projectName,
      createdBy: userId,
      createdByName: userName,
      permission,
      expiresAt,
      usageCount: 0,
      createdAt: Timestamp.now(),
      isActive: true,
    };

    // password, maxUsage, designFileId, designFileName은 값이 있을 때만 추가
    if (password !== undefined) {
      shareLink.password = password;
    }
    if (maxUsage !== undefined) {
      shareLink.maxUsage = maxUsage;
    }
    if (designFileId !== undefined) {
      shareLink.designFileId = designFileId;
    }
    if (designFileName !== undefined) {
      shareLink.designFileName = designFileName;
    }

    // Firestore에 저장
    await setDoc(doc(db, 'shareLinks', linkId), shareLink);

    console.log('✅ 공유 링크 생성 완료:', token);
    return shareLink;
  } catch (error) {
    console.error('❌ 공유 링크 생성 실패:', error);
    throw error;
  }
}

/**
 * 토큰으로 공유 링크 조회
 */
export async function getShareLinkByToken(token: string): Promise<ShareLink | null> {
  try {
    const q = query(collection(db, 'shareLinks'), where('token', '==', token));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const linkData = snapshot.docs[0].data() as ShareLink;
    return linkData;
  } catch (error) {
    console.error('❌ 공유 링크 조회 실패:', error);
    throw error;
  }
}

/**
 * 공유 링크 유효성 검증
 */
export async function validateShareLink(
  token: string,
  password?: string
): Promise<{ valid: boolean; reason?: string; link?: ShareLink }> {
  try {
    const link = await getShareLinkByToken(token);

    if (!link) {
      return { valid: false, reason: '존재하지 않는 링크입니다.' };
    }

    if (!link.isActive) {
      return { valid: false, reason: '비활성화된 링크입니다.' };
    }

    // 만료 확인
    const now = Timestamp.now();
    if (link.expiresAt.toMillis() < now.toMillis()) {
      return { valid: false, reason: '만료된 링크입니다.' };
    }

    // 최대 사용 횟수 확인
    if (link.maxUsage && link.usageCount >= link.maxUsage) {
      return { valid: false, reason: '사용 가능 횟수를 초과했습니다.' };
    }

    // 비밀번호 확인
    if (link.password && link.password !== password) {
      return { valid: false, reason: '비밀번호가 일치하지 않습니다.' };
    }

    return { valid: true, link };
  } catch (error) {
    console.error('❌ 링크 검증 실패:', error);
    return { valid: false, reason: '링크 검증 중 오류가 발생했습니다.' };
  }
}

/**
 * 공유 링크를 통해 프로젝트 접근 권한 부여
 */
export async function grantProjectAccessViaLink(
  token: string,
  userId: string,
  userName: string,
  userEmail: string,
  password?: string,
  photoURL?: string // 프로필 사진 URL 추가
): Promise<{ success: boolean; message: string; projectId?: string; permission?: SharePermission }> {
  try {
    // 링크 검증
    const validation = await validateShareLink(token, password);
    if (!validation.valid || !validation.link) {
      return { success: false, message: validation.reason || '유효하지 않은 링크입니다.' };
    }

    const link = validation.link;

    // 이미 프로젝트 소유자인지 확인
    const projectDoc = await getDoc(doc(db, 'projects', link.projectId));
    if (!projectDoc.exists()) {
      return { success: false, message: '프로젝트를 찾을 수 없습니다.' };
    }

    const projectData = projectDoc.data();
    if (projectData.userId === userId) {
      return { success: false, message: '이미 소유하고 있는 프로젝트입니다.' };
    }

    // Transaction으로 권한 부여 및 사용 횟수 증가
    await runTransaction(db, async (transaction) => {
      // 공유 프로젝트 접근 권한 문서 생성/업데이트
      const accessDocRef = doc(db, 'sharedProjectAccess', `${link.projectId}_${userId}`);
      const accessData: any = {
        projectId: link.projectId,
        projectName: link.projectName,
        userId,
        userName,
        userEmail,
        sharedBy: link.createdBy,
        sharedByName: link.createdByName,
        permission: link.permission,
        sharedVia: 'link',
        linkToken: token,
        grantedAt: Timestamp.now(),
      };

      // 프로필 사진이 있으면 저장
      if (photoURL) {
        accessData.photoURL = photoURL;
      }

      transaction.set(accessDocRef, accessData);

      // 링크 사용 횟수 증가
      const linkDocRef = doc(db, 'shareLinks', link.id);
      transaction.update(linkDocRef, {
        usageCount: link.usageCount + 1,
      });

      // 접근 기록 저장
      const accessLogRef = doc(collection(db, 'shareLinkAccessLog'));
      transaction.set(accessLogRef, {
        linkId: link.id,
        userId,
        userName,
        userEmail,
        accessedAt: Timestamp.now(),
        permission: link.permission,
      });
    });

    console.log('✅ 프로젝트 접근 권한 부여 완료:', link.projectId);
    return {
      success: true,
      message: '프로젝트에 접근할 수 있습니다.',
      projectId: link.projectId,
      permission: link.permission,
    };
  } catch (error) {
    console.error('❌ 권한 부여 실패:', error);
    return { success: false, message: '권한 부여 중 오류가 발생했습니다.' };
  }
}

/**
 * 사용자가 생성한 공유 링크 목록 조회
 */
export async function getUserShareLinks(userId: string): Promise<ShareLink[]> {
  try {
    const q = query(
      collection(db, 'shareLinks'),
      where('createdBy', '==', userId),
      where('isActive', '==', true)
    );
    const snapshot = await getDocs(q);

    const links: ShareLink[] = [];
    snapshot.forEach((doc) => {
      links.push(doc.data() as ShareLink);
    });

    return links;
  } catch (error) {
    console.error('❌ 공유 링크 목록 조회 실패:', error);
    throw error;
  }
}

/**
 * 프로젝트의 공유 링크 목록 조회
 */
export async function getProjectShareLinks(projectId: string): Promise<ShareLink[]> {
  try {
    const q = query(
      collection(db, 'shareLinks'),
      where('projectId', '==', projectId),
      where('isActive', '==', true)
    );
    const snapshot = await getDocs(q);

    const links: ShareLink[] = [];
    snapshot.forEach((doc) => {
      links.push(doc.data() as ShareLink);
    });

    return links;
  } catch (error) {
    console.error('❌ 프로젝트 공유 링크 조회 실패:', error);
    throw error;
  }
}

/**
 * 공유 링크 비활성화
 */
export async function deactivateShareLink(linkId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'shareLinks', linkId), {
      isActive: false,
    });
    console.log('✅ 공유 링크 비활성화 완료:', linkId);
  } catch (error) {
    console.error('❌ 공유 링크 비활성화 실패:', error);
    throw error;
  }
}

/**
 * 공유 링크 삭제
 */
export async function deleteShareLink(linkId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'shareLinks', linkId));
    console.log('✅ 공유 링크 삭제 완료:', linkId);
  } catch (error) {
    console.error('❌ 공유 링크 삭제 실패:', error);
    throw error;
  }
}

/**
 * 공유 링크 접근 기록 조회
 */
export async function getShareLinkAccessLog(linkId: string): Promise<ShareLinkAccess[]> {
  try {
    const q = query(collection(db, 'shareLinkAccessLog'), where('linkId', '==', linkId));
    const snapshot = await getDocs(q);

    const accessLog: ShareLinkAccess[] = [];
    snapshot.forEach((doc) => {
      accessLog.push(doc.data() as ShareLinkAccess);
    });

    return accessLog;
  } catch (error) {
    console.error('❌ 접근 기록 조회 실패:', error);
    throw error;
  }
}

/**
 * 사용자의 프로젝트 접근 권한 확인
 */
export async function getUserProjectPermission(
  projectId: string,
  userId: string
): Promise<SharePermission | 'owner' | null> {
  try {
    // 프로젝트 소유자 확인
    const projectDoc = await getDoc(doc(db, 'projects', projectId));
    if (projectDoc.exists() && projectDoc.data().userId === userId) {
      return 'owner';
    }

    // 공유 프로젝트 접근 권한 확인
    const accessDoc = await getDoc(doc(db, 'sharedProjectAccess', `${projectId}_${userId}`));
    if (accessDoc.exists()) {
      return accessDoc.data().permission as SharePermission;
    }

    return null;
  } catch (error) {
    console.error('❌ 프로젝트 권한 확인 실패:', error);
    return null;
  }
}

/**
 * 공유받은 프로젝트 목록 조회
 */
export async function getSharedProjectsForUser(userId: string) {
  try {
    const q = query(collection(db, 'sharedProjectAccess'), where('userId', '==', userId));
    const snapshot = await getDocs(q);

    const sharedProjects: any[] = [];
    snapshot.forEach((doc) => {
      sharedProjects.push(doc.data());
    });

    return sharedProjects;
  } catch (error) {
    console.error('❌ 공유 프로젝트 목록 조회 실패:', error);
    throw error;
  }
}

/**
 * 프로젝트의 협업자 목록 조회 (프로젝트에 접근 권한이 있는 모든 사용자)
 */
export interface ProjectCollaborator {
  userId: string;
  userName: string;
  userEmail: string;
  permission: SharePermission;
  grantedAt: Timestamp;
  photoURL?: string; // 프로필 사진 URL
}

export async function getProjectCollaborators(projectId: string): Promise<ProjectCollaborator[]> {
  try {
    // projectId로 시작하는 모든 sharedProjectAccess 문서 조회
    const q = query(
      collection(db, 'sharedProjectAccess'),
      where('projectId', '==', projectId)
    );
    const snapshot = await getDocs(q);

    const collaborators: ProjectCollaborator[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      collaborators.push({
        userId: data.userId,
        userName: data.userName,
        userEmail: data.userEmail,
        permission: data.permission as SharePermission,
        grantedAt: data.grantedAt,
        photoURL: data.photoURL, // 프로필 사진이 저장되어 있으면 사용
      });
    });

    console.log('✅ 프로젝트 협업자 조회 완료:', projectId, collaborators.length, '명');
    return collaborators;
  } catch (error) {
    console.error('❌ 프로젝트 협업자 조회 실패:', error);
    return [];
  }
}

/**
 * 이메일로 직접 사용자 초대 (Firebase Auth 사용자 조회)
 */
export async function inviteUserByEmail(
  projectId: string,
  projectName: string,
  inviterUserId: string,
  inviterUserName: string,
  inviteeEmail: string,
  permission: SharePermission
): Promise<{ success: boolean; message: string; userId?: string }> {
  try {
    // 1. Firebase Auth에서 이메일로 사용자 조회 (Cloud Function 필요)
    // 현재는 Firestore의 users 컬렉션이나 sharedProjectAccess에서 이미 초대된 사용자만 찾을 수 있음
    // 실제로는 Firebase Admin SDK를 사용하는 Cloud Function이 필요함

    // 임시 방안: users 컬렉션에서 이메일로 검색 (있다면)
    const usersQuery = query(
      collection(db, 'users'),
      where('email', '==', inviteeEmail)
    );
    const usersSnapshot = await getDocs(usersQuery);

    if (usersSnapshot.empty) {
      return {
        success: false,
        message: '해당 이메일로 가입된 사용자를 찾을 수 없습니다. 먼저 회원가입이 필요합니다.'
      };
    }

    const userData = usersSnapshot.docs[0].data();
    const inviteeUserId = userData.uid || usersSnapshot.docs[0].id;
    const inviteeUserName = userData.displayName || userData.email?.split('@')[0] || '사용자';
    const inviteePhotoURL = userData.photoURL;

    // 2. 이미 초대되었는지 확인
    const accessDocRef = doc(db, 'sharedProjectAccess', `${projectId}_${inviteeUserId}`);
    const accessDoc = await getDoc(accessDocRef);

    if (accessDoc.exists()) {
      return {
        success: false,
        message: '이미 이 프로젝트에 초대된 사용자입니다.'
      };
    }

    // 3. 프로젝트 소유자인지 확인
    const projectDoc = await getDoc(doc(db, 'projects', projectId));
    if (!projectDoc.exists()) {
      return {
        success: false,
        message: '프로젝트를 찾을 수 없습니다.'
      };
    }

    const projectData = projectDoc.data();
    if (projectData.userId === inviteeUserId) {
      return {
        success: false,
        message: '프로젝트 소유자는 초대할 수 없습니다.'
      };
    }

    // 4. 권한 부여
    const accessData: any = {
      projectId,
      projectName,
      userId: inviteeUserId,
      userName: inviteeUserName,
      userEmail: inviteeEmail,
      sharedBy: inviterUserId,
      sharedByName: inviterUserName,
      permission,
      sharedVia: 'email',
      grantedAt: Timestamp.now(),
    };

    if (inviteePhotoURL) {
      accessData.photoURL = inviteePhotoURL;
    }

    await setDoc(accessDocRef, accessData);

    console.log('✅ 이메일로 사용자 초대 완료:', inviteeEmail);
    return {
      success: true,
      message: '초대가 완료되었습니다.',
      userId: inviteeUserId
    };
  } catch (error) {
    console.error('❌ 이메일 초대 실패:', error);
    return {
      success: false,
      message: '초대 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 이메일로 프로젝트 직접 초대 (회원가입된 사용자에게만)
 */
export async function shareProjectWithEmail(
  projectId: string,
  projectName: string,
  ownerUserId: string,
  ownerUserName: string,
  targetEmail: string,
  permission: SharePermission
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. 이메일로 사용자 찾기 (users 컬렉션에서 검색)
    const usersQuery = query(collection(db, 'users'), where('email', '==', targetEmail));
    const usersSnapshot = await getDocs(usersQuery);

    if (usersSnapshot.empty) {
      return {
        success: false,
        message: '해당 이메일로 가입된 사용자를 찾을 수 없습니다. 링크 공유를 사용하세요.',
      };
    }

    const targetUserDoc = usersSnapshot.docs[0];
    const targetUserData = targetUserDoc.data();
    const targetUserId = targetUserDoc.id;

    // 2. 본인에게 초대하는 경우 차단
    if (targetUserId === ownerUserId) {
      return {
        success: false,
        message: '자신에게는 초대할 수 없습니다.',
      };
    }

    // 3. 이미 소유자인지 확인
    const projectDoc = await getDoc(doc(db, 'projects', projectId));
    if (!projectDoc.exists()) {
      return { success: false, message: '프로젝트를 찾을 수 없습니다.' };
    }

    const projectData = projectDoc.data();
    if (projectData.userId === targetUserId) {
      return {
        success: false,
        message: '이미 프로젝트 소유자입니다.',
      };
    }

    // 4. 이미 협업자인지 확인
    const accessDocRef = doc(db, 'sharedProjectAccess', `${projectId}_${targetUserId}`);
    const existingAccess = await getDoc(accessDocRef);

    if (existingAccess.exists()) {
      // 이미 있으면 권한만 업데이트
      await updateDoc(accessDocRef, {
        permission,
        grantedAt: Timestamp.now(),
      });

      console.log('✅ 협업자 권한 업데이트 완료:', targetEmail, permission);
      return {
        success: true,
        message: `${targetEmail}님의 권한이 업데이트되었습니다.`,
      };
    }

    // 5. 새로운 협업자 추가
    await setDoc(accessDocRef, {
      projectId,
      projectName,
      userId: targetUserId,
      userName: targetUserData.displayName || targetUserData.email?.split('@')[0] || '사용자',
      userEmail: targetEmail,
      sharedBy: ownerUserId,
      sharedByName: ownerUserName,
      permission,
      sharedVia: 'email',
      grantedAt: Timestamp.now(),
      photoURL: targetUserData.photoURL || null,
    });

    // 6. 알림 생성 (notifications 컬렉션에 추가)
    const notificationRef = doc(collection(db, 'notifications'));
    await setDoc(notificationRef, {
      userId: targetUserId,
      type: 'project_shared',
      title: '프로젝트 초대',
      message: `${ownerUserName}님이 "${projectName}" 프로젝트에 초대했습니다.`,
      projectId,
      projectName,
      sharedBy: ownerUserId,
      sharedByName: ownerUserName,
      permission,
      read: false,
      createdAt: Timestamp.now(),
    });

    console.log('✅ 이메일 초대 완료:', targetEmail, permission);
    return {
      success: true,
      message: `${targetEmail}님을 프로젝트에 초대했습니다.`,
    };
  } catch (error) {
    console.error('❌ 이메일 초대 실패:', error);
    return {
      success: false,
      message: '초대 중 오류가 발생했습니다.',
    };
  }
}
