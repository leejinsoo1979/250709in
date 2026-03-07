import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './config';
import { getCurrentUserAsync } from './auth';
import { SavedCabinet } from './types';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';

const MY_CABINETS_COLLECTION = 'myCabinets';

// My캐비닛 저장
export const saveMyCabinet = async (data: {
  name: string;
  category: 'full' | 'upper' | 'lower';
  width: number;
  height: number;
  depth: number;
  customConfig: CustomFurnitureConfig;
}): Promise<{ id: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { id: null, error: '로그인이 필요합니다.' };
    }

    const cabinetData: Omit<SavedCabinet, 'id'> = {
      userId: user.uid,
      name: data.name,
      category: data.category,
      width: data.width,
      height: data.height,
      depth: data.depth,
      customConfig: data.customConfig,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };

    const docRef = await addDoc(collection(db, MY_CABINETS_COLLECTION), cabinetData);
    return { id: docRef.id, error: null };
  } catch (error) {
    console.error('My캐비닛 저장 에러:', error);
    return { id: null, error: 'My캐비닛 저장 중 오류가 발생했습니다.' };
  }
};

// My캐비닛 목록 가져오기
export const getMyCabinets = async (): Promise<{ cabinets: SavedCabinet[]; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { cabinets: [], error: '로그인이 필요합니다.' };
    }

    const q = query(
      collection(db, MY_CABINETS_COLLECTION),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const cabinets: SavedCabinet[] = [];

    querySnapshot.forEach((doc) => {
      cabinets.push({
        id: doc.id,
        ...doc.data(),
      } as SavedCabinet);
    });

    return { cabinets, error: null };
  } catch (error) {
    console.error('My캐비닛 목록 가져오기 에러:', error);
    return { cabinets: [], error: 'My캐비닛 목록을 가져오는 중 오류가 발생했습니다.' };
  }
};

// My캐비닛 삭제
export const deleteMyCabinet = async (cabinetId: string): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    await deleteDoc(doc(db, MY_CABINETS_COLLECTION, cabinetId));
    return { error: null };
  } catch (error) {
    console.error('My캐비닛 삭제 에러:', error);
    return { error: 'My캐비닛 삭제 중 오류가 발생했습니다.' };
  }
};
