import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AlertProvider } from '@/contexts/AlertContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Step1 from '@/editor/Step1';
import Configurator from '@/editor/Configurator';
import SimpleDashboard from '@/pages/SimpleDashboard';
import TestDashboard from '@/pages/TestDashboard';
import { LoginForm } from '@/components/auth/LoginForm';
import FirebaseDebug from '@/components/FirebaseDebug';
import FirebaseDataDebug from '@/components/debug/FirebaseDataDebug';

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
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

function App() {
  // 앱 종료 시 메모리 정리 - R3F가 자체적으로 정리하므로 제거
  // useEffect(() => {
  //   const cleanup = () => {
  //     disposeWebGLCanvases();
  //   };
  //   
  //   // 페이지 언로드 시 정리
  //   window.addEventListener('beforeunload', cleanup);
  //   
  //   return () => {
  //     window.removeEventListener('beforeunload', cleanup);
  //     cleanup();
  //   };
  // }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AlertProvider>
          <AuthProvider>
            <Router>
              <AppContent />
            </Router>
          </AuthProvider>
        </AlertProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;