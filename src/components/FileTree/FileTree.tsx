import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FolderIcon, 
  FileIcon, 
  PlusIcon, 
  MoreHorizontalIcon, 
  EditIcon, 
  TrashIcon, 
  CopyIcon, 
  ChevronRightIcon, 
  ChevronDownIcon,
  HomeIcon,
  PackageIcon
} from '@/components/common/Icons';
import ProjectDropdown from '@/components/common/ProjectDropdown';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useAuth } from '@/auth/AuthProvider';
import { getUserProjects, getDesignFiles, deleteProject, deleteDesignFile, loadFolderData, createProject } from '@/firebase/projects';
import { ProjectSummary, DesignFileSummary, ProjectFolder } from '@/firebase/types';
import styles from './FileTree.module.css';

interface FileNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: FileNode[];
  expanded?: boolean;
  parentId?: string;
  nodeType?: 'project' | 'space' | 'furniture' | 'material' | 'module' | 'config' | 'folder' | 'design';
  icon?: React.ReactNode;
}

interface FileTreeProps {
  onFileSelect?: (file: FileNode) => void;
  onCreateNew?: () => void;
}

const FileTree: React.FC<FileTreeProps> = ({ onFileSelect, onCreateNew }) => {
  console.log('FileTree 컴포넌트 렌더링 시작');
  
  const navigate = useNavigate();
  const { basicInfo } = useProjectStore();
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const derivedSpaceStore = useDerivedSpaceStore();
  const { user } = useAuth();
  
  const [files, setFiles] = useState<FileNode[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectSummary[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectSummary | null>(null);
  const [designFiles, setDesignFiles] = useState<DesignFileSummary[]>([]);
  const [projectFolders, setProjectFolders] = useState<any[]>([]);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    nodeId: string;
    nodeType: string;
    projectId?: string;
  } | null>(null);
  const [currentWorkingFile, setCurrentWorkingFile] = useState<string | null>(null);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  
  // BroadcastChannel for real-time synchronization
  const [broadcastChannel] = useState(() => new BroadcastChannel('project-updates'));
  
  // 현재 프로젝트의 파일트리 구조 생성 (대시보드와 동일한 구조)
  const generateFileTreeFromCurrentProject = (): FileNode[] => {
    if (!currentProject) return [];
    
    console.log('=== 파일트리 생성 디버깅 ===');
    console.log('현재 프로젝트:', currentProject.title, currentProject.id);
    console.log('프로젝트 폴더들:', projectFolders);
    console.log('디자인 파일들:', designFiles);
    
    const nodes: FileNode[] = [];
    
    // 1. 모든 디자인파일을 실제 Firebase 데이터를 기반으로 처리
    const allDesignFiles = designFiles || [];
    console.log('처리할 전체 디자인파일:', allDesignFiles);
    
    // 2. 폴더들 추가 (실제 디자인파일 ID 사용)
    projectFolders.forEach(folder => {
      console.log('폴더 처리 중:', folder.name, folder.children);
      
      const folderNode: FileNode = {
        id: folder.id,
        name: folder.name,
        type: 'folder',
        nodeType: 'folder',
        icon: <FolderIcon size={16} />,
        expanded: folder.expanded || false,
        children: folder.children ? folder.children.map((child: any) => {
          // 실제 디자인파일이 있는지 확인
          const actualDesignFile = allDesignFiles.find(df => df.id === child.id);
          console.log(`폴더 ${folder.name}의 자식 ${child.name} (${child.id}) - 실제 디자인파일:`, actualDesignFile);
          
          return {
            id: child.id, // 실제 Firebase 디자인파일 ID 사용
            name: actualDesignFile ? actualDesignFile.name : child.name, // 실제 디자인파일 이름 사용
            type: 'file',
            nodeType: 'design',
            icon: <div style={{ 
              width: '16px', 
              height: '16px', 
              border: '1px solid var(--theme-primary)', 
              borderRadius: '2px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: '10px', 
              color: 'var(--theme-primary)', 
              fontWeight: 'bold' 
            }}>+</div>,
            parentId: folder.id
          };
        }) : []
      };
      
      nodes.push(folderNode);
    });
    
    // 3. 루트 레벨 디자인 파일들 (폴더에 속하지 않은 파일들)
    const allFolderChildIds = projectFolders.flatMap(folder => 
      folder.children ? folder.children.map((child: any) => child.id) : []
    );
    console.log('폴더에 속한 디자인파일 IDs:', allFolderChildIds);
    
    // 폴더에 속하지 않은 디자인파일들 찾기
    const rootLevelDesignFiles = allDesignFiles.filter(df => !allFolderChildIds.includes(df.id));
    console.log('루트 레벨 디자인파일들:', rootLevelDesignFiles);
    
    rootLevelDesignFiles.forEach(designFile => {
      const rootDesignNode: FileNode = {
        id: designFile.id, // 실제 Firebase 디자인파일 ID 사용
        name: designFile.name, // 실제 디자인파일 이름 사용
        type: 'file',
        nodeType: 'design',
        icon: <div style={{ 
          width: '16px', 
          height: '16px', 
          border: '1px solid var(--theme-primary)', 
          borderRadius: '2px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontSize: '10px', 
          color: 'var(--theme-primary)', 
          fontWeight: 'bold' 
        }}>+</div>,
        parentId: currentProject.id
      };
      
      nodes.push(rootDesignNode);
    });
    
    // 4. 만약 루트 레벨 디자인파일이 없고 프로젝트에 가구가 있다면 기본 디자인파일 생성
    const hasDesignFiles = currentProject.furnitureCount && currentProject.furnitureCount > 0;
    if (hasDesignFiles && rootLevelDesignFiles.length === 0 && allFolderChildIds.length === 0) {
      console.log('기본 루트 디자인파일 생성 (가구 데이터 기반)');
      const defaultDesignNode: FileNode = {
        id: `${currentProject.id}-design`, // 가상 ID 사용 (호환성)
        name: currentProject.title,
        type: 'file',
        nodeType: 'design',
        icon: <div style={{ 
          width: '16px', 
          height: '16px', 
          border: '1px solid var(--theme-primary)', 
          borderRadius: '2px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontSize: '10px', 
          color: 'var(--theme-primary)', 
          fontWeight: 'bold' 
        }}>+</div>,
        parentId: currentProject.id
      };
      
      nodes.push(defaultDesignNode);
    }
    
    console.log('최종 생성된 파일트리 노드:', nodes);
    return nodes;
  };
  
  // 모든 프로젝트 데이터 로드 (대시보드와 동일)
  const loadAllProjectsData = useCallback(async () => {
    if (!user) {
      console.log('사용자가 로그인하지 않음');
      setLoading(false);
      return;
    }
    
    try {
      console.log('모든 프로젝트 데이터 로드 시작');
      setLoading(true);
      
      // 모든 프로젝트 목록 로드
      const userProjects = await getUserProjects(user.uid);
      
      console.log('로드된 모든 프로젝트:', userProjects);
      
      // 현재 프로젝트 설정 (URL에서 가져옴)
      const urlParams = new URLSearchParams(window.location.search);
      const currentProjectId = urlParams.get('projectId');
      
      if (currentProjectId) {
        const currentProj = userProjects.projects.find(p => p.id === currentProjectId);
        if (currentProj) {
          setCurrentProject(currentProj);
          
          // 현재 프로젝트의 디자인파일들과 폴더 데이터 로드
          const designFilesResult = await getDesignFiles(currentProjectId);
          setDesignFiles(designFilesResult.designFiles);
          
          // 폴더 데이터 로드
          const folderResult = await loadFolderData(currentProjectId);
          setProjectFolders(folderResult.folders || []);
          console.log('로드된 폴더 데이터:', folderResult.folders);
        }
      }
      
      // 전체 프로젝트 목록 저장
      setAllProjects(userProjects.projects);
      
    } catch (error) {
      console.error('프로젝트 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);
  
  // 컴포넌트 마운트 시 모든 프로젝트 데이터 로드
  useEffect(() => {
    loadAllProjectsData();
  }, [loadAllProjectsData]);
  
  // BroadcastChannel 메시지 리스너
  useEffect(() => {
    const handleBroadcastMessage = (event: MessageEvent) => {
      console.log('📡 FileTree BroadcastChannel 메시지 수신:', event.data);
      if (event.data.type === 'PROJECT_UPDATED' || event.data.type === 'FOLDERS_UPDATED') {
        // 모든 프로젝트 데이터 다시 로드
        loadAllProjectsData();
      }
    };
    
    broadcastChannel.addEventListener('message', handleBroadcastMessage);
    
    return () => {
      broadcastChannel.removeEventListener('message', handleBroadcastMessage);
    };
  }, [broadcastChannel, loadAllProjectsData]);
  
  // URL에서 현재 작업중인 디자인파일명 추출
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const designFileName = urlParams.get('designFileName') || urlParams.get('fileName');
    
    if (designFileName) {
      setCurrentWorkingFile(decodeURIComponent(designFileName));
      console.log('현재 작업중인 파일:', decodeURIComponent(designFileName));
    } else if (currentProject) {
      // URL에 디자인파일명이 없으면 프로젝트명을 사용 (루트 레벨 디자인)
      setCurrentWorkingFile(currentProject.title);
      console.log('현재 작업중인 파일 (프로젝트명):', currentProject.title);
    }
  }, [currentProject]);
  
  // 컴포넌트 언마운트 시 BroadcastChannel 정리
  useEffect(() => {
    return () => {
      broadcastChannel.close();
    };
  }, [broadcastChannel]);
  
  // 프로젝트 데이터가 변경될 때마다 파일트리 재생성
  useEffect(() => {
    if (!loading && currentProject) {
      const fileTree = generateFileTreeFromCurrentProject();
      setFiles(fileTree);
    }
  }, [currentProject, designFiles, projectFolders, loading]);

  // 현재 작업중인 파일이 변경될 때 해당 파일을 자동 선택
  useEffect(() => {
    if (!currentWorkingFile || !currentProject) return;
    
    console.log('현재 작업중인 파일 자동 선택 시도:', currentWorkingFile);
    console.log('현재 프로젝트:', currentProject.title);
    console.log('디자인 파일들:', designFiles);
    console.log('프로젝트 폴더들:', projectFolders);
    
    // 현재 작업중인 파일에 해당하는 노드 ID 찾기
    let targetNodeId = null;
    
    if (currentWorkingFile === currentProject.title) {
      // 루트 레벨 디자인 파일
      targetNodeId = `${currentProject.id}-design`;
      console.log('루트 레벨 디자인파일로 인식:', targetNodeId);
    } else {
      // 폴더 내 파일 찾기
      for (const folder of projectFolders) {
        if (folder.children) {
          for (const child of folder.children) {
            if (child.name === currentWorkingFile) {
              targetNodeId = child.id;
              console.log('폴더 내 파일 찾음:', targetNodeId, child.name);
              break;
            }
          }
        }
        if (targetNodeId) break;
      }
      
      // 폴더에서 찾지 못했으면 designFiles에서 직접 찾기
      if (!targetNodeId) {
        const matchingDesignFile = designFiles.find(df => df.name === currentWorkingFile);
        if (matchingDesignFile) {
          targetNodeId = matchingDesignFile.id;
          console.log('designFiles에서 직접 찾음:', targetNodeId, matchingDesignFile.name);
        }
      }
    }
    
    if (targetNodeId) {
      setSelectedFile(targetNodeId);
      console.log('현재 작업중인 파일 자동 선택 완료:', targetNodeId);
    } else {
      console.log('현재 작업중인 파일을 찾을 수 없습니다:', currentWorkingFile);
    }
  }, [currentWorkingFile, currentProject, projectFolders, designFiles]);

  // 파일트리 상태가 변경될 때마다 선택된 파일 경로 업데이트
  useEffect(() => {
    if (selectedFile) {
      const path = getSelectedFilePath();
      console.log('현재 선택된 파일 경로:', path);
    } else {
      console.log('선택된 파일이 없습니다.');
    }
  }, [files, selectedFile]);

  const toggleExpanded = (nodeId: string) => {
    // 폴더 확장/축소 상태 업데이트
    setProjectFolders(prevFolders => 
      prevFolders.map(folder => 
        folder.id === nodeId 
          ? { ...folder, expanded: !folder.expanded }
          : folder
      )
    );
    
    // 파일트리도 업데이트
    const updateNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };
    setFiles(updateNode(files));
  };

  // 저장 확인 팝업 표시
  const showSaveConfirmation = (nodeId: string, nodeType: string, projectId?: string) => {
    setPendingNavigation({ nodeId, nodeType, projectId });
    setShowSaveConfirmModal(true);
  };

  // 저장 및 이동
  const handleSaveAndNavigate = async () => {
    if (!pendingNavigation) return;
    
    try {
      // TODO: 현재 디자인파일 저장 로직 구현 필요
      console.log('현재 파일 저장 중...');
      
      // 저장 후 이동
      await performNavigation(pendingNavigation);
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setShowSaveConfirmModal(false);
      setPendingNavigation(null);
    }
  };

  // 저장 없이 이동
  const handleNavigateWithoutSave = async () => {
    if (!pendingNavigation) return;
    
    await performNavigation(pendingNavigation);
    setShowSaveConfirmModal(false);
    setPendingNavigation(null);
  };

  // 실제 네비게이션 수행
  const performNavigation = async (navigation: { nodeId: string; nodeType: string; projectId?: string }) => {
    const { nodeId, nodeType, projectId } = navigation;
    
    if (nodeType === 'design') {
      // 디자인 파일 로드
      console.log('디자인 파일 로드:', nodeId);
      const designFile = designFiles.find(df => df.id === nodeId);
      if (designFile) {
        // TODO: 실제 디자인파일 로드 로직 구현
        console.log('디자인파일 로드 요청:', designFile.name);
      }
    } else if (nodeType === 'project' && projectId) {
      // 다른 프로젝트로 이동
      navigate(`/configurator?projectId=${projectId}`);
    }
  };

  const handleFileClick = (node: FileNode) => {
    console.log('파일 클릭:', node.name, node.id);
    setSelectedFile(node.id);
    onFileSelect?.(node);
    
    // 노드 타입에 따라 적절한 액션 수행
    if (node.nodeType === 'design') {
      // 디자인 파일 클릭 시 저장 확인 팝업 표시
      showSaveConfirmation(node.id, 'design');
    } else if (node.nodeType === 'project') {
      // 프로젝트 클릭 시
      console.log('프로젝트 선택:', node.name);
      const project = allProjects.find(p => p.id === node.id);
      if (project && project.id !== currentProject?.id) {
        // 다른 프로젝트로 이동 시 저장 확인 팝업 표시
        showSaveConfirmation(node.id, 'project', project.id);
      } else {
        // 같은 프로젝트면 확장/축소
        toggleExpanded(node.id);
      }
    } else if (node.nodeType === 'folder') {
      // 폴더 클릭 시 확장/축소
      console.log('폴더 선택:', node.name);
      toggleExpanded(node.id);
    }
    
    // 파일 경로 즉시 업데이트
    setTimeout(() => {
      const path = getSelectedFilePath();
      console.log('업데이트된 파일 경로:', path);
    }, 0);
  };

  const handleContextMenu = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };


  // 프로젝트 선택
  const handleProjectSelect = (project: ProjectSummary) => {
    if (project.id !== currentProject?.id) {
      // 다른 프로젝트 선택 시 저장 확인 팝업 표시
      showSaveConfirmation(project.id, 'project', project.id);
    }
  };

  const handleContextAction = (action: string, nodeId: string) => {
    console.log(`Action: ${action} on node: ${nodeId}`);
    closeContextMenu();
    
    switch (action) {
      case 'rename':
        // 이름 변경 모드 시작
        const nodeToRename = findNodeById(files, nodeId);
        if (nodeToRename) {
          setEditingNode(nodeId);
          setEditingName(nodeToRename.name);
        }
        break;
      case 'delete':
        // 삭제 로직
        deleteNode(nodeId);
        break;
      case 'copy':
        // 복사 로직
        break;
      case 'addFolder':
        // 새 폴더 추가 로직
        addNewFolder();
        break;
    }
  };

  // 노드 ID로 노드 찾기
  const findNodeById = (nodes: FileNode[], id: string): FileNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // 새 폴더 추가 (임시 비활성화)
  const addNewFolder = async () => {
    console.log('폴더 생성 기능은 새 구조에서 아직 구현되지 않았습니다.');
    alert('폴더 생성 기능은 곧 추가될 예정입니다.');
  };

  // 새 프로젝트 추가 모달 열기
  const addNewProject = () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }
    setShowCreateProjectModal(true);
    setNewProjectName('');
  };

  // 새 프로젝트 생성
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      return;
    }

    try {
      console.log('새 프로젝트 생성 시작:', newProjectName.trim());
      const result = await createProject({ title: newProjectName.trim() });
      
      if (result.error) {
        console.error('프로젝트 생성 실패:', result.error);
        alert('프로젝트 생성에 실패했습니다: ' + result.error);
        return;
      }

      console.log('프로젝트 생성 성공:', result.id);

      // 모든 프로젝트 데이터 다시 로드하여 드롭다운 메뉴 업데이트
      await loadAllProjectsData();

      // BroadcastChannel로 다른 탭(대시보드)에 알림
      try {
        if (broadcastChannel && broadcastChannel.constructor.name === 'BroadcastChannel') {
          broadcastChannel.postMessage({ 
            type: 'PROJECT_UPDATED', 
            action: 'created',
            projectId: result.id 
          });
          console.log('✅ BroadcastChannel 메시지 전송 성공');
        }
      } catch (error) {
        console.warn('⚠️ BroadcastChannel 메시지 전송 실패:', error.message);
      }

      // 모달 닫기
      setShowCreateProjectModal(false);
      setNewProjectName('');

    } catch (error) {
      console.error('프로젝트 생성 중 예외 발생:', error);
      alert('프로젝트 생성 중 오류가 발생했습니다.');
    }
  };

  // 노드 삭제
  const deleteNode = async (nodeId: string) => {
    if (!user) return;
    
    try {
      const nodeToDelete = findNodeById(files, nodeId);
      if (!nodeToDelete) return;
      
      if (nodeToDelete.nodeType === 'project') {
        // 프로젝트 삭제 확인
        const projectToDelete = allProjects.find(p => p.id === nodeId);
        if (!projectToDelete) return;
        
        const confirmed = confirm(
          `프로젝트 "${projectToDelete.title}"을(를) 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 프로젝트 내의 모든 디자인파일도 함께 삭제됩니다.`
        );
        
        if (!confirmed) return;
        
        console.log('프로젝트 삭제 시작:', nodeId);
        const result = await deleteProject(nodeId);
        
        if (result.error) {
          console.error('프로젝트 삭제 실패:', result.error);
          alert('프로젝트 삭제에 실패했습니다: ' + result.error);
          return;
        }
        
        console.log('프로젝트 삭제 성공:', nodeId);
        alert('프로젝트가 삭제되었습니다.');
        
        // 삭제된 프로젝트가 현재 프로젝트인 경우 대시보드로 이동
        if (currentProject?.id === nodeId) {
          navigate('/dashboard');
        } else {
          // 데이터 새로고침
          loadAllProjectsData();
        }
        
        // BroadcastChannel로 다른 탭에 알림 (안전하게 처리)
        try {
          if (broadcastChannel && broadcastChannel.constructor.name === 'BroadcastChannel') {
            broadcastChannel.postMessage({ 
              type: 'PROJECT_UPDATED', 
              action: 'deleted',
              projectId: nodeId 
            });
            console.log('✅ BroadcastChannel 메시지 전송 성공');
          }
        } catch (error) {
          console.warn('⚠️ BroadcastChannel 메시지 전송 실패:', error.message);
          // BroadcastChannel 오류는 무시하고 계속 진행
        }
        
      } else if (nodeToDelete.nodeType === 'design') {
        console.log('디자인파일 삭제 시도:', nodeId);
        
        // 실제 Firebase 디자인파일 ID 찾기
        let actualDesignFileId = null;
        let designFileToDelete = null;
        
        if (nodeId === `${currentProject?.id}-design`) {
          // 루트 레벨 디자인파일인 경우
          designFileToDelete = designFiles.find(df => df.name === currentProject?.title);
          if (designFileToDelete) {
            actualDesignFileId = designFileToDelete.id;
          }
        } else {
          // 폴더 내 디자인파일인 경우
          designFileToDelete = designFiles.find(df => df.id === nodeId);
          if (designFileToDelete) {
            actualDesignFileId = nodeId;
          } else {
            // 폴더 내에서 찾기
            for (const folder of projectFolders) {
              if (folder.children) {
                for (const child of folder.children) {
                  if (child.id === nodeId) {
                    actualDesignFileId = child.id;
                    designFileToDelete = { id: child.id, name: child.name };
                    break;
                  }
                }
              }
              if (actualDesignFileId) break;
            }
          }
        }
        
        if (!designFileToDelete || !currentProject || !actualDesignFileId) {
          console.error('디자인파일을 찾을 수 없습니다:', nodeId);
          alert('디자인파일을 찾을 수 없습니다.');
          return;
        }
        
        const confirmed = confirm(
          `디자인파일 "${designFileToDelete.name}"을(를) 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`
        );
        
        if (!confirmed) return;
        
        console.log('디자인파일 삭제 시작 - 실제 ID:', actualDesignFileId);
        const result = await deleteDesignFile(actualDesignFileId, currentProject.id);
        
        if (result.error) {
          console.error('디자인파일 삭제 실패:', result.error);
          alert('디자인파일 삭제에 실패했습니다: ' + result.error);
          return;
        }
        
        console.log('디자인파일 삭제 성공:', actualDesignFileId);
        alert('디자인파일이 삭제되었습니다.');
        
        // 데이터 새로고침
        loadAllProjectsData();
        
        // BroadcastChannel로 다른 탭에 알림 (안전하게 처리)
        try {
          if (broadcastChannel && broadcastChannel.constructor.name === 'BroadcastChannel') {
            broadcastChannel.postMessage({ 
              type: 'PROJECT_UPDATED', 
              action: 'design_deleted',
              projectId: currentProject.id,
              designFileId: actualDesignFileId
            });
            console.log('✅ BroadcastChannel 메시지 전송 성공');
          }
        } catch (error) {
          console.warn('⚠️ BroadcastChannel 메시지 전송 실패:', error.message);
          // BroadcastChannel 오류는 무시하고 계속 진행
        }
      }
      
    } catch (error) {
      console.error('노드 삭제 실패:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 이름 편집 완료
  const handleNameEditComplete = async () => {
    if (!editingNode || !editingName.trim()) {
      handleNameEditCancel();
      return;
    }
    
    const nodeToEdit = findNodeById(files, editingNode);
    if (!nodeToEdit) {
      handleNameEditCancel();
      return;
    }
    
    try {
      if (nodeToEdit.nodeType === 'design') {
        console.log('=== 디자인파일 이름 변경 디버깅 시작 ===');
        console.log('editingNode:', editingNode);
        console.log('editingName:', editingName.trim());
        console.log('nodeToEdit:', nodeToEdit);
        console.log('currentProject:', currentProject);
        console.log('designFiles 전체:', designFiles);
        console.log('projectFolders 전체:', projectFolders);
        
        // 실제 Firebase 디자인파일 ID 찾기
        let actualDesignFileId = null;
        let designFileInfo = null;
        
        // 1. designFiles에서 직접 ID로 찾기 (가장 정확한 방법)
        const directMatch = designFiles.find(df => df.id === editingNode);
        if (directMatch) {
          actualDesignFileId = editingNode;
          designFileInfo = directMatch;
          console.log('✅ designFiles에서 직접 ID 매칭 성공:', directMatch);
        }
        
        // 2. 루트 레벨 디자인파일 체크 (가상 ID인 경우)
        if (!actualDesignFileId && editingNode === `${currentProject?.id}-design`) {
          const rootMatch = designFiles.find(df => df.name === currentProject?.title);
          if (rootMatch) {
            actualDesignFileId = rootMatch.id;
            designFileInfo = rootMatch;
            console.log('✅ 루트 레벨 디자인파일 매칭 성공:', rootMatch);
          }
        }
        
        // 3. 폴더 구조에서 찾기
        if (!actualDesignFileId) {
          for (const folder of projectFolders) {
            if (folder.children) {
              for (const child of folder.children) {
                if (child.id === editingNode) {
                  // 폴더 child의 ID가 실제 designFile ID인지 확인
                  const folderChildMatch = designFiles.find(df => df.id === child.id);
                  if (folderChildMatch) {
                    actualDesignFileId = child.id;
                    designFileInfo = folderChildMatch;
                    console.log('✅ 폴더 구조에서 매칭 성공:', folderChildMatch);
                    break;
                  }
                }
              }
            }
            if (actualDesignFileId) break;
          }
        }
        
        // 4. 이름으로 찾기 (최후의 수단)
        if (!actualDesignFileId) {
          const nameMatch = designFiles.find(df => df.name === nodeToEdit.name);
          if (nameMatch) {
            actualDesignFileId = nameMatch.id;
            designFileInfo = nameMatch;
            console.log('✅ 이름으로 매칭 성공:', nameMatch);
          }
        }
        
        console.log('최종 actualDesignFileId:', actualDesignFileId);
        console.log('최종 designFileInfo:', designFileInfo);
        
        // 실제 Firebase 디자인파일이 없는 경우 - 폴더 구조에서만 이름 변경
        if (!actualDesignFileId && designFiles.length === 0) {
          console.log('⚠️ 실제 Firebase 디자인파일이 없음 - 폴더 구조 이름만 변경');
          
          // 폴더 구조에서 해당 노드 찾아서 이름 변경
          const updatedFolders = [...projectFolders];
          let nameUpdated = false;
          
          for (let i = 0; i < updatedFolders.length; i++) {
            if (updatedFolders[i].children) {
              for (let j = 0; j < updatedFolders[i].children.length; j++) {
                if (updatedFolders[i].children[j].id === editingNode) {
                  updatedFolders[i].children[j].name = editingName.trim();
                  nameUpdated = true;
                  console.log('✅ 폴더 구조에서 이름 변경 성공:', editingNode, '→', editingName.trim());
                  break;
                }
              }
            }
            if (nameUpdated) break;
          }
          
          if (nameUpdated) {
            // 폴더 데이터 저장
            const { saveFolderData } = await import('@/firebase/projects');
            const saveResult = await saveFolderData(currentProject.id, updatedFolders);
            
            if (saveResult.error) {
              console.error('❌ 폴더 데이터 저장 실패:', saveResult.error);
              alert('폴더 데이터 저장에 실패했습니다: ' + saveResult.error);
              handleNameEditCancel();
              return;
            }
            
            console.log('✅ 폴더 데이터 저장 성공');
            
            // 로컬 상태 업데이트
            setProjectFolders(updatedFolders);
            
            // BroadcastChannel로 다른 탭에 알림 (안전하게 처리)
            try {
              if (broadcastChannel && broadcastChannel.constructor.name === 'BroadcastChannel') {
                broadcastChannel.postMessage({ 
                  type: 'FOLDERS_UPDATED', 
                  action: 'design_renamed_in_folder',
                  projectId: currentProject?.id,
                  editingNode,
                  newName: editingName.trim()
                });
                console.log('✅ BroadcastChannel 메시지 전송 성공');
              }
            } catch (error) {
              console.warn('⚠️ BroadcastChannel 메시지 전송 실패:', error.message);
              // BroadcastChannel 오류는 무시하고 계속 진행
            }
            
            // 데이터 새로고침
            loadAllProjectsData();
            
          } else {
            console.error('❌ 폴더 구조에서 노드를 찾을 수 없음:', editingNode);
            alert('해당 디자인파일을 찾을 수 없습니다.');
            handleNameEditCancel();
            return;
          }
          
        } else if (!actualDesignFileId) {
          // 디자인파일이 있어야 하는데 ID를 찾을 수 없는 경우
          console.error('❌ 디자인파일 ID를 찾을 수 없습니다');
          console.error('시도한 editingNode:', editingNode);
          console.error('사용 가능한 designFiles IDs:', designFiles.map(df => df.id));
          alert('디자인파일을 찾을 수 없습니다.');
          handleNameEditCancel();
          return;
          
        } else {
          // 실제 Firebase 디자인파일이 있는 경우 - 정상 처리
          console.log('Firebase updateDesignFile 호출:', actualDesignFileId, editingName.trim());
          const { updateDesignFile } = await import('@/firebase/projects');
          const result = await updateDesignFile(actualDesignFileId, { name: editingName.trim() });
          
          if (result.error) {
            console.error('❌ 디자인파일 이름 변경 실패:', result.error);
            alert('디자인파일 이름 변경에 실패했습니다: ' + result.error);
            handleNameEditCancel();
            return;
          }
          
          console.log('✅ 디자인파일 이름 변경 성공:', actualDesignFileId, editingName.trim());
          
          // BroadcastChannel로 다른 탭에 알림 (안전하게 처리)
          try {
            if (broadcastChannel && broadcastChannel.constructor.name === 'BroadcastChannel') {
              broadcastChannel.postMessage({ 
                type: 'PROJECT_UPDATED', 
                action: 'design_renamed',
                projectId: currentProject?.id,
                designFileId: actualDesignFileId,
                newName: editingName.trim()
              });
              console.log('✅ BroadcastChannel 메시지 전송 성공');
            }
          } catch (error) {
            console.warn('⚠️ BroadcastChannel 메시지 전송 실패:', error.message);
            // BroadcastChannel 오류는 무시하고 계속 진행
          }
          
          // 데이터 새로고침
          loadAllProjectsData();
        }
        
      } else if (nodeToEdit.nodeType === 'folder') {
        // 폴더 이름 수정 (향후 구현)
        console.log('폴더 이름 수정 기능은 곧 구현될 예정입니다.');
        alert('폴더 이름 수정 기능은 곧 구현될 예정입니다.');
      } else {
        console.log('지원되지 않는 노드 타입:', nodeToEdit.nodeType);
      }
      
    } catch (error) {
      console.error('❌ 이름 변경 중 예외 발생:', error);
      alert('이름 변경 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setEditingNode(null);
      setEditingName('');
    }
  };

  // 이름 편집 취소
  const handleNameEditCancel = () => {
    setEditingNode(null);
    setEditingName('');
  };

  // 현재 작업중인 파일의 경로 계산
  const getCurrentWorkingFilePath = (): string[] => {
    if (!currentWorkingFile || !currentProject) return [];
    
    // 1. 프로젝트명을 기본 경로로 설정
    const basePath = [currentProject.title];
    
    // 2. 현재 작업중인 파일이 프로젝트명과 같으면 루트 레벨 디자인 파일
    if (currentWorkingFile === currentProject.title) {
      return basePath;
    }
    
    // 3. 폴더 내에서 해당 파일 찾기
    for (const folder of projectFolders) {
      if (folder.children) {
        for (const child of folder.children) {
          if (child.name === currentWorkingFile) {
            return [...basePath, folder.name, child.name];
          }
        }
      }
    }
    
    // 4. 찾지 못했으면 루트 레벨로 가정
    return [...basePath, currentWorkingFile];
  };

  // 선택된 파일의 경로 계산 (기존 함수 유지)
  const getSelectedFilePath = (): string[] => {
    if (!selectedFile) return [];
    
    const findPath = (nodes: FileNode[], targetId: string, currentPath: string[] = []): string[] | null => {
      for (const node of nodes) {
        const newPath = [...currentPath, node.name];
        
        if (node.id === targetId) {
          return newPath;
        }
        
        if (node.children) {
          const found = findPath(node.children, targetId, newPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    return findPath(files, selectedFile) || [];
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedFile === node.id;
    const isEditing = editingNode === node.id;
    
    // 현재 작업중인 파일인지 확인
    const isCurrentWorkingFile = node.nodeType === 'design' && (
      (node.name === currentWorkingFile) || 
      (node.id === `${currentProject?.id}-design` && currentWorkingFile === currentProject?.title) ||
      (selectedFile === node.id)
    );
    
    if (node.nodeType === 'design') {
      console.log(`renderNode [${node.name}]:`, {
        nodeId: node.id,
        nodeName: node.name,
        currentWorkingFile,
        selectedFile,
        isCurrentWorkingFile,
        isSelected
      });
    }

    return (
      <div key={node.id} className={styles.nodeWrapper}>
        <div
          className={`${styles.node} ${isSelected ? styles.selected : ''} ${isCurrentWorkingFile ? styles.currentWorkingFile : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (!isEditing) {
              if (isCurrentWorkingFile) {
                // 현재 작업중인 파일 클릭 시 리로드 방지
                console.log('현재 작업중인 파일 클릭 - 리로드 방지:', node.name);
                return;
              }
              handleFileClick(node);
            }
          }}
          onContextMenu={(e) => !isEditing && handleContextMenu(e, node.id)}
        >
          <div className={styles.nodeContent}>
            {node.type === 'folder' && (
              <button
                className={styles.expandButton}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(node.id);
                }}
              >
                {hasChildren && node.expanded ? (
                  <ChevronDownIcon size={12} />
                ) : hasChildren ? (
                  <ChevronRightIcon size={12} />
                ) : null}
              </button>
            )}
            
            <div className={styles.icon}>
              {node.icon || (node.type === 'folder' ? (
                <FolderIcon size={16} />
              ) : (
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  border: '1px solid var(--theme-primary)', 
                  borderRadius: '2px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '10px', 
                  color: 'var(--theme-primary)', 
                  fontWeight: 'bold' 
                }}>+</div>
              ))}
            </div>
            
            {isEditing ? (
              <input
                type="text"
                className={styles.nameInput}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNameEditComplete();
                  } else if (e.key === 'Escape') {
                    handleNameEditCancel();
                  }
                }}
                onBlur={handleNameEditComplete}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={styles.name}>{node.name}</span>
            )}
            
            {/* 폴더에 항목 수 표시 */}
            {node.type === 'folder' && node.children && node.children.length > 0 && (
              <span className={styles.itemCount}>{node.children.length}</span>
            )}
          </div>
          
          {!isEditing && (
            <button
              className={styles.moreButton}
              onClick={(e) => handleContextMenu(e, node.id)}
            >
              ⋯
            </button>
          )}
        </div>
        
        {node.type === 'folder' && node.expanded && node.children && (
          <div className={styles.children}>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const currentWorkingFilePath = getCurrentWorkingFilePath();

  return (
    <div 
      className={styles.fileTree} 
      onClick={closeContextMenu}
    >
      <div className={styles.header}>
        {/* 현재 작업중인 파일 경로 표시 */}
        <div className={styles.filePath}>
          {currentWorkingFilePath.length > 0 ? (
            currentWorkingFilePath.map((path, index) => (
              <React.Fragment key={index}>
                {index > 0 && <span className={styles.pathSeparator}>/</span>}
                <span 
                  className={styles.pathSegment}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // 클릭해도 아무 동작하지 않음 (리로드 방지)
                    console.log('경로 클릭 (리로드 방지):', path);
                  }}
                  style={{ cursor: 'default' }}
                >
                  {path}
                </span>
              </React.Fragment>
            ))
          ) : (
            <span className={styles.pathSegment}>작업중인 파일이 없습니다</span>
          )}
        </div>
        
        <div className={styles.headerTop}>
          <ProjectDropdown
            projects={allProjects}
            currentProject={currentProject}
            onProjectSelect={handleProjectSelect}
            onCreateNew={addNewProject}
          />
        </div>
      </div>

      <div className={styles.treeContainer}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <p>파일 목록을 불러오는 중...</p>
          </div>
        ) : files.length > 0 ? (
          files.map(node => renderNode(node))
        ) : currentProject ? (
          <div className={styles.emptyContainer}>
            <p>폴더나 디자인 파일이 없습니다.</p>
          </div>
        ) : (
          <div className={styles.emptyContainer}>
            <p>프로젝트를 선택하세요.</p>
          </div>
        )}
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const node = findNodeById(files, contextMenu.nodeId);
            const nodeType = node?.nodeType || 'unknown';
            
            return (
              <>
                {/* 폴더에만 새폴더 추가 옵션 표시 */}
                {nodeType === 'folder' && (
                  <button
                    className={styles.contextMenuItem}
                    onClick={addNewFolder}
                  >
                    <PlusIcon size={14} />
                    새로운 폴더
                  </button>
                )}
                
                {/* 모든 노드에 이름 수정 옵션 */}
                <button
                  className={styles.contextMenuItem}
                  onClick={() => handleContextAction('rename', contextMenu.nodeId)}
                >
                  <EditIcon size={14} />
                  이름 수정
                </button>
                
                {/* 모든 노드에 공유 옵션 */}
                <button
                  className={styles.contextMenuItem}
                  onClick={() => handleContextAction('copy', contextMenu.nodeId)}
                >
                  <CopyIcon size={14} />
                  공유
                </button>
                
                {/* 루트가 아닌 노드에 삭제 옵션 */}
                {contextMenu.nodeId !== 'project-root' && (
                  <>
                    <hr className={styles.contextMenuDivider} />
                    <button
                      className={`${styles.contextMenuItem} ${styles.deleteMenuItem}`}
                      onClick={() => handleContextAction('delete', contextMenu.nodeId)}
                    >
                      <TrashIcon size={14} />
                      삭제하기
                    </button>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* 저장 확인 모달 */}
      {showSaveConfirmModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSaveConfirmModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>파일 이동</h3>
            </div>
            <div className={styles.modalContent}>
              <p>현재 작업 중인 파일을 저장하고 이동하시겠습니까?</p>
              <p className={styles.modalSubtext}>
                저장하지 않으면 변경사항이 손실될 수 있습니다.
              </p>
            </div>
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelButton}
                onClick={() => setShowSaveConfirmModal(false)}
              >
                취소
              </button>
              <button 
                className={styles.navigateButton}
                onClick={handleNavigateWithoutSave}
              >
                저장 안함
              </button>
              <button 
                className={styles.saveButton}
                onClick={handleSaveAndNavigate}
              >
                저장 후 이동
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 새 프로젝트 생성 모달 */}
      {showCreateProjectModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateProjectModal(false)}>
          <div className={styles.createProjectModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.createProjectModalTitle}>새 프로젝트 만들기</h3>
            <input
              type="text"
              className={styles.createProjectModalInput}
              placeholder="프로젝트 이름을 입력하세요"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newProjectName.trim()) {
                  handleCreateProject();
                } else if (e.key === 'Escape') {
                  setShowCreateProjectModal(false);
                  setNewProjectName('');
                }
              }}
              autoFocus
            />
            <div className={styles.createProjectModalActions}>
              <button 
                className={styles.createProjectModalCancelBtn}
                onClick={() => {
                  setShowCreateProjectModal(false);
                  setNewProjectName('');
                }}
              >
                취소
              </button>
              <button 
                className={styles.createProjectModalCreateBtn}
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileTree;