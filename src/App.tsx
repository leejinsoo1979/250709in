import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { AuthProvider } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AlertProvider } from '@/contexts/AlertContext';
import { NavigationProvider } from '@/contexts/NavigationContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Step1 from '@/editor/Step1';
import Configurator from '@/editor/Configurator';
import SimpleDashboard from '@/pages/SimpleDashboard';
import TestDashboard from '@/pages/TestDashboard';
import { LoginForm } from '@/components/auth/LoginForm';
import FirebaseDebug from '@/components/FirebaseDebug';
import FirebaseDataDebug from '@/components/debug/FirebaseDataDebug';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';

// AR 뷰어는 lazy loading으로 처리 (모바일에서만 사용)
const ARViewer = lazy(() => import('@/editor/ar-viewer/ARViewer'));

// WebGL 메모리 누수를 방지하기 위한 개선된 함수
function disposeWebGLCanvases() {
  // React Three Fiber가 자체적으로 WebGL 컨텍스트를 관리하므로
  // 이 함수에서는 간섭하지 않음
  // console.log('Route change detected, allowing R3F to handle cleanup');
}

// 라우트 변경 감지 및 정리를 담당하는 컴포넌트
function RouteChangeHandler() {
  const location = useLocation();

  useEffect(() => {
    // 라우트 변경 감지
    // React Three Fiber가 자체적으로 정리하므로 간섭하지 않음
    // console.log('Route changed to:', location.pathname);
  }, [location.pathname]);

  return null;
}

// 앱 컴포넌트
function AppContent() {
  // 스토어에서 isDirty 상태 가져오기
  const projectIsDirty = useProjectStore((state) => state.isDirty);
  const spaceConfigIsDirty = useSpaceConfigStore((state) => state.isDirty);
  const furnitureIsDirty = useFurnitureStore((state) => state.isDirty);
  
  // 어느 하나라도 변경사항이 있으면 true
  const hasUnsavedChanges = projectIsDirty || spaceConfigIsDirty || furnitureIsDirty;

  // 브라우저 새로고침/닫기 시 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const message = '저장하지 않은 변경사항이 있습니다. 정말로 페이지를 떠나시겠습니까?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  return (
    <>
      <RouteChangeHandler />
      <Routes>
        {/* 메인 페이지 - 대시보드로 리다이렉트 */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* 대시보드 페이지 */}
        <Route path="/dashboard" element={<SimpleDashboard />} />
        {/* 인증 페이지 */}
        <Route path="/auth" element={<LoginForm />} />
        {/* 디버그 페이지 */}
        <Route path="/debug/firebase" element={<FirebaseDebug />} />
        <Route path="/debug/data" element={<FirebaseDataDebug />} />
        {/* 에디터 라우트 */}
        <Route path="/step1" element={<Step1 />} />
        <Route path="/configurator" element={<Configurator />} />
        <Route path="/step0" element={<Navigate to="/step1" replace />} />
        <Route path="/step2" element={<Navigate to="/configurator" replace />} />
        <Route path="/step3" element={<Navigate to="/configurator" replace />} />
        {/* AR 뷰어 라우트 */}
        <Route path="/ar-viewer" element={
          <Suspense fallback={<div>Loading AR Viewer...</div>}>
            <ARViewer />
          </Suspense>
        } />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AlertProvider>
          <AuthProvider>
            <Router>
              <NavigationProvider>
                <AppContent />
              </NavigationProvider>
            </Router>
          </AuthProvider>
        </AlertProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;