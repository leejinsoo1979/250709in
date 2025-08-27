import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  onSnapshot,
  runTransaction,
  writeBatch,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  deleteField,
  QueryConstraint,
  DocumentData,
  WithFieldValue,
  UpdateData,
  Query,
  CollectionReference,
  DocumentReference,
  Unsubscribe,
  QuerySnapshot,
  DocumentSnapshot,
  Transaction,
  WriteBatch,
  FieldValue,
  enableNetwork,
  disableNetwork,
  clearIndexedDbPersistence,
  enableIndexedDbPersistence,
  waitForPendingWrites,
  terminate,
} from 'firebase/firestore';
import { db as firebaseDb } from '../../firebase/config';

export interface QueryOptions {
  where?: Array<{
    field: string;
    operator: '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'array-contains-any' | 'in' | 'not-in';
    value: any;
  }>;
  orderBy?: Array<{
    field: string;
    direction?: 'asc' | 'desc';
  }>;
  limit?: number;
  startAfter?: any;
  endBefore?: any;
}

export interface BatchOperation {
  type: 'set' | 'update' | 'delete';
  path: string;
  data?: any;
  options?: { merge?: boolean };
}

export interface RealtimeOptions extends QueryOptions {
  includeMetadataChanges?: boolean;
}

export interface TransactionOptions {
  maxAttempts?: number;
}

export class FirestoreService {
  private db: Firestore;
  private subscriptions: Map<string, Unsubscribe> = new Map();
  private offlineMode: boolean = false;
  private cacheEnabled: boolean = true;

  constructor() {
    this.db = firebaseDb;
    this.initializeOfflineSupport();
  }

  /**
   * 오프라인 지원 초기화
   */
  private async initializeOfflineSupport(): Promise<void> {
    try {
      // 브라우저 환경에서만 IndexedDB 지속성 활성화
      if (typeof window !== 'undefined' && this.cacheEnabled) {
        // 이미 초기화된 경우 스킵
        try {
          await enableIndexedDbPersistence(this.db);
        } catch (err: any) {
          if (err.code === 'failed-precondition') {
            // 다른 탭에서 이미 활성화됨
            console.warn('Firestore persistence already enabled in another tab');
          } else if (err.code === 'unimplemented') {
            // 브라우저가 지원하지 않음
            console.warn('Firestore persistence not supported in this browser');
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize offline support:', error);
    }
  }

  /**
   * 컬렉션 참조 가져오기
   */
  private getCollectionRef(collectionPath: string): CollectionReference {
    return collection(this.db, collectionPath);
  }

  /**
   * 문서 참조 가져오기
   */
  private getDocRef(documentPath: string): DocumentReference {
    const pathSegments = documentPath.split('/');
    return doc(this.db, ...pathSegments);
  }

  /**
   * 쿼리 빌더
   */
  private buildQuery(
    collectionRef: CollectionReference, 
    options?: QueryOptions
  ): Query {
    const constraints: QueryConstraint[] = [];

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

    if (options?.endBefore) {
      constraints.push(endBefore(options.endBefore));
    }

    return constraints.length > 0 
      ? query(collectionRef, ...constraints)
      : collectionRef;
  }

  /**
   * 단일 문서 조회
   */
  async getDocument<T = DocumentData>(
    documentPath: string
  ): Promise<T | null> {
    try {
      const docRef = this.getDocRef(documentPath);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as T;
      }
      return null;
    } catch (error) {
      console.error(`Error getting document ${documentPath}:`, error);
      throw error;
    }
  }

  /**
   * 컬렉션 조회
   */
  async getCollection<T = DocumentData>(
    collectionPath: string,
    options?: QueryOptions
  ): Promise<T[]> {
    try {
      const collectionRef = this.getCollectionRef(collectionPath);
      const q = this.buildQuery(collectionRef, options);
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];
    } catch (error) {
      console.error(`Error getting collection ${collectionPath}:`, error);
      throw error;
    }
  }

  /**
   * 문서 생성
   */
  async createDocument<T = DocumentData>(
    collectionPath: string,
    data: WithFieldValue<T>
  ): Promise<string> {
    try {
      const collectionRef = this.getCollectionRef(collectionPath);
      const docData = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collectionRef, docData);
      return docRef.id;
    } catch (error) {
      console.error(`Error creating document in ${collectionPath}:`, error);
      throw error;
    }
  }

  /**
   * 문서 생성 (ID 지정)
   */
  async setDocument<T = DocumentData>(
    documentPath: string,
    data: WithFieldValue<T>,
    options?: { merge?: boolean }
  ): Promise<void> {
    try {
      const docRef = this.getDocRef(documentPath);
      const docData = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(docRef, docData, options || {});
    } catch (error) {
      console.error(`Error setting document ${documentPath}:`, error);
      throw error;
    }
  }

  /**
   * 문서 업데이트
   */
  async updateDocument(
    documentPath: string,
    data: UpdateData<DocumentData>
  ): Promise<void> {
    try {
      const docRef = this.getDocRef(documentPath);
      const updateData = {
        ...data,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(docRef, updateData);
    } catch (error) {
      console.error(`Error updating document ${documentPath}:`, error);
      throw error;
    }
  }

  /**
   * 문서 삭제
   */
  async deleteDocument(documentPath: string): Promise<void> {
    try {
      const docRef = this.getDocRef(documentPath);
      await deleteDoc(docRef);
    } catch (error) {
      console.error(`Error deleting document ${documentPath}:`, error);
      throw error;
    }
  }

  /**
   * 실시간 리스너 설정
   */
  subscribe<T = DocumentData>(
    path: string,
    callback: (data: T | T[]) => void,
    errorCallback?: (error: Error) => void,
    options?: RealtimeOptions
  ): string {
    const subscriptionId = `${path}_${Date.now()}`;
    
    try {
      let unsubscribe: Unsubscribe;
      
      // 문서 경로인지 컬렉션 경로인지 확인
      const pathSegments = path.split('/');
      const isDocument = pathSegments.length % 2 === 0;
      
      if (isDocument) {
        // 문서 리스너
        const docRef = this.getDocRef(path);
        unsubscribe = onSnapshot(
          docRef,
          { includeMetadataChanges: options?.includeMetadataChanges },
          (docSnap) => {
            if (docSnap.exists()) {
              callback({ id: docSnap.id, ...docSnap.data() } as T);
            } else {
              callback(null as any);
            }
          },
          (error) => {
            console.error(`Snapshot error for ${path}:`, error);
            errorCallback?.(error);
          }
        );
      } else {
        // 컬렉션 리스너
        const collectionRef = this.getCollectionRef(path);
        const q = this.buildQuery(collectionRef, options);
        
        unsubscribe = onSnapshot(
          q,
          { includeMetadataChanges: options?.includeMetadataChanges },
          (querySnap) => {
            const data = querySnap.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as T[];
            callback(data);
          },
          (error) => {
            console.error(`Snapshot error for ${path}:`, error);
            errorCallback?.(error);
          }
        );
      }
      
      this.subscriptions.set(subscriptionId, unsubscribe);
      return subscriptionId;
    } catch (error) {
      console.error(`Error setting up listener for ${path}:`, error);
      throw error;
    }
  }

  /**
   * 실시간 리스너 해제
   */
  unsubscribe(subscriptionId: string): void {
    const unsubscribe = this.subscriptions.get(subscriptionId);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(subscriptionId);
    }
  }

  /**
   * 모든 리스너 해제
   */
  unsubscribeAll(): void {
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
  }

  /**
   * 트랜잭션 실행
   */
  async runTransaction<T>(
    updateFunction: (transaction: Transaction) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    try {
      return await runTransaction(
        this.db, 
        updateFunction,
        { maxAttempts: options?.maxAttempts || 5 }
      );
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }

  /**
   * 배치 작업 실행
   */
  async executeBatch(operations: BatchOperation[]): Promise<void> {
    try {
      const batch = writeBatch(this.db);
      
      operations.forEach(op => {
        const docRef = this.getDocRef(op.path);
        
        switch (op.type) {
          case 'set':
            batch.set(docRef, {
              ...op.data,
              updatedAt: serverTimestamp()
            }, op.options || {});
            break;
          case 'update':
            batch.update(docRef, {
              ...op.data,
              updatedAt: serverTimestamp()
            });
            break;
          case 'delete':
            batch.delete(docRef);
            break;
        }
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Batch operation failed:', error);
      throw error;
    }
  }

  /**
   * WriteBatch 인스턴스 생성
   */
  createBatch(): WriteBatch {
    return writeBatch(this.db);
  }

  /**
   * 필드 값 헬퍼 - 증가/감소
   */
  getFieldIncrement(n: number): FieldValue {
    return increment(n);
  }

  /**
   * 필드 값 헬퍼 - 배열에 추가
   */
  getArrayUnion(...elements: any[]): FieldValue {
    return arrayUnion(...elements);
  }

  /**
   * 필드 값 헬퍼 - 배열에서 제거
   */
  getArrayRemove(...elements: any[]): FieldValue {
    return arrayRemove(...elements);
  }

  /**
   * 필드 값 헬퍼 - 필드 삭제
   */
  getDeleteField(): FieldValue {
    return deleteField();
  }

  /**
   * 필드 값 헬퍼 - 서버 타임스탬프
   */
  getServerTimestamp(): FieldValue {
    return serverTimestamp();
  }

  /**
   * 오프라인 모드 전환
   */
  async setOfflineMode(offline: boolean): Promise<void> {
    try {
      if (offline) {
        await disableNetwork(this.db);
      } else {
        await enableNetwork(this.db);
      }
      this.offlineMode = offline;
    } catch (error) {
      console.error('Failed to toggle offline mode:', error);
      throw error;
    }
  }

  /**
   * 대기 중인 쓰기 작업 기다리기
   */
  async waitForPendingWrites(): Promise<void> {
    try {
      await waitForPendingWrites(this.db);
    } catch (error) {
      console.error('Failed to wait for pending writes:', error);
      throw error;
    }
  }

  /**
   * 캐시 클리어
   */
  async clearCache(): Promise<void> {
    try {
      await clearIndexedDbPersistence(this.db);
    } catch (error) {
      console.error('Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Firestore 연결 종료
   */
  async terminate(): Promise<void> {
    try {
      this.unsubscribeAll();
      await terminate(this.db);
    } catch (error) {
      console.error('Failed to terminate Firestore:', error);
      throw error;
    }
  }

  /**
   * 컬렉션 내 문서 수 카운트 (최적화된 쿼리)
   */
  async countDocuments(
    collectionPath: string,
    options?: QueryOptions
  ): Promise<number> {
    try {
      // 카운트만 필요한 경우 최소한의 데이터만 가져오기
      const limitedOptions = {
        ...options,
        limit: undefined // limit 제거하여 전체 카운트 가져오기
      };
      
      const collectionRef = this.getCollectionRef(collectionPath);
      const q = this.buildQuery(collectionRef, limitedOptions);
      const snapshot = await getDocs(q);
      
      return snapshot.size;
    } catch (error) {
      console.error(`Error counting documents in ${collectionPath}:`, error);
      throw error;
    }
  }

  /**
   * 문서 존재 여부 확인
   */
  async documentExists(documentPath: string): Promise<boolean> {
    try {
      const docRef = this.getDocRef(documentPath);
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      console.error(`Error checking document existence ${documentPath}:`, error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스
export const firestoreService = new FirestoreService();