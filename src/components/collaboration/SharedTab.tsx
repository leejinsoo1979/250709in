import React, { useState, useEffect } from 'react';
import { ShareIcon, UserIcon, ClockIcon, CopyIcon, TrashIcon, EditIcon } from '../common/Icons';
import { ProjectSummary } from '../../firebase/types';
import { useAuth } from '../../auth/AuthProvider';
import styles from './CollaborationTabs.module.css';

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
          <div className={styles.shareGrid}>
            {currentProjects.map((project) => {
              const sharedInfo = project as any;
              return (
                <div
                  key={project.id}
                  className={styles.shareCard}
                  onClick={() => onProjectSelect?.(project.id)}
                >
                  <div className={styles.shareHeader}>
                    <div className={styles.shareIcon}>
                      <ShareIcon size={20} />
                    </div>
                  </div>

                  <div className={styles.shareContent}>
                    <h4 className={styles.shareTitle}>{project.title}</h4>
                    <div className={styles.shareMeta}>
                      {activeSubTab === 'shared-with-me' && sharedInfo.sharedDesignFileName && (
                        <div className={styles.shareUser}>
                          <EditIcon size={14} />
                          <span>{sharedInfo.sharedDesignFileName}</span>
                        </div>
                      )}
                      <div className={styles.shareTime}>
                        <ClockIcon size={14} />
                        <span>
                          {project.updatedAt?.toDate?.()?.toLocaleDateString() || '날짜 없음'}
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