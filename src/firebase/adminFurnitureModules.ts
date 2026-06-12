import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe
} from 'firebase/firestore';
import { db } from './config';
import type { ModuleData } from '@/data/modules';

const COLLECTION = 'adminFurnitureModules';

/** 관리 화면용 — enabled 여부와 무관한 전체 문서 표현 */
export interface AdminFurnitureModuleDoc {
  module: ModuleData & { thumbnail?: string };
  enabled: boolean;
  updatedAt: Date | null;
}

const stripUndefined = <T,>(value: T): T => (
  JSON.parse(JSON.stringify(value)) as T
);

const docToModule = (data: Record<string, unknown>, docId: string): ModuleData => {
  const modelConfig = (data.modelConfig || undefined) as ModuleData['modelConfig'];

  // 구버전 저장본 정규화: 키큰장 다중 섹션인데 하부/상부 경계가 없으면 기본 1 (첫 섹션 = 하부)
  // — 3D 구분 패널/(하)(상) 메시 이름/패널목록 그룹이 이 필드를 게이트로 사용
  if (
    modelConfig
    && data.category === 'full'
    && Array.isArray(modelConfig.sections)
    && modelConfig.sections.length >= 2
    && modelConfig.lowerSectionCount === undefined
  ) {
    modelConfig.lowerSectionCount = 1;
  }

  return {
    id: (data.id as string) || docId,
    name: data.name,
    category: data.category,
    dimensions: data.dimensions,
    color: (data.color as string) || '#C8B69E',
    description: data.description,
    hasDoor: data.hasDoor,
    isDynamic: data.isDynamic,
    widthOptions: data.widthOptions,
    type: data.type,
    defaultDepth: data.defaultDepth,
    slotWidths: data.slotWidths,
    galleryCategory: data.galleryCategory,
    thumbnail: data.thumbnail,
    modelConfig
  } as ModuleData;
};

export async function saveAdminFurnitureModule(moduleData: ModuleData & { thumbnail?: string }) {
  const cleanModule = stripUndefined(moduleData);
  await setDoc(doc(db, COLLECTION, cleanModule.id), {
    ...cleanModule,
    enabled: true,
    source: 'admin-module-builder',
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function subscribeEnabledAdminFurnitureModules(
  onModules: (modules: ModuleData[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION),
    where('enabled', '==', true)
  );

  return onSnapshot(q, (snapshot) => {
    const modules = snapshot.docs
      .map(docSnap => docToModule(docSnap.data(), docSnap.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    onModules(modules);
  }, onError);
}

/** 모듈빌더 관리 패널용 — enabled 여부 무관 전체 모듈 구독 */
export function subscribeAllAdminFurnitureModules(
  onDocs: (docs: AdminFurnitureModuleDoc[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(collection(db, COLLECTION), (snapshot) => {
    const docs = snapshot.docs
      .map(docSnap => {
        const data = docSnap.data();
        return {
          module: docToModule(data, docSnap.id),
          enabled: data.enabled !== false,
          updatedAt: data.updatedAt?.toDate?.() || null
        } as AdminFurnitureModuleDoc;
      })
      .sort((a, b) => a.module.name.localeCompare(b.module.name, 'ko'));
    onDocs(docs);
  }, onError);
}

/** 저장 전 동일 ID 존재 여부 확인 (덮어쓰기 경고용) */
export async function adminFurnitureModuleExists(moduleId: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, COLLECTION, moduleId));
  return snapshot.exists();
}

/** 가구 목록 노출 ON/OFF */
export async function setAdminFurnitureModuleEnabled(moduleId: string, enabled: boolean) {
  await updateDoc(doc(db, COLLECTION, moduleId), {
    enabled,
    updatedAt: serverTimestamp()
  });
}

export async function deleteAdminFurnitureModule(moduleId: string) {
  await deleteDoc(doc(db, COLLECTION, moduleId));
}
