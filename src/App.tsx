import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { AuthProvider } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AlertProvider } from '@/contexts/AlertContext';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { TeamProvider } from '@/contexts/TeamContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Step1 from '@/editor/Step1';
import Configurator from '@/editor/Configurator';
import SimpleDashboard from '@/pages/SimpleDashboard';
import TestDashboard from '@/pages/TestDashboard';
import ViewerPage from '@/pages/ViewerPage';
import LandingPage from '@/pages/LandingPage';
import SignUpPage from '@/pages/SignUpPage';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminUsers from '@/pages/admin/Users';
import AdminUserDetail from '@/pages/admin/UserDetail';
import AdminAdmins from '@/pages/admin/Admins';
import AdminTeams from '@/pages/admin/Teams';
import AdminProjects from '@/pages/admin/Projects';
import AdminShares from '@/pages/admin/Shares';
import AdminLogs from '@/pages/admin/Logs';
import AdminMessages from '@/pages/admin/Messages';
import AdminChatbot from '@/pages/admin/Chatbot';
import AdminSettings from '@/pages/admin/Settings';
import AdminAllApiKeys from '@/pages/admin/AllApiKeys';
import AdminSubscriptions from '@/pages/admin/Subscriptions';
import PlaceholderPage from '@/pages/admin/PlaceholderPage';
import { HiOutlineCreditCard, HiOutlineLockClosed } from 'react-icons/hi';
import { SettingsIcon } from '@/components/common/Icons';
import { LoginForm } from '@/components/auth/LoginForm';
import { ModernLoginForm } from '@/components/auth/ModernLoginForm';
import { UltraModernLoginForm } from '@/components/auth/UltraModernLoginForm';
import { GradientLoginForm } from '@/components/auth/GradientLoginForm';
import { SplitLoginForm } from '@/components/auth/SplitLoginForm';
import FirebaseDebug from '@/components/FirebaseDebug';
import FirebaseDataDebug from '@/components/debug/FirebaseDataDebug';
import { TouchTestPage } from '@/components/TouchUI/TouchTestPage';
import { ShareLinkAccess } from '@/pages/ShareLinkAccess';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import CNCOptimizer from '@/editor/CNCOptimizer';
import CNCOptimizerNew from '@/editor/CNCOptimizer/CNCOptimizerNew';
import CNCOptimizerPro from '@/editor/CNCOptimizer/CNCOptimizerPro';
import CNCOptimizerTest from '@/editor/CNCOptimizer/CNCOptimizerTest';
import Test2DViewer from '@/pages/Test2DViewer';
import CanvasDuplicateTest from '@/test/CanvasDuplicateTest';
import PreviewPopout from '@/editor/Configurator/components/PreviewPopout';
import { initializeTheme } from '@/theme';
import { logPageView } from '@/firebase/analytics';

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

    // Firebase Analytics 페이지 뷰 로깅
    const pageName = location.pathname;
    const pageTitle = document.title || pageName;
    logPageView(pageName, pageTitle);
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

  // 브라우저 새로고침/닫기 시 경고 (Configurator 페이지에서만)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Configurator 페이지에서만 경고 표시
      const isConfiguratorPage = window.location.pathname.includes('/configurator');
      
      if (hasUnsavedChanges && isConfiguratorPage) {
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
        {/* 메인 페이지 - 랜딩 페이지 */}
        <Route path="/" element={<LandingPage />} />
        {/* 대시보드 페이지 */}
        <Route path="/dashboard" element={<SimpleDashboard />} />
        <Route path="/dashboard/*" element={<SimpleDashboard />} />
        {/* 관리자 페이지 */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:userId" element={<AdminUserDetail />} />
          <Route path="admins" element={<AdminAdmins />} />
          <Route path="teams" element={<AdminTeams />} />
          <Route path="projects" element={<AdminProjects />} />
          <Route path="shares" element={<AdminShares />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="chatbot" element={<AdminChatbot />} />
          <Route path="api-keys" element={<AdminAllApiKeys />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="billing" element={<PlaceholderPage title="결제 관리" description="PG사 연동, 결제 내역, 청구서 관리 기능이 곧 제공됩니다." icon={<HiOutlineCreditCard size={40} />} />} />
          <Route path="security" element={<PlaceholderPage title="보안 설정" description="2FA, IP 제한, 감사 로그 등 보안 기능이 곧 제공됩니다." icon={<HiOutlineLockClosed size={40} />} />} />
        </Route>
        {/* 인증 페이지 */}
        <Route path="/login" element={<SplitLoginForm />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/auth" element={<SplitLoginForm />} />
        <Route path="/auth/gradient" element={<GradientLoginForm />} />
        <Route path="/auth/ultra" element={<UltraModernLoginForm />} />
        <Route path="/auth/modern" element={<ModernLoginForm />} />
        <Route path="/auth/classic" element={<LoginForm />} />
        {/* 디버그 페이지 */}
        <Route path="/debug/firebase" element={<FirebaseDebug />} />
        <Route path="/debug/data" element={<FirebaseDataDebug />} />
        <Route path="/touch-test" element={<TouchTestPage />} />
        {/* 2D Konva 뷰어 테스트 페이지 */}
        <Route path="/test-2d" element={<Test2DViewer />} />
        <Route path="/test-canvas" element={<CanvasDuplicateTest />} />
        {/* 에디터 라우트 */}
        <Route path="/step1" element={<Step1 />} />
        <Route path="/configurator" element={<Configurator />} />
        <Route path="/preview-popout" element={<PreviewPopout />} />
        <Route path="/cnc-optimizer" element={<CNCOptimizerPro />} />
        <Route path="/cnc-test" element={<CNCOptimizerTest />} />
        <Route path="/step0" element={<Navigate to="/step1" replace />} />
        <Route path="/step2" element={<Navigate to="/configurator" replace />} />
        <Route path="/step3" element={<Navigate to="/configurator" replace />} />
        {/* AR 뷰어 라우트 */}
        <Route path="/ar-viewer" element={
          <Suspense fallback={<LoadingSpinner fullscreen message="Loading AR Viewer..." />}>
            <ARViewer />
          </Suspense>
        } />
        {/* 공유 뷰어 라우트 */}
        <Route path="/viewer/:projectId" element={<ViewerPage />} />
        {/* 공유 링크 접근 라우트 */}
        <Route path="/share/:token" element={<ShareLinkAccess />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

function App() {
  // Initialize theme on app load
  useEffect(() => {
    initializeTheme();

    // 측판/백패널/도어 결 방향을 기본값으로 리셋 (한번만 실행)
    const hasReset = sessionStorage.getItem('panelGrainDirectionsReset');
    if (!hasReset) {
      useFurnitureStore.getState().resetPanelGrainDirections();
      sessionStorage.setItem('panelGrainDirectionsReset', 'true');
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AlertProvider>
          <AuthProvider>
            <TeamProvider>
              <Router>
                <NavigationProvider>
                  <AppContent />
                </NavigationProvider>
              </Router>
            </TeamProvider>
          </AuthProvider>
        </AlertProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;