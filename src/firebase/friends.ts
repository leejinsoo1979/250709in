/**
 * 친구/메신저 헬퍼
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
  onSnapshot,
  addDoc,
  limit as fsLimit,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './config';

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface FriendRequestRecord {
  id: string;
  fromUid: string;
  toUid: string;
  fromName?: string;
  fromEmail?: string;
  toName?: string;
  toEmail?: string;
  status: FriendRequestStatus;
  createdAt?: Date | null;
  respondedAt?: Date | null;
}

export interface FriendRecord {
  uid: string;
  name?: string;
  email?: string;
  photoURL?: string;
  createdAt?: Date | null;
}

export interface ConversationRecord {
  id: string;
  members: string[];
  lastMessage?: string;
  lastMessageAt?: Date | null;
  lastSenderId?: string;
  unread?: Record<string, number>;
  // 표시용 (조회 후 채움)
  peerUid?: string;
  peerName?: string;
  peerEmail?: string;
  peerPhotoURL?: string;
}

export type MessageAttachmentKind = 'image' | 'file';

export interface MessageAttachment {
  kind: MessageAttachmentKind;
  url: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface MessageRecord {
  id: string;
  senderId: string;
  text: string;
  createdAt?: Date | null;
  readBy?: string[];
  attachments?: MessageAttachment[];
}

/** 메시지 첨부 파일 업로드 (Firebase Storage → MessageAttachment 반환) */
export async function uploadMessageAttachment(
  convId: string,
  senderId: string,
  file: File,
): Promise<MessageAttachment> {
  const safeName = file.name.replace(/[^\w.\-가-힣]/g, '_');
  const path = `chat-attachments/${convId}/${Date.now()}_${senderId}_${safeName}`;
  const sref = storageRef(storage, path);
  await uploadBytes(sref, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(sref);
  const isImage = (file.type || '').startsWith('image/');
  return {
    kind: isImage ? 'image' : 'file',
    url,
    name: file.name,
    size: file.size,
    mimeType: file.type || undefined,
  };
}

const tsToDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  return null;
};

export const conversationIdFor = (a: string, b: string) => {
  return [a, b].sort().join('_');
};

const requestIdFor = (from: string, to: string) => `${from}_${to}`;

/** 이메일로 사용자 조회 */
export async function findUserByEmail(email: string): Promise<{ uid: string; name?: string; email?: string; photoURL?: string } | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', target));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data() as any;
  return {
    uid: d.id,
    name: data.displayName || data.name || '',
    email: data.email || target,
    photoURL: data.photoURL || '',
  };
}

/** 친구 요청 보내기 */
export async function sendFriendRequest(params: {
  fromUid: string;
  fromName?: string;
  fromEmail?: string;
  toUid: string;
  toName?: string;
  toEmail?: string;
}): Promise<string> {
  const { fromUid, toUid } = params;
  if (fromUid === toUid) throw new Error('자기 자신에게 친구 요청을 보낼 수 없습니다.');
  // 이미 친구인지 확인
  const friendDoc = await getDoc(doc(db, 'friends', fromUid, 'list', toUid));
  if (friendDoc.exists()) throw new Error('이미 친구입니다.');
  // 이미 보낸 요청이 있는지
  const reqId = requestIdFor(fromUid, toUid);
  const reqDoc = await getDoc(doc(db, 'friendRequests', reqId));
  if (reqDoc.exists() && (reqDoc.data() as any).status === 'pending') {
    throw new Error('이미 친구 요청을 보냈습니다.');
  }
  // 반대 방향 요청이 있는지 (있으면 자동 수락하도록)
  const reverseReqId = requestIdFor(toUid, fromUid);
  const reverseDoc = await getDoc(doc(db, 'friendRequests', reverseReqId));
  if (reverseDoc.exists() && (reverseDoc.data() as any).status === 'pending') {
    await respondFriendRequest(reverseReqId, 'accepted');
    return reverseReqId;
  }
  await setDoc(doc(db, 'friendRequests', reqId), {
    fromUid,
    toUid,
    fromName: params.fromName || '',
    fromEmail: params.fromEmail || '',
    toName: params.toName || '',
    toEmail: params.toEmail || '',
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  // 수신자에게 알림 생성 (종 아이콘에 표시)
  try {
    const notifId = doc(collection(db, 'notifications')).id;
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      userId: toUid,
      type: 'system',
      title: '친구 요청',
      message: `${params.fromName || params.fromEmail || '누군가'}님이 친구 요청을 보냈습니다.`,
      sharedBy: fromUid,
      sharedByName: params.fromName || '',
      actionUrl: '/dashboard/friends',
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('[친구요청 알림 생성 실패]', e);
  }
  return reqId;
}

/** 친구 요청 응답 (수락/거절) */
export async function respondFriendRequest(reqId: string, action: 'accepted' | 'rejected'): Promise<void> {
  const reqRef = doc(db, 'friendRequests', reqId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error('요청을 찾을 수 없습니다.');
  const data = reqSnap.data() as any;
  await updateDoc(reqRef, {
    status: action,
    respondedAt: serverTimestamp(),
  });
  if (action === 'accepted') {
    // 양방향 미러링
    await Promise.all([
      setDoc(doc(db, 'friends', data.fromUid, 'list', data.toUid), {
        uid: data.toUid,
        name: data.toName || '',
        email: data.toEmail || '',
        createdAt: serverTimestamp(),
      }),
      setDoc(doc(db, 'friends', data.toUid, 'list', data.fromUid), {
        uid: data.fromUid,
        name: data.fromName || '',
        email: data.fromEmail || '',
        createdAt: serverTimestamp(),
      }),
    ]);
  }
}

/** 친구 요청 취소 (송신자) */
export async function cancelFriendRequest(reqId: string): Promise<void> {
  await deleteDoc(doc(db, 'friendRequests', reqId));
}

/** 받은 친구 요청 실시간 구독 */
export function subscribeReceivedRequests(uid: string, cb: (list: FriendRequestRecord[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'friendRequests'),
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const list: FriendRequestRecord[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        fromUid: data.fromUid,
        toUid: data.toUid,
        fromName: data.fromName,
        fromEmail: data.fromEmail,
        toName: data.toName,
        toEmail: data.toEmail,
        status: data.status,
        createdAt: tsToDate(data.createdAt),
        respondedAt: tsToDate(data.respondedAt),
      };
    });
    cb(list);
  });
}

/** 친구 목록 실시간 구독 */
export function subscribeFriends(uid: string, cb: (list: FriendRecord[]) => void): Unsubscribe {
  const q = query(collection(db, 'friends', uid, 'list'));
  return onSnapshot(q, (snap) => {
    const list: FriendRecord[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        uid: data.uid || d.id,
        name: data.name || '',
        email: data.email || '',
        photoURL: data.photoURL || '',
        createdAt: tsToDate(data.createdAt),
      };
    });
    cb(list);
  });
}

/** 친구 삭제 (양쪽 모두 제거) */
export async function removeFriend(myUid: string, friendUid: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'friends', myUid, 'list', friendUid)),
    deleteDoc(doc(db, 'friends', friendUid, 'list', myUid)),
  ]);
}

/** 대화방 보장 (없으면 생성) */
export async function ensureConversation(myUid: string, peerUid: string): Promise<string> {
  const convId = conversationIdFor(myUid, peerUid);
  const ref = doc(db, 'conversations', convId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      members: [myUid, peerUid],
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      lastSenderId: '',
      unread: { [myUid]: 0, [peerUid]: 0 },
      createdAt: serverTimestamp(),
    });
  }
  return convId;
}

/** 메시지 전송 */
export async function sendMessage(
  convId: string,
  senderId: string,
  text: string,
  attachments?: MessageAttachment[],
): Promise<void> {
  const trimmed = (text || '').trim();
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!trimmed && !hasAttachments) return;
  const convRef = doc(db, 'conversations', convId);
  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) throw new Error('대화방이 없습니다.');
  const conv = convSnap.data() as any;
  const peerUid = (conv.members as string[]).find((u) => u !== senderId);
  const messagePayload: Record<string, unknown> = {
    senderId,
    text: trimmed,
    createdAt: serverTimestamp(),
    readBy: [senderId],
  };
  if (hasAttachments) {
    messagePayload.attachments = attachments;
  }
  await addDoc(collection(convRef, 'messages'), messagePayload);
  const unread = { ...(conv.unread || {}) };
  unread[senderId] = 0;
  if (peerUid) unread[peerUid] = (unread[peerUid] || 0) + 1;
  const lastMessagePreview = trimmed || (hasAttachments
    ? (attachments![0].kind === 'image' ? '🖼 이미지' : `📎 ${attachments![0].name || '파일'}`)
    : '');
  await updateDoc(convRef, {
    lastMessage: lastMessagePreview,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    unread,
  });
  // 수신자에게 알림 생성 (종 아이콘에 표시)
  if (peerUid) {
    try {
      // 발신자 이름 조회
      let senderName = '';
      try {
        const u = await getDoc(doc(db, 'users', senderId));
        if (u.exists()) {
          const ud = u.data() as any;
          senderName = ud.displayName || ud.name || '';
        }
      } catch {}
      const notifId = doc(collection(db, 'notifications')).id;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: peerUid,
        type: 'message',
        title: senderName ? `${senderName}님의 메시지` : '새 메시지',
        message: trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed,
        senderId,
        senderName,
        actionUrl: `/dashboard/messages/${convId}`,
        isRead: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('[메시지 알림 생성 실패]', e);
    }
  }
}

/** 대화방 메시지 실시간 구독 */
export function subscribeMessages(convId: string, cb: (list: MessageRecord[]) => void): Unsubscribe {
  const q = query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'asc'), fsLimit(500));
  return onSnapshot(q, (snap) => {
    const list: MessageRecord[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        senderId: data.senderId,
        text: data.text,
        createdAt: tsToDate(data.createdAt),
        readBy: data.readBy || [],
        attachments: Array.isArray(data.attachments) ? data.attachments : undefined,
      };
    });
    cb(list);
  });
}

/** 내 대화방 목록 실시간 구독 */
export function subscribeMyConversations(myUid: string, cb: (list: ConversationRecord[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('members', 'array-contains', myUid)
  );
  return onSnapshot(q, async (snap) => {
    const conversations: ConversationRecord[] = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() as any;
        const members: string[] = data.members || [];
        const peerUid = members.find((u) => u !== myUid) || '';
        let peerName = '';
        let peerEmail = '';
        let peerPhotoURL = '';
        if (peerUid) {
          try {
            const u = await getDoc(doc(db, 'users', peerUid));
            if (u.exists()) {
              const ud = u.data() as any;
              peerName = ud.displayName || ud.name || '';
              peerEmail = ud.email || '';
              peerPhotoURL = ud.photoURL || '';
            }
          } catch {}
        }
        return {
          id: d.id,
          members,
          lastMessage: data.lastMessage || '',
          lastMessageAt: tsToDate(data.lastMessageAt),
          lastSenderId: data.lastSenderId,
          unread: data.unread || {},
          peerUid,
          peerName,
          peerEmail,
          peerPhotoURL,
        };
      })
    );
    conversations.sort((a, b) => {
      const ta = a.lastMessageAt?.getTime() || 0;
      const tb = b.lastMessageAt?.getTime() || 0;
      return tb - ta;
    });
    cb(conversations);
  });
}

/** 내 unread 카운트 0으로 초기화 */
export async function markConversationRead(convId: string, myUid: string): Promise<void> {
  const ref = doc(db, 'conversations', convId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as any;
  const unread = { ...(data.unread || {}) };
  if (unread[myUid] === 0) return;
  unread[myUid] = 0;
  await updateDoc(ref, { unread });
}
