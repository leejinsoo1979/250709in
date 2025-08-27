import React, { useState, useEffect } from 'react';
import { ShareIcon, UserIcon, ClockIcon, CopyIcon, TrashIcon, EditIcon } from '../common/Icons';
import { ProjectShare } from '../../firebase/types';
import { 
  getSharedByMeProjects, 
  getSharedWithMeProjects, 
  createShareLink, 
  revokeProjectShare,
  updateSharePermission 
} from '../../firebase/sharing';
import { useAuth } from '../../auth/AuthProvider';
import styles from './CollaborationTabs.module.css';

interface SharedTabProps {
  onProjectSelect?: (projectId: string) => void;
}

const SharedTab: React.FC<SharedTabProps> = ({ onProjectSelect }) => {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'shared-by-me' | 'shared-with-me'>('shared-by-me');
  const [sharedByMe, setSharedByMe] = useState<ProjectShare[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<ProjectShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // 공유 데이터 로드
  const loadSharedData = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [sharedByMeResult, sharedWithMeResult] = await Promise.all([
        getSharedByMeProjects(),
        getSharedWithMeProjects()
      ]);

      if (sharedByMeResult.error) {
        // Firebase 설정이 없을 때는 에러 메시지를 표시하지 않음
        console.warn('내가 공유한 프로젝트 로드 실패:', sharedByMeResult.error);
      } else {
        setSharedByMe(sharedByMeResult.shares);
      }

      if (sharedWithMeResult.error) {
        // Firebase 설정이 없을 때는 에러 메시지를 표시하지 않음
        console.warn('공유 프로젝트 로드 실패:', sharedWithMeResult.error);
      } else {
        setSharedWithMe(sharedWithMeResult.shares);
      }
    } catch (err) {
      setError('공유 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSharedData();
  }, [user]);

  // 공유 링크 생성
  const handleCreateShareLink = async (projectId: string, permission: 'viewer' | 'editor') => {
    try {
      const { shareLink, error } = await createShareLink(projectId, permission, 30); // 30일 만료
      if (error) {
        alert(error);
      } else if (shareLink) {
        navigator.clipboard.writeText(shareLink);
        alert('공유 링크가 클립보드에 복사되었습니다!');
        loadSharedData(); // 새로고침
      }
    } catch (err) {
      alert('공유 링크 생성 중 오류가 발생했습니다.');
    }
  };

  // 공유 취소
  const handleRevokeShare = async (shareId: string) => {
    if (!confirm('정말 공유를 취소하시겠습니까?')) return;
    
    try {
      const { error } = await revokeProjectShare(shareId);
      if (error) {
        alert(error);
      } else {
        loadSharedData(); // 새로고침
      }
    } catch (err) {
      alert('공유 취소 중 오류가 발생했습니다.');
    }
  };

  // 권한 변경
  const handleChangePermission = async (shareId: string, newPermission: 'viewer' | 'editor') => {
    try {
      const { error } = await updateSharePermission(shareId, newPermission);
      if (error) {
        alert(error);
      } else {
        loadSharedData(); // 새로고침
      }
    } catch (err) {
      alert('권한 변경 중 오류가 발생했습니다.');
    }
  };

  const currentShares = activeSubTab === 'shared-by-me' ? sharedByMe : sharedWithMe;

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 className={styles.tabTitle}>
            <ShareIcon size={20} />
            공유 프로젝트
          </h2>
          
          <div className={styles.shareStats} style={{ marginLeft: 'auto', marginRight: '16px' }}>
            <span>
              {activeSubTab === 'shared-by-me' 
                ? `공유한 프로젝트 ${sharedByMe.length}개`
                : `공유받은 프로젝트 ${sharedWithMe.length}개`}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className={styles.subTabs}>
            <button
              className={`${styles.subTab} ${activeSubTab === 'shared-by-me' ? styles.active : ''}`}
              onClick={() => setActiveSubTab('shared-by-me')}
            >
              내가 공유한 프로젝트
            </button>
            <button
              className={`${styles.subTab} ${activeSubTab === 'shared-with-me' ? styles.active : ''}`}
              onClick={() => setActiveSubTab('shared-with-me')}
            >
              공유받은 프로젝트
            </button>
          </div>
          
          {activeSubTab === 'shared-by-me' && (
            <button
              className={styles.shareButton}
              onClick={() => setShowShareModal(true)}
            >
              <ShareIcon size={16} />
              새 공유 만들기
            </button>
          )}
        </div>
      </div>

      <div className={styles.contentArea}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>공유 프로젝트를 불러오는 중...</p>
          </div>
        )}

        {/* 에러 상태는 표시하지 않음 */}

        {!loading && currentShares.length === 0 && (
          <div className={styles.emptyState}>
            <ShareIcon size={48} />
            <h3>
              {activeSubTab === 'shared-by-me' 
                ? '공유한 프로젝트가 없습니다' 
                : '공유받은 프로젝트가 없습니다'}
            </h3>
            <p>
              {activeSubTab === 'shared-by-me' 
                ? '프로젝트를 다른 사람과 공유해보세요.' 
                : '다른 사람이 공유한 프로젝트가 여기에 표시됩니다.'}
            </p>
          </div>
        )}

        {!loading && currentShares.length > 0 && (
          <div className={styles.shareGrid}>
            {currentShares.map((share) => (
              <div
                key={share.id}
                className={styles.shareCard}
                onClick={() => onProjectSelect?.(share.projectId)}
              >
                <div className={styles.shareHeader}>
                  <div className={styles.shareIcon}>
                    <ShareIcon size={20} />
                  </div>
                  <div className={styles.shareActions}>
                    {activeSubTab === 'shared-by-me' && (
                      <>
                        <button
                          className={styles.actionButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (share.shareType === 'link' && share.accessToken) {
                              const shareLink = `${window.location.origin}/shared/${share.id}?token=${share.accessToken}`;
                              navigator.clipboard.writeText(shareLink);
                              alert('공유 링크가 복사되었습니다!');
                            }
                          }}
                          title="링크 복사"
                        >
                          <CopyIcon size={14} />
                        </button>
                        <button
                          className={styles.actionButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            const newPermission = share.permission === 'viewer' ? 'editor' : 'viewer';
                            handleChangePermission(share.id, newPermission);
                          }}
                          title="권한 변경"
                        >
                          <EditIcon size={14} />
                        </button>
                        <button
                          className={`${styles.actionButton} ${styles.danger}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRevokeShare(share.id);
                          }}
                          title="공유 취소"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                <div className={styles.shareContent}>
                  <h4 className={styles.shareTitle}>{share.projectTitle}</h4>
                  <div className={styles.shareMeta}>
                    <div className={styles.shareUser}>
                      <UserIcon size={14} />
                      <span>
                        {activeSubTab === 'shared-by-me' 
                          ? share.sharedWith === 'public' ? '링크 공유' : share.sharedWith
                          : share.ownerEmail}
                      </span>
                    </div>
                    <div className={styles.sharePermission}>
                      <span className={`${styles.permissionBadge} ${styles[share.permission]}`}>
                        {share.permission === 'viewer' ? '보기' : '편집'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.shareDate}>
                    <ClockIcon size={12} />
                    <span>{share.createdAt.toDate().toLocaleDateString()}</span>
                    {share.expiresAt && (
                      <span className={styles.expiryDate}>
                        만료: {share.expiresAt.toDate().toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedTab;