import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';

// 알림 타입 정의
export type NotificationType = 'project_shared' | 'project_access_granted' | 'team_invitation' | 'share_removed' | 'system';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  projectId?: string;
  projectName?: string;
  sharedBy?: string;
  sharedByName?: string;
  permission?: 'viewer' | 'editor';
  actionUrl?: string;
  isRead: boolean;
  createdAt: Timestamp;
}

/**
 * 알림 생성
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  options?: {
    projectId?: string;
    projectName?: string;
    sharedBy?: string;
    sharedByName?: string;
    permission?: 'viewer' | 'editor';
    actionUrl?: string;
  }
): Promise<void> {
  try {
    const notificationId = doc(collection(db, 'notifications')).id;

    const notification: Notification = {
      id: notificationId,
      userId,
      type,
      title,
      message,
      projectId: options?.projectId,
      projectName: options?.projectName,
      sharedBy: options?.sharedBy,
      sharedByName: options?.sharedByName,
      permission: options?.permission,
      actionUrl: options?.actionUrl,
      isRead: false,
      createdAt: Timestamp.now(),
    };

    await setDoc(doc(db, 'notifications', notificationId), notification);
    console.log('✅ 알림 생성 완료:', notificationId);
  } catch (error) {
    console.error('❌ 알림 생성 실패:', error);
    throw error;
  }
}

/**
 * 프로젝트 공유 알림 생성
 */
export async function createProjectSharedNotification(
  userId: string,
  projectId: string,
  projectName: string,
  sharedBy: string,
  sharedByName: string,
  permission: 'viewer' | 'editor'
): Promise<void> {
  const permissionText = permission === 'viewer' ? '조회 권한' : '편집 권한';
  await createNotification(
    userId,
    'project_shared',
    '새로운 프로젝트가 공유되었습니다',
    `${sharedByName}님이 "${projectName}" 프로젝트를 공유했습니다 (${permissionText})`,
    {
      projectId,
      projectName,
      sharedBy,
      sharedByName,
      permission,
      actionUrl: `/configurator?projectId=${projectId}`,
    }
  );
}

/**
 * 공유 해제 알림 생성 (공유받은 사람이 공유를 해제한 경우)
 */
export async function createShareRemovedNotification(
  userId: string, // 알림을 받을 사용자 (공유한 사람)
  projectId: string,
  projectName: string,
  removedBy: string, // 공유를 해제한 사용자 ID
  removedByName: string, // 공유를 해제한 사용자 이름
  designFileName?: string // 디자인 파일명 (옵션)
): Promise<void> {
  const itemText = designFileName ? `디자인 파일 "${designFileName}"` : `프로젝트 "${projectName}"`;
  await createNotification(
    userId,
    'share_removed',
    '공유가 해제되었습니다',
    `${removedByName}님이 ${itemText}의 공유를 해제했습니다`,
    {
      projectId,
      projectName,
      sharedBy: removedBy,
      sharedByName: removedByName,
    }
  );
}

/**
 * 사용자의 알림 목록 조회
 */
export async function getUserNotifications(
  userId: string,
  limitCount: number = 50
): Promise<Notification[]> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const notifications: Notification[] = [];

    snapshot.forEach((doc) => {
      notifications.push(doc.data() as Notification);
    });

    return notifications;
  } catch (error) {
    console.error('❌ 알림 목록 조회 실패:', error);
    throw error;
  }
}

/**
 * 읽지 않은 알림 개수 조회
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', false)
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('❌ 읽지 않은 알림 개수 조회 실패:', error);
    return 0;
  }
}

/**
 * 알림 읽음 처리
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
    });
    console.log('✅ 알림 읽음 처리 완료:', notificationId);
  } catch (error) {
    console.error('❌ 알림 읽음 처리 실패:', error);
    throw error;
  }
}

/**
 * 모든 알림 읽음 처리
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', false)
    );

    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs.map((doc) =>
      updateDoc(doc.ref, { isRead: true })
    );

    await Promise.all(updatePromises);
    console.log('✅ 모든 알림 읽음 처리 완료');
  } catch (error) {
    console.error('❌ 모든 알림 읽음 처리 실패:', error);
    throw error;
  }
}

/**
 * 알림 삭제
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
    console.log('✅ 알림 삭제 완료:', notificationId);
  } catch (error) {
    console.error('❌ 알림 삭제 실패:', error);
    throw error;
  }
}

/**
 * 사용자의 모든 알림 삭제
 */
export async function deleteAllNotifications(userId: string): Promise<void> {
  try {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId));
    const snapshot = await getDocs(q);

    const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    console.log('✅ 모든 알림 삭제 완료');
  } catch (error) {
    console.error('❌ 모든 알림 삭제 실패:', error);
    throw error;
  }
}

/**
 * 알림 실시간 구독
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const notifications: Notification[] = [];
      snapshot.forEach((doc) => {
        notifications.push(doc.data() as Notification);
      });
      callback(notifications);
    },
    (error) => {
      console.error('❌ 알림 실시간 구독 에러:', error);
    }
  );

  return unsubscribe;
}

/**
 * 읽지 않은 알림 실시간 구독
 */
export function subscribeToUnreadCount(
  userId: string,
  callback: (count: number) => void
): () => void {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('isRead', '==', false)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.size);
    },
    (error) => {
      console.error('❌ 읽지 않은 알림 구독 에러:', error);
    }
  );

  return unsubscribe;
}
