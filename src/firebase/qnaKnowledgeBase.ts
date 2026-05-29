import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';

export interface QnAKnowledgeItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  rules: string;
  answerGuidance: string;
  examples: string;
  tags: string[];
  priority: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface QnAKnowledgeInput {
  title: string;
  category: string;
  summary: string;
  content: string;
  rules: string;
  answerGuidance: string;
  examples: string;
  tagsText: string;
  priority: number;
  isActive: boolean;
}

const COLLECTION = 'qnaKnowledgeBase';

const parseTags = (tagsText: string) =>
  tagsText
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);

const toPayload = (data: QnAKnowledgeInput) => ({
  title: data.title.trim(),
  category: data.category.trim() || '일반',
  summary: data.summary.trim(),
  content: data.content.trim(),
  rules: data.rules.trim(),
  answerGuidance: data.answerGuidance.trim(),
  examples: data.examples.trim(),
  tags: parseTags(data.tagsText),
  priority: data.priority,
  isActive: data.isActive,
});

export const listQnAKnowledge = async (): Promise<{ items: QnAKnowledgeItem[]; error: string | null }> => {
  try {
    const q = query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<QnAKnowledgeItem, 'id'>),
    }));
    return { items, error: null };
  } catch (e: any) {
    console.error('listQnAKnowledge 실패:', e);
    return { items: [], error: e?.message || '지식베이스 조회 실패' };
  }
};

export const createQnAKnowledge = async (data: QnAKnowledgeInput): Promise<{ id: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) return { id: null, error: '로그인이 필요합니다.' };

    const payload = toPayload(data);
    if (!payload.title || !payload.content) {
      return { id: null, error: '제목과 근거 내용을 입력해주세요.' };
    }

    const ref = await addDoc(collection(db, COLLECTION), {
      ...payload,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: ref.id, error: null };
  } catch (e: any) {
    console.error('createQnAKnowledge 실패:', e);
    return { id: null, error: e?.message || '지식베이스 추가 실패' };
  }
};

export const updateQnAKnowledge = async (id: string, data: QnAKnowledgeInput): Promise<{ error: string | null }> => {
  try {
    const payload = toPayload(data);
    if (!payload.title || !payload.content) {
      return { error: '제목과 근거 내용을 입력해주세요.' };
    }

    await updateDoc(doc(db, COLLECTION, id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return { error: null };
  } catch (e: any) {
    console.error('updateQnAKnowledge 실패:', e);
    return { error: e?.message || '지식베이스 수정 실패' };
  }
};

export const deleteQnAKnowledge = async (id: string): Promise<{ error: string | null }> => {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    return { error: null };
  } catch (e: any) {
    console.error('deleteQnAKnowledge 실패:', e);
    return { error: e?.message || '지식베이스 삭제 실패' };
  }
};
