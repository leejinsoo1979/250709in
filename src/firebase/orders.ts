/**
 * 발주(orders) 관련 헬퍼
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
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
