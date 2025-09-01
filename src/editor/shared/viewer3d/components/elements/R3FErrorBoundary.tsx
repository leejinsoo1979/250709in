import React from 'react';

interface R3FErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface R3FErrorBoundaryState {
  hasError: boolean;
  errorCount: number;
}

/**
 * Error boundary specifically for R3F hook errors
 * Retries rendering after a short delay to allow Canvas to initialize
 */
export class R3FErrorBoundary extends React.Component<R3FErrorBoundaryProps, R3FErrorBoundaryState> {
  private retryTimeout: NodeJS.Timeout | null = null;
  
  constructor(props: R3FErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): R3FErrorBoundaryState | null {
    // Check if this is an R3F hook error
    if (error.message?.includes('R3F: Hooks can only be used within the Canvas component')) {
      return { hasError: true, errorCount: 0 };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (error.message?.includes('R3F: Hooks can only be used within the Canvas component')) {
      console.warn('R3F hook error caught, will retry rendering:', error.message);
      
      // Clear any existing timeout
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
      }
      
      // Retry after a short delay
      if (this.state.errorCount < 3) {
        this.retryTimeout = setTimeout(() => {
          this.setState({ 
            hasError: false, 
            errorCount: this.state.errorCount + 1 
          });
        }, 100 * (this.state.errorCount + 1)); // Exponential backoff
      }
    }
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  render() {
    if (this.state.hasError && this.state.errorCount >= 3) {
      // After 3 retries, show fallback
      return this.props.fallback || null;
    }

    if (this.state.hasError) {
      // While retrying, show nothing
      return null;
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap components with R3F error boundary
 */
export function withR3FErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
): React.ComponentType<P> {
  return (props: P) => (
    <R3FErrorBoundary fallback={fallback}>
      <Component {...props} />
    </R3FErrorBoundary>
  );
}