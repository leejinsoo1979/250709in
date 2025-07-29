import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { getUserProjects, getDesignFiles, loadFolderData, saveFolderData, deleteDesignFile, updateDesignFile } from '@/firebase/projects';
import { ProjectSummary, DesignFileSummary } from '@/firebase/types';
import SimpleProjectDropdown from '@/components/common/SimpleProjectDropdown';
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, PlusIcon, ProjectIcon } from '@/components/common/Icons';
import styles from './DashboardFileTree.module.css';

interface FolderData {
  id: string;
  name: string;
  type: 'folder';
  children: {
    id: string;
    name: string;
    type: 'file' | 'design';
  }[];
  expanded: boolean;
}

interface DashboardFileTreeProps {
  onFileSelect?: (projectId: string, designFileName: string) => void;
  onCreateNew?: () => void;
  onClose?: () => void;
}

const DashboardFileTree: React.FC<DashboardFileTreeProps> = ({ onFileSelect, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [allProjects, setAllProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [folders, setFolders] = useState<{ [projectId: string]: FolderData[] }>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [moreMenu, setMoreMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    itemId: string;
    itemName: string;
    itemType: 'folder' | 'design' | 'project';
  } | null>(null);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // 컴포넌트 마운트 시 프로젝트 데이터 로드
  useEffect(() => {
    const loadProjects = async () => {
      if (user) {
        await loadAllProjects();
        
        // URL에서 현재 프로젝트 ID 가져오기
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('projectId');
        if (projectId) {
          setSelectedProjectId(projectId);
        }
      }
    };
    
    loadProjects();
  }, [user]);
  
  // 선택된 프로젝트가 변경될 때 해당 프로젝트 데이터 로드
  useEffect(() => {
    const loadProjectData = async () => {
      if (selectedProjectId && allProjects.length > 0) {
        const project = allProjects.find(p => p.id === selectedProjectId);
        if (project) {
          setSelectedProject(project);
          await loadFolderDataForProject(selectedProjectId);
          await loadDesignFilesForProject(selectedProjectId);
        }
      }
    };
    
    loadProjectData();
  }, [selectedProjectId, allProjects, user]);
  
  const loadAllProjects = async () => {
    if (!user) return;
    
    try {
      const result = await getUserProjects(user.uid);
      setAllProjects(result.projects);
    } catch (error) {
      console.error('프로젝트 로드 에러:', error);
    }
  };
  
  const loadFolderDataForProject = async (projectId: string) => {
    if (!user) return;
    
    try {
      const { folders: folderData, error } = await loadFolderData(projectId);
      if (error) {
        console.error('폴더 데이터 불러오기 에러:', error);
      } else {
        setFolders(prev => ({
          ...prev,
          [projectId]: folderData || []
        }));
      }
    } catch (err) {
      console.error('폴더 데이터 불러오기 중 오류:', err);
    }
  };
  
  const loadDesignFilesForProject = async (projectId: string) => {
    if (!user) return;
    
    try {
      const result = await getDesignFiles(projectId);
      // 현재는 디자인 파일 로드만 수행, 추후 필요시 상태 관리 추가
      console.log('디자인 파일 로드 완료:', result.designFiles);
    } catch (error) {
      console.error('디자인 파일 로드 에러:', error);
    }
  };
  
  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };
  
  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    const project = allProjects.find(p => p.id === projectId);
    if (project) {
      setSelectedProject(project);
    }
  };
  
  const handleDesignFileClick = (projectId: string, designFileName: string) => {
    if (onFileSelect) {
      onFileSelect(projectId, designFileName);
    } else {
      // 기본 동작: 에디터로 이동
      navigate(`/configurator?projectId=${projectId}&designFileName=${encodeURIComponent(designFileName)}`);
    }
    onClose?.();
  };
  
  const handleMoreMenuOpen = (e: React.MouseEvent, itemId: string, itemName: string, itemType: 'folder' | 'design' | 'project') => {
    e.preventDefault();
    e.stopPropagation();
    setMoreMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      itemId,
      itemName,
      itemType
    });
  };
  
  const closeMoreMenu = () => {
    setMoreMenu(null);
  };
  
  const handleCreateFolder = () => {
    if (!selectedProjectId) return;
    setIsCreateFolderModalOpen(true);
  };
  
  const handleCreateFolderSubmit = async () => {
    if (!newFolderName.trim() || !selectedProjectId) return;
    
    setIsCreatingFolder(true);
    try {
      const folderId = `folder_${Date.now()}`;
      const newFolder: FolderData = {
        id: folderId,
        name: newFolderName.trim(),
        type: 'folder',
        children: [],
        expanded: false
      };
      
      const updatedFolders = [
        ...(folders[selectedProjectId] || []),
        newFolder
      ];
      
      setFolders(prev => ({
        ...prev,
        [selectedProjectId]: updatedFolders
      }));
      
      // Firebase에 저장
      await saveFolderData(selectedProjectId, updatedFolders);
      
      setIsCreateFolderModalOpen(false);
      setNewFolderName('');
    } catch (error) {
      console.error('폴더 생성 에러:', error);
      alert('폴더 생성에 실패했습니다.');
    } finally {
      setIsCreatingFolder(false);
    }
  };
  
  const handleCloseFolderModal = () => {
    setIsCreateFolderModalOpen(false);
    setNewFolderName('');
  };
  
  const handleRenameItem = async () => {
    if (!moreMenu) return;
    
    const newName = prompt(`새 이름을 입력하세요:`, moreMenu.itemName);
    if (!newName || newName.trim() === moreMenu.itemName) {
      closeMoreMenu();
      return;
    }
    
    try {
      if (moreMenu.itemType === 'folder' && selectedProjectId) {
        // 폴더 이름 변경
        const updatedFolders = folders[selectedProjectId]?.map(folder => 
          folder.id === moreMenu.itemId 
            ? { ...folder, name: newName.trim() }
            : folder
        ) || [];
        
        setFolders(prev => ({
          ...prev,
          [selectedProjectId]: updatedFolders
        }));
        
        // Firebase에 저장
        await saveFolderData(selectedProjectId, updatedFolders);
      } else if (moreMenu.itemType === 'design') {
        // 디자인 파일 이름 변경
        await updateDesignFile(moreMenu.itemId, { name: newName.trim() });
        
        // 데이터 새로고침
        if (selectedProjectId) {
          await loadDesignFilesForProject(selectedProjectId);
        }
      }
    } catch (error) {
      console.error('이름 변경 에러:', error);
      alert('이름 변경에 실패했습니다.');
    }
    
    closeMoreMenu();
  };
  
  const handleDeleteItem = async () => {
    if (!moreMenu) return;
    
    const confirmMessage = moreMenu.itemType === 'folder' 
      ? `정말로 폴더 "${moreMenu.itemName}"을(를) 삭제하시겠습니까?\n\n폴더 내의 모든 파일도 함께 삭제됩니다.`
      : `정말로 파일 "${moreMenu.itemName}"을(를) 삭제하시겠습니까?`;
    
    if (window.confirm(confirmMessage)) {
      try {
        if (moreMenu.itemType === 'folder' && selectedProjectId) {
          const updatedFolders = folders[selectedProjectId]?.filter(folder => folder.id !== moreMenu.itemId) || [];
          setFolders(prev => ({
            ...prev,
            [selectedProjectId]: updatedFolders
          }));
          
          // Firebase에 저장
          await saveFolderData(selectedProjectId, updatedFolders);
        } else if (moreMenu.itemType === 'design' && selectedProjectId) {
          await deleteDesignFile(moreMenu.itemId, selectedProjectId);
          
          // 데이터 새로고침
          await loadDesignFilesForProject(selectedProjectId);
        }
      } catch (error) {
        console.error('삭제 에러:', error);
        alert('삭제에 실패했습니다.');
      }
    }
    
    closeMoreMenu();
  };
  
  // 루트 레벨 디자인 파일 확인 (대시보드와 동일한 로직)
  const hasRootDesignFile = () => {
    if (!selectedProject || !selectedProjectId) return false;
    
    const projectFolders = folders[selectedProjectId] || [];
    const allFolderChildren = projectFolders.flatMap(folder => folder.children);
    const folderChildIds = new Set(allFolderChildren.map(child => child.id));
    const rootDesignId = `${selectedProject.id}-design`;
    const isRootDesignInFolder = folderChildIds.has(rootDesignId);
    
    return selectedProject.furnitureCount && selectedProject.furnitureCount > 0 && !isRootDesignInFolder;
  };
  
  return (
    <div className={styles.fileTree}>
      <div className={styles.treeHeader}>
        <div className={styles.projectSelectorContainer}>
          <SimpleProjectDropdown
            projects={allProjects}
            currentProject={selectedProject}
            onProjectSelect={(project) => handleProjectSelect(project.id)}
          />
        </div>
      </div>
      
      <div className={styles.treeContent}>
        {selectedProjectId && selectedProject ? (
          <div>
            {/* 새 폴더 생성 버튼 */}
            <button className={styles.createFolderBtn} onClick={handleCreateFolder}>
              <div className={styles.createFolderIcon}>
                <FolderIcon size={16} />
                <PlusIcon size={12} />
              </div>
              <span>새로운 폴더</span>
            </button>
            
            {/* 프로젝트 루트 */}
            <div className={`${styles.treeItem} ${styles.active}`}>
              <div className={styles.treeItemIcon}>
                <ProjectIcon size={16} />
              </div>
              <span>{selectedProject.title}</span>
              <div className={styles.treeItemActions}>
                <button 
                  className={styles.treeItemActionBtn}
                  onClick={(e) => handleMoreMenuOpen(e, selectedProject.id, selectedProject.title, 'project')}
                >
                  ⋯
                </button>
              </div>
            </div>
            
            {/* 폴더들 */}
            {(folders[selectedProjectId] || []).map(folder => (
              <div key={folder.id}>
                <div 
                  className={styles.treeItem}
                  onClick={() => toggleFolder(folder.id)}
                >
                  <div className={styles.treeItemIcon}>
                    {expandedFolders.has(folder.id) ? (
                      <ChevronDownIcon size={12} />
                    ) : (
                      <ChevronRightIcon size={12} />
                    )}
                    <FolderIcon size={16} />
                  </div>
                  <span>{folder.name}</span>
                  <span className={styles.treeItemCount}>{folder.children.length}</span>
                  <div className={styles.treeItemActions}>
                    <button 
                      className={styles.treeItemActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoreMenuOpen(e, folder.id, folder.name, 'folder');
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                </div>
                
                {/* 폴더 내 파일들 */}
                {expandedFolders.has(folder.id) && (
                  <div className={styles.folderChildren}>
                    {folder.children.map(child => (
                      <div 
                        key={child.id}
                        className={`${styles.treeItem} ${styles.childItem}`}
                        onClick={() => handleDesignFileClick(selectedProject.id, child.name)}
                      >
                        <div className={styles.treeItemIcon}>
                          <div className={styles.designIcon}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                              <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                              <path d="M2 2l7.586 7.586"/>
                              <circle cx="11" cy="11" r="2"/>
                            </svg>
                          </div>
                        </div>
                        <span>{child.name}</span>
                        <div className={styles.treeItemActions}>
                          <button 
                            className={styles.treeItemActionBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoreMenuOpen(e, child.id, child.name, 'design');
                            }}
                          >
                            ⋯
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            
            {/* 루트 레벨 디자인 파일 */}
            {hasRootDesignFile() && (
              <div 
                className={styles.treeItem}
                onClick={() => handleDesignFileClick(selectedProject.id, selectedProject.title)}
              >
                <div className={styles.treeItemIcon}>
                  <div className={styles.designIcon}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                      <path d="M2 2l7.586 7.586"/>
                      <circle cx="11" cy="11" r="2"/>
                    </svg>
                  </div>
                </div>
                <span>{selectedProject.title}</span>
                <div className={styles.treeItemActions}>
                  <button 
                    className={styles.treeItemActionBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoreMenuOpen(e, `${selectedProject.id}-design`, selectedProject.title, 'design');
                    }}
                  >
                    ⋯
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          user && allProjects.length > 0 ? (
            <>
              {allProjects.map(project => (
                <div 
                  key={project.id}
                  className={styles.treeItem}
                  onClick={() => handleProjectSelect(project.id)}
                >
                  <div className={styles.treeItemIcon}>
                    <ProjectIcon size={16} />
                  </div>
                  <span>{project.title}</span>
                  <span className={styles.treeItemCount}>1</span>
                  <div className={styles.treeItemActions}>
                    <button 
                      className={styles.treeItemActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoreMenuOpen(e, project.id, project.title, 'project');
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : user ? (
            <div className={styles.treeItem}>
              <span style={{ color: '#999', fontSize: '14px' }}>
                프로젝트가 없습니다
              </span>
            </div>
          ) : (
            <div className={styles.treeItem}>
              <span style={{ color: '#999', fontSize: '14px' }}>
                로그인이 필요합니다
              </span>
            </div>
          )
        )}
      </div>
      
      {/* 더보기 메뉴 */}
      {moreMenu && (
        <>
          <div 
            className={styles.moreMenuBackdrop}
            onClick={closeMoreMenu}
          />
          <div
            className={styles.moreMenu}
            style={{
              position: 'fixed',
              top: moreMenu.y,
              left: moreMenu.x
            }}
          >
            <div 
              className={styles.moreMenuItem}
              onClick={handleRenameItem}
            >
              이름 바꾸기
            </div>
            <div 
              className={`${styles.moreMenuItem} ${styles.deleteItem}`}
              onClick={handleDeleteItem}
            >
              삭제하기
            </div>
          </div>
        </>
      )}
      
      {/* 폴더 생성 모달 */}
      {isCreateFolderModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>새 폴더 생성</h2>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="폴더 이름을 입력하세요"
              className={styles.modalInput}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  handleCreateFolderSubmit();
                }
              }}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button
                onClick={handleCloseFolderModal}
                disabled={isCreatingFolder}
                className={styles.modalCancelBtn}
              >
                취소
              </button>
              <button
                onClick={handleCreateFolderSubmit}
                disabled={!newFolderName.trim() || isCreatingFolder}
                className={styles.modalCreateBtn}
              >
                {isCreatingFolder ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardFileTree;