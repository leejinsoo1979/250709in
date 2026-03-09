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
  onFileSelect?: (projectId: string, designFileId: string, designFileName: string) => void;
  onProjectSelect?: (projectId: string) => void;
  onCreateNew?: () => void;
  onClose?: () => void;
}

const DashboardFileTree: React.FC<DashboardFileTreeProps> = ({ onFileSelect, onProjectSelect, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [allProjects, setAllProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [folders, setFolders] = useState<{ [projectId: string]: FolderData[] }>({});
  const [designFiles, setDesignFiles] = useState<{ [projectId: string]: DesignFileSummary[] }>({});
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
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
          // URL에 프로젝트 ID가 있으면 자동으로 확장
          setExpandedProjects(new Set([projectId]));
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
      
      // 프로젝트가 있고 선택된 프로젝트가 없으면 첫 번째 프로젝트 자동 선택
      if (result.projects.length > 0 && !selectedProjectId) {
        const firstProjectId = result.projects[0].id;
        setSelectedProjectId(firstProjectId);
        setSelectedProject(result.projects[0]);
        // 첫 번째 프로젝트 자동 확장
        setExpandedProjects(new Set([firstProjectId]));
        console.log('✅ 첫 번째 프로젝트 자동 선택 및 확장:', firstProjectId);
      }
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
    if (!user) {
      console.warn('⚠️ 사용자가 로그인되지 않음 - 디자인 파일 로드 건너뛰기');
      return;
    }
    
    try {
      console.log('🔄 디자인 파일 로드 시작:', { projectId, userId: user.uid });
      const result = await getDesignFiles(projectId);
      console.log('🔥 디자인 파일 로드 결과:', {
        projectId,
        designFilesCount: result.designFiles?.length || 0,
        designFiles: result.designFiles?.map(df => ({ id: df.id, name: df.name })),
        error: result.error
      });
      
      if (result.error) {
        console.error('❌ 디자인 파일 로드 에러:', result.error);
        // 에러가 있어도 빈 배열로 설정하여 UI가 동작하도록 함
        setDesignFiles(prev => ({
          ...prev,
          [projectId]: []
        }));
        return;
      }
      
      // 디자인 파일을 상태에 저장
      if (result.designFiles && Array.isArray(result.designFiles)) {
        const validDesignFiles = result.designFiles.filter(df => df && df.id && df.name);
        setDesignFiles(prev => ({
          ...prev,
          [projectId]: validDesignFiles
        }));
        console.log('✅ 디자인 파일 state 업데이트 완료:', {
          count: validDesignFiles.length,
          files: validDesignFiles.map(df => df.name)
        });
      } else {
        console.log('⚠️ 디자인 파일이 없거나 비어있음');
        setDesignFiles(prev => ({
          ...prev,
          [projectId]: []
        }));
      }
    } catch (error) {
      console.error('❌ 디자인 파일 로드 중 예외 발생:', error);
      // 프로젝트 로드 실패 시에도 빈 배열로 설정
      setDesignFiles(prev => ({
        ...prev,
        [projectId]: []
      }));
    }
  };
  
  const toggleProject = async (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
      // 프로젝트를 확장할 때 선택 및 데이터 로드
      handleProjectSelect(projectId);
      // 폴더와 디자인 파일 데이터 로드
      await loadFolderDataForProject(projectId);
      await loadDesignFilesForProject(projectId);
    }
    setExpandedProjects(newExpanded);
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
    // 상위 컴포넌트로 프로젝트 선택 이벤트 전달
    if (onProjectSelect) {
      onProjectSelect(projectId);
    }
  };
  
  const handleDesignFileClick = (projectId: string, designFileId: string, designFileName: string) => {
    console.log('🎯 handleDesignFileClick 호출됨:', {
      projectId,
      designFileId,
      designFileName,
      hasOnFileSelect: !!onFileSelect
    });
    
    if (onFileSelect) {
      console.log('✅ onFileSelect 함수 호출 시작');
      onFileSelect(projectId, designFileId, designFileName);
    } else {
      console.log('🔀 기본 네비게이션 동작');
      // 기본 동작: 에디터로 이동 - designFileId와 designFileName 모두 전달
      navigate(`/configurator?projectId=${projectId}&designFileId=${designFileId}&designFileName=${encodeURIComponent(designFileName)}`);
    }
    
    if (onClose) {
      console.log('🚪 파일트리 닫기');
      onClose();
    }
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
        {!user ? (
          <div className={styles.loginPrompt}>
            <div className={styles.loginPromptIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <p className={styles.loginPromptText}>로그인이 필요합니다</p>
            <button 
              className={styles.loginPromptButton}
              onClick={() => navigate('/login')}
            >
              로그인하기
            </button>
          </div>
        ) : user && allProjects.length > 0 ? (
          <>
            {/* 모든 프로젝트 목록 */}
            {allProjects.map(project => (
              <div key={project.id}>
                <div 
                  className={`${styles.treeItem} ${selectedProjectId === project.id ? styles.active : ''}`}
                  onClick={() => toggleProject(project.id)}
                >
                  <div className={styles.treeItemIcon}>
                    <span style={{ 
                      display: 'inline-block', 
                      width: '16px', 
                      height: '16px',
                      fontSize: '12px',
                      lineHeight: '16px',
                      textAlign: 'center',
                      color: 'var(--theme-text-secondary, #666)',
                      fontFamily: 'monospace',
                      userSelect: 'none'
                    }}>
                      {expandedProjects.has(project.id) ? '▼' : '▶'}
                    </span>
                    <ProjectIcon size={16} color="#666" />
                  </div>
                  <span>{project.title}</span>
                  <span className={styles.treeItemCount}>
                    {((designFiles[project.id] || []).length) + ((folders[project.id] || []).reduce((sum, f) => sum + f.children.length, 0))}
                  </span>
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
                
                {/* 프로젝트가 확장되면 디자인 파일과 폴더 표시 */}
                {expandedProjects.has(project.id) && (
                  <div className={styles.projectChildren}>
                    {console.log('🔥 프로젝트 확장됨:', {
                      projectId: project.id,
                      designFiles: designFiles[project.id],
                      designFilesCount: designFiles[project.id]?.length || 0,
                      designFilesDetail: designFiles[project.id]?.map(df => ({ id: df.id, name: df.name })),
                      folders: folders[project.id]?.length || 0
                    })}
                    {/* 폴더들 */}
                    {(folders[project.id] || []).map(folder => (
                      <div key={folder.id}>
                        <div 
                          className={`${styles.treeItem} ${styles.childItem}`}
                          onClick={() => toggleFolder(folder.id)}
                        >
                          <div className={styles.treeItemIcon}>
                            <span style={{ 
                              display: 'inline-block', 
                              width: '14px', 
                              height: '14px',
                              fontSize: '11px',
                              lineHeight: '14px',
                              textAlign: 'center',
                              color: 'var(--theme-text-secondary, #666)',
                              fontFamily: 'monospace',
                              userSelect: 'none'
                            }}>
                              {expandedFolders.has(folder.id) ? '▼' : '▶'}
                            </span>
                            <FolderIcon size={16} color="currentColor" />
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
                                className={`${styles.treeItem} ${styles.childItem} ${styles.nestedItem}`}
                                onClick={() => handleDesignFileClick(project.id, child.id, child.name)}
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
                    
                  </div>
                )}
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