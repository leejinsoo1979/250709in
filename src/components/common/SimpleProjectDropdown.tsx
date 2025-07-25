import React, { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, FolderIcon } from '@/components/common/Icons';
import { ProjectSummary } from '@/firebase/types';
import styles from './SimpleProjectDropdown.module.css';

interface SimpleProjectDropdownProps {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  onProjectSelect: (project: ProjectSummary) => void;
}

const SimpleProjectDropdown: React.FC<SimpleProjectDropdownProps> = ({
  projects,
  currentProject,
  onProjectSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 최근 프로젝트 순으로 정렬
  const sortedProjects = [...projects].sort((a, b) => {
    const aTime = a.updatedAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || 0;
    return bTime - aTime;
  });

  // 외부 클릭으로 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleProjectSelect = (project: ProjectSummary) => {
    onProjectSelect(project);
    setIsOpen(false);
  };

  return (
    <div className={styles.dropdown} ref={dropdownRef}>
      <button 
        className={`${styles.trigger} ${isOpen ? styles.active : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <div className={styles.triggerContent}>
          <span className={styles.projectName}>
            {currentProject?.title || '프로젝트 선택'}
          </span>
        </div>
        <ChevronDownIcon 
          size={14} 
          className={`${styles.arrow} ${isOpen ? styles.rotated : ''}`}
        />
      </button>

      {isOpen && (
        <div className={styles.menu}>
          {sortedProjects.length > 0 ? (
            sortedProjects.map((project) => (
              <button
                key={project.id}
                className={`${styles.menuItem} ${
                  currentProject?.id === project.id ? styles.current : ''
                }`}
                onClick={() => handleProjectSelect(project)}
                type="button"
              >
                <span className={styles.itemName}>{project.title}</span>
                {currentProject?.id === project.id && (
                  <span className={styles.currentIndicator}>✓</span>
                )}
              </button>
            ))
          ) : (
            <div className={styles.emptyState}>
              프로젝트가 없습니다
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SimpleProjectDropdown;