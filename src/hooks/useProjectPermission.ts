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
export function useProjectPermission(projectId: string | null, skipCheck: boolean = false): ProjectPermissionState {
  const { user } = useAuth();
  const [permission, setPermission] = useState<ProjectPermission>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // readonly 모드 등에서 권한 체크를 건너뛰는 경우
    if (skipCheck) {
      console.log('👁️ 권한 체크 건너뜀 (readonly 모드)');
      setPermission('viewer');
      setLoading(false);
      return;
    }

    if (!projectId || !user) {
      setPermission(null);
      setLoading(false);
      return;
    }

    const checkPermission = async () => {
      setLoading(true);
      try {
        // 먼저 일반 권한 확인 (소유자, editor, viewer)
        const perm = await getUserProjectPermission(projectId, user.uid);

        // 권한이 있으면 그대로 사용
        if (perm) {
          setPermission(perm);
        } else if (isSuperAdmin(user.email || '')) {
          // 권한이 없는데 관리자면 viewer로 접근 가능
          console.log('👑 관리자 권한으로 프로젝트 접근 (viewer):', projectId);
          setPermission('viewer');
        } else {
          // 권한도 없고 관리자도 아니면 null
          setPermission(null);
        }
      } catch (error) {
        console.error('권한 확인 실패:', error);
        setPermission(null);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [projectId, user, skipCheck]);

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
