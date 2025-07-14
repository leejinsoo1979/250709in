import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import TopBar from '../components/dashboard/TopBar';
import ProjectCard from '../components/common/ProjectCard';
import { UserIcon, HomeIcon, UsersIcon, SettingsIcon, LogOutIcon, PlusIcon } from '../components/common/Icons';
import { ProjectSummary } from '../firebase/types';
import { generateDefaultThumbnail } from '../editor/shared/utils/thumbnailCapture';
import Step0 from '../editor/Step0';
import styles from './SimpleDashboard.module.css';

const SimpleDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState('서초 레미안');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  
  // 프로젝트 생성 모달 상태
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Step0 모달 상태
  const [isStep0ModalOpen, setIsStep0ModalOpen] = useState(false);
  
  // 프로젝트 목록 상태
  const [projects, setProjects] = useState(['서초 레미안', '반포 자이', '송파 헬리오시티']);
  
  // 프로젝트 구조 상태 (각 프로젝트마다 폴더 구조)
  const [projectStructure, setProjectStructure] = useState<{[key: string]: string[]}>({
    '서초 레미안': ['안방', '거실'],
    '반포 자이': ['안방', '작은방'],
    '송파 헬리오시티': ['안방', '드레스룸']
  });
  
  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
    projectName: string;
  }>({
    show: false,
    x: 0,
    y: 0,
    projectName: ''
  });
  
  // 프로젝트 데이터를 ProjectSummary 형태로 변환
  const projectCards: ProjectSummary[] = [
    {
      id: '1',
      title: '3단 선반 수납장',
      updatedAt: Timestamp.fromDate(new Date('2025-01-13')),
      furnitureCount: 1,
      spaceSize: {
        width: 200,
        height: 240,
        depth: 60
      },
      thumbnail: (() => {
        const thumb = generateDefaultThumbnail(
          { width: 2000, height: 2400, depth: 600 }, 
          1
        );
        console.log('🖼️ 생성된 썸네일:', thumb?.substring(0, 50) + '...');
        return thumb;
      })()
    },
    {
      id: '2',
      title: '서랍형 수납장',
      updatedAt: Timestamp.fromDate(new Date('2025-01-13')),
      furnitureCount: 1,
      spaceSize: {
        width: 180,
        height: 240,
        depth: 60
      },
      thumbnail: generateDefaultThumbnail(
        { width: 1800, height: 2400, depth: 600 }, 
        2
      )
    }
  ];

  const handleProjectOpen = (id: string) => {
    navigate('/configurator');
  };

  const handleProjectMenu = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    console.log('프로젝트 메뉴 클릭:', id);
  };

  const handleViewModeToggle = (mode: 'grid' | 'list') => {
    setViewMode(mode);
  };

  const handleSortChange = (sort: 'date' | 'name') => {
    setSortBy(sort);
  };

  // 새 프로젝트 생성 모달 열기
  const handleCreateProject = () => {
    setIsCreateModalOpen(true);
    setNewProjectName('');
  };

  // 프로젝트 생성 처리
  const handleCreateProjectSubmit = async () => {
    if (!newProjectName.trim()) return;
    
    setIsCreating(true);
    try {
      // 프로젝트 목록에 추가
      setProjects(prev => [...prev, newProjectName.trim()]);
      setSelectedProject(newProjectName.trim());
      
      // 프로젝트 구조에 기본 폴더 추가
      setProjectStructure(prev => ({
        ...prev,
        [newProjectName.trim()]: ['안방'] // 기본 폴더
      }));
      
      // 모달 닫기
      setIsCreateModalOpen(false);
      setNewProjectName('');
      
      console.log('새 프로젝트 생성:', newProjectName.trim());
    } catch (error) {
      console.error('프로젝트 생성 실패:', error);
    } finally {
      setIsCreating(false);
    }
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setNewProjectName('');
  };

  // 새로운 디자인 모달 열기
  const handleCreateDesign = () => {
    setIsStep0ModalOpen(true);
  };

  // Step0 모달 닫기
  const handleCloseStep0Modal = () => {
    setIsStep0ModalOpen(false);
  };

  // 프로젝트 우클릭 메뉴
  const handleProjectRightClick = (event: React.MouseEvent, projectName: string) => {
    event.preventDefault();
    setContextMenu({
      show: true,
      x: event.pageX,
      y: event.pageY,
      projectName
    });
  };

  // 컨텍스트 메뉴 숨기기
  const hideContextMenu = () => {
    setContextMenu(prev => ({ ...prev, show: false }));
  };

  // 컨텍스트 메뉴 액션
  const handleContextMenuAction = (action: string) => {
    console.log(`${action} 액션 실행:`, contextMenu.projectName);
    hideContextMenu();
  };

  // 전체 클릭 시 컨텍스트 메뉴 숨기기
  const handleGlobalClick = () => {
    hideContextMenu();
  };

  return (
    <div className={styles.dashboard} onClick={handleGlobalClick}>
      {/* 좌측 사이드바 */}
      <aside className={styles.sidebar}>
        <div className={styles.profile}>
          <div className={styles.userAvatar}>
            <UserIcon size={24} />
          </div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>사용자명</div>
            <div className={styles.userEmail}>user@example.com</div>
          </div>
          <button className={styles.createBtn} onClick={handleCreateProject}>
            <PlusIcon size={16} />
            새 프로젝트
          </button>
          <button className={styles.inviteBtn}>
            <UsersIcon size={16} />
            사용자 초대
          </button>
        </div>
        
        <nav className={styles.nav}>
          <div className={styles.navItem}>
            <HomeIcon size={18} />
            전체 프로젝트
          </div>
          <div className={styles.navItem}>
            <UserIcon size={18} />
            프로필
          </div>
          <div className={styles.navItem}>
            <UsersIcon size={18} />
            팀
          </div>
          <div className={styles.navItem}>
            <SettingsIcon size={18} />
            설정
          </div>
          <div className={styles.navItem}>
            <LogOutIcon size={18} />
            로그아웃
          </div>
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className={styles.main}>
        {/* TopBar 컴포넌트 사용 */}
        <TopBar
          viewMode={viewMode}
          sortBy={sortBy}
          onViewModeToggle={handleViewModeToggle}
          onSortChange={handleSortChange}
        />

        <div className={styles.content}>
          {/* 프로젝트 트리 */}
          <aside className={styles.projectTree}>
            <div className={styles.treeHeader}>
              <div className={styles.dropdown}>
                <button 
                  className={styles.dropdownBtn}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  {selectedProject} ▼
                </button>
                {isDropdownOpen && (
                  <div className={styles.dropdownMenu}>
                    {projects.map(project => (
                      <button
                        key={project}
                        onClick={() => {
                          setSelectedProject(project);
                          setIsDropdownOpen(false);
                        }}
                      >
                        {project}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className={styles.tree}>
              {/* 선택된 프로젝트의 폴더 구조 표시 */}
              {projectStructure[selectedProject] && (
                <div className={styles.treeItem}>
                  <span 
                    onContextMenu={(e) => handleProjectRightClick(e, selectedProject)}
                    className={styles.projectFolder}
                  >
                    📁 {selectedProject}
                  </span>
                  <span className={styles.count}>{projectStructure[selectedProject].length}</span>
                </div>
              )}
              
              {/* 프로젝트 내 폴더들 */}
              {projectStructure[selectedProject]?.map((folder, index) => (
                <div key={index} className={styles.treeSubItem}>
                  <span>📂 {folder}</span>
                  <span className={styles.count}>0</span>
                </div>
              ))}
            </div>
          </aside>

          {/* 프로젝트 카드 영역 */}
          <section className={styles.designArea}>
            <div className={`${styles.designGrid} ${viewMode === 'list' ? styles.listView : ''}`}>
              <div 
                className={styles.createCard}
                onClick={handleCreateDesign}
              >
                <div className={styles.createIcon}>
                  <PlusIcon size={32} />
                </div>
                <div>새로운 디자인</div>
              </div>
              
              {projectCards.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={handleProjectOpen}
                  onMenuClick={handleProjectMenu}
                  viewMode={viewMode}
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* 컨텍스트 메뉴 */}
      {contextMenu.show && (
        <div 
          className={styles.contextMenu}
          style={{ 
            left: contextMenu.x,
            top: contextMenu.y
          }}
        >
          <div 
            className={styles.contextMenuItem}
            onClick={() => handleContextMenuAction('새 폴더')}
          >
            📁 새 폴더
          </div>
          <div 
            className={styles.contextMenuItem}
            onClick={() => handleContextMenuAction('새 파일')}
          >
            📄 새 파일
          </div>
          <div 
            className={styles.contextMenuItem}
            onClick={() => handleContextMenuAction('삭제')}
          >
            🗑️ 삭제
          </div>
        </div>
      )}

      {/* 새 프로젝트 생성 모달 */}
      {isCreateModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>새 프로젝트 생성</h2>
            <div className={styles.modalContent}>
              <input
                type="text"
                placeholder="프로젝트 이름을 입력하세요"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className={styles.modalInput}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateProjectSubmit()}
                autoFocus
              />
            </div>
            <div className={styles.modalActions}>
              <button 
                className={styles.modalCancelBtn}
                onClick={handleCloseModal}
                disabled={isCreating}
              >
                취소
              </button>
              <button 
                className={styles.modalCreateBtn}
                onClick={handleCreateProjectSubmit}
                disabled={!newProjectName.trim() || isCreating}
              >
                {isCreating ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step0 모달 */}
      {isStep0ModalOpen && (
        <div className={styles.step0ModalOverlay}>
          <div className={styles.step0ModalContent}>
            <Step0 onClose={handleCloseStep0Modal} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleDashboard;