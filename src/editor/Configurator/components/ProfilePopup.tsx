import React from 'react';
import { X, User, Mail, Calendar, Shield, LogOut, Settings, ChevronRight } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { signOutUser } from '@/firebase/auth';
import { useNavigate } from 'react-router-dom';
import styles from './ProfilePopup.module.css';

interface ProfilePopupProps {
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; right: number };
}

const ProfilePopup: React.FC<ProfilePopupProps> = ({ isOpen, onClose, position }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

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
          <div className={styles.headerContent}>
            <div className={styles.headerLeft}>
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || '사용자'} className={styles.headerAvatar} />
              ) : (
                <div className={styles.headerAvatarPlaceholder}>
                  <User size={20} />
                </div>
              )}
              <div className={styles.headerInfo}>
                <h3 className={styles.headerName}>{user.displayName || '사용자'}</h3>
                <p className={styles.headerEmail}>{user.email}</p>
              </div>
            </div>
            <button className={styles.closeButton} onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className={styles.content}>

          {/* 사용자 정보 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>계정 정보</h4>
            <div className={styles.infoSection}>
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>
                <Shield size={18} />
                <span>인증 방법</span>
              </div>
              <span className={styles.infoValue}>
                {user.providerData?.[0]?.providerId === 'google.com' ? 'Google 계정' : 
                 user.providerData?.[0]?.providerId === 'password' ? '이메일 인증' : 
                 '기타'}
              </span>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>
                <Calendar size={18} />
                <span>가입일</span>
              </div>
              <span className={styles.infoValue}>
                {formatCreatedDate(user.metadata?.creationTime)}
              </span>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>
                <Calendar size={18} />
                <span>마지막 활동</span>
              </div>
              <span className={styles.infoValue}>
                {formatLastSignIn(user.metadata?.lastSignInTime)}
              </span>
            </div>
            </div>
          </div>

          {/* 빠른 메뉴 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>빠른 메뉴</h4>
            <div className={styles.menuSection}>
              <button className={styles.menuItem}>
                <div className={styles.menuLeft}>
                  <Settings size={18} />
                  <span>계정 설정</span>
                </div>
                <ChevronRight size={16} />
              </button>
              <button className={styles.menuItem} onClick={async () => {
                // 로그아웃 처리
                await signOutUser();
                navigate('/auth');
              }}>
                <div className={styles.menuLeft}>
                  <LogOut size={18} />
                  <span>로그아웃</span>
                </div>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* UID (개발자용) - 더 작게 */}
          <div className={styles.uidSection}>
            <span className={styles.uidLabel}>User ID</span>
            <code className={styles.uid}>{user.uid}</code>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfilePopup;