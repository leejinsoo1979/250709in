/**
 * Firestore Service - Firebase Firestore 래퍼
 * Firebase 직접 접근을 추상화하여 서비스 계층에서 사용
 */

import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QueryConstraint,
  DocumentReference,
  CollectionReference,
  Query,
  QuerySnapshot,
  DocumentSnapshot,
  WhereFilterOp,
  OrderByDirection,
  FieldValue
} from 'firebase/firestore';
import { db } from '@/firebase/config';

export type WhereCondition = {
  field: string;
  operator: WhereFilterOp;
  value: any;
};

export type OrderByCondition = {
  field: string;
  direction?: OrderByDirection;
};

export type QueryOptions = {
  where?: WhereCondition[];
  orderBy?: OrderByCondition[];
  limit?: number;
  startAfter?: any;
};

export type FirestoreDocument = {
  id: string;
  [key: string]: any;
};

/**
 * Firestore 컬렉션 참조 가져오기
 */
export function getCollection(path: string): CollectionReference<DocumentData> {
  return collection(db, path);
}

/**
 * Firestore 문서 참조 가져오기
 */
export function getDocRef(collectionPath: string, docId: string): DocumentReference<DocumentData> {
  return doc(db, collectionPath, docId);
}

/**
 * 문서 생성
 */
export async function createDocument(
  collectionPath: string, 
  data: Record<string, any>
): Promise<string> {
  const docRef = await addDoc(collection(db, collectionPath), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
}

/**
 * 문서 읽기
 */
export async function readDocument(
  collectionPath: string, 
  docId: string
): Promise<FirestoreDocument | null> {
  const docSnap = await getDoc(doc(db, collectionPath, docId));
  
  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...docSnap.data()
    };
  }
  
  return null;
}

/**
 * 문서 업데이트
 */
export async function updateDocument(
  collectionPath: string, 
  docId: string, 
  data: Record<string, any>
): Promise<void> {
  await updateDoc(doc(db, collectionPath, docId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

/**
 * 문서 삭제
 */
export async function deleteDocument(
  collectionPath: string, 
  docId: string
): Promise<void> {
  await deleteDoc(doc(db, collectionPath, docId));
}

/**
 * 쿼리 빌더
 */
function buildQuery(
  collectionRef: CollectionReference<DocumentData>, 
  options?: QueryOptions
): Query<DocumentData> {
  let constraints: QueryConstraint[] = [];
  
  if (options?.where) {
    options.where.forEach(condition => {
      constraints.push(where(condition.field, condition.operator, condition.value));
    });
  }
  
  if (options?.orderBy) {
    options.orderBy.forEach(order => {
      constraints.push(orderBy(order.field, order.direction || 'asc'));
    });
  }
  
  if (options?.limit) {
    constraints.push(limit(options.limit));
  }
  
  if (options?.startAfter) {
    constraints.push(startAfter(options.startAfter));
  }
  
  return constraints.length > 0 
    ? query(collectionRef, ...constraints)
    : query(collectionRef);
}

/**
 * 컬렉션 쿼리
 */
export async function queryDocuments(
  collectionPath: string,
  options?: QueryOptions
): Promise<FirestoreDocument[]> {
  const collectionRef = collection(db, collectionPath);
  const q = buildQuery(collectionRef, options);
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * 페이지네이션 쿼리
 */
export async function queryDocumentsPaginated(
  collectionPath: string,
  pageSize: number,
  lastDocument?: DocumentSnapshot,
  options?: Omit<QueryOptions, 'limit' | 'startAfter'>
): Promise<{
  documents: FirestoreDocument[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}> {
  const collectionRef = collection(db, collectionPath);
  
  const queryOptions: QueryOptions = {
    ...options,
    limit: pageSize + 1, // 다음 페이지 확인용
    ...(lastDocument && { startAfter: lastDocument })
  };
  
  const q = buildQuery(collectionRef, queryOptions);
  const querySnapshot = await getDocs(q);
  
  const documents = querySnapshot.docs.slice(0, pageSize).map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  const hasMore = querySnapshot.docs.length > pageSize;
  const lastDoc = querySnapshot.docs.length > 0 
    ? querySnapshot.docs[Math.min(pageSize - 1, querySnapshot.docs.length - 1)]
    : null;
  
  return {
    documents,
    lastDoc,
    hasMore
  };
}

/**
 * 서버 타임스탬프 헬퍼
 */
export function getServerTimestamp(): FieldValue {
  return serverTimestamp();
}

/**
 * 타임스탬프 변환 헬퍼
 */
export function timestampToDate(timestamp: Timestamp | null): Date | null {
  return timestamp ? timestamp.toDate() : null;
}

/**
 * 배치 작업 헬퍼 (트랜잭션 대체)
 */
export async function batchOperation<T>(
  operations: (() => Promise<any>)[]
): Promise<T[]> {
  const results = await Promise.all(operations);
  return results;
}