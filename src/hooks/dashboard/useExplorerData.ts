import { useState, useEffect, useCallback } from 'react';
import { doc, getDocFromServer, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { ProjectSummary } from '@/firebase/types';
import {
  getUserProjects,
  loadFolderData,
  saveFolderData,
  FolderData,
  getDesignFiles,
  subscribeToUserProjects,
} from '@/firebase/projects';
import {
  getProjectCollaborators,
  type ProjectCollaborator,
  getSharedProjectsForUser,
  getMySharedLinks,
} from '@/firebase/shareLinks';
import { useAuth } from '@/auth/AuthProvider';
import type { ExplorerItem, QuickAccessMenu, UseExplorerDataReturn } from './types';

export function useExplorerData(
  currentProjectId: string | null,
  currentFolderId: string | null,
  activeMenu: QuickAccessMenu,
  searchTerm?: string
): UseExplorerDataReturn {
  const { user } = useAuth();

  // 프로젝트 목록
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [, setInitialLoadComplete] = useState(false);
  const [error] = useState<string | null>(null);

  // 디자인 파일
  const [projectDesignFiles, setProjectDesignFiles] = useState<{ [projectId: string]: any[] }>({});
  const [designFilesLoading, setDesignFilesLoading] = useState<{ [projectId: string]: boolean }>({});

  // 폴더 데이터
  const [folders, setFolders] = useState<{ [projectId: string]: FolderData[] }>({});

  // 프로젝트 소유자 정보
  const [projectOwners, setProjectOwners] = useState<{ [userId: string]: { displayName: string; photoURL?: string | null } }>({});

  // 협업자
  const [projectCollaborators, setProjectCollaboratorsState] = useState<{ [projectId: string]: ProjectCollaborator[] }>({});

  // 공유 프로젝트
  const [sharedByMeProjects, setSharedByMeProjects] = useState<ProjectSummary[]>([]);
  const [sharedWithMeProjects, setSharedWithMeProjects] = useState<ProjectSummary[]>([]);

  // 북마크
  const [bookmarkedProjects, setBookmarkedProjects] = useState<Set<string>>(new Set());
  const [bookmarkedDesigns, setBookmarkedDesigns] = useState<Set<string>>(new Set());
  const [bookmarkedFolders, setBookmarkedFolders] = useState<Set<string>>(new Set());

  // --- 데이터 로딩 함수들 ---

  const loadDesignFilesForProject = useCallback(async (projectId: string) => {
    if (!user) return;

    setDesignFilesLoading(prev => ({ ...prev, [projectId]: true }));

    try {
      const { designFiles, error } = await getDesignFiles(projectId);
      if (error) {
        console.error('디자인 파일 로드 실패:', error);
      } else {
        setProjectDesignFiles(prev => ({ ...prev, [projectId]: designFiles }));

        // 소유자 프로필 정보 로드
        const ownerIds = new Set(
          designFiles.map((df: any) => df.userId).filter(Boolean)
        );
        if (ownerIds.size > 0) {
          const fetchedOwners = await Promise.all(
            Array.from(ownerIds).map(async (ownerId) => {
              try {
                const ownerDoc = await getDocFromServer(doc(db, 'users', ownerId));
                let displayName = '';
                let photoURL: string | null = null;
                if (ownerDoc.exists()) {
                  const data = ownerDoc.data();
                  displayName = data.displayName || data.name || data.email?.split?.('@')?.[0] || '';
                  photoURL = data.photoURL || null;
                }
                if (!photoURL) {
                  try {
                    const profileDoc = await getDocFromServer(doc(db, 'userProfiles', ownerId));
                    if (profileDoc.exists()) {
                      const pd = profileDoc.data();
                      photoURL = pd.photoURL || null;
                      if (!displayName) displayName = pd.displayName || '';
                    }
                  } catch { /* ignore */ }
                }
                return { ownerId, displayName, photoURL };
              } catch {
                return { ownerId, displayName: '', photoURL: null };
              }
            })
          );
          setProjectOwners(prev => {
            const next = { ...prev };
            fetchedOwners.forEach(o => {
              if (o.displayName || o.photoURL) {
                next[o.ownerId] = { displayName: o.displayName, photoURL: o.photoURL };
              } else if (!next[o.ownerId]) {
                next[o.ownerId] = { displayName: '', photoURL: null };
              }
            });
            return next;
          });
        }
      }
    } catch (err) {
      console.error('디자인 파일 로드 에러:', err);
    } finally {
      setDesignFilesLoading(prev => ({ ...prev, [projectId]: false }));
    }
  }, [user]);

  const loadFolderDataForProject = useCallback(async (projectId: string) => {
    try {
      const { folders: loadedFolders, error } = await loadFolderData(projectId);
      if (error) {
        // localStorage 백업에서 복원
        const uid = user?.uid;
        if (uid) {
          const backup = localStorage.getItem(`folders_backup_${uid}_${projectId}`);
          if (backup) {
            try {
              const backupFolders = JSON.parse(backup);
              setFolders(prev => ({ ...prev, [projectId]: backupFolders }));
              return;
            } catch { /* ignore */ }
          }
        }
      } else {
        if (loadedFolders.length === 0) {
          const uid = user?.uid;
          if (uid) {
            const backup = localStorage.getItem(`folders_backup_${uid}_${projectId}`);
            if (backup) {
              try {
                const backupFolders = JSON.parse(backup);
                if (backupFolders.length > 0) {
                  setFolders(prev => ({ ...prev, [projectId]: backupFolders }));
                  saveFolderData(projectId, backupFolders).catch(() => {});
                  return;
                }
              } catch { /* ignore */ }
            }
          }
        }
        setFolders(prev => ({ ...prev, [projectId]: loadedFolders }));
      }
    } catch (err) {
      console.error('폴더 로드 에러:', err);
      const uid = user?.uid;
      if (uid) {
        const backup = localStorage.getItem(`folders_backup_${uid}_${projectId}`);
        if (backup) {
          try {
            setFolders(prev => ({ ...prev, [projectId]: JSON.parse(backup) }));
          } catch { /* ignore */ }
        }
      }
    }
  }, [user]);

  // --- 실시간 구독 ---

  useEffect(() => {
    if (!user) {
      setProjectsLoading(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      const unsubscribe = subscribeToUserProjects(user.uid, (loadedProjects) => {
        setProjects(loadedProjects);
        setProjectsLoading(false);
        setInitialLoadComplete(true);
      });
      return () => unsubscribe();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [user]);

  // 프로젝트 로드 시 디자인 파일 로드
  useEffect(() => {
    if (projects.length > 0 && user) {
      projects.forEach(project => {
        if (!projectDesignFiles[project.id] && !designFilesLoading[project.id]) {
          loadDesignFilesForProject(project.id);
        }
      });
    }
  }, [projects, user, loadDesignFilesForProject]);

  // 공유 프로젝트 로드
  useEffect(() => {
    if (!user) return;
    const loadShared = async () => {
      try {
        const shared = await getSharedProjectsForUser(user.uid);
        setSharedWithMeProjects(shared);

        const myLinks = await getMySharedLinks(user.uid);
        const sharedByMe = projects.filter(p => {
          const collabs = projectCollaborators[p.id];
          return collabs && collabs.length > 0;
        });

        const sharedByMeMap = new Map<string, any>();
        sharedByMe.forEach(p => sharedByMeMap.set(p.id, p));
        myLinks.forEach(link => {
          if (!sharedByMeMap.has(link.projectId)) {
            sharedByMeMap.set(link.projectId, {
              id: link.projectId,
              title: link.projectName,
              userId: user.uid,
              createdAt: link.createdAt,
              updatedAt: link.createdAt,
            });
          }
        });

        setSharedByMeProjects(Array.from(sharedByMeMap.values()));
      } catch (err) {
        console.error('공유 프로젝트 로드 실패:', err);
      }
    };
    loadShared();
  }, [user, projects, projectCollaborators]);

  // 협업자 정보 로드
  useEffect(() => {
    const allProjects = [...projects, ...sharedByMeProjects, ...sharedWithMeProjects];
    if (allProjects.length === 0) return;

    const fetchAll = async () => {
      const map: { [id: string]: ProjectCollaborator[] } = {};
      for (const p of allProjects) {
        try {
          const collabs = await getProjectCollaborators(p.id);
          if (collabs.length > 0) map[p.id] = collabs;
        } catch { /* ignore */ }
      }
      setProjectCollaboratorsState(map);
    };
    fetchAll();
  }, [projects, sharedByMeProjects, sharedWithMeProjects]);

  // 북마크 로드 (localStorage)
  useEffect(() => {
    if (!user) return;
    try {
      const bp = localStorage.getItem(`bookmarks_projects_${user.uid}`);
      const bd = localStorage.getItem(`bookmarks_designs_${user.uid}`);
      const bf = localStorage.getItem(`bookmarks_folders_${user.uid}`);
      if (bp) setBookmarkedProjects(new Set(JSON.parse(bp)));
      if (bd) setBookmarkedDesigns(new Set(JSON.parse(bd)));
      if (bf) setBookmarkedFolders(new Set(JSON.parse(bf)));
    } catch { /* ignore */ }
  }, [user]);

  // --- currentItems 계산 ---

  // 삭제되지 않은 프로젝트만 필터 (일반 뷰용)
  const activeProjects = projects.filter(p => !p.isDeleted);
  // 삭제된 프로젝트 (휴지통용)
  const deletedProjects = projects.filter(p => p.isDeleted);

  const currentItems: ExplorerItem[] = (() => {
    // 글로벌 검색: searchTerm이 있으면 모든 프로젝트 + 모든 디자인 파일에서 검색
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const items: ExplorerItem[] = [];

      // 프로젝트 검색
      activeProjects.forEach(p => {
        if (p.title.toLowerCase().includes(term)) {
          items.push({
            id: p.id, name: p.title, type: 'project',
            updatedAt: p.updatedAt, thumbnail: p.thumbnail,
            spaceSize: p.spaceSize, furnitureCount: p.furnitureCount,
            status: p.status, isShared: p.isShared,
          });
        }
      });

      // 모든 디자인 파일 검색
      Object.entries(projectDesignFiles).forEach(([projectId, files]) => {
        (files || []).filter((df: any) => !df.isDeleted).forEach((df: any) => {
          if (df.name && df.name.toLowerCase().includes(term)) {
            const owner = projectOwners[df.userId];
            items.push({
              id: df.id, name: df.name, type: 'design',
              projectId, folderId: df.folderId,
              updatedAt: df.updatedAt, thumbnail: df.thumbnail,
              spaceSize: df.spaceSize, furnitureCount: df.furnitureCount,
              userId: df.userId,
              ownerName: owner?.displayName,
              ownerPhotoURL: owner?.photoURL || undefined,
            });
          }
        });
      });

      // 폴더 검색
      Object.entries(folders).forEach(([projectId, projectFolders]) => {
        projectFolders.forEach(folder => {
          if (folder.name.toLowerCase().includes(term)) {
            const folderTimestamp = folder.createdAt
              || (folder.id.startsWith('folder_') ? parseInt(folder.id.split('_')[1], 10) : undefined);
            items.push({
              id: folder.id, name: folder.name, type: 'folder',
              projectId,
              updatedAt: folderTimestamp ? Timestamp.fromMillis(folderTimestamp) : undefined,
            });
          }
        });
      });

      return items;
    }

    // 휴지통 메뉴
    if (activeMenu === 'trash') {
      const items: ExplorerItem[] = [];
      // 삭제된 프로젝트
      deletedProjects.forEach(p => {
        items.push({
          id: p.id, name: p.title, type: 'project',
          updatedAt: p.updatedAt, thumbnail: p.thumbnail,
          spaceSize: p.spaceSize, status: p.status,
        });
      });
      // 삭제된 디자인 파일 (모든 프로젝트에서)
      Object.entries(projectDesignFiles).forEach(([projectId, files]) => {
        (files || []).filter((df: any) => df.isDeleted).forEach((df: any) => {
          const owner = projectOwners[df.userId];
          items.push({
            id: df.id, name: df.name, type: 'design',
            projectId, folderId: df.folderId,
            updatedAt: df.deletedAt || df.updatedAt, thumbnail: df.thumbnail,
            spaceSize: df.spaceSize, furnitureCount: df.furnitureCount,
            userId: df.userId,
            ownerName: owner?.displayName,
            ownerPhotoURL: owner?.photoURL || undefined,
          });
        });
      });
      return items;
    }

    // 빠른 액세스 메뉴 모드
    if (activeMenu === 'bookmarks') {
      const items: ExplorerItem[] = [];
      activeProjects.filter(p => bookmarkedProjects.has(p.id)).forEach(p => {
        items.push({
          id: p.id, name: p.title, type: 'project',
          updatedAt: p.updatedAt, thumbnail: p.thumbnail,
          spaceSize: p.spaceSize, status: p.status, isShared: p.isShared,
        });
      });
      return items;
    }

    if (activeMenu === 'shared-with-me') {
      return sharedWithMeProjects.map(p => ({
        id: p.id, name: p.title, type: 'project' as const,
        updatedAt: p.updatedAt, thumbnail: p.thumbnail,
        spaceSize: p.spaceSize, status: p.status, isShared: true,
      }));
    }

    if (activeMenu === 'shared-by-me') {
      return sharedByMeProjects.map(p => ({
        id: p.id, name: p.title, type: 'project' as const,
        updatedAt: p.updatedAt, thumbnail: p.thumbnail,
        spaceSize: p.spaceSize, status: p.status, isShared: true,
      }));
    }

    // 프로젝트가 선택되지 않은 경우 → 프로젝트 목록 표시
    if (!currentProjectId) {
      let filteredProjects = activeProjects;
      if (activeMenu === 'in-progress') {
        filteredProjects = activeProjects.filter(p => !p.status || p.status === 'in_progress');
      } else if (activeMenu === 'completed') {
        filteredProjects = activeProjects.filter(p => p.status === 'completed');
      }
      return filteredProjects.map(p => ({
        id: p.id, name: p.title, type: 'project' as const,
        updatedAt: p.updatedAt, thumbnail: p.thumbnail,
        spaceSize: p.spaceSize, furnitureCount: p.furnitureCount,
        status: p.status, isShared: p.isShared,
      }));
    }

    // 프로젝트 선택 + 폴더 미선택 → 해당 프로젝트의 폴더 + 루트 디자인 파일
    const items: ExplorerItem[] = [];

    // 폴더들
    const projectFolders = folders[currentProjectId] || [];
    if (!currentFolderId) {
      projectFolders.forEach(folder => {
        // createdAt이 없는 기존 폴더는 id에서 타임스탬프 추출 (folder_1720000000000 형식)
        const folderTimestamp = folder.createdAt
          || (folder.id.startsWith('folder_') ? parseInt(folder.id.split('_')[1], 10) : undefined);
        items.push({
          id: folder.id, name: folder.name, type: 'folder',
          projectId: currentProjectId,
          updatedAt: folderTimestamp ? Timestamp.fromMillis(folderTimestamp) : undefined,
        });
      });
    }

    // 디자인 파일들 (삭제되지 않은 것만)
    const designFiles = projectDesignFiles[currentProjectId] || [];
    const filteredDesignFiles = (currentFolderId
      ? designFiles.filter((df: any) => df.folderId === currentFolderId)
      : designFiles.filter((df: any) => !df.folderId)
    ).filter((df: any) => !df.isDeleted);

    filteredDesignFiles.forEach((df: any) => {
      const owner = projectOwners[df.userId];
      items.push({
        id: df.id, name: df.name, type: 'design',
        projectId: currentProjectId, folderId: df.folderId,
        updatedAt: df.updatedAt, thumbnail: df.thumbnail,
        spaceSize: df.spaceSize, furnitureCount: df.furnitureCount,
        userId: df.userId,
        ownerName: owner?.displayName,
        ownerPhotoURL: owner?.photoURL || undefined,
      });
    });

    return items;
  })();

  // --- 리프레시 함수들 ---

  const refreshProjects = useCallback(async () => {
    if (!user) return;
    setProjectsLoading(true);
    try {
      const { projects: loaded, error } = await getUserProjects();
      if (!error) {
        setProjects(loaded);
      }
    } catch { /* ignore */ } finally {
      setProjectsLoading(false);
    }
  }, [user]);

  const refreshDesignFiles = useCallback(async (projectId: string) => {
    await loadDesignFilesForProject(projectId);
  }, [loadDesignFilesForProject]);

  const refreshFolders = useCallback(async (projectId: string) => {
    await loadFolderDataForProject(projectId);
  }, [loadFolderDataForProject]);

  // 현재 프로젝트 선택 시 폴더/디자인 파일 로드
  useEffect(() => {
    if (currentProjectId && user) {
      if (!folders[currentProjectId]) {
        loadFolderDataForProject(currentProjectId);
      }
      if (!projectDesignFiles[currentProjectId]) {
        loadDesignFilesForProject(currentProjectId);
      }
    }
  }, [currentProjectId, user]);

  const isLoading = projectsLoading || (currentProjectId ? !!designFilesLoading[currentProjectId] : false);

  return {
    projects,
    currentItems,
    folders,
    projectDesignFiles,
    isLoading,
    projectsLoading,
    error,
    projectOwners,
    sharedByMeProjects,
    sharedWithMeProjects,
    bookmarkedProjects,
    bookmarkedDesigns,
    bookmarkedFolders,
    refreshProjects,
    refreshDesignFiles,
    refreshFolders,
  };
}
