import React, { useState } from 'react';
import { ProjectSummary } from '../../firebase/types';
import { 
  FolderIcon, 
  StarIcon, 
  ForkIcon, 
  ClockIcon, 
  ChartIcon, 
  PaletteIcon, 
  DocumentIcon, 
  MoreIcon,
  RocketIcon,
  ClipboardIcon,
  EyeIcon,
  EditIcon,
  TrashIcon
} from './Icons';
import styles from './ProjectCard.module.css';

interface ProjectCardProps {
  project: ProjectSummary;
  onOpen: (id: string) => void;
  onMenuClick: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  viewMode?: 'grid' | 'list';
}

const ProjectCard: React.FC<ProjectCardProps> = ({ 
  project, 
  onOpen, 
  onMenuClick, 
  viewMode = 'grid' 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const formatDate = (timestamp: { seconds?: number } | Date | string | null | undefined): string => {
    try {
      if (typeof timestamp === 'object' && timestamp !== null && !(timestamp instanceof Date) && 'seconds' in timestamp && timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } else if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      return new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return '날짜 없음';
    }
  };

  return (
    <div 
      className={`${styles.projectCard} ${styles[viewMode]}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onOpen(project.id)}
    >
      <div className={styles.cardContent}>
        <div className={styles.thumbnail}>
          {(() => {
            console.log('🖼️ ProjectCard thumbnail 체크:', {
              title: project.title,
              hasThumbnail: !!project.thumbnail,
              thumbnailType: typeof project.thumbnail,
              thumbnailStart: project.thumbnail?.substring(0, 30)
            });
            return project.thumbnail ? (
              <img 
                src={project.thumbnail} 
                alt={project.title} 
                className={styles.thumbnailImage}
                onLoad={() => console.log('✅ 썸네일 로드 성공:', project.title)}
                onError={(e) => console.error('❌ 썸네일 로드 실패:', project.title, e)}
              />
            ) : (
              <div className={styles.placeholderThumbnail}>
                <FolderIcon size={32} />
              </div>
            );
          })()}
        </div>
        
        <div className={styles.projectInfo}>
          <div className={styles.projectHeader}>
            <h3 className={styles.projectTitle}>
              <FolderIcon size={16} className={styles.projectIcon} />
              {project.title}
            </h3>
            <button 
              className={styles.moreButton}
              onClick={(e) => onMenuClick(project.id, e)}
            >
              <MoreIcon size={16} />
            </button>
          </div>
          
          <p className={styles.projectDescription}>
            가구 설계 프로젝트 • React + Three.js
          </p>
          
          <div className={styles.projectStats}>
            <div className={styles.statItem}>
              <ChartIcon size={14} className={styles.statIcon} />
              <span className={styles.statLabel}>JavaScript</span>
              <span className={styles.statValue}>86.0%</span>
            </div>
            <div className={styles.statItem}>
              <PaletteIcon size={14} className={styles.statIcon} />
              <span className={styles.statLabel}>CSS</span>
              <span className={styles.statValue}>7.9%</span>
            </div>
            <div className={styles.statItem}>
              <DocumentIcon size={14} className={styles.statIcon} />
              <span className={styles.statLabel}>TypeScript</span>
              <span className={styles.statValue}>6.0%</span>
            </div>
          </div>
          
          <div className={styles.projectMeta}>
            <div className={styles.metaItem}>
              <StarIcon size={14} className={styles.metaIcon} />
              <span>0 stars</span>
            </div>
            <div className={styles.metaItem}>
              <ForkIcon size={14} className={styles.metaIcon} />
              <span>0 forks</span>
            </div>
            <div className={styles.metaItem}>
              <ClockIcon size={14} className={styles.metaIcon} />
              <span>Updated {formatDate(project.updatedAt)}</span>
            </div>
          </div>
        </div>
      </div>
      
      {isHovered && (
        <div className={styles.hoverOverlay}>
          <div className={styles.hoverActions}>
            <button 
              className={styles.hoverButton}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(project.id);
              }}
            >
              <RocketIcon size={16} />
              <span>열기</span>
            </button>
            <button 
              className={styles.hoverButton}
              onClick={(e) => {
                e.stopPropagation();
                // 복제 기능 구현
              }}
            >
              <ClipboardIcon size={16} />
              <span>복제</span>
            </button>
            <button 
              className={styles.hoverButton}
              onClick={(e) => {
                e.stopPropagation();
                // 편집 기능 구현
              }}
            >
              <EditIcon size={16} />
              <span>편집</span>
            </button>
          </div>
        </div>
      )}
      
      <div className={styles.cardActions}>
        <button 
          className={styles.primaryButton}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(project.id);
          }}
        >
          <RocketIcon size={16} />
          <span>프로젝트 열기</span>
        </button>
      </div>
    </div>
  );
};

export default ProjectCard; 