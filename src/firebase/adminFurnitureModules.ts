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

/** 비율(%) 칸 합계를 100으로 정규화 — 3D 렌더러는 %를 남은 높이의 리터럴 %로 해석 */
const normalizePercentSectionsInPlace = (sections: NonNullable<ModuleData['modelConfig']>['sections']) => {
  if (!Array.isArray(sections)) return;
  const pctTotal = sections
    .filter(section => (section.heightType || 'percentage') === 'percentage')
    .reduce((sum, section) => sum + Math.max(section.height || 0, 0), 0);
  if (pctTotal <= 0 || Math.abs(pctTotal - 100) < 0.01) return;
  sections.forEach(section => {
    if ((section.heightType || 'percentage') === 'percentage') {
      section.height = Math.round((Math.max(section.height || 0, 0) / pctTotal) * 1000) / 10;
    }
  });
};

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

  // 구버전 저장본 정규화: 비율(%) 합계 100 보정 (100+100 같은 값은 첫 섹션이 전체를 차지하는 렌더 버그 유발)
  if (modelConfig) {
    normalizePercentSectionsInPlace(modelConfig.sections);
    normalizePercentSectionsInPlace(modelConfig.leftSections);
    normalizePercentSectionsInPlace(modelConfig.rightSections);
  }

  // 구버전 저장본 정규화: 목찬넬(손잡이) 동반 외부서랍의 마이다 상단갭은 -20 상한 (목찬넬 위로 못 올라감)
  if (modelConfig?.externalDrawers && modelConfig.topChannelNotch === true) {
    const currentTopGap = modelConfig.externalDrawers.topGap;
    if (currentTopGap === undefined || currentTopGap > -20) {
      modelConfig.externalDrawers.topGap = -20;
    }
  }

  // 구버전 저장본 정규화: topChannelNotch 도입 전 모듈은 상판 없음 = 자동 목찬넬이었음 — 기존 외형 유지
  if (modelConfig && modelConfig.topChannelNotch === undefined) {
    const isLegacyAutoChannel = data.category === 'lower'
      ? modelConfig.hideTopPanel !== false
      : modelConfig.hideTopPanel === true;
    if (isLegacyAutoChannel) modelConfig.topChannelNotch = true;
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

/**
 * 저장 — 신규 모듈은 비공개 초안(enabled: false)으로 저장.
 * 게시는 모듈관리 목록에서 관리자가 '게시'를 켰을 때만. 이미 게시 중인 모듈의 수정 저장은 게시 상태 유지.
 * @returns 저장 후 게시 여부
 */
export async function saveAdminFurnitureModule(moduleData: ModuleData & { thumbnail?: string }): Promise<boolean> {
  const cleanModule = stripUndefined(moduleData);
  const ref = doc(db, COLLECTION, cleanModule.id);
  const existing = await getDoc(ref);
  const enabled = existing.exists() ? existing.data()?.enabled === true : false;
  await setDoc(ref, {
    ...cleanModule,
    enabled,
    source: 'admin-module-builder',
    updatedAt: serverTimestamp()
  }, { merge: true });
  return enabled;
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
