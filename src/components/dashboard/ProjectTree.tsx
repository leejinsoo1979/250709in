import React, { useState, useRef, useEffect } from 'react';
import styles from './ProjectTree.module.css';

const TreeItem = ({ 
  item, 
  level = 0, 
  onToggle, 
  onRename, 
  onDelete, 
  onShare, 
  onDetails 
}): any => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect((): any => {
    const handleClickOutside = (event): any => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuToggle = (e): any => {
    e.stopPropagation();
    setIsMenuOpen(!isMenuOpen);
  };

  const handleMenuAction = (action, e): any => {
    e.stopPropagation();
    setIsMenuOpen(false);
    
    switch (action) {
      case 'rename':
        onRename?.(item);
        break;
      case 'delete':
        onDelete?.(item);
        break;
      case 'share':
        onShare?.(item);
        break;
      case 'details':
        onDetails?.(item);
        break;
    }
  };

  return (
    <div className={styles.treeItem}>
      <div 
        className={styles.itemContent}
        style={{ paddingLeft: `${level * 20 + 16}px` }}
        onClick={() => onToggle?.(item)}
      >
        <div className={styles.itemLeft}>
          <span className={styles.expandIcon}>
            {item.children && item.children.length > 0 ? 
              (item.expanded ? '▼' : '▶') : ''}
          </span>
          <span className={styles.folderIcon}>📁</span>
          <span className={styles.itemName}>{item.name}</span>
        </div>
        
        <div className={styles.itemRight}>
          <span className={styles.itemCount}>
            {item.children ? item.children.length : 0}
          </span>
          <button 
            className={styles.menuButton}
            onClick={handleMenuToggle}
          >
            ⋯
          </button>
          
          {isMenuOpen && (
            <div className={styles.dropdownMenu} ref={menuRef}>
              <button 
                className={styles.menuItem}
                onClick={(e) => handleMenuAction('rename', e)}
              >
                ✏️ 이름 변경
              </button>
              <button 
                className={styles.menuItem}
                onClick={(e) => handleMenuAction('delete', e)}
              >
                🗑️ 삭제
              </button>
              <button 
                className={styles.menuItem}
                onClick={(e) => handleMenuAction('share', e)}
              >
                🔗 공유
              </button>
              <button 
                className={styles.menuItem}
                onClick={(e) => handleMenuAction('details', e)}
              >
                ℹ️ 상세정보
              </button>
            </div>
          )}
        </div>
      </div>
      
      {item.expanded && item.children && (
        <div className={styles.children}>
          {item.children.map((child) => (
            <TreeItem
              key={child.id}
              item={child}
              level={level + 1}
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
              onShare={onShare}
              onDetails={onDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectTree = ({
  selectedProject,
  projects = [],
  treeData = [],
  onProjectSelect,
  onToggle,
  onRename,
  onDelete,
  onShare,
  onDetails
}): any => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <div className={styles.projectTree}>
      <div className={styles.header}>
        <div className={styles.dropdown}>
          <button 
            className={styles.dropdownButton}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <span className={styles.selectedProject}>
              {selectedProject ? selectedProject.name : '프로젝트 선택'}
            </span>
            <span className={styles.dropdownArrow}>
              {isDropdownOpen ? '▲' : '▼'}
            </span>
          </button>
          
          {isDropdownOpen && (
            <div className={styles.dropdownList}>
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={styles.dropdownItem}
                  onClick={(): any => {
                    onProjectSelect?.(project);
                    setIsDropdownOpen(false);
                  }}
                >
                  {project.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className={styles.treeContainer}>
        {treeData.map((item) => (
          <TreeItem
            key={item.id}
            item={item}
            onToggle={onToggle}
            onRename={onRename}
            onDelete={onDelete}
            onShare={onShare}
            onDetails={onDetails}
          />
        ))}
      </div>
    </div>
  );
};

export default ProjectTree;