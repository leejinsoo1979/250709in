import React, { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, SearchIcon, PlusIcon, FolderIcon } from '@/components/common/Icons';
import { ProjectSummary } from '@/firebase/types';
import styles from './ProjectDropdown.module.css';

interface ProjectDropdownProps {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  onProjectSelect: (project: ProjectSummary) => void;
  onCreateNew?: () => void;
}

const ProjectDropdown: React.FC<ProjectDropdownProps> = ({
  projects,
  currentProject,
  onProjectSelect,
  onCreateNew
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 검색 필터링
  const filteredProjects = projects.filter(project =>
    project.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 최근 프로젝트 순으로 정렬
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  // 외부 클릭으로 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 드롭다운 열릴 때 검색 입력창에 포커스
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  };

  const handleProjectSelect = (project: ProjectSummary) => {
    onProjectSelect(project);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleCreateNew = () => {
    if (onCreateNew) {
      onCreateNew();
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  // 날짜 포맷팅
  const formatDate = (timestamp: any) => {
    if (!timestamp) return '날짜 없음';
    try {
      const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '날짜 없음';
    }
  };

  // 상대적 시간 계산
  const getRelativeTime = (timestamp: any) => {
    if (!timestamp) return '알 수 없음';
    try {
      const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
      const now = new Date();
      const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
      
      if (diffInHours < 1) return '방금 전';
      if (diffInHours < 24) return `${diffInHours}시간 전`;
      if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}일 전`;
      if (diffInHours < 720) return `${Math.floor(diffInHours / 168)}주 전`;
      return `${Math.floor(diffInHours / 720)}개월 전`;
    } catch {
      return '알 수 없음';
    }
  };

  return (
    <div className={styles.projectDropdown} ref={dropdownRef}>
      {/* 메인 트리거 버튼 */}
      <button 
        className={`${styles.mainTrigger} ${isOpen ? styles.active : ''}`}
        onClick={handleToggle}
        type="button"
      >
        <div className={styles.triggerLeft}>
          <div className={styles.projectAvatar}>
            {currentProject ? (
              <span className={styles.avatarText}>
                {currentProject.title.charAt(0).toUpperCase()}
              </span>
            ) : (
              <FolderIcon size={16} />
            )}
          </div>
          <div className={styles.projectDetails}>
            <div className={styles.projectName}>
              {currentProject?.title || '프로젝트 선택'}
            </div>
            {currentProject && (
              <div className={styles.projectMeta}>
                <span className={styles.updateTime}>
                  {getRelativeTime(currentProject.updatedAt)}
                </span>
                {currentProject.furnitureCount && currentProject.furnitureCount > 0 && (
                  <>
                    <span className={styles.metaDivider}>•</span>
                    <span className={styles.furnitureCount}>
                      {currentProject.furnitureCount}개 가구
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <ChevronDownIcon 
          size={20} 
          className={`${styles.triggerArrow} ${isOpen ? styles.rotated : ''}`}
        />
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <>
          <div className={styles.backdrop} onClick={() => setIsOpen(false)} />
          <div className={styles.dropdownMenu}>
            {/* 헤더 */}
            <div className={styles.menuHeader}>
              <h3 className={styles.menuTitle}>프로젝트 선택</h3>
              <div className={styles.searchContainer}>
                <SearchIcon size={16} className={styles.searchIcon} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className={styles.searchInput}
                  placeholder="프로젝트 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* 프로젝트 목록 */}
            <div className={styles.projectListContainer}>
              {sortedProjects.length > 0 ? (
                <>
                  <div className={styles.listHeader}>
                    <span className={styles.listHeaderText}>
                      {searchQuery ? `검색 결과 ${sortedProjects.length}개` : `최근 프로젝트 ${sortedProjects.length}개`}
                    </span>
                  </div>
                  <div className={styles.projectList}>
                    {sortedProjects.map((project, index) => (
                      <button
                        key={project.id}
                        className={`${styles.projectItem} ${
                          currentProject?.id === project.id ? styles.currentProject : ''
                        }`}
                        onClick={() => handleProjectSelect(project)}
                        type="button"
                      >
                        <div className={styles.projectItemLeft}>
                          <div className={`${styles.projectItemAvatar} ${
                            currentProject?.id === project.id ? styles.activeAvatar : ''
                          }`}>
                            <span className={styles.avatarText}>
                              {project.title.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className={styles.projectItemInfo}>
                            <div className={styles.projectItemName}>
                              {project.title}
                            </div>
                            <div className={styles.projectItemMeta}>
                              <span className={styles.itemDate}>
                                {formatDate(project.updatedAt)}
                              </span>
                              <span className={styles.itemUpdateTime}>
                                {getRelativeTime(project.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={styles.projectItemRight}>
                          {project.furnitureCount && project.furnitureCount > 0 && (
                            <div className={styles.furnitureBadge}>
                              {project.furnitureCount}
                            </div>
                          )}
                          {currentProject?.id === project.id && (
                            <div className={styles.currentBadge}>
                              현재
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <SearchIcon size={32} />
                  </div>
                  <div className={styles.emptyText}>
                    {searchQuery ? (
                      <>
                        <strong>"{searchQuery}"</strong>에 대한<br />
                        검색 결과가 없습니다
                      </>
                    ) : (
                      <>
                        생성된 프로젝트가<br />
                        없습니다
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 푸터 액션 버튼 */}
            {onCreateNew && (
              <div className={styles.menuFooter}>
                <button
                  className={styles.createProjectBtn}
                  onClick={handleCreateNew}
                  type="button"
                >
                  <PlusIcon size={18} className={styles.createIcon} />
                  <span>새 프로젝트 만들기</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectDropdown;