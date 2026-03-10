import { useState, useCallback } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { deleteProject, deleteDesignFile, saveFolderData } from '@/firebase/projects';
import type { DragState, ExplorerItem, UseExplorerDataReturn, UseExplorerNavigationReturn, UseExplorerActionsReturn } from './types';

export function useExplorerActions(
  data: UseExplorerDataReturn,
  nav: UseExplorerNavigationReturn
): UseExplorerActionsReturn {
  const { user } = useAuth();

  // 선택 상태
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // 드래그앤드롭 상태
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedItem: null,
    dragOverFolder: null,
  });

  // --- 선택 ---

  const selectItem = useCallback((id: string, multi = false) => {
    setSelectedItems(prev => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      }
      // 단일 선택: 이미 선택된 거면 해제, 아니면 교체
      if (prev.has(id) && prev.size === 1) {
        return new Set();
      }
      return new Set([id]);
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = data.currentItems.map(item => item.id);
    setSelectedItems(new Set(allIds));
  }, [data.currentItems]);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  // --- 삭제 ---

  const deleteItems = useCallback(async (items: { id: string; type: string; projectId?: string }[]) => {
    for (const item of items) {
      try {
        if (item.type === 'project') {
          const { error } = await deleteProject(item.id);
          if (error) {
            alert('프로젝트 삭제 실패: ' + error);
          } else {
            // BroadcastChannel 알림
            try {
              const ch = new BroadcastChannel('project-updates');
              ch.postMessage({ type: 'PROJECT_DELETED', projectId: item.id });
              ch.close();
            } catch { /* ignore */ }
          }
        } else if (item.type === 'design' && item.projectId) {
          const { error } = await deleteDesignFile(item.projectId, item.id);
          if (error) {
            alert('디자인파일 삭제 실패: ' + error);
          }
        } else if (item.type === 'folder' && item.projectId) {
          const projectFolders = data.folders[item.projectId] || [];
          const updated = projectFolders.filter(f => f.id !== item.id);
          await saveFolderData(item.projectId, updated);
        }
      } catch (err) {
        console.error('삭제 중 오류:', err);
      }
    }

    // 삭제 후 데이터 새로고침
    await data.refreshProjects();
    if (nav.currentProjectId) {
      await data.refreshDesignFiles(nav.currentProjectId);
      await data.refreshFolders(nav.currentProjectId);
    }
    clearSelection();
  }, [data, nav.currentProjectId, clearSelection]);

  // --- 이름 변경 ---

  const renameItem = useCallback(async (id: string, type: string, newName: string, projectId?: string) => {
    // 이름 변경 로직은 기존 SimpleDashboard의 handleConfirmRename 참조
    // 이 훅에서는 기본 인터페이스만 제공하고 실제 구현은 SimpleDashboard에서 처리
    console.log('renameItem:', { id, type, newName, projectId });
  }, []);

  // --- 복제 ---

  const duplicateProject = useCallback(async (projectId: string) => {
    console.log('duplicateProject:', projectId);
    // 기존 SimpleDashboard의 handleDuplicateItem 로직 참조
  }, []);

  // --- 북마크 ---

  const toggleBookmark = useCallback(async (id: string, type: 'project' | 'design' | 'folder') => {
    if (!user) return;

    if (type === 'project') {
      const newBookmarks = new Set(data.bookmarkedProjects);
      if (newBookmarks.has(id)) {
        newBookmarks.delete(id);
      } else {
        newBookmarks.add(id);
      }
      localStorage.setItem(`bookmarks_projects_${user.uid}`, JSON.stringify(Array.from(newBookmarks)));
      // Note: 실제 상태 업데이트는 useExplorerData 내부에서 localStorage 변경을 감지해야 함
      // 여기서는 직접 data를 수정할 수 없으므로 refreshProjects를 호출
      await data.refreshProjects();
    } else if (type === 'design') {
      const newBookmarks = new Set(data.bookmarkedDesigns);
      if (newBookmarks.has(id)) {
        newBookmarks.delete(id);
      } else {
        newBookmarks.add(id);
      }
      localStorage.setItem(`bookmarks_designs_${user.uid}`, JSON.stringify(Array.from(newBookmarks)));
    } else if (type === 'folder') {
      const newBookmarks = new Set(data.bookmarkedFolders);
      if (newBookmarks.has(id)) {
        newBookmarks.delete(id);
      } else {
        newBookmarks.add(id);
      }
      localStorage.setItem(`bookmarks_folders_${user.uid}`, JSON.stringify(Array.from(newBookmarks)));
    }
  }, [user, data]);

  // --- 드래그앤드롭 ---

  const onDragStart = useCallback((e: React.DragEvent, item: DragState['draggedItem']) => {
    setDragState({
      isDragging: true,
      draggedItem: item,
      dragOverFolder: null,
    });
    e.dataTransfer.effectAllowed = 'move';
    if (item) {
      e.dataTransfer.setData('text/plain', JSON.stringify(item));
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => ({ ...prev, dragOverFolder: folderId }));
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    if (!dragState.draggedItem || !nav.currentProjectId) return;

    const projectFolders = data.folders[nav.currentProjectId] || [];
    const updated = projectFolders.map(folder => {
      if (folder.id === targetFolderId) {
        return {
          ...folder,
          children: [...folder.children, dragState.draggedItem!],
        };
      }
      return folder;
    });

    await saveFolderData(nav.currentProjectId, updated);
    await data.refreshFolders(nav.currentProjectId);

    setDragState({ isDragging: false, draggedItem: null, dragOverFolder: null });
  }, [dragState.draggedItem, nav.currentProjectId, data]);

  const onDragEnd = useCallback(() => {
    setDragState({ isDragging: false, draggedItem: null, dragOverFolder: null });
  }, []);

  return {
    selectedItems,
    dragState,
    selectItem,
    selectAll,
    clearSelection,
    deleteItems,
    renameItem,
    duplicateProject,
    toggleBookmark,
    dragHandlers: { onDragStart, onDragOver, onDrop, onDragEnd },
  };
}
