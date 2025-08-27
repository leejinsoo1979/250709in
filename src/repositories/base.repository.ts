import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  QueryConstraint,
  DocumentData,
  WithFieldValue,
  UpdateData,
  onSnapshot,
  runTransaction,
  WriteBatch,
  writeBatch,
  Firestore,
  CollectionReference,
  DocumentReference,
  Query,
  Unsubscribe,
  serverTimestamp,
  FieldValue,
} from 'firebase/firestore';

export interface BaseEntity {
  id: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface QueryOptions {
  where?: Array<{ field: string; operator: any; value: any }>;
  orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit?: number;
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract collectionName: string;
  protected abstract db: Firestore;

  protected get collectionRef(): CollectionReference {
    return collection(this.db, this.collectionName);
  }

  protected buildQuery(options?: QueryOptions): Query {
    const constraints: QueryConstraint[] = [];

    if (options?.where) {
      options.where.forEach(w => {
        constraints.push(where(w.field, w.operator, w.value));
      });
    }

    if (options?.orderBy) {
      options.orderBy.forEach(o => {
        constraints.push(orderBy(o.field, o.direction));
      });
    }

    if (options?.limit) {
      constraints.push(limit(options.limit));
    }

    return query(this.collectionRef, ...constraints);
  }

  async findById(id: string): Promise<T | null> {
    try {
      const docRef = doc(this.db, this.collectionName, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as T;
      }
      return null;
    } catch (error) {
      console.error(`Error finding document by id ${id}:`, error);
      throw error;
    }
  }

  async findAll(options?: QueryOptions): Promise<T[]> {
    try {
      const q = options ? this.buildQuery(options) : this.collectionRef;
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];
    } catch (error) {
      console.error('Error finding documents:', error);
      throw error;
    }
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    try {
      const docData = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      } as WithFieldValue<DocumentData>;

      const docRef = await addDoc(this.collectionRef, docData);
      const created = await this.findById(docRef.id);
      
      if (!created) {
        throw new Error('Failed to retrieve created document');
      }
      
      return created;
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  }

  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    try {
      const docRef = doc(this.db, this.collectionName, id);
      const updateData = {
        ...data,
        updatedAt: serverTimestamp()
      } as UpdateData<DocumentData>;

      await updateDoc(docRef, updateData);
      const updated = await this.findById(id);
      
      if (!updated) {
        throw new Error('Document not found after update');
      }
      
      return updated;
    } catch (error) {
      console.error(`Error updating document ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const docRef = doc(this.db, this.collectionName, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error(`Error deleting document ${id}:`, error);
      throw error;
    }
  }

  // 실시간 리스너
  subscribe(
    callback: (data: T[]) => void,
    options?: QueryOptions
  ): Unsubscribe {
    const q = options ? this.buildQuery(options) : this.collectionRef;
    
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];
      callback(data);
    }, (error) => {
      console.error('Snapshot error:', error);
    });
  }

  // 트랜잭션 헬퍼
  async runTransaction<R>(
    updateFunction: (transaction: any) => Promise<R>
  ): Promise<R> {
    return runTransaction(this.db, updateFunction);
  }

  // 배치 작업 헬퍼
  createBatch(): WriteBatch {
    return writeBatch(this.db);
  }

  async executeBatch(batch: WriteBatch): Promise<void> {
    try {
      await batch.commit();
    } catch (error) {
      console.error('Error executing batch:', error);
      throw error;
    }
  }

  // 문서 참조 가져오기
  getDocRef(id: string): DocumentReference {
    return doc(this.db, this.collectionName, id);
  }

  // 컬렉션 내 문서 수 카운트
  async count(options?: QueryOptions): Promise<number> {
    try {
      const q = options ? this.buildQuery(options) : this.collectionRef;
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('Error counting documents:', error);
      throw error;
    }
  }

  // 존재 여부 확인
  async exists(id: string): Promise<boolean> {
    try {
      const docRef = doc(this.db, this.collectionName, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      console.error(`Error checking existence of ${id}:`, error);
      throw error;
    }
  }
}