import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, X, Check } from 'lucide-react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useAuth } from '@/auth/AuthProvider';
import { db } from '@/firebase/config';
import {
  subscribeToNotifications,
  subscribeToUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  type Notification,
} from '@/firebase/notifications';
import { useScrollLock } from '@/hooks/useScrollLock';
import styles from './NotificationCenter.module.css';

export const NotificationCenter: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<Notification | null>(null);
  const [selectedMessageBody, setSelectedMessageBody] = useState('');
  const [isMessageBodyLoading, setIsMessageBodyLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useScrollLock(isOpen || Boolean(selectedMessage));

  const isMessageNotification = (notification: Notification) => (
    notification.type === 'message' ||
    Boolean(notification.messageId) ||
    Boolean(notification.actionUrl?.startsWith('/dashboard/messages'))
  );

  const getNotificationBody = (notification: Notification | null) => {
    if (!notification) return '';
    const data = notification as Notification & {
      content?: string;
      body?: string;
      text?: string;
      description?: string;
    };
    return [
      data.content,
      data.body,
      data.text,
      data.description,
      notification.message,
    ].find(value => typeof value === 'string' && value.trim())?.trim() || '';
  };

  const getConversationIdFromActionUrl = (actionUrl?: string) => {
    if (!actionUrl) return null;
    const match = actionUrl.match(/\/dashboard\/messages\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  };

  const resolveNotificationBody = async (notification: Notification) => {
    const fallbackBody = getNotificationBody(notification);

    try {
      if (notification.messageId) {
        const messageSnap = await getDoc(doc(db, 'messages', notification.messageId));
        if (messageSnap.exists()) {
          const messageData = messageSnap.data() as {
            content?: string;
            message?: string;
            text?: string;
            body?: string;
          };
          const body = [
            messageData.content,
            messageData.message,
            messageData.text,
            messageData.body,
          ].find(value => typeof value === 'string' && value.trim())?.trim();
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
        const latestMessage = messageSnap.docs[0]?.data() as {
          text?: string;
          content?: string;
          message?: string;
          body?: string;
        } | undefined;
        const body = [
          latestMessage?.text,
          latestMessage?.content,
          latestMessage?.message,
          latestMessage?.body,
        ].find(value => typeof value === 'string' && value.trim())?.trim();
        if (body) return body;
      }
    } catch (err) {
      console.error('❌ 메시지 본문 로드 실패:', err);
    }

    return fallbackBody;
  };

  // 알림 실시간 구독
  useEffect(() => {
    if (!user) return;

    const unsubscribeNotifications = subscribeToNotifications(
      user.uid,
      (newNotifications) => {
        console.log('🔔 알림 업데이트:', newNotifications.length, '개');
        console.log('  - 메시지 타입:', newNotifications.filter(n => n.type === 'message').length, '개');
        setNotifications(newNotifications);
      }
    );

    const unsubscribeUnreadCount = subscribeToUnreadCount(user.uid, (count) => {
      setUnreadCount(count);
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeUnreadCount();
    };
  }, [user]);

  // selectedMessage 변경 감지 및 읽음 처리
  useEffect(() => {
    let cancelled = false;

    if (selectedMessage) {
      console.log('💬 메시지 팝업 열림:', selectedMessage);
      setSelectedMessageBody(getNotificationBody(selectedMessage));

      // 메시지 팝업을 여는 순간 읽음 처리
      if (!selectedMessage.isRead && selectedMessage.id) {
        console.log('📖 메시지 팝업 열림 → 즉시 읽음 처리:', selectedMessage.id);
        markNotificationAsRead(selectedMessage.id).catch(err => {
          console.error('❌ 읽음 처리 실패:', err);
        });
      }

      const loadFullMessageBody = async () => {
        setIsMessageBodyLoading(true);
        try {
          const body = await resolveNotificationBody(selectedMessage);
          if (body && !cancelled) {
            setSelectedMessageBody(body);
          }
        } catch (err) {
          console.error('❌ 메시지 본문 로드 실패:', err);
        } finally {
          if (!cancelled) {
            setIsMessageBodyLoading(false);
          }
        }
      };

      void loadFullMessageBody();
    } else {
      console.log('💬 메시지 팝업 닫힘');
      setSelectedMessageBody('');
      setIsMessageBodyLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedMessage]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const markAsReadIfNeeded = (notification: Notification) => {
    if (!notification.isRead && notification.id) {
      markNotificationAsRead(notification.id).catch(err => {
        console.error('❌ 읽음 처리 실패:', err);
      });
    }
  };

  const getNotificationActionUrl = (notification: Notification) => {
    if (notification.actionUrl) return notification.actionUrl;
    if (notification.projectId) return `/configurator?projectId=${encodeURIComponent(notification.projectId)}`;
    if (notification.type === 'message' && notification.id) {
      return `/notification/${encodeURIComponent(notification.id)}`;
    }
    return null;
  };

  const navigateToNotificationTarget = (actionUrl: string) => {
    try {
      const url = new URL(actionUrl, window.location.origin);
      if (url.origin === window.location.origin) {
        navigate(`${url.pathname}${url.search}${url.hash}`);
        return;
      }
      window.location.href = url.toString();
    } catch {
      navigate(actionUrl);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    console.log('🔔 알림 클릭:', notification);
    console.log('  - type:', notification.type);
    console.log('  - title:', notification.title);

    markAsReadIfNeeded(notification);
    const actionUrl = getNotificationActionUrl(notification);
    if (actionUrl) {
      console.log('🔗 알림 대상 페이지 이동:', actionUrl);
      navigateToNotificationTarget(actionUrl);
      setIsOpen(false);
      return;
    }

    console.log('✉️ 알림 내용 팝업 열기');
    setSelectedMessage(notification);
    setIsOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await markAllNotificationsAsRead(user.uid);
  };

  const handleDeleteNotification = async (
    e: React.MouseEvent,
    notificationId: string
  ) => {
    e.stopPropagation();
    await deleteNotification(notificationId);
  };

  const formatTime = (timestamp: any) => {
    const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString('ko-KR');
  };

  if (!user) return null;

  return (
    <>
      <div className={styles.container} ref={dropdownRef}>
        {/* Bell Icon */}
        <button
          className={styles.bellButton}
          onClick={() => setIsOpen(!isOpen)}
          aria-label="알림"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className={styles.badge}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Dropdown with Overlay */}
      {isOpen && createPortal(
        <>
          <div
            className={styles.dropdownOverlay}
            onClick={() => setIsOpen(false)}
          />
          <div className={styles.dropdown} ref={dropdownRef}>
            {/* Header */}
            <div className={styles.header}>
              <h3 className={styles.title}>알림</h3>
              {notifications.length > 0 && (
                <button
                  className={styles.markAllButton}
                  onClick={handleMarkAllAsRead}
                  title="모두 읽음 처리"
                >
                  <Check size={16} style={{ marginRight: '4px' }} />
                  모두 읽음
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className={styles.list}>
              {notifications.length === 0 ? (
                <div className={styles.empty}>
                  <Bell size={32} className={styles.emptyIcon} />
                  <p>새로운 알림이 없습니다</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`${styles.item} ${
                      !notification.isRead ? styles.unread : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className={styles.itemContent}>
                      <div className={styles.itemHeader}>
                        <h4 className={styles.itemTitle}>{notification.title}</h4>
                        {!notification.isRead && (
                          <span className={styles.newBadge}>NEW</span>
                        )}
                      </div>
                      <p className={styles.itemMessage}>{notification.message}</p>
                      <span className={styles.itemTime}>
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      {isMessageNotification(notification) && (
                        <button
                          className={styles.viewButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('👁️ 보기 버튼 클릭:', notification);
                            handleNotificationClick(notification);
                            setIsOpen(false);
                          }}
                          title="보기"
                        >
                          보기
                        </button>
                      )}
                      <button
                        className={styles.deleteButton}
                        onClick={(e) =>
                          handleDeleteNotification(e, notification.id)
                        }
                        title="삭제"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className={styles.footer}>
                <span className={styles.footerText}>
                  총 {notifications.length}개의 알림
                </span>
              </div>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Message Modal */}
      {selectedMessage && createPortal(
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedMessage(null)}
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{selectedMessage.title}</h2>
              <button
                className={styles.modalClose}
                onClick={() => setSelectedMessage(null)}
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.messageContent}>
                {selectedMessageBody || (isMessageBodyLoading ? '메시지 내용을 불러오는 중입니다.' : '표시할 메시지 내용이 없습니다.')}
              </p>
              <div className={styles.messageMeta}>
                <div className={styles.messageSender}>
                  <span>발신:</span>
                  <strong>{selectedMessage.senderName || '관리자'}</strong>
                </div>
                <span>•</span>
                <span>{formatTime(selectedMessage.createdAt)}</span>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.confirmButton}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  console.log('✅ 확인 버튼 클릭됨 → 모달 닫기');
                  setSelectedMessage(null);
                }}
              >
                <Check size={18} style={{ marginRight: '6px' }} />
                확인
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
