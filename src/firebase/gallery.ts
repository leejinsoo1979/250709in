import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  getDocs,
  Timestamp,
  increment,
} from 'firebase/firestore';
import { db } from './config';

export interface GalleryPost {
  id: string;               // 문서 ID (= designFileId 권장)
  designFileId: string;
  projectId: string;
  userId: string;
  userName: string;
  title: string;
  description: string;
  thumbnail: string;        // data URL 또는 storage URL
  dimensions?: { width: number; height: number; depth: number };
  views: number;
  likes: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isPublic: boolean;
}

const COL = 'galleryPosts';

/** 게시(신규 또는 재활성화) */
export async function publishToGallery(params: {
  designFileId: string;
  projectId: string;
  userId: string;
  userName: string;
  title: string;
  description: string;
  thumbnail: string;
  dimensions?: { width: number; height: number; depth: number };
}): Promise<string> {
  const ref = doc(db, COL, params.designFileId);
  const now = Timestamp.now();
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await updateDoc(ref, {
      title: params.title,
      description: params.description,
      thumbnail: params.thumbnail,
      dimensions: params.dimensions || null,
      userName: params.userName,
      isPublic: true,
      updatedAt: now,
    });
  } else {
    await setDoc(ref, {
      designFileId: params.designFileId,
      projectId: params.projectId,
      userId: params.userId,
      userName: params.userName,
      title: params.title,
      description: params.description,
      thumbnail: params.thumbnail,
      dimensions: params.dimensions || null,
      views: 0,
      likes: 0,
      createdAt: now,
      updatedAt: now,
      isPublic: true,
    });
  }
  return params.designFileId;
}

/** 게시 해제 (isPublic=false 유지 / 완전삭제 선택 가능) */
export async function unpublishFromGallery(designFileId: string, hard = false): Promise<void> {
  const ref = doc(db, COL, designFileId);
  if (hard) {
    await deleteDoc(ref);
  } else {
    await updateDoc(ref, { isPublic: false, updatedAt: Timestamp.now() });
  }
}

/** 특정 디자인이 갤러리에 게시되어 있는지 */
export async function getGalleryPost(designFileId: string): Promise<GalleryPost | null> {
  const snap = await getDoc(doc(db, COL, designFileId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<GalleryPost, 'id'>) };
}

/** 공개 갤러리 리스트 */
export async function listPublicGalleryPosts(options?: {
  sortBy?: 'latest' | 'likes' | 'views';
  limit?: number;
}): Promise<GalleryPost[]> {
  const sortField = options?.sortBy === 'likes' ? 'likes'
    : options?.sortBy === 'views' ? 'views'
    : 'createdAt';
  const q = query(
    collection(db, COL),
    where('isPublic', '==', true),
    orderBy(sortField, 'desc'),
    fsLimit(options?.limit ?? 60),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<GalleryPost, 'id'>) }));
}

/** 조회수 증가 */
export async function incrementGalleryView(designFileId: string): Promise<void> {
  await updateDoc(doc(db, COL, designFileId), { views: increment(1) });
}

/** 좋아요 토글 (단순 카운트) */
export async function incrementGalleryLike(designFileId: string, delta = 1): Promise<void> {
  await updateDoc(doc(db, COL, designFileId), { likes: increment(delta) });
}
