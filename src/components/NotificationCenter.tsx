import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Check } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  useScrollLock(isOpen || Boolean(selectedMessage));

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

  // selectedMessage 변경 감지
  useEffect(() => {
    if (selectedMessage) {
      console.log('💬 메시지 팝업 열림:', selectedMessage);
    } else {
      console.log('💬 메시지 팝업 닫힘');
    }
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

  const handleNotificationClick = async (notification: Notification) => {
    console.log('🔔 알림 클릭:', notification);
    console.log('  - type:', notification.type);
    console.log('  - title:', notification.title);

    // 메시지 타입이면 팝업으로 표시 (읽음 처리는 확인 버튼에서)
    if (notification.type === 'message') {
      console.log('✉️ 메시지 알림 → 팝업 열기 (읽음 처리는 확인 버튼에서)');
      setSelectedMessage(notification);
      setIsOpen(false);
      return;
    }

    // 메시지가 아닌 알림은 클릭 시 바로 읽음 처리
    if (!notification.isRead) {
      await markNotificationAsRead(notification.id);
    }

    console.log('📍 다른 타입 알림 → URL 이동');
    // 액션 URL이 있으면 이동
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }

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
    const date = timestamp.toDate();
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
                      {notification.type === 'message' && (
                        <button
                          className={styles.viewButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('👁️ 보기 버튼 클릭:', notification);
                            setSelectedMessage(notification);
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
              <p className={styles.messageContent}>{selectedMessage.message}</p>
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
                  console.log('✅ 확인 버튼 클릭됨');

                  // 즉시 모달 닫기
                  const messageId = selectedMessage.id;
                  const isAlreadyRead = selectedMessage.isRead;
                  setSelectedMessage(null);
                  console.log('❌ 모달 닫힘');

                  // 백그라운드에서 읽음 처리 (이미 읽은 경우에도 실행하여 안전성 확보)
                  console.log('📖 백그라운드에서 읽음 처리:', messageId, '(이미 읽음:', isAlreadyRead, ')');
                  markNotificationAsRead(messageId).catch(err => {
                    console.error('❌ 읽음 처리 실패:', err);
                  });
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
