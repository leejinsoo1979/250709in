import {
  collection,
  doc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './config';

// 변경 이력 타입
export type ChangeType =
  | 'project_created'
  | 'project_updated'
  | 'design_added'
  | 'design_updated'
  | 'design_deleted'
  | 'space_config_updated'
  | 'furniture_added'
  | 'furniture_updated'
  | 'furniture_deleted'
  | 'folder_created'
  | 'folder_updated'
  | 'folder_deleted';

export interface ProjectHistoryEntry {
  id: string;
  projectId: string;
  projectName: string;
  changeType: ChangeType;
  changedBy: string;
  changedByName: string;
  changedByEmail?: string;
  timestamp: Timestamp;
  changes: {
    field?: string;
    oldValue?: any;
    newValue?: any;
    description?: string;
  };
  metadata?: {
    designFileName?: string;
    furnitureId?: string;
    folderName?: string;
    [key: string]: any;
  };
}

/**
 * 프로젝트 변경 이력 기록
 */
export async function recordProjectHistory(
  projectId: string,
  projectName: string,
  changeType: ChangeType,
  userId: string,
  userName: string,
  userEmail: string | undefined,
  changes: {
    field?: string;
    oldValue?: any;
    newValue?: any;
    description?: string;
  },
  metadata?: {
    designFileName?: string;
    furnitureId?: string;
    folderName?: string;
    [key: string]: any;
  }
): Promise<void> {
  try {
    const historyEntry: Omit<ProjectHistoryEntry, 'id'> = {
      projectId,
      projectName,
      changeType,
      changedBy: userId,
      changedByName: userName,
      changedByEmail: userEmail,
      timestamp: Timestamp.now(),
      changes,
      metadata,
    };

    await addDoc(collection(db, 'projectHistory'), historyEntry);
    console.log('✅ 변경 이력 기록 완료:', changeType);
  } catch (error) {
    console.error('❌ 변경 이력 기록 실패:', error);
    // 이력 기록 실패는 주요 기능에 영향을 주지 않으므로 에러를 throw하지 않음
  }
}

/**
 * 프로젝트 변경 이력 조회
 */
export async function getProjectHistory(
  projectId: string,
  limitCount: number = 50
): Promise<ProjectHistoryEntry[]> {
  try {
    const q = query(
      collection(db, 'projectHistory'),
      where('projectId', '==', projectId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as ProjectHistoryEntry[];
  } catch (error) {
    console.error('❌ 변경 이력 조회 실패:', error);
    return [];
  }
}

/**
 * 사용자별 변경 이력 조회
 */
export async function getUserHistory(
  userId: string,
  limitCount: number = 50
): Promise<ProjectHistoryEntry[]> {
  try {
    const q = query(
      collection(db, 'projectHistory'),
      where('changedBy', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as ProjectHistoryEntry[];
  } catch (error) {
    console.error('❌ 사용자 이력 조회 실패:', error);
    return [];
  }
}

/**
 * 프로젝트 변경 이력 실시간 구독
 */
export function subscribeToProjectHistory(
  projectId: string,
  callback: (history: ProjectHistoryEntry[]) => void,
  limitCount: number = 50
): () => void {
  const q = query(
    collection(db, 'projectHistory'),
    where('projectId', '==', projectId),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ProjectHistoryEntry[];
      callback(history);
    },
    (error) => {
      console.error('❌ 이력 구독 실패:', error);
      callback([]);
    }
  );

  return unsubscribe;
}

/**
 * 변경 타입에 대한 한글 설명 반환
 */
export function getChangeTypeDescription(changeType: ChangeType): string {
  const descriptions: Record<ChangeType, string> = {
    project_created: '프로젝트 생성',
    project_updated: '프로젝트 수정',
    design_added: '디자인 파일 추가',
    design_updated: '디자인 파일 수정',
    design_deleted: '디자인 파일 삭제',
    space_config_updated: '공간 설정 변경',
    furniture_added: '가구 추가',
    furniture_updated: '가구 수정',
    furniture_deleted: '가구 삭제',
    folder_created: '폴더 생성',
    folder_updated: '폴더 수정',
    folder_deleted: '폴더 삭제',
  };

  return descriptions[changeType] || '알 수 없는 변경';
}

/**
 * 변경 이력을 사람이 읽기 쉬운 텍스트로 변환
 */
export function formatHistoryEntry(entry: ProjectHistoryEntry): string {
  const timeStr = entry.timestamp.toDate().toLocaleString('ko-KR');
  const changeDesc = getChangeTypeDescription(entry.changeType);

  let details = '';
  if (entry.changes.description) {
    details = `: ${entry.changes.description}`;
  } else if (entry.metadata?.designFileName) {
    details = `: ${entry.metadata.designFileName}`;
  } else if (entry.metadata?.folderName) {
    details = `: ${entry.metadata.folderName}`;
  }

  return `[${timeStr}] ${entry.changedByName}님이 ${changeDesc}${details}`;
}
