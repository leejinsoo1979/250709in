/**
 * 라이브 화면공유 세션 (WebRTC signaling)
 *
 * Firestore 구조:
 *   live-sessions/{sessionId}                     ← 메타데이터 (broadcaster, 상태)
 *     viewers/{viewerUid}                         ← 시청자별 PeerConnection signaling
 *       signals/{signalId}                        ← offer/answer/ICE 후보 메시지
 *
 * sessionId = `${convId}_${broadcasterUid}_${epochMs}` 형식
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  orderBy,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';

export type LiveSessionStatus = 'active' | 'ended';

export interface LiveSessionRecord {
  id: string;
  convId: string;
  broadcasterUid: string;
  broadcasterName?: string;
  status: LiveSessionStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
}

export type SignalKind = 'offer' | 'answer' | 'ice-broadcaster' | 'ice-viewer';

export interface SignalMessage {
  id: string;
  kind: SignalKind;
  payload: any;
  fromUid: string;
  createdAt?: Date | null;
}

function tsToDate(ts?: Timestamp | null): Date | null {
  if (!ts) return null;
  if (typeof (ts as any)?.toDate === 'function') {
    try { return (ts as any).toDate(); } catch { return null; }
  }
  return null;
}

// ============================================
// 세션 라이프사이클
// ============================================

/** 시연자: 새 라이브 세션 시작 */
export async function startLiveSession(params: {
  convId: string;
  broadcasterUid: string;
  broadcasterName?: string;
}): Promise<string> {
  const { convId, broadcasterUid, broadcasterName } = params;
  const sessionId = `${convId}_${broadcasterUid}_${Date.now()}`;
  const ref = doc(db, 'live-sessions', sessionId);
  await setDoc(ref, {
    convId,
    broadcasterUid,
    broadcasterName: broadcasterName || '',
    status: 'active' as LiveSessionStatus,
    startedAt: serverTimestamp(),
    endedAt: null,
  });
  return sessionId;
}

/** 시연자/시스템: 세션 종료 */
export async function endLiveSession(sessionId: string): Promise<void> {
  const ref = doc(db, 'live-sessions', sessionId);
  try {
    await updateDoc(ref, {
      status: 'ended' as LiveSessionStatus,
      endedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[liveSessions] endLiveSession 실패', e);
    throw e;
  }
}

/** 세션 메타 실시간 구독 */
export function subscribeLiveSession(
  sessionId: string,
  cb: (record: LiveSessionRecord | null) => void,
): Unsubscribe {
  const ref = doc(db, 'live-sessions', sessionId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    const data = snap.data() as any;
    cb({
      id: snap.id,
      convId: data.convId,
      broadcasterUid: data.broadcasterUid,
      broadcasterName: data.broadcasterName,
      status: data.status,
      startedAt: tsToDate(data.startedAt),
      endedAt: tsToDate(data.endedAt),
    });
  });
}

/** 대화방 내 활성 라이브 세션 구독 (시청자가 채팅창에서 사용) */
export function subscribeActiveLiveSessionsForConv(
  convId: string,
  cb: (sessions: LiveSessionRecord[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'live-sessions'),
    where('convId', '==', convId),
    where('status', '==', 'active'),
  );
  return onSnapshot(q, (snap) => {
    const list: LiveSessionRecord[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        convId: data.convId,
        broadcasterUid: data.broadcasterUid,
        broadcasterName: data.broadcasterName,
        status: data.status,
        startedAt: tsToDate(data.startedAt),
        endedAt: tsToDate(data.endedAt),
      };
    });
    cb(list);
  });
}

// ============================================
// 시청자 등록 (시연자가 누가 들어왔는지 알기 위함)
// ============================================

/** 시청자: 세션에 join (자기 viewer 문서 생성) */
export async function joinAsViewer(sessionId: string, viewerUid: string): Promise<void> {
  const ref = doc(db, 'live-sessions', sessionId, 'viewers', viewerUid);
  await setDoc(ref, {
    viewerUid,
    joinedAt: serverTimestamp(),
  });
}

/** 시청자: 세션에서 leave (자기 viewer 문서 + signal 정리) */
export async function leaveAsViewer(sessionId: string, viewerUid: string): Promise<void> {
  const ref = doc(db, 'live-sessions', sessionId, 'viewers', viewerUid);
  // signals 서브컬렉션 정리
  try {
    const signalsSnap = await getDocs(collection(ref, 'signals'));
    await Promise.all(signalsSnap.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.warn('[liveSessions] signals 정리 실패', e);
  }
  try {
    await deleteDoc(ref);
  } catch (e) {
    console.warn('[liveSessions] viewer 문서 삭제 실패', e);
  }
}

/** 시연자: 시청자 목록 구독 (새 시청자 join 시 PeerConnection 생성) */
export function subscribeViewers(
  sessionId: string,
  cb: (viewerUids: string[]) => void,
): Unsubscribe {
  const q = collection(db, 'live-sessions', sessionId, 'viewers');
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.id));
  });
}

// ============================================
// Signaling (offer/answer/ICE)
// ============================================

/** signal 전송 (offer/answer/ICE candidate) */
export async function sendSignal(params: {
  sessionId: string;
  viewerUid: string;
  fromUid: string;
  kind: SignalKind;
  payload: any;
}): Promise<void> {
  const { sessionId, viewerUid, fromUid, kind, payload } = params;
  const ref = collection(db, 'live-sessions', sessionId, 'viewers', viewerUid, 'signals');
  await addDoc(ref, {
    kind,
    payload,
    fromUid,
    createdAt: serverTimestamp(),
  });
}

/** signal 구독 (시연자 + 시청자 양쪽이 사용)
 *  - 시연자: viewer 쪽에서 보낸 'answer', 'ice-viewer' 만 처리
 *  - 시청자: broadcaster 쪽에서 보낸 'offer', 'ice-broadcaster' 만 처리
 */
export function subscribeSignals(params: {
  sessionId: string;
  viewerUid: string;
  myUid: string;
  cb: (signal: SignalMessage) => void;
}): Unsubscribe {
  const { sessionId, viewerUid, myUid, cb } = params;
  const q = query(
    collection(db, 'live-sessions', sessionId, 'viewers', viewerUid, 'signals'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      const data = change.doc.data() as any;
      // 자기가 보낸 signal은 무시
      if (data.fromUid === myUid) return;
      cb({
        id: change.doc.id,
        kind: data.kind,
        payload: data.payload,
        fromUid: data.fromUid,
        createdAt: tsToDate(data.createdAt),
      });
    });
  });
}

// ============================================
// ICE 서버 설정
// ============================================

/** 공개 STUN 서버 (대부분의 NAT 환경에서 충분) */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
