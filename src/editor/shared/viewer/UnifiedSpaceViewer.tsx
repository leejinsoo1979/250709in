import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import { Space2DKonvaView } from '@/editor/shared/viewer2d';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import styles from './UnifiedSpaceViewer.module.css';

interface UnifiedSpaceViewerProps {
  // Common props
  viewMode?: '2D' | '3D';
  showDimensions?: boolean;
  showFurniture?: boolean;
  showFrame?: boolean;
  renderMode?: 'solid' | 'wireframe';
  
  // 3D specific props
  spaceInfo?: any;
  svgSize?: any;
  isEmbedded?: boolean;
  isStep2?: boolean;
  activeZone?: any;
  showAll?: boolean;
  
  // Size props
  width?: number;
  height?: number;
  
  // Callbacks
  onViewModeChange?: (mode: '2D' | '3D') => void;
}

/**
 * UnifiedSpaceViewer Component
 * Provides seamless switching between 2D Konva canvas and 3D Three.js views
 */
const UnifiedSpaceViewer: React.FC<UnifiedSpaceViewerProps> = ({
  viewMode: propViewMode,
  showDimensions = true,
  showFurniture = true,
  showFrame = true,
  renderMode = 'solid',
  spaceInfo,
  svgSize,
  isEmbedded = false,
  isStep2 = false,
  activeZone,
  showAll = true,
  width,
  height,
  onViewModeChange,
}) => {
  const uiStore = useUIStore();
  const [localViewMode, setLocalViewMode] = useState<'2D' | '3D'>(
    propViewMode || uiStore.viewMode || '3D'
  );
  const [use2DKonva, setUse2DKonva] = useState(false);

  // Sync with UI store
  useEffect(() => {
    if (propViewMode) {
      setLocalViewMode(propViewMode);
    } else if (uiStore.viewMode) {
      setLocalViewMode(uiStore.viewMode);
    }
  }, [propViewMode, uiStore.viewMode]);

  // Handle view mode change
  const handleViewModeChange = (mode: '2D' | '3D') => {
    setLocalViewMode(mode);
    uiStore.setViewMode(mode);
    
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
  };

  // Toggle between 2D implementations
  const handle2DImplementationToggle = () => {
    setUse2DKonva(!use2DKonva);
  };

  return (
    <div className={styles.container}>
      {/* View mode selector */}
      <div className={styles.viewModeSelector}>
        <Tabs value={localViewMode} onValueChange={(value) => handleViewModeChange(value as '2D' | '3D')}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="2D" className={styles.tabTrigger}>
              2D View
            </TabsTrigger>
            <TabsTrigger value="3D" className={styles.tabTrigger}>
              3D View
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        {/* 2D implementation toggle (only shown in 2D mode) */}
        {localViewMode === '2D' && (
          <div className={styles.implementationToggle}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={use2DKonva}
                onChange={handle2DImplementationToggle}
                className={styles.toggleCheckbox}
              />
              <span className={styles.toggleText}>
                Use Konva Canvas {use2DKonva ? '(Active)' : '(Inactive)'}
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Viewer container */}
      <div className={styles.viewerContainer}>
        {localViewMode === '2D' && use2DKonva ? (
          // Render 2D Konva Canvas
          <Space2DKonvaView
            width={width}
            height={height}
            viewMode={localViewMode}
            showDimensions={showDimensions}
            showFurniture={showFurniture}
            showGrid={true}
          />
        ) : (
          // Render 3D or orthographic 2D view
          <Space3DView
            spaceInfo={spaceInfo}
            svgSize={svgSize}
            viewMode={localViewMode}
            renderMode={renderMode}
            showAll={showAll}
            showFurniture={showFurniture}
            showFrame={showFrame}
            showDimensions={showDimensions}
            isEmbedded={isEmbedded}
            isStep2={isStep2}
            activeZone={activeZone}
            setViewMode={handleViewModeChange}
          />
        )}
      </div>
    </div>
  );
};

export default UnifiedSpaceViewer;