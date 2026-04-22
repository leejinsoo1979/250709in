import React, { useEffect, useState } from 'react';
import { X, User, Mail, Calendar, Shield, LogOut, Settings, ChevronRight, CreditCard, Coins, Edit2, Check } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { signOutUser, auth } from '@/firebase/auth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/useTranslation';
import { getUsageStats, UsageStats, getUserProfile, updateUserProfile } from '@/firebase/userProfiles';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
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
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  // 닉네임 편집 상태
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [displayNameLocal, setDisplayNameLocal] = useState<string | null>(null);

  // 사용량 통계 및 크레딧 가져오기
  useEffect(() => {
    if (isOpen && user) {
      // 슈퍼 관리자 권한 체크 (이메일로도 확인)
      const superAdminEmails = ['sbbc212@gmail.com'];
      const isEmailSuperAdmin = superAdminEmails.includes(user.email || '');

      if (isEmailSuperAdmin) {
        console.log('✅ 슈퍼 관리자 이메일 감지:', user.email);
        setIsSuperAdmin(true);
        setCredits(999999); // 무제한 크레딧 표시
      } else {
        // users 컬렉션에서도 role 체크
        getDoc(doc(db, 'users', user.uid)).then((userDoc) => {
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const isSuperAdminUser = userData.role === 'superadmin';
            setIsSuperAdmin(isSuperAdminUser);

            if (isSuperAdminUser) {
              setCredits(999999); // 무제한 크레딧 표시
            } else {
              getUserProfile().then(({ profile }) => {
                if (profile) {
                  setCredits(profile.credits ?? 200);
                }
              });
            }
          } else {
            getUserProfile().then(({ profile }) => {
              if (profile) {
                setCredits(profile.credits ?? 200);
              }
            });
          }
        });
      }

      getUsageStats().then(({ stats }) => {
        if (stats) {
          setUsageStats(stats);
        }
      });
    }
  }, [isOpen, user]);

  // 닉네임 저장
  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !user) return;
    if (trimmed === (displayNameLocal ?? user.displayName ?? '')) {
      setIsEditingName(false);
      return;
    }
    if (trimmed.length > 30) {
      alert('닉네임은 30자 이내로 입력해주세요');
      return;
    }
    setNameSaving(true);
    try {
      const { error } = await updateUserProfile({ displayName: trimmed });
      if (error) {
        alert(`닉네임 변경 실패: ${error}`);
      } else {
        // Firebase Auth user 객체 갱신
        if (auth.currentUser) {
          await auth.currentUser.reload();
        }
        setDisplayNameLocal(trimmed);
        setIsEditingName(false);
      }
    } catch (e: any) {
      alert(`닉네임 변경 중 오류: ${e?.message || e}`);
    } finally {
      setNameSaving(false);
    }
  };

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
                {isEditingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="text"
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        else if (e.key === 'Escape') setIsEditingName(false);
                      }}
                      disabled={nameSaving}
                      maxLength={30}
                      placeholder="닉네임 입력"
                      style={{
                        fontSize: 15, fontWeight: 600,
                        padding: '4px 8px', borderRadius: 4,
                        border: '1px solid var(--theme-primary, #3b82f6)',
                        background: 'var(--theme-surface, #fff)',
                        color: 'var(--theme-text, #000)',
                        outline: 'none', width: 140,
                      }}
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={nameSaving}
                      title="저장"
                      style={{
                        padding: 4, borderRadius: 4, border: 'none',
                        background: 'var(--theme-primary, #3b82f6)', color: '#fff',
                        cursor: nameSaving ? 'wait' : 'pointer', display: 'flex',
                      }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setIsEditingName(false)}
                      disabled={nameSaving}
                      title="취소"
                      style={{
                        padding: 4, borderRadius: 4, border: '1px solid var(--theme-border, #ddd)',
                        background: 'transparent', color: 'var(--theme-text-muted, #888)',
                        cursor: 'pointer', display: 'flex',
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <h3 className={styles.headerName}>{displayNameLocal ?? user.displayName ?? '사용자'}</h3>
                    <button
                      onClick={() => {
                        setNameInput(displayNameLocal ?? user.displayName ?? '');
                        setIsEditingName(true);
                      }}
                      title="닉네임 수정"
                      style={{
                        padding: 2, borderRadius: 3, border: 'none',
                        background: 'transparent', color: 'var(--theme-text-muted, #888)',
                        cursor: 'pointer', display: 'flex',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-primary, #3b82f6)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--theme-text-muted, #888)'; }}
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                )}
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
              {isSuperAdmin && (
                <button className={`${styles.menuItem} ${styles.adminMenuItem}`} onClick={() => {
                  onClose();
                  navigate('/admin');
                }}>
                  <div className={styles.menuLeft}>
                    <Shield size={18} />
                    <span>관리자 페이지</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              )}
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
              <div className={styles.planBadge}>{isSuperAdmin ? '무제한 플랜' : '무료 플랜'}</div>

              {/* 크레딧 정보 */}
              <div className={styles.creditInfo}>
                <div className={styles.creditLeft}>
                  <div className={styles.creditHeader}>
                    <Coins size={14} />
                    <span>보유 크레딧</span>
                  </div>
                  <div className={styles.creditNote}>
                    {isSuperAdmin ? '무제한 사용 가능' : '디자인 파일당 20 소모'}
                  </div>
                </div>
                <div className={styles.creditAmount}>
                  {isSuperAdmin ? '∞' : credits} <span className={styles.creditUnit}>{isSuperAdmin ? '' : '크레딧'}</span>
                </div>
              </div>

              {usageStats && !isSuperAdmin && (
                <div className={styles.planStats}>
                  <div className={styles.planStat}>
                    <span className={styles.statLabel}>프로젝트</span>
                    <span className={styles.statValue}>
                      {usageStats.projectCount} / {usageStats.maxProjects === -1 ? '∞' : usageStats.maxProjects}
                    </span>
                  </div>
                </div>
              )}
              {!isSuperAdmin && (
                <button
                  className={styles.upgradeButton}
                  onClick={() => {
                    onClose();
                    navigate('/dashboard/profile?section=subscription');
                  }}
                >
                  플랜 업그레이드
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfilePopup;