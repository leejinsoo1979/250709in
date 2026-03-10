import { useState, useCallback, useMemo } from 'react';
import type { NavigationEntry, BreadcrumbItem, QuickAccessMenu, UseExplorerNavigationReturn } from './types';

export function useExplorerNavigation(): UseExplorerNavigationReturn {
  // 히스토리 스택
  const [history, setHistory] = useState<NavigationEntry[]>([
    { projectId: null, folderId: null, label: '전체' }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // 빠른 액세스 메뉴 (기본: 진행중 프로젝트)
  const [activeMenu, setActiveMenu] = useState<QuickAccessMenu>('in-progress');

  // 현재 위치 (히스토리에서 파생)
  const current = history[historyIndex];
  const currentProjectId = current?.projectId ?? null;
  const currentFolderId = current?.folderId ?? null;

  // 뒤로/앞으로/상위 가능 여부
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;
  const canGoUp = currentFolderId !== null || currentProjectId !== null;

  // 브레드크럼 경로 (히스토리 현재 위치 기반)
  const breadcrumbPath = useMemo<BreadcrumbItem[]>(() => {
    const path: BreadcrumbItem[] = [{ id: 'root', label: '전체', type: 'root' }];

    if (currentProjectId) {
      const projectLabel = current?.label || currentProjectId;
      // 프로젝트와 폴더가 모두 있으면 라벨을 분리
      if (currentFolderId) {
        // 프로젝트명은 히스토리에서 찾기
        const projectEntry = history.find(
          h => h.projectId === currentProjectId && !h.folderId
        );
        path.push({
          id: currentProjectId,
          label: projectEntry?.label || currentProjectId,
          type: 'project',
        });
        path.push({
          id: currentFolderId,
          label: projectLabel,
          type: 'folder',
        });
      } else {
        path.push({
          id: currentProjectId,
          label: projectLabel,
          type: 'project',
        });
      }
    }

    return path;
  }, [currentProjectId, currentFolderId, current, history]);

  // 네비게이션: 특정 위치로 이동
  const navigateTo = useCallback((
    projectId: string | null,
    folderId: string | null = null,
    label: string = ''
  ) => {
    const entry: NavigationEntry = {
      projectId,
      folderId,
      label: label || (projectId ? projectId : '전체'),
    };

    setHistory(prev => {
      // 현재 위치 이후의 히스토리 제거 (앞으로 갈 수 없게)
      const newHistory = prev.slice(0, historyIndex + 1);
      // 같은 위치면 추가하지 않음
      const last = newHistory[newHistory.length - 1];
      if (last && last.projectId === projectId && last.folderId === folderId) {
        return prev;
      }
      return [...newHistory, entry];
    });

    setHistoryIndex(prev => {
      const last = history[prev];
      if (last && last.projectId === projectId && last.folderId === folderId) {
        return prev;
      }
      return prev + 1;
    });

    // 프로젝트/폴더 네비게이션이면 activeMenu를 all로
    if (projectId !== null) {
      setActiveMenu('all');
    }
  }, [historyIndex, history]);

  // 뒤로
  const goBack = useCallback(() => {
    if (canGoBack) {
      setHistoryIndex(prev => prev - 1);
    }
  }, [canGoBack]);

  // 앞으로
  const goForward = useCallback(() => {
    if (canGoForward) {
      setHistoryIndex(prev => prev + 1);
    }
  }, [canGoForward]);

  // 상위 폴더/프로젝트
  const goUp = useCallback(() => {
    if (currentFolderId) {
      // 폴더 안에 있으면 → 프로젝트 루트로
      const projectEntry = history.find(
        h => h.projectId === currentProjectId && !h.folderId
      );
      navigateTo(currentProjectId, null, projectEntry?.label || '');
    } else if (currentProjectId) {
      // 프로젝트 루트에 있으면 → 전체로
      navigateTo(null, null, '전체');
    }
  }, [currentFolderId, currentProjectId, history, navigateTo]);

  // 루트로 이동
  const navigateToRoot = useCallback(() => {
    navigateTo(null, null, '전체');
  }, [navigateTo]);

  return {
    currentProjectId,
    currentFolderId,
    activeMenu,
    breadcrumbPath,
    canGoBack,
    canGoForward,
    canGoUp,
    goBack,
    goForward,
    goUp,
    navigateTo,
    setActiveMenu,
    navigateToRoot,
  };
}
