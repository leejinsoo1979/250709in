import React from 'react';
import { useThree } from '@react-three/fiber';

interface CanvasContextWrapperProps {
  children: (context: ReturnType<typeof useThree>) => React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Wrapper component that safely checks for Canvas context
 * and provides it to children or renders fallback
 */
export const CanvasContextWrapper: React.FC<CanvasContextWrapperProps> = ({ 
  children, 
  fallback = null 
}) => {
  try {
    const context = useThree();
    return <>{children(context)}</>;
  } catch (error) {
    console.warn('Component rendered outside Canvas context:', error);
    return <>{fallback}</>;
  }
};

/**
 * HOC to wrap components that require Canvas context
 */
export function withCanvasContext<P extends object>(
  Component: React.ComponentType<P & { canvasContext: ReturnType<typeof useThree> }>
): React.ComponentType<P> {
  return (props: P) => {
    return (
      <CanvasContextWrapper>
        {(context) => <Component {...props} canvasContext={context} />}
      </CanvasContextWrapper>
    );
  };
}