import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
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

// ────────── 댓글 ──────────
const COMMENTS_COL = 'galleryComments';

export interface GalleryComment {
  id: string;
  postId: string;          // galleryPosts 문서 ID (= designFileId)
  parentId?: string | null; // 대댓글이면 부모 댓글 ID, 최상위는 null
  userId: string;
  userName: string;
  userPhotoURL?: string;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 댓글 목록 (최신순) */
export async function listGalleryComments(postId: string): Promise<GalleryComment[]> {
  const q = query(
    collection(db, COMMENTS_COL),
    where('postId', '==', postId),
    orderBy('createdAt', 'desc'),
    fsLimit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<GalleryComment, 'id'>) }));
}

/** 댓글 작성 */
export async function addGalleryComment(params: {
  postId: string;
  parentId?: string | null;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  text: string;
}): Promise<string> {
  const now = Timestamp.now();
  const ref = await addDoc(collection(db, COMMENTS_COL), {
    postId: params.postId,
    parentId: params.parentId || null,
    userId: params.userId,
    userName: params.userName,
    userPhotoURL: params.userPhotoURL || null,
    text: params.text,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

/** 댓글 수정 */
export async function updateGalleryComment(commentId: string, text: string): Promise<void> {
  await updateDoc(doc(db, COMMENTS_COL, commentId), {
    text,
    updatedAt: Timestamp.now(),
  });
}

/** 댓글 삭제 */
export async function deleteGalleryComment(commentId: string): Promise<void> {
  await deleteDoc(doc(db, COMMENTS_COL, commentId));
}

/** 여러 게시물의 댓글 수 맵 반환 */
export async function getCommentCounts(postIds: string[]): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const results: Record<string, number> = {};
  // Firestore 'in' 쿼리는 10개 제한 → 배치
  const chunks: string[][] = [];
  for (let i = 0; i < postIds.length; i += 10) {
    chunks.push(postIds.slice(i, i + 10));
  }
  await Promise.all(chunks.map(async (chunk) => {
    const q = query(collection(db, COMMENTS_COL), where('postId', 'in', chunk));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const pid = (d.data() as any).postId as string;
      results[pid] = (results[pid] || 0) + 1;
    });
  }));
  return results;
}
