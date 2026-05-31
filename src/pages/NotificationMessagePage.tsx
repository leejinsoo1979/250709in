import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { db } from '@/firebase/config';
import { markNotificationAsRead, type Notification } from '@/firebase/notifications';
import styles from './NotificationMessagePage.module.css';

type MessageBodyFields = {
  content?: string;
  message?: string;
  text?: string;
  body?: string;
  description?: string;
};

const firstText = (...values: Array<string | undefined>) => (
  values.find(value => typeof value === 'string' && value.trim())?.trim() || ''
);

const formatTime = (timestamp: any) => {
  const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getConversationIdFromActionUrl = (actionUrl?: string) => {
  if (!actionUrl) return null;
  const match = actionUrl.match(/\/dashboard\/messages\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const resolveNotificationBody = async (notification: Notification) => {
  const fallback = firstText(
    (notification as Notification & MessageBodyFields).content,
    (notification as Notification & MessageBodyFields).body,
    (notification as Notification & MessageBodyFields).text,
    (notification as Notification & MessageBodyFields).description,
    notification.message
  );

  if (notification.messageId) {
    const messageSnap = await getDoc(doc(db, 'messages', notification.messageId));
    if (messageSnap.exists()) {
      const data = messageSnap.data() as MessageBodyFields;
      const body = firstText(data.content, data.message, data.text, data.body, data.description);
      if (body) return body;
    }
  }

  const conversationId = getConversationIdFromActionUrl(notification.actionUrl);
  if (conversationId) {
    const messageQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const messageSnap = await getDocs(messageQuery);
    const latestMessage = messageSnap.docs[0]?.data() as MessageBodyFields | undefined;
    const body = firstText(
      latestMessage?.text,
      latestMessage?.content,
      latestMessage?.message,
      latestMessage?.body,
      latestMessage?.description
    );
    if (body) return body;
  }

  return fallback;
};

const NotificationMessagePage: React.FC = () => {
  const { notificationId } = useParams<{ notificationId: string }>();
  const { user, loading: authLoading } = useAuth();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setError('로그인이 필요합니다.');
      setLoading(false);
      return;
    }
    if (!notificationId) {
      setError('알림 정보를 찾을 수 없습니다.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadNotification = async () => {
      setLoading(true);
      setError('');
      try {
        const snap = await getDoc(doc(db, 'notifications', notificationId));
        if (!snap.exists()) {
          throw new Error('알림을 찾을 수 없습니다.');
        }

        const loaded = {
          ...(snap.data() as Omit<Notification, 'id'>),
          id: snap.id,
        } as Notification;

        if (loaded.userId !== user.uid) {
          throw new Error('이 알림을 볼 권한이 없습니다.');
        }

        const resolvedBody = await resolveNotificationBody(loaded);
        if (!loaded.isRead) {
          await markNotificationAsRead(loaded.id);
        }

        if (!cancelled) {
          setNotification(loaded);
          setBody(resolvedBody);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || '알림을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadNotification();

    return () => {
      cancelled = true;
    };
  }, [authLoading, notificationId, user]);

  if (authLoading || loading) {
    return <LoadingSpinner fullscreen message="알림 메시지를 불러오는 중..." />;
  }

  if (error || !notification) {
    return (
      <main className={styles.page}>
        <div className={styles.status}>{error || '알림을 표시할 수 없습니다.'}</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.label}>알림 메시지</div>
          <h1 className={styles.title}>{notification.title || '알림'}</h1>
        </header>

        <article className={styles.body}>
          {body || '표시할 메시지 내용이 없습니다.'}
        </article>

        <div className={styles.meta}>
          <span>발신: <strong>{notification.senderName || '관리자'}</strong></span>
          <span>•</span>
          <span>{formatTime(notification.createdAt)}</span>
        </div>

        <footer className={styles.footer}>
          <button className={styles.button} type="button" onClick={() => window.close()}>
            확인
          </button>
        </footer>
      </section>
    </main>
  );
};

export default NotificationMessagePage;
