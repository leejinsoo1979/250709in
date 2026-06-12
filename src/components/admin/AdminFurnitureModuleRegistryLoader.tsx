import { useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { subscribeEnabledAdminFurnitureModules } from '@/firebase/adminFurnitureModules';
import { clearAdminFurnitureModules, setAdminFurnitureModules } from '@/data/modules/adminModuleRegistry';

const AdminFurnitureModuleRegistryLoader = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      clearAdminFurnitureModules();
      return;
    }

    return subscribeEnabledAdminFurnitureModules(
      setAdminFurnitureModules,
      (error) => {
        console.error('관리자 모듈 로드 실패:', error);
        clearAdminFurnitureModules();
      }
    );
  }, [user]);

  return null;
};

export default AdminFurnitureModuleRegistryLoader;
