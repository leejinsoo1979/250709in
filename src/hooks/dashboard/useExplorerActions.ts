import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { deleteProject, deleteDesignFile, saveFolderData, createDesignFile, createProject, getDesignFileById, getProject } from '@/firebase/projects';
import { DEFAULT_SPACE_CONFIG } from '@/store/core/spaceConfigStore';
import type { DragState, ExplorerItem, ClipboardState, SelectItemOptions, UseExplorerDataReturn, UseExplorerNavigationReturn, UseExplorerActionsReturn } from './types';

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
    draggedItems: [],
    dragOverFolder: null,
  });
  const dragStateRef = useRef<DragState>(dragState);
  dragStateRef.current = dragState;

  // 클립보드 상태
  const clipboardRef = useRef<ClipboardState | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  // Shift 선택 앵커 포인트
  const lastSelectedIdRef = useRef<string | null>(null);

  // --- 선택 ---

  const selectItem = useCallback((id: string, optionsOrMulti?: boolean | SelectItemOptions) => {
    // boolean 호환 유지
    const opts: SelectItemOptions = typeof optionsOrMulti === 'boolean'
      ? { multi: optionsOrMulti }
      : optionsOrMulti || {};

    const { multi, shift, orderedIds } = opts;

    setSelectedItems(prev => {
      // Shift+클릭 범위 선택
      if (shift && orderedIds && lastSelectedIdRef.current) {
        const anchorIdx = orderedIds.indexOf(lastSelectedIdRef.current);
        const targetIdx = orderedIds.indexOf(id);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          const rangeIds = orderedIds.slice(start, end + 1);
          if (multi) {
            // Ctrl+Shift: 기존 선택에 범위 추가
            const next = new Set(prev);
            rangeIds.forEach(rid => next.add(rid));
            return next;
          }
          return new Set(rangeIds);
        }
      }

      // Ctrl+클릭 토글
      if (multi) {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        lastSelectedIdRef.current = id;
        return next;
      }

      // 단일 선택: 이미 선택된 거면 해제, 아니면 교체
      lastSelectedIdRef.current = id;
      if (prev.has(id) && prev.size === 1) {
        return new Set();
      }
      return new Set([id]);
    });

    // shift가 아닐 때만 앵커 업데이트 (shift는 앵커 유지)
    if (!opts.shift) {
      lastSelectedIdRef.current = id;
    }
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
          const { error } = await deleteDesignFile(item.id, item.projectId);
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
    console.log('renameItem:', { id, type, newName, projectId });
  }, []);

  // --- 복제 ---

  const duplicateProject = useCallback(async (projectId: string) => {
    console.log('duplicateProject:', projectId);
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

  // --- 클립보드 (복사/잘라내기/붙여넣기/복제) ---

  const copyItems = useCallback((items: ExplorerItem[]) => {
    const state: ClipboardState = { items, mode: 'copy' };
    clipboardRef.current = state;
    setClipboard(state);
  }, []);

  const cutItems = useCallback((items: ExplorerItem[]) => {
    const state: ClipboardState = { items, mode: 'cut' };
    clipboardRef.current = state;
    setClipboard(state);
  }, []);

  const pasteItems = useCallback(async (targetProjectId?: string, targetFolderId?: string) => {
    const cb = clipboardRef.current;
    if (!cb || cb.items.length === 0) return;

    const destProjectId = targetProjectId || nav.currentProjectId;
    if (!destProjectId && cb.items.some(i => i.type === 'design')) {
      alert('디자인 파일을 붙여넣으려면 프로젝트를 먼저 선택해주세요.');
      return;
    }

    for (const item of cb.items) {
      try {
        if (item.type === 'design') {
          if (cb.mode === 'copy') {
            // 디자인 복제: 원본 데이터를 가져와서 새로 생성
            const { designFile } = await getDesignFileById(item.id);
            const newData = {
              name: `${item.name} (복사본)`,
              projectId: destProjectId!,
              spaceConfig: designFile?.spaceConfig || DEFAULT_SPACE_CONFIG,
              furniture: designFile?.furniture || { placedModules: [] },
              thumbnail: designFile?.thumbnail,
            };
            await createDesignFile(newData);
          } else {
            // cut: 폴더 간 이동 (같은 프로젝트 내에서만)
            if (destProjectId && targetFolderId) {
              const projectFolders = data.folders[destProjectId] || [];
              // 기존 폴더에서 제거
              let movedItem: any = null;
              const cleaned = projectFolders.map(folder => {
                const childIdx = folder.children.findIndex(c => c.id === item.id);
                if (childIdx !== -1) {
                  movedItem = folder.children[childIdx];
                  return { ...folder, children: folder.children.filter(c => c.id !== item.id) };
                }
                return folder;
              });
              // 대상 폴더에 추가
              if (movedItem) {
                const updated = cleaned.map(folder => {
                  if (folder.id === targetFolderId) {
                    return { ...folder, children: [...folder.children, movedItem] };
                  }
                  return folder;
                });
                await saveFolderData(destProjectId, updated);
              }
            }
          }
        } else if (item.type === 'project') {
          if (cb.mode === 'copy') {
            // 프로젝트 복제
            const { project } = await getProject(item.id);
            if (project) {
              await createProject({ title: `${item.name} (복사본)` });
            }
          }
        }
      } catch (err) {
        console.error('붙여넣기 중 오류:', err);
      }
    }

    // cut 후 클립보드 비우기
    if (cb.mode === 'cut') {
      clipboardRef.current = null;
      setClipboard(null);
    }

    // 데이터 새로고침
    await data.refreshProjects();
    if (destProjectId) {
      await data.refreshDesignFiles(destProjectId);
      await data.refreshFolders(destProjectId);
    }
  }, [nav.currentProjectId, data]);

  const duplicateItems = useCallback(async (items: ExplorerItem[]) => {
    for (const item of items) {
      try {
        if (item.type === 'design') {
          const projectId = item.projectId || nav.currentProjectId;
          if (!projectId) continue;
          const { designFile } = await getDesignFileById(item.id);
          await createDesignFile({
            name: `${item.name} (복사본)`,
            projectId,
            spaceConfig: designFile?.spaceConfig || DEFAULT_SPACE_CONFIG,
            furniture: designFile?.furniture || { placedModules: [] },
            thumbnail: designFile?.thumbnail,
          });
        } else if (item.type === 'project') {
          await createProject({ title: `${item.name} (복사본)` });
        }
      } catch (err) {
        console.error('복제 중 오류:', err);
      }
    }

    await data.refreshProjects();
    if (nav.currentProjectId) {
      await data.refreshDesignFiles(nav.currentProjectId);
    }
  }, [nav.currentProjectId, data]);

  // --- 드래그앤드롭 ---

  const onDragStart = useCallback((e: React.DragEvent, item: DragState['draggedItem']) => {
    if (!item) return;

    // 멀티 드래그: 선택된 아이템이 여러 개이고 드래그 시작 아이템이 선택에 포함된 경우
    let draggedItems: DragState['draggedItems'] = [item];
    if (selectedItems.size > 1 && selectedItems.has(item.id)) {
      draggedItems = data.currentItems
        .filter(ci => selectedItems.has(ci.id) && ci.type === 'design' && ci.projectId)
        .map(ci => ({ id: ci.id, name: ci.name, type: 'design' as const, projectId: ci.projectId! }));
    }

    setDragState({
      isDragging: true,
      draggedItem: item,
      draggedItems,
      dragOverFolder: null,
    });

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(draggedItems));

    // 커스텀 드래그 이미지 (멀티 드래그 배지)
    if (draggedItems.length > 1) {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;top:-9999px;padding:6px 12px;background:#3b82f6;color:#fff;border-radius:12px;font-size:13px;font-weight:600;white-space:nowrap;';
      badge.textContent = `${draggedItems.length}개 항목`;
      document.body.appendChild(badge);
      e.dataTransfer.setDragImage(badge, 0, 0);
      requestAnimationFrame(() => document.body.removeChild(badge));
    }
  }, [selectedItems, data.currentItems]);

  const onDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => ({ ...prev, dragOverFolder: folderId }));
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    if (!nav.currentProjectId) return;

    // ref에서 최신 드래그 상태 읽기 (stale closure 방지)
    const currentDrag = dragStateRef.current;
    const itemsToDrop = currentDrag.draggedItems.length > 0 ? currentDrag.draggedItems : (currentDrag.draggedItem ? [currentDrag.draggedItem] : []);

    // dataTransfer에서도 폴백으로 읽기
    if (itemsToDrop.length === 0) {
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            itemsToDrop.push(...parsed);
          }
        }
      } catch { /* ignore */ }
    }
    if (itemsToDrop.length === 0) return;

    const projectFolders = data.folders[nav.currentProjectId] || [];

    // 기존 폴더에서 중복 제거 후 대상 폴더에 추가
    const dropIds = new Set(itemsToDrop.map(i => i.id));
    const cleaned = projectFolders.map(folder => ({
      ...folder,
      children: (folder.children || []).filter(c => !dropIds.has(c.id)),
    }));

    const updated = cleaned.map(folder => {
      if (folder.id === targetFolderId) {
        return {
          ...folder,
          children: [...(folder.children || []), ...itemsToDrop],
        };
      }
      return folder;
    });

    await saveFolderData(nav.currentProjectId, updated);
    await data.refreshFolders(nav.currentProjectId);

    setDragState({ isDragging: false, draggedItem: null, draggedItems: [], dragOverFolder: null });
  }, [nav.currentProjectId, data]);

  const onDragEnd = useCallback(() => {
    setDragState({ isDragging: false, draggedItem: null, draggedItems: [], dragOverFolder: null });
  }, []);

  return {
    selectedItems,
    setSelectedItems,
    dragState,
    selectItem,
    selectAll,
    clearSelection,
    deleteItems,
    renameItem,
    duplicateProject,
    toggleBookmark,
    clipboard,
    copyItems,
    cutItems,
    pasteItems,
    duplicateItems,
    dragHandlers: { onDragStart, onDragOver, onDrop, onDragEnd },
  };
}
