import React, { useState, useEffect } from 'react';
import { ShareIcon, UserIcon, ClockIcon, CopyIcon, TrashIcon, EditIcon } from '../common/Icons';
import { ProjectSummary } from '../../firebase/types';
import { ProjectCollaborator } from '../../firebase/shareLinks';
import { useAuth } from '../../auth/AuthProvider';
import { PiFolderFill } from "react-icons/pi";
import ThumbnailImage from '../common/ThumbnailImage';
import styles from './CollaborationTabs.module.css';
import dashboardStyles from '../../pages/SimpleDashboard.module.css';

interface SharedTabProps {
  onProjectSelect?: (projectId: string) => void;
  sharedByMe?: ProjectSummary[]; // 내가 공유한 프로젝트
  sharedWithMe?: ProjectSummary[]; // 공유받은 프로젝트
  projectDesignFiles?: { [projectId: string]: any[] }; // 프로젝트별 디자인 파일
  projectCollaborators?: { [projectId: string]: ProjectCollaborator[] }; // 프로젝트별 협업자
}

const SharedTab: React.FC<SharedTabProps> = ({
  onProjectSelect,
  sharedByMe = [],
  sharedWithMe = [],
  projectDesignFiles = {},
  projectCollaborators = {}
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

              // 디자인 파일 데이터 가져오기
              const designFiles = projectDesignFiles[project.id] || [];
              const designFile = isDesignShare
                ? designFiles.find(df => df.id === sharedInfo.sharedDesignFileId || df.name === sharedInfo.sharedDesignFileName)
                : undefined;

              // 협업자 정보 가져오기
              const collaborators = projectCollaborators[project.id] || [];

              // 표시할 사용자 결정
              const displayUser = activeSubTab === 'shared-by-me'
                ? user
                : {
                    // 공유받은 프로젝트의 경우 공유한 사람(호스트)의 프로필 정보 사용
                    photoURL: sharedInfo.sharedByPhotoURL,
                    userName: sharedInfo.sharedByName,
                    displayName: sharedInfo.sharedByName,
                    email: null
                  };

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
                          designFile={designFile ? {
                            thumbnail: designFile.thumbnail,
                            updatedAt: designFile.updatedAt,
                            spaceConfig: designFile.spaceConfig,
                            furniture: designFile.furniture
                          } : undefined}
                          className={dashboardStyles.designThumbnailImage}
                          alt={sharedInfo.sharedDesignFileName || project.title}
                        />
                      </div>
                    ) : (
                      // 프로젝트 카드 - 분할 썸네일 (2x2 그리드)
                      (() => {
                        if (designFiles.length === 0) {
                          return (
                            <div className={dashboardStyles.emptyThumbnailState}>
                              <div className={dashboardStyles.emptyThumbnailIcon}>
                                <PiFolderFill size={48} style={{ opacity: 0.3 }} />
                              </div>
                              <div className={dashboardStyles.emptyThumbnailText}>
                                생성된 파일이 없습니다
                              </div>
                            </div>
                          );
                        }

                        const displayItems = designFiles.slice(0, 4); // 최대 4개만 표시

                        return (
                          <div className={dashboardStyles.thumbnailGrid}>
                            {displayItems.map((designFile, index) => (
                              <div key={designFile.id || index} className={dashboardStyles.thumbnailItem}>
                                <ThumbnailImage
                                  project={project}
                                  designFile={{
                                    thumbnail: designFile.thumbnail,
                                    updatedAt: designFile.updatedAt,
                                    spaceConfig: designFile.spaceConfig,
                                    furniture: designFile.furniture
                                  }}
                                  className={dashboardStyles.thumbnailImage}
                                  alt={designFile.name || `디자인 ${index + 1}`}
                                />
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </div>

                  {/* SimpleDashboard와 동일한 cardInfo 구조 */}
                  <div className={dashboardStyles.cardInfo}>
                    <div className={dashboardStyles.cardTitle}>
                      {isDesignShare ? `${project.title} > ${sharedInfo.sharedDesignFileName}` : project.title}
                    </div>
                    <div className={dashboardStyles.cardMeta}>
                      <div className={dashboardStyles.cardDate}>
                        {(() => {
                          const dateToUse = project.updatedAt || project.createdAt;
                          if (dateToUse && dateToUse.seconds) {
                            return new Date(dateToUse.seconds * 1000).toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                          }
                          return '날짜 정보 없음';
                        })()}
                      </div>
                    </div>
                    <div className={dashboardStyles.cardFooter}>
                      <div className={dashboardStyles.cardUser}>
                        <div className={dashboardStyles.cardUserAvatar}>
                          {displayUser?.photoURL ? (
                            <img
                              src={displayUser.photoURL}
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
                          {activeSubTab === 'shared-by-me'
                            ? (user?.displayName || user?.email?.split('@')[0] || '사용자')
                            : ((displayUser as any)?.displayName || (displayUser as any)?.email?.split('@')[0] || '협업자')}
                        </span>
                      </div>

                      {/* 협업자 프로필 사진들 - "내가 공유한 프로젝트"에서만 표시 */}
                      {collaborators.length > 0 && activeSubTab === 'shared-by-me' && (
                        <div style={{
                          display: 'flex',
                          gap: '4px',
                          marginTop: '8px',
                          paddingLeft: '4px'
                        }}>
                          {collaborators.slice(0, 3).map((collaborator) => (
                            <div
                              key={collaborator.userId}
                              title={`${collaborator.userName} (${collaborator.permission === 'editor' ? '편집 가능' : '조회만'})`}
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                border: '2px solid white',
                                backgroundColor: '#e0e0e0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                color: '#666'
                              }}
                            >
                              {collaborator.photoURL ? (
                                <img
                                  src={collaborator.photoURL}
                                  alt={collaborator.userName}
                                  referrerPolicy="no-referrer"
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                  }}
                                />
                              ) : (
                                <UserIcon size={10} />
                              )}
                            </div>
                          ))}
                          {collaborators.length > 3 && (
                            <div
                              title={`+${collaborators.length - 3}명 더`}
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                border: '2px solid white',
                                backgroundColor: '#f0f0f0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                color: '#666'
                              }}
                            >
                              +{collaborators.length - 3}
                            </div>
                          )}
                        </div>
                      )}
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