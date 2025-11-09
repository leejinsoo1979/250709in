import React, { useState, useEffect } from 'react';
import { ShareIcon, UserIcon, ClockIcon, CopyIcon, TrashIcon, EditIcon } from '../common/Icons';
import { ProjectSummary } from '../../firebase/types';
import { useAuth } from '../../auth/AuthProvider';
import { PiFolderFill } from "react-icons/pi";
import ThumbnailImage from '../common/ThumbnailImage';
import styles from './CollaborationTabs.module.css';
import dashboardStyles from '../../pages/SimpleDashboard.module.css';

interface SharedTabProps {
  onProjectSelect?: (projectId: string) => void;
  sharedByMe?: ProjectSummary[]; // 내가 공유한 프로젝트
  sharedWithMe?: ProjectSummary[]; // 공유받은 프로젝트
}

const SharedTab: React.FC<SharedTabProps> = ({
  onProjectSelect,
  sharedByMe = [],
  sharedWithMe = []
}) => {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'shared-by-me' | 'shared-with-me'>('shared-by-me');

  const currentProjects = activeSubTab === 'shared-by-me' ? sharedByMe : sharedWithMe;

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
        </div>
      </div>

      <div className={styles.contentArea}>
        {currentProjects.length === 0 && (
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

        {currentProjects.length > 0 && (
          <div className={dashboardStyles.designGrid}>
            {currentProjects.map((project) => {
              const sharedInfo = project as any;
              const isDesignShare = !!sharedInfo.sharedDesignFileId;

              return (
                <div
                  key={isDesignShare ? `${project.id}_${sharedInfo.sharedDesignFileId}` : project.id}
                  className={dashboardStyles.designCard}
                  onClick={() => onProjectSelect?.(project.id)}
                >
                  <div className={dashboardStyles.cardThumbnail}>
                    {isDesignShare ? (
                      // 디자인 카드 - SimpleDashboard와 동일한 구조
                      <div className={dashboardStyles.designThumbnail}>
                        <ThumbnailImage
                          project={project}
                          className={dashboardStyles.designThumbnailImage}
                          alt={sharedInfo.sharedDesignFileName || project.title}
                        />
                      </div>
                    ) : (
                      // 프로젝트 카드 - SimpleDashboard와 동일한 구조
                      <div className={dashboardStyles.emptyThumbnailState}>
                        <div className={dashboardStyles.emptyThumbnailIcon}>
                          <PiFolderFill size={48} style={{ opacity: 0.3 }} />
                        </div>
                        <div className={dashboardStyles.emptyThumbnailText}>
                          공유된 프로젝트
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SimpleDashboard와 동일한 cardInfo 구조 */}
                  <div className={dashboardStyles.cardInfo}>
                    <div className={dashboardStyles.cardTitle}>
                      {isDesignShare ? sharedInfo.sharedDesignFileName : project.title}
                    </div>
                    <div className={dashboardStyles.cardMeta}>
                      <div className={dashboardStyles.cardDate}>
                        {project.updatedAt?.toDate?.()?.toLocaleDateString('ko-KR') || '날짜 정보 없음'}
                      </div>
                    </div>
                    <div className={dashboardStyles.cardFooter}>
                      <div className={dashboardStyles.cardUser}>
                        <div className={dashboardStyles.cardUserAvatar}>
                          {user?.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt="프로필"
                              referrerPolicy="no-referrer"
                              style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '50%',
                                objectFit: 'cover'
                              }}
                            />
                          ) : (
                            <UserIcon size={12} />
                          )}
                        </div>
                        <span className={dashboardStyles.cardUserName}>
                          {user?.displayName || user?.email?.split('@')[0] || '사용자'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedTab;