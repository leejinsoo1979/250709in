import React, { useEffect, useState } from 'react';
import { X, User, Mail, Calendar, Shield, LogOut, Settings, ChevronRight, CreditCard, Coins } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { signOutUser } from '@/firebase/auth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/useTranslation';
import { getUsageStats, UsageStats, getUserProfile } from '@/firebase/userProfiles';
import styles from './ProfilePopup.module.css';

interface ProfilePopupProps {
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; right: number };
}

const ProfilePopup: React.FC<ProfilePopupProps> = ({ isOpen, onClose, position }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, currentLanguage } = useTranslation();
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [credits, setCredits] = useState<number>(0);

  // 사용량 통계 및 크레딧 가져오기
  useEffect(() => {
    if (isOpen && user) {
      getUsageStats().then(({ stats }) => {
        if (stats) {
          setUsageStats(stats);
        }
      });

      getUserProfile().then(({ profile }) => {
        if (profile) {
          setCredits(profile.credits || 0);
        }
      });
    }
  }, [isOpen, user]);

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
            <h4 className={styles.sectionTitle}>{t('profile.accountInfo')}</h4>
            <div className={styles.infoSection}>
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>
                <Shield size={18} />
                <span>{t('profile.authMethod')}</span>
              </div>
              <span className={styles.infoValue}>
                {user.providerData?.[0]?.providerId === 'google.com' ? t('profile.googleAccount') : 
                 user.providerData?.[0]?.providerId === 'password' ? t('profile.emailAuth') : 
                 t('profile.other')}
              </span>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>
                <Calendar size={18} />
                <span>{t('profile.joinDate')}</span>
              </div>
              <span className={styles.infoValue}>
                {formatCreatedDate(user.metadata?.creationTime)}
              </span>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>
                <Calendar size={18} />
                <span>{t('profile.lastActivity')}</span>
              </div>
              <span className={styles.infoValue}>
                {formatLastSignIn(user.metadata?.lastSignInTime)}
              </span>
            </div>
            </div>
          </div>

          {/* 빠른 메뉴 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>{t('profile.quickMenu')}</h4>
            <div className={styles.menuSection}>
              <button className={styles.menuItem} onClick={() => {
                onClose();
                navigate('/dashboard/profile?section=account');
              }}>
                <div className={styles.menuLeft}>
                  <Settings size={18} />
                  <span>{t('profile.accountSettings')}</span>
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
                  <span>{t('common.logout')}</span>
                </div>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* 구독 정보 */}
          <div className={styles.subscriptionSection}>
            <div className={styles.subscriptionHeader}>
              <CreditCard size={16} />
              <span className={styles.subscriptionLabel}>구독 플랜</span>
            </div>
            <div className={styles.subscriptionContent}>
              <div className={styles.planBadge}>무료 플랜</div>

              {/* 크레딧 정보 */}
              <div className={styles.creditInfo}>
                <div className={styles.creditHeader}>
                  <Coins size={16} />
                  <span>보유 크레딧</span>
                </div>
                <div className={styles.creditAmount}>
                  {credits} <span className={styles.creditUnit}>크레딧</span>
                </div>
                <div className={styles.creditNote}>
                  디자인 파일 생성 시 20 크레딧 소모
                </div>
              </div>

              {usageStats && (
                <div className={styles.planStats}>
                  <div className={styles.planStat}>
                    <span className={styles.statLabel}>프로젝트</span>
                    <span className={styles.statValue}>{usageStats.projectCount} / {usageStats.maxProjects}</span>
                  </div>
                  <div className={styles.planStat}>
                    <span className={styles.statLabel}>저장 공간</span>
                    <span className={styles.statValue}>
                      {(usageStats.storageUsed / (1024 * 1024)).toFixed(1)}MB / {usageStats.maxStorage / (1024 * 1024)}MB
                    </span>
                  </div>
                </div>
              )}
              <button
                className={styles.upgradeButton}
                onClick={() => {
                  onClose();
                  navigate('/dashboard/profile?section=subscription');
                }}
              >
                플랜 업그레이드
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfilePopup;