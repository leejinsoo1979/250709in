import React, { useState, useEffect } from 'react';
import { subscribeToNotificationCount, unsubscribeAll } from '../../firebase/realtime';
import { useAuth } from '../../auth/AuthProvider';
import styles from './NotificationBadge.module.css';

interface NotificationBadgeProps {
  children: React.ReactNode;
  className?: string;
}

const NotificationBadge: React.FC<NotificationBadgeProps> = ({ children, className }) => {
  const { user } = useAuth();
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setNotificationCount(0);
      return;
    }

    let unsubscribes: any[] = [];

    // 실시간 알림 카운터 구독
    const setupNotificationListener = async () => {
      try {
        const listeners = await subscribeToNotificationCount((count) => {
          setNotificationCount(count);
        });
        unsubscribes = listeners;
      } catch (error) {
        console.error('알림 리스너 설정 에러:', error);
      }
    };

    setupNotificationListener();

    // 컴포넌트 언마운트 시 리스너 해제
    return () => {
      unsubscribeAll(unsubscribes);
    };
  }, [user]);

  return (
    <div className={`${styles.notificationBadge} ${className || ''}`}>
      {children}
      {notificationCount > 0 && (
        <span className={styles.badge}>
          {notificationCount > 99 ? '99+' : notificationCount}
        </span>
      )}
    </div>
  );
};

export default NotificationBadge;