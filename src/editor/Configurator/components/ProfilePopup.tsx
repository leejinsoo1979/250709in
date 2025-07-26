import React from 'react';
import { X, User, Mail, Calendar, Shield } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import styles from './ProfilePopup.module.css';

interface ProfilePopupProps {
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; right: number };
}

const ProfilePopup: React.FC<ProfilePopupProps> = ({ isOpen, onClose, position }) => {
  const { user } = useAuth();

  if (!isOpen || !user) return null;

  // 계정 생성일 포맷팅
  const formatCreatedDate = (timestamp: string | number | undefined) => {
    if (!timestamp) return '정보 없음';
    const date = new Date(timestamp);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // 마지막 로그인 시간 포맷팅
  const formatLastSignIn = (timestamp: string | undefined) => {
    if (!timestamp) return '정보 없음';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    
    return date.toLocaleDateString('ko-KR');
  };

  return (
    <>
      {/* 배경 오버레이 */}
      <div className={styles.overlay} onClick={onClose} />
      
      {/* 프로필 팝업 */}
      <div className={styles.popup} style={{ top: position.top, right: position.right }}>
        <div className={styles.header}>
          <h3 className={styles.title}>프로필 정보</h3>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          {/* 프로필 이미지 */}
          <div className={styles.avatarSection}>
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || '사용자'} className={styles.avatar} />
            ) : (
              <div className={styles.avatarPlaceholder}>
                <User size={40} />
              </div>
            )}
          </div>

          {/* 사용자 정보 */}
          <div className={styles.infoSection}>
            <div className={styles.infoItem}>
              <User size={16} className={styles.icon} />
              <div className={styles.infoContent}>
                <span className={styles.label}>이름</span>
                <span className={styles.value}>{user.displayName || '설정되지 않음'}</span>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Mail size={16} className={styles.icon} />
              <div className={styles.infoContent}>
                <span className={styles.label}>이메일</span>
                <span className={styles.value}>{user.email}</span>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Shield size={16} className={styles.icon} />
              <div className={styles.infoContent}>
                <span className={styles.label}>인증 방법</span>
                <span className={styles.value}>
                  {user.providerData?.[0]?.providerId === 'google.com' ? 'Google' : 
                   user.providerData?.[0]?.providerId === 'password' ? '이메일/비밀번호' : 
                   '기타'}
                </span>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Calendar size={16} className={styles.icon} />
              <div className={styles.infoContent}>
                <span className={styles.label}>가입일</span>
                <span className={styles.value}>
                  {formatCreatedDate(user.metadata?.creationTime)}
                </span>
              </div>
            </div>

            <div className={styles.infoItem}>
              <Calendar size={16} className={styles.icon} />
              <div className={styles.infoContent}>
                <span className={styles.label}>마지막 로그인</span>
                <span className={styles.value}>
                  {formatLastSignIn(user.metadata?.lastSignInTime)}
                </span>
              </div>
            </div>
          </div>

          {/* UID (개발자용) */}
          <div className={styles.uidSection}>
            <span className={styles.uidLabel}>사용자 ID</span>
            <code className={styles.uid}>{user.uid}</code>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfilePopup;