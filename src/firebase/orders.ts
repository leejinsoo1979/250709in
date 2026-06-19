/**
 * 발주(orders) 관련 헬퍼
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

export type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'cancelled';

export interface OrderFormData {
  materialSpec?: string;  // 자재 스펙 (예: PB 18T, MDF 9T 등)
  dueDate?: string;
  deliveryAddress?: string;
  installSchedule?: string;
  notes?: string;
}

export interface OrderDesignItem {
  designId: string;
  designName: string;
  projectId?: string;
  projectName?: string;
  thumbnailUrl?: string;
}

export interface OrderRecord {
  id: string;
  ordererId: string;
  ordererName?: string;
  ordererEmail?: string;
  factoryId: string;
  factoryName?: string;
  designId: string;
  designName: string;
  designs: OrderDesignItem[];
  orderScope?: 'design' | 'multi-design' | 'project';
  projectId?: string;
  projectName?: string;
  thumbnailUrl?: string;
  formData: OrderFormData;
  status: OrderStatus;
  reason?: string | null;
  createdAt?: Date | null;
  processedAt?: Date | null;
  updatedAt?: Date | null;
}

export interface FactoryInfo {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

export const getOrderDesignKey = (design: Pick<OrderDesignItem, 'designId' | 'projectId'>) => (
  `${design.projectId || ''}:${design.designId}`
);

export const getOrderDesignItems = (order: OrderRecord): OrderDesignItem[] => (
  order.designs.length > 0
    ? order.designs
    : order.designId
      ? [{
        designId: order.designId,
        designName: order.designName || '디자인',
        projectId: order.projectId,
        projectName: order.projectName,
        thumbnailUrl: order.thumbnailUrl,
      }]
      : []
);

/**
 * 등록된 공장(파트너) 목록 조회 — users.isPartner === true
 */
export async function listFactories(): Promise<FactoryInfo[]> {
  try {
    const q = query(collection(db, 'users'), where('isPartner', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        uid: d.id,
        displayName: x.displayName || x.name || x.email || '이름 없음',
        email: x.email || '',
        photoURL: x.photoURL || undefined,
      };
    });
  } catch (e) {
    console.error('공장 목록 조회 실패:', e);
    return [];
  }
}

/**
 * 발주 생성 — Cloud Function 호출
 */
export async function createOrder(input: {
  factoryId: string;
  designId?: string;
  designName?: string;
  designs?: OrderDesignItem[];
  orderScope?: 'design' | 'multi-design' | 'project';
  projectId?: string;
  projectName?: string;
  thumbnailUrl?: string;
  formData: OrderFormData;
}): Promise<{ ok: boolean; orderId: string }> {
  const fn = httpsCallable<typeof input, { ok: boolean; orderId: string }>(functions, 'createOrder');
  const r = await fn(input);
  return r.data;
}

/**
 * 발주 처리 — 공장이 수락/거절/진행/완료
 */
export async function processOrder(input: {
  orderId: string;
  action: 'accept' | 'reject' | 'in_progress' | 'complete';
  reason?: string;
}): Promise<{ ok: boolean; status: string }> {
  const fn = httpsCallable<typeof input, { ok: boolean; status: string }>(functions, 'processOrder');
  const r = await fn(input);
  return r.data;
}

/**
 * 발주 안의 디자인 1개 제거 — 다중/프로젝트 발주 목록에서 개별 정리용.
 * 마지막 1개는 발주 자체를 취소해야 하므로 여기서는 제거하지 않는다.
 */
export async function removeOrderDesign(order: OrderRecord, design: OrderDesignItem): Promise<void> {
  const currentDesigns = getOrderDesignItems(order);
  if (currentDesigns.length <= 1) {
    throw new Error('마지막 디자인은 개별 삭제할 수 없습니다. 발주 취소를 사용하세요.');
  }

  const removeKey = getOrderDesignKey(design);
  const nextDesigns = currentDesigns.filter(item => getOrderDesignKey(item) !== removeKey);
  if (nextDesigns.length === currentDesigns.length) {
    throw new Error('삭제할 디자인을 찾지 못했습니다.');
  }
  if (nextDesigns.length === 0) {
    throw new Error('발주에는 최소 1개의 디자인이 필요합니다.');
  }

  const firstDesign = nextDesigns[0];
  const nextDesignName = nextDesigns.length > 1
    ? `${firstDesign.designName || '디자인'} 외 ${nextDesigns.length - 1}개`
    : firstDesign.designName || '디자인';
  const nextOrderScope = order.orderScope === 'project' && nextDesigns.length > 1
    ? 'project'
    : nextDesigns.length > 1
      ? 'multi-design'
      : 'design';

  await updateDoc(doc(db, 'orders', order.id), {
    designs: nextDesigns,
    designCount: nextDesigns.length,
    designId: firstDesign.designId,
    designName: nextDesignName,
    orderScope: nextOrderScope,
    projectId: firstDesign.projectId || order.projectId || '',
    projectName: firstDesign.projectName || order.projectName || '',
    thumbnailUrl: firstDesign.thumbnailUrl || '',
    updatedAt: serverTimestamp(),
  });
}

/**
 * 발주자 본인 발주 목록
 */
export async function listMyOrders(uid: string): Promise<OrderRecord[]> {
  const q = query(collection(db, 'orders'), where('ordererId', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(toOrderRecord).sort(byCreatedDesc);
}

/**
 * 공장이 받은 발주 목록
 */
export async function listFactoryOrders(uid: string): Promise<OrderRecord[]> {
  const q = query(collection(db, 'orders'), where('factoryId', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(toOrderRecord).sort(byCreatedDesc);
}

/**
 * 단일 발주 조회
 */
export async function getOrder(orderId: string): Promise<OrderRecord | null> {
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return null;
  return toOrderRecord(snap as never);
}

function toOrderRecord(d: { id: string; data: () => Record<string, unknown> }): OrderRecord {
  const x = d.data();
  const ts = (v: unknown) => {
    const t = v as { toDate?: () => Date };
    return t?.toDate?.() || null;
  };
  const designs = Array.isArray(x.designs)
    ? (x.designs as OrderDesignItem[])
    : [{
      designId: x.designId as string,
      designName: (x.designName as string) || '',
      projectId: x.projectId as string | undefined,
      projectName: x.projectName as string | undefined,
      thumbnailUrl: x.thumbnailUrl as string | undefined,
    }].filter(item => item.designId);
  const firstDesign = designs[0];
  const designName = (x.designName as string)
    || (designs.length > 1 && firstDesign ? `${firstDesign.designName} 외 ${designs.length - 1}개` : firstDesign?.designName)
    || '';
  return {
    id: d.id,
    ordererId: x.ordererId as string,
    ordererName: x.ordererName as string | undefined,
    ordererEmail: x.ordererEmail as string | undefined,
    factoryId: x.factoryId as string,
    factoryName: x.factoryName as string | undefined,
    designId: (x.designId as string) || firstDesign?.designId || '',
    designName,
    designs,
    orderScope: x.orderScope as OrderRecord['orderScope'],
    projectId: x.projectId as string | undefined,
    projectName: x.projectName as string | undefined,
    thumbnailUrl: x.thumbnailUrl as string | undefined,
    formData: (x.formData as OrderFormData) || {},
    status: (x.status as OrderStatus) || 'pending',
    reason: (x.reason as string) || null,
    createdAt: ts(x.createdAt),
    processedAt: ts(x.processedAt),
    updatedAt: ts(x.updatedAt),
  };
}

function byCreatedDesc(a: OrderRecord, b: OrderRecord) {
  return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
}
