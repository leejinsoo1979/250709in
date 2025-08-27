import React, { useEffect, useState } from 'react';
import { Space2DKonvaView } from '@/editor/shared/viewer2d';

/**
 * Test component to verify canvas duplication issue is resolved
 * during orientation changes (landscape ↔ portrait)
 */
const CanvasDuplicateTest: React.FC = () => {
  const [orientationChangeCount, setOrientationChangeCount] = useState(0);
  const [canvasCount, setCanvasCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  // Monitor canvas elements
  useEffect(() => {
    const checkCanvasCount = () => {
      const canvases = document.querySelectorAll('canvas');
      const konvaContainers = document.querySelectorAll('.konvajs-content');
      
      setCanvasCount(canvases.length);
      
      const logEntry = `[${new Date().toLocaleTimeString()}] Canvas count: ${canvases.length}, Konva containers: ${konvaContainers.length}`;
      setLogs(prev => [...prev.slice(-9), logEntry]);
      
      if (canvases.length > 1) {
        console.warn('Multiple canvas elements detected!', canvases);
      }
    };

    // Initial check
    checkCanvasCount();

    // Monitor DOM changes
    const observer = new MutationObserver(() => {
      checkCanvasCount();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Monitor orientation changes
    const handleOrientationChange = () => {
      setOrientationChangeCount(prev => prev + 1);
      console.log('Orientation change detected');
      setTimeout(checkCanvasCount, 500);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', checkCanvasCount);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', checkCanvasCount);
    };
  }, []);

  const simulateOrientationChange = () => {
    // Simulate orientation change by resizing window
    const event = new Event('resize');
    window.dispatchEvent(event);
    
    setTimeout(() => {
      const orientationEvent = new Event('orientationchange');
      window.dispatchEvent(orientationEvent);
    }, 100);
    
    setOrientationChangeCount(prev => prev + 1);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Test Controls */}
      <div style={{ 
        padding: '10px', 
        background: '#f0f0f0', 
        borderBottom: '1px solid #ddd',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexShrink: 0
      }}>
        <h3 style={{ margin: 0 }}>Canvas Duplicate Test</h3>
        <button 
          onClick={simulateOrientationChange}
          style={{
            padding: '5px 10px',
            background: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Simulate Orientation Change
        </button>
        <button 
          onClick={clearLogs}
          style={{
            padding: '5px 10px',
            background: '#666',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Clear Logs
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '20px' }}>
          <span>Orientation Changes: <strong>{orientationChangeCount}</strong></span>
          <span style={{ 
            color: canvasCount > 1 ? 'red' : 'green',
            fontWeight: 'bold'
          }}>
            Canvas Count: {canvasCount} {canvasCount > 1 ? '⚠️ DUPLICATE!' : '✅'}
          </span>
        </div>
      </div>

      {/* Log Display */}
      <div style={{
        padding: '10px',
        background: '#f9f9f9',
        borderBottom: '1px solid #ddd',
        maxHeight: '150px',
        overflowY: 'auto',
        flexShrink: 0
      }}>
        <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#999' }}>No logs yet...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} style={{ marginBottom: '2px' }}>{log}</div>
            ))
          )}
        </div>
      </div>

      {/* Canvas Container */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Space2DKonvaView
          showGrid={true}
          showDimensions={true}
          showFurniture={true}
        />
      </div>
    </div>
  );
};

export default CanvasDuplicateTest;