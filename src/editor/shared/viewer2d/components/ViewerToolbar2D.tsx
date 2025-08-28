import React from 'react';
import { 
  Grid3x3, 
  Ruler, 
  Move, 
  MousePointer,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize,
  Eye,
  EyeOff,
  Layers,
  Download,
  Upload
} from 'lucide-react';

interface ViewerToolbar2DProps {
  showGrid: boolean;
  showDimensions: boolean;
  showFurniture: boolean;
  showColumns: boolean;
  showWalls: boolean;
  tool: 'select' | 'pan' | 'measure';
  scale: number;
  onToggleGrid: () => void;
  onToggleDimensions: () => void;
  onToggleFurniture: () => void;
  onToggleColumns: () => void;
  onToggleWalls: () => void;
  onToolChange: (tool: 'select' | 'pan' | 'measure') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

const ViewerToolbar2D: React.FC<ViewerToolbar2DProps> = ({
  showGrid,
  showDimensions,
  showFurniture,
  showColumns,
  showWalls,
  tool,
  scale,
  onToggleGrid,
  onToggleDimensions,
  onToggleFurniture,
  onToggleColumns,
  onToggleWalls,
  onToolChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onExport,
  onImport,
}) => {
  return (
    <div className={styles.toolbar}>
      {/* Tool selection */}
      <div className={styles.toolGroup}>
        <button
          className={`${styles.toolButton} ${tool === 'select' ? styles.active : ''}`}
          onClick={() => onToolChange('select')}
          title="Select Tool (V)"
        >
          <MousePointer size={20} />
        </button>
        <button
          className={`${styles.toolButton} ${tool === 'pan' ? styles.active : ''}`}
          onClick={() => onToolChange('pan')}
          title="Pan Tool (H)"
        >
          <Move size={20} />
        </button>
        <button
          className={`${styles.toolButton} ${tool === 'measure' ? styles.active : ''}`}
          onClick={() => onToolChange('measure')}
          title="Measure Tool (M)"
        >
          <Ruler size={20} />
        </button>
      </div>

      <div className={styles.toolDivider} />

      {/* View toggles */}
      <div className={styles.toolGroup}>
        <button
          className={`${styles.toolButton} ${showGrid ? styles.active : ''}`}
          onClick={onToggleGrid}
          title="Toggle Grid (G)"
        >
          <Grid3x3 size={20} />
        </button>
        <button
          className={`${styles.toolButton} ${showDimensions ? styles.active : ''}`}
          onClick={onToggleDimensions}
          title="Toggle Dimensions (D)"
        >
          <Ruler size={20} />
        </button>
        <button
          className={`${styles.toolButton} ${showFurniture ? styles.active : ''}`}
          onClick={onToggleFurniture}
          title="Toggle Furniture (F)"
        >
          {showFurniture ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>
        <button
          className={`${styles.toolButton} ${showColumns ? styles.active : ''}`}
          onClick={onToggleColumns}
          title="Toggle Columns"
        >
          <Layers size={20} />
        </button>
        <button
          className={`${styles.toolButton} ${showWalls ? styles.active : ''}`}
          onClick={onToggleWalls}
          title="Toggle Walls"
        >
          <Layers size={20} />
        </button>
      </div>

      <div className={styles.toolDivider} />

      {/* Zoom controls */}
      <div className={styles.toolGroup}>
        <button
          className={styles.toolButton}
          onClick={onZoomIn}
          title="Zoom In (+)"
        >
          <ZoomIn size={20} />
        </button>
        <span className={styles.zoomLevel}>{Math.round(scale * 100)}%</span>
        <button
          className={styles.toolButton}
          onClick={onZoomOut}
          title="Zoom Out (-)"
        >
          <ZoomOut size={20} />
        </button>
        <button
          className={styles.toolButton}
          onClick={onZoomReset}
          title="Fit to View (Space)"
        >
          <Maximize size={20} />
        </button>
      </div>

      {/* Import/Export */}
      {(onExport || onImport) && (
        <>
          <div className={styles.toolDivider} />
          <div className={styles.toolGroup}>
            {onImport && (
              <button
                className={styles.toolButton}
                onClick={onImport}
                title="Import"
              >
                <Upload size={20} />
              </button>
            )}
            {onExport && (
              <button
                className={styles.toolButton}
                onClick={onExport}
                title="Export"
              >
                <Download size={20} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ViewerToolbar2D;