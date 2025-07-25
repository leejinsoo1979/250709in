import React, { useState, useRef, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon, SearchIcon, PlusIcon, FolderIcon } from '@/components/common/Icons';
import { ProjectSummary } from '@/firebase/types';
import styles from './ProjectDropdownV2.module.css';
import clsx from 'clsx';

interface ProjectDropdownProps {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  onProjectSelect: (project: ProjectSummary) => void;
  onCreateNew?: () => void;
}

const ProjectDropdownV2: React.FC<ProjectDropdownProps> = ({
  projects,
  currentProject,
  onProjectSelect,
  onCreateNew
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  // 드롭다운 열릴 때 검색 입력창에 포커스
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

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
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger asChild>
        <motion.button 
          className={clsx(styles.trigger, isOpen && styles.active)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <motion.div 
            className={styles.triggerContent}
            animate={{ opacity: 1 }}
          >
            <div className={styles.projectIcon}>
              {currentProject ? (
                <motion.div 
                  className={styles.projectAvatar}
                  layoutId="project-avatar"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.3 }}
                >
                  {currentProject.title.charAt(0).toUpperCase()}
                </motion.div>
              ) : (
                <FolderIcon size={20} />
              )}
            </div>
            <div className={styles.projectInfo}>
              <div className={styles.projectName}>
                {currentProject?.title || '프로젝트 선택'}
              </div>
              {currentProject && (
                <motion.div 
                  className={styles.projectMeta}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <span className={styles.updateTime}>
                    {getRelativeTime(currentProject.updatedAt)}
                  </span>
                  {currentProject.furnitureCount && currentProject.furnitureCount > 0 && (
                    <>
                      <span className={styles.dot}>•</span>
                      <span className={styles.furnitureCount}>
                        {currentProject.furnitureCount}개
                      </span>
                    </>
                  )}
                </motion.div>
              )}
            </div>
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDownIcon size={20} className={styles.chevron} />
            </motion.div>
          </motion.div>
        </motion.button>
      </DropdownMenu.Trigger>

      <AnimatePresence>
        {isOpen && (
          <DropdownMenu.Portal>
            <DropdownMenu.Content asChild sideOffset={8} align="start">
              <motion.div 
                className={styles.content}
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className={styles.header}>
                  <h3 className={styles.title}>프로젝트</h3>
                  <div className={styles.searchWrapper}>
                    <SearchIcon size={16} className={styles.searchIcon} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      className={styles.searchInput}
                      placeholder="검색..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>

                <div className={styles.scrollArea}>
                  {sortedProjects.length > 0 ? (
                    <div className={styles.projectList}>
                      {sortedProjects.map((project, index) => (
                        <DropdownMenu.Item key={project.id} asChild>
                          <motion.button
                            className={clsx(
                              styles.projectItem,
                              currentProject?.id === project.id && styles.selected
                            )}
                            onClick={() => onProjectSelect(project)}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.02 }}
                            whileHover={{ x: 4 }}
                          >
                            <div className={styles.projectItemLeft}>
                              <motion.div 
                                className={clsx(
                                  styles.projectItemAvatar,
                                  currentProject?.id === project.id && styles.selectedAvatar
                                )}
                                whileHover={{ scale: 1.1 }}
                              >
                                {project.title.charAt(0).toUpperCase()}
                              </motion.div>
                              <div className={styles.projectItemInfo}>
                                <div className={styles.projectItemName}>
                                  {project.title}
                                </div>
                                <div className={styles.projectItemMeta}>
                                  <span>{formatDate(project.updatedAt)}</span>
                                  <span className={styles.dot}>•</span>
                                  <span>{getRelativeTime(project.updatedAt)}</span>
                                </div>
                              </div>
                            </div>
                            {project.furnitureCount && project.furnitureCount > 0 && (
                              <motion.div 
                                className={styles.furnitureChip}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring" }}
                              >
                                {project.furnitureCount}
                              </motion.div>
                            )}
                          </motion.button>
                        </DropdownMenu.Item>
                      ))}
                    </div>
                  ) : (
                    <motion.div 
                      className={styles.emptyState}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <SearchIcon size={48} className={styles.emptyIcon} />
                      <p className={styles.emptyText}>
                        {searchQuery ? `"${searchQuery}" 검색 결과가 없습니다` : '프로젝트가 없습니다'}
                      </p>
                    </motion.div>
                  )}
                </div>

                {onCreateNew && (
                  <motion.div 
                    className={styles.footer}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <DropdownMenu.Item asChild>
                      <motion.button
                        className={styles.createButton}
                        onClick={onCreateNew}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <PlusIcon size={18} />
                        <span>새 프로젝트</span>
                      </motion.button>
                    </DropdownMenu.Item>
                  </motion.div>
                )}
              </motion.div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        )}
      </AnimatePresence>
    </DropdownMenu.Root>
  );
};

export default ProjectDropdownV2;