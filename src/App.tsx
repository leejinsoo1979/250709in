import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Step1 from '@/editor/Step1';
import Configurator from '@/editor/Configurator';
import SimpleDashboard from '@/pages/SimpleDashboard';
import TestDashboard from '@/pages/TestDashboard';
import { LoginForm } from '@/components/auth/LoginForm';
import FirebaseDebug from '@/components/FirebaseDebug';
import FirebaseDataDebug from '@/components/debug/FirebaseDataDebug';

// WebGL 메모리 누수를 방지하기 위한 간단한 함수
function disposeWebGLCanvases() {
  const canvases = document.getElementsByTagName('canvas');
  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i];
    // Canvas 요소 비우기
    const context = canvas.getContext('2d');
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Canvas 속성 초기화
    canvas.width = 1;
    canvas.height = 1;
  }
}

// 라우트 변경 감지 및 정리를 담당하는 컴포넌트
function RouteChangeHandler() {
  const location = useLocation();

  useEffect(() => {
    // 라우트가 변경될 때마다 WebGL 컨텍스트 정리
    return () => {
      setTimeout(() => {
        disposeWebGLCanvases();
      }, 0);
    };
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
  // 앱 종료 시 메모리 정리
  useEffect(() => {
    const cleanup = () => {
      disposeWebGLCanvases();
    };
    
    // 페이지 언로드 시 정리
    window.addEventListener('beforeunload', cleanup);
    
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <AppContent />
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;