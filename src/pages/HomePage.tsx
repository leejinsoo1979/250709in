import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { getUserProjects, createProject, deleteProject } from '../firebase/projects';
import { signOutUser } from '../firebase/auth';
import { ProjectSummary } from '../firebase/types';
import { DEFAULT_SPACE_CONFIG } from '../store/core/spaceConfigStore';
import Card from '../components/common/Card';
import LoadingSpinner from '../components/common/LoadingSpinner';
import styles from './HomePage.module.css';

// 포털을 위한 컴포넌트 생성
const DropdownPortal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
  onAction: (action: string) => void;
}> = ({ isOpen, onClose, position, onAction }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className={styles.dropdownPortal}
      style={{ 
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 999999 // 매우 높은 z-index
      }}
    >
      <button onClick={() => onAction('duplicate')}>Duplicate</button>
      <button onClick={() => onAction('rename')}>Rename</button>
      <button onClick={() => onAction('collaborate')}>Collaborate</button>
      <button onClick={() => onAction('delete')} className={styles.deleteMenuItem}>Delete</button>
    </div>
  );
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dropdownProject, setDropdownProject] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // 프로젝트 목록 로드
  const loadProjects = useCallback(async () => {
    if (!user) return;
    
    setLoadingProjects(true);
    try {
      const { projects: userProjects, error } = await getUserProjects();
      if (error) {
        console.error('프로젝트 목록 로드 에러:', error);
        // Firebase 연결 문제일 수 있으므로 빈 배열로 설정
        setProjects([]);
      } else {
        setProjects(userProjects);
      }
    } catch (error) {
      console.error('프로젝트 목록 로드 실패:', error);
      // 에러 발생 시 빈 배열로 설정하여 UI가 깨지지 않도록 함
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [user]);

  // 사용자 로그인 시 프로젝트 목록 로드
  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user, loadProjects]);

  // 다른 창에서 프로젝트 업데이트 알림 수신 (BroadcastChannel)
  useEffect(() => {
    if (!user) return;

    const channel = new BroadcastChannel('project-updates');
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'PROJECT_SAVED') {
        console.log('📡 다른 창에서 프로젝트 저장됨, 목록 새로고침:', event.data.projectId);
        loadProjects(); // 프로젝트 목록 새로고침
      }
    };

    channel.addEventListener('message', handleMessage);
    console.log('📡 프로젝트 업데이트 리스너 등록');

    // 컴포넌트 언마운트 시 리스너 정리
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      console.log('📡 프로젝트 업데이트 리스너 해제');
    };
  }, [user, loadProjects]);

  // 새 프로젝트 생성
  const handleCreateProject = async () => {
    if (!user) {
      // 로그인이 필요한 경우 인증 페이지로 이동
      navigate('/auth');
      return;
    }

    setCreating(true);
    
    // 팝업 차단 방지를 위해 사용자 액션 직후 새창 열기
    const newWindow = window.open('about:blank', '_blank');
    
    try {
      // 기본값으로 새 프로젝트 생성
      const now = new Date();
      const year = String(now.getFullYear()).slice(-2); // 연도 뒤 2자리
      const month = String(now.getMonth() + 1).padStart(2, '0'); // 월 2자리
      const day = String(now.getDate()).padStart(2, '0'); // 일 2자리
      const defaultTitle = `가구 ${year}${month}${day}`;
      
      const { id, error } = await createProject({
        title: defaultTitle,
        projectData: {
          title: defaultTitle,
          location: ''
        },
        spaceConfig: DEFAULT_SPACE_CONFIG,
        furniture: {
          placedModules: []
        }
      });

      if (error) {
        console.error('프로젝트 생성 에러:', error);
        alert('프로젝트 생성에 실패했습니다: ' + error);
        // 에러 시 새창 닫기
        if (newWindow) newWindow.close();
      } else if (id) {
        console.log('✅ 새 프로젝트 생성 성공:', id);
        // 프로젝트 생성 성공 시 새창에 URL 설정
        const step0Url = `/step0?projectId=${id}`;
        if (newWindow) {
          newWindow.location.href = step0Url;
        } else {
          // 새창이 차단된 경우 현재 창에서 이동
          window.open(step0Url, '_blank');
        }
      }
    } catch (error) {
      console.error('프로젝트 생성 실패:', error);
      alert('프로젝트 생성 중 오류가 발생했습니다.');
      // 에러 시 새창 닫기
      if (newWindow) newWindow.close();
    } finally {
      setCreating(false);
    }
  };

  // 기존 프로젝트 열기 (새창)
  const handleOpenProject = (projectId: string) => {
    const editorUrl = `/configurator?projectId=${projectId}`;
    window.open(editorUrl, '_blank');
  };

  // 도면 보기 (유료 기능)
  const handleViewDrawing = () => {
    alert('유료회원 메뉴입니다');
  };



  // 드롭다운 토글 함수 수정 (position: fixed 사용 시 scrollY 제거 + 경계 체크)
  const toggleDropdown = (projectId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    
    if (dropdownProject === projectId) {
      setDropdownProject(null);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const dropdownWidth = 140;
      const dropdownHeight = 160; // 대략적인 드롭다운 높이
      
      // 기본 위치: 버튼 바로 아래, 오른쪽 정렬
      let top = rect.bottom + 4;
      let left = rect.right - dropdownWidth;
      
      // 화면 오른쪽 경계 체크
      if (left < 0) {
        left = rect.left; // 버튼 왼쪽 정렬로 변경
      }
      if (left + dropdownWidth > window.innerWidth) {
        left = window.innerWidth - dropdownWidth - 8; // 화면 끝에서 8px 간격
      }
      
      // 화면 아래쪽 경계 체크
      if (top + dropdownHeight > window.innerHeight) {
        top = rect.top - dropdownHeight - 4; // 버튼 위쪽으로 표시
      }
      
      setDropdownPosition({ top, left });
      setDropdownProject(projectId);
    }
  };

  // 드롭다운 액션 처리
  const handleDropdownAction = async (action: string) => {
    if (!dropdownProject) return;

    const project = projects.find(p => p.id === dropdownProject);
    if (!project) return;

    switch (action) {
      case 'duplicate':
        alert('Duplicate 기능은 아직 구현되지 않았습니다.');
        break;
      case 'rename': {
        const newName = prompt('새 프로젝트 이름을 입력하세요:', project.title);
        if (newName && newName.trim()) {
          // 이름 변경 기능 구현 예정
          alert('Rename 기능은 아직 구현되지 않았습니다.');
        }
        break;
      }
      case 'collaborate':
        alert('Collaborate 기능은 아직 구현되지 않았습니다.');
        break;
      case 'delete':
        if (window.confirm(`"${project.title}" 프로젝트를 삭제하시겠습니까?`)) {
          try {
            await deleteProject(project.id);
            loadProjects();
          } catch (error) {
            console.error('프로젝트 삭제 실패:', error);
            alert('프로젝트 삭제에 실패했습니다.');
          }
        }
        break;
    }

    setDropdownProject(null);
  };

  // 로그아웃 처리
  const handleLogout = async () => {
    try {
      const { error } = await signOutUser();
      if (error) {
        console.error('로그아웃 에러:', error);
        alert('로그아웃에 실패했습니다: ' + error);
      } else {
        console.log('✅ 로그아웃 성공');
        // 로그아웃 후 프로젝트 목록 초기화
        setProjects([]);
      }
    } catch (error) {
      console.error('로그아웃 실패:', error);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  // 날짜 포맷 함수
  const formatDate = (timestamp: { seconds?: number } | Date | string | null | undefined): string => {
    if (!timestamp) return '날짜 미상';
    
    let date: Date;
    if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp && timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      date = new Date();
    }
    
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return '방금 전';
    } else if (diffInHours < 24) {
      return `${diffInHours}시간 전`;
    } else if (diffInHours < 24 * 7) {
      return `${Math.floor(diffInHours / 24)}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  // 로딩 중일 때
  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSpinner 
          message="사용자 정보를 불러오는 중..."
          size="large"
          type="spinner"
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* 헤더 */}
        <div className={styles.header}>
          <h1 className={styles.title}>
            🏠 가구 설계 도구
          </h1>
          <p className={styles.subtitle}>
            직관적인 3D 인터페이스로 맞춤형 가구를 설계하고 관리하세요
          </p>
        </div>

        {user ? (
          <div className={styles.mainCard}>
            <div className={styles.userSection}>
              <div className={styles.userInfo}>
                <h2>
                  안녕하세요, {user.displayName || user.email}님! 👋
                </h2>
                <p>
                  새로운 프로젝트를 시작하거나 기존 프로젝트를 계속 작업하세요
                </p>
              </div>
              <button 
                className={styles.logoutButton}
                onClick={handleLogout}
                title="로그아웃"
              >
                로그아웃
              </button>
            </div>

            {/* 프로젝트 목록 */}
            <div className={styles.projectsSection}>
              <h3>
                내 프로젝트 ({projects.length})
              </h3>
              
                             {loadingProjects ? (
                 <div className={styles.loadingProjects}>
                   <LoadingSpinner 
                     message="프로젝트 목록을 불러오는 중..."
                     size="medium"
                     type="dots"
                   />
                 </div>
               ) : (
                <div className={styles.projectGrid}>
                  {/* 새 프로젝트 추가 카드 */}
                  <div 
                    className={`${styles.projectCard} ${styles.newProjectCard}`}
                    onClick={handleCreateProject}
                  >
                    <div className={styles.newProjectContent}>
                      <div className={styles.newProjectIcon}>
                        {creating ? '⏳' : '+'}
                      </div>
                      <div className={styles.newProjectText}>
                        {creating ? '생성 중...' : 'New project'}
                      </div>
                    </div>
                  </div>

                  {/* 기존 프로젝트 카드들 */}
                  {projects.map((project) => (
                    <div key={project.id} className={styles.projectCard}>
                      {/* 프로젝트 썸네일 */}
                      <div 
                        className={styles.projectThumbnail}
                        onClick={() => handleOpenProject(project.id)}
                      >
                        {project.thumbnail ? (
                          <img 
                            src={project.thumbnail} 
                            alt={project.title}
                            className={styles.thumbnailImage}
                          />
                        ) : (
                          <div className={styles.thumbnailPlaceholder}>
                            <div className={styles.editIcon}>✏️</div>
                          </div>
                        )}
                        <div className={styles.versionBadge}>V5.0</div>
                        
                        {/* 메뉴 버튼 */}
                        <button 
                          className={styles.menuButton}
                          onClick={(e) => toggleDropdown(project.id, e)}
                        >
                          ⋯
                        </button>
                      </div>

                      {/* 프로젝트 정보 */}
                      <div className={styles.projectInfo}>
                        <h4 className={styles.projectTitle}>
                          {project.title}
                        </h4>
                        <div className={styles.projectMeta}>
                          <span className={styles.projectTime}>
                            {formatDate(project.updatedAt)}
                          </span>
                        </div>
                      </div>

                      {/* 도면 보기 버튼 */}
                      <button 
                        className={styles.projectDetailsButton}
                        onClick={handleViewDrawing}
                      >
                        도면 보기
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {projects.length === 0 && !loadingProjects && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📁</div>
                  <h4>아직 프로젝트가 없습니다</h4>
                  <p>새 프로젝트를 만들어서 가구 설계를 시작해보세요!</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.mainCard}>
            <div className={styles.loginSection}>
              <h2>
                로그인이 필요합니다
              </h2>
              <p>
                프로젝트를 생성하고 관리하려면 먼저 로그인해주세요
              </p>
              <button 
                className={styles.loginButton}
                onClick={() => navigate('/auth')}
              >
                로그인하기
              </button>
            </div>
          </div>
        )}

        {/* 기능 소개 */}
        <div className={styles.featuresGrid}>
          <Card>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🎨</div>
              <h3>직관적인 설계</h3>
              <p>
                드래그 앤 드롭으로 쉽게 가구를 배치하고 수정할 수 있습니다
              </p>
            </div>
          </Card>
          
          <Card>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🔄</div>
              <h3>실시간 3D</h3>
              <p>
                변경사항이 즉시 3D 뷰에 반영되어 결과를 바로 확인할 수 있습니다
              </p>
            </div>
          </Card>
          
          <Card>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>☁️</div>
              <h3>클라우드 저장</h3>
              <p>
                프로젝트가 안전하게 클라우드에 저장되어 언제든 접근할 수 있습니다
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* 드롭다운 포털 */}
      <DropdownPortal
        isOpen={dropdownProject !== null}
        onClose={() => setDropdownProject(null)}
        position={dropdownPosition}
        onAction={handleDropdownAction}
      />
    </div>
  );
};

export default HomePage; 