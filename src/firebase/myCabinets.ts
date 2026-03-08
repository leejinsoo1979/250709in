import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './config';
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

    // Firestore는 undefined 값을 거부하므로 JSON 직렬화로 제거
    const cleanConfig = JSON.parse(JSON.stringify(data.customConfig));

    const cabinetData: Omit<SavedCabinet, 'id'> = {
      userId: user.uid,
      name: data.name,
      category: data.category,
      width: data.width,
      height: data.height,
      depth: data.depth,
      customConfig: cleanConfig,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };

    const docRef = await addDoc(collection(db, MY_CABINETS_COLLECTION), cabinetData);
    return { id: docRef.id, error: null };
  } catch (error: any) {
    console.error('My캐비닛 저장 에러:', error);
    console.error('My캐비닛 저장 에러 상세:', error?.message, error?.code);
    return { id: null, error: `My캐비닛 저장 중 오류: ${error?.message || '알 수 없는 에러'}` };
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
  } catch (error: any) {
    console.error('My캐비닛 목록 가져오기 에러:', error);
    console.error('My캐비닛 목록 에러 상세:', error?.message, error?.code);
    return { cabinets: [], error: `My캐비닛 목록 오류: ${error?.message || '알 수 없는 에러'}` };
  }
};

// My캐비닛 섬네일 업로드
export const uploadCabinetThumbnail = async (
  cabinetId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { url: null, error: '로그인이 필요합니다.' };
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { url: null, error: 'JPEG, PNG, GIF, WebP만 지원됩니다.' };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { url: null, error: '파일 크기는 2MB 이하여야 합니다.' };
    }

    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'png';
    const storageRef = ref(storage, `cabinet-thumbnails/${user.uid}/${cabinetId}_${timestamp}.${ext}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    // Firestore에 thumbnail URL 저장
    await updateDoc(doc(db, MY_CABINETS_COLLECTION, cabinetId), {
      thumbnail: url,
      updatedAt: serverTimestamp(),
    });

    return { url, error: null };
  } catch (error: any) {
    console.error('섬네일 업로드 에러:', error);
    return { url: null, error: `섬네일 업로드 오류: ${error?.message || '알 수 없는 에러'}` };
  }
};

// My캐비닛 수정
export const updateMyCabinet = async (
  cabinetId: string,
  data: {
    name?: string;
    category?: 'full' | 'upper' | 'lower';
    width?: number;
    height?: number;
    depth?: number;
    customConfig?: CustomFurnitureConfig;
    thumbnail?: string;
  }
): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    const updateData: Record<string, any> = { updatedAt: serverTimestamp() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.width !== undefined) updateData.width = data.width;
    if (data.height !== undefined) updateData.height = data.height;
    if (data.depth !== undefined) updateData.depth = data.depth;
    if (data.customConfig !== undefined) {
      updateData.customConfig = JSON.parse(JSON.stringify(data.customConfig));
    }
    if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;

    await updateDoc(doc(db, MY_CABINETS_COLLECTION, cabinetId), updateData);
    return { error: null };
  } catch (error: any) {
    console.error('My캐비닛 수정 에러:', error);
    return { error: `My캐비닛 수정 중 오류: ${error?.message || '알 수 없는 에러'}` };
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
