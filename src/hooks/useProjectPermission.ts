import { useState, useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { getUserProjectPermission, type SharePermission } from '@/firebase/shareLinks';
import { isSuperAdmin } from '@/firebase/admins';

export type ProjectPermission = SharePermission | 'owner' | null;

export interface ProjectPermissionState {
  permission: ProjectPermission;
  loading: boolean;
  isOwner: boolean;
  canEdit: boolean;
  canView: boolean;
}

/**
 * 프로젝트에 대한 사용자의 권한을 확인하는 커스텀 훅
 */
export function useProjectPermission(projectId: string | null): ProjectPermissionState {
  const { user } = useAuth();
  const [permission, setPermission] = useState<ProjectPermission>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !user) {
      setPermission(null);
      setLoading(false);
      return;
    }

    const checkPermission = async () => {
      setLoading(true);
      try {
        // 관리자는 viewer 권한으로 모든 프로젝트 조회 가능 (수정 불가)
        if (isSuperAdmin(user.email || '')) {
          console.log('👑 관리자 권한으로 프로젝트 접근 (viewer):', projectId);
          setPermission('viewer');
          setLoading(false);
          return;
        }

        const perm = await getUserProjectPermission(projectId, user.uid);
        setPermission(perm);
      } catch (error) {
        console.error('권한 확인 실패:', error);
        setPermission(null);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [projectId, user]);

  const isOwner = permission === 'owner';
  const canEdit = isOwner || permission === 'editor';
  const canView = isOwner || permission === 'editor' || permission === 'viewer';

  return {
    permission,
    loading,
    isOwner,
    canEdit,
    canView,
  };
}
