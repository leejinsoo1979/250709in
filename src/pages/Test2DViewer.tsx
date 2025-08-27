import React, { useEffect } from 'react';
import { Space2DKonvaView } from '@/editor/shared/viewer2d';
import { UnifiedSpaceViewer } from '@/editor/shared/viewer';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import styles from './Test2DViewer.module.css';

const Test2DViewer: React.FC = () => {
  const spaceConfig = useSpaceConfigStore();
  const furniture = useFurnitureStore();

  // Initialize with test data
  useEffect(() => {
    // Set up space dimensions
    if (!spaceConfig.width || !spaceConfig.depth) {
      spaceConfig.setSpaceInfo({
        width: 3000,
        depth: 2000,
        height: 2400,
        columns: [
          {
            id: 'col1',
            position: { x: 500, y: 0, z: 500 },
            size: 100,
            height: 2400,
          },
          {
            id: 'col2',
            position: { x: 2500, y: 0, z: 500 },
            size: 100,
            height: 2400,
          },
        ],
        walls: [
          {
            id: 'wall1',
            position: { x: 0, y: 0, z: 0 },
            dimensions: { width: 3000, height: 2400, depth: 100 },
            type: 'back',
          },
        ],
      });
    }

    // Add some test furniture
    if (furniture.placedModules.length === 0) {
      furniture.addModule({
        id: 'furniture1',
        moduleId: 'module1',
        name: 'Cabinet 1',
        position: { x: 800, y: 0, z: 800 },
        dimensions: { width: 600, height: 800, depth: 400 },
        rotation: 0,
        hasDoors: true,
      });
      
      furniture.addModule({
        id: 'furniture2',
        moduleId: 'module2',
        name: 'Cabinet 2',
        position: { x: 1600, y: 0, z: 1200 },
        dimensions: { width: 800, height: 900, depth: 500 },
        rotation: 45,
        hasDoors: false,
      });
    }
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>2D Canvas Viewer Test - React Konva Implementation</h1>
        <p>Test page for the new Konva-based 2D editor</p>
      </div>
      
      <div className={styles.content}>
        <div className={styles.viewerSection}>
          <h2>Standalone Konva Viewer</h2>
          <div className={styles.viewerContainer}>
            <Space2DKonvaView
              width={800}
              height={600}
              viewMode="2D"
              showGrid={true}
              showDimensions={true}
              showFurniture={true}
            />
          </div>
        </div>
        
        <div className={styles.viewerSection}>
          <h2>Unified Viewer with Mode Switch</h2>
          <div className={styles.viewerContainer}>
            <UnifiedSpaceViewer
              viewMode="2D"
              showDimensions={true}
              showFurniture={true}
              showFrame={true}
              renderMode="solid"
            />
          </div>
        </div>
      </div>
      
      <div className={styles.features}>
        <h2>Implemented Features</h2>
        <ul>
          <li>✅ Konva.js canvas rendering</li>
          <li>✅ Furniture drag and drop</li>
          <li>✅ Zoom and pan controls</li>
          <li>✅ Grid display with toggle</li>
          <li>✅ Dimension labels</li>
          <li>✅ Furniture selection and rotation</li>
          <li>✅ Column and wall rendering</li>
          <li>✅ Toolbar with view controls</li>
          <li>✅ Integration with Zustand stores</li>
          <li>✅ 2D/3D view mode switching</li>
        </ul>
      </div>
    </div>
  );
};

export default Test2DViewer;