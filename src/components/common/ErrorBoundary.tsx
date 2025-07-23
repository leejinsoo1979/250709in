import React, { Component, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // 다음 렌더링에서 폴백 UI가 보이도록 상태를 업데이트합니다.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 에러 리포팅 서비스에 에러를 기록할 수 있습니다
    console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // 커스텀 폴백 UI를 렌더링할 수 있습니다
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={styles.errorContainer}>
          <div className={styles.errorCard}>
            <h1 className={styles.errorIcon}>⚠️</h1>
            <h2 className={styles.errorTitle}>문제가 발생했습니다</h2>
            <p className={styles.errorMessage}>
              예상치 못한 오류가 발생했습니다. 페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
            </p>
            <button
              onClick={() => window.location.reload()}
              className={styles.reloadButton}
            >
              페이지 새로고침
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className={styles.developerInfo}>
                <summary className={styles.developerSummary}>
                  개발자 정보 (개발 모드에서만 표시)
                </summary>
                <pre className={styles.errorDetails}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 