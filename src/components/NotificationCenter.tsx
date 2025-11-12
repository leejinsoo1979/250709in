import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
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
import styles from './NotificationCenter.module.css';

export const NotificationCenter: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<Notification | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 알림 실시간 구독
  useEffect(() => {
    if (!user) return;

    const unsubscribeNotifications = subscribeToNotifications(
      user.uid,
      (newNotifications) => {
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
    // 읽지 않은 알림이면 읽음 처리
    if (!notification.isRead) {
      await markNotificationAsRead(notification.id);
    }

    // 메시지 타입이면 팝업으로 표시
    if (notification.type === 'message') {
      setSelectedMessage(notification);
      setIsOpen(false);
      return;
    }

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

        {/* Dropdown */}
        {isOpen && (
          <div className={styles.dropdown}>
            {/* Header */}
            <div className={styles.header}>
              <h3 className={styles.title}>알림</h3>
              {notifications.length > 0 && (
                <button
                  className={styles.markAllButton}
                  onClick={handleMarkAllAsRead}
                  title="모두 읽음 처리"
                >
                  <CheckCheck size={18} />
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
                          <span className={styles.unreadDot} />
                        )}
                      </div>
                      <p className={styles.itemMessage}>{notification.message}</p>
                      <span className={styles.itemTime}>
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
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
        )}
      </div>

      {/* Message Modal */}
      {selectedMessage && (
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
          </div>
        </div>
      )}
    </>
  );
};
