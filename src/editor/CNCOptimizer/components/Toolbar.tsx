import React from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, ZoomIn, ZoomOut, Type, Calculator, Save, User } from 'lucide-react';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  fontSize: 'small' | 'medium' | 'large';
  onFontSizeChange: (size: 'small' | 'medium' | 'large') => void;
  onCalculate: () => void;
  onSave: () => void;
  projectName?: string;
}

const Toolbar: React.FC<ToolbarProps> = ({
  zoom,
  onZoomChange,
  fontSize,
  onFontSizeChange,
  onCalculate,
  onSave,
  projectName = 'CNC Optimizer'
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // URL 파라미터에서 프로젝트 ID와 디자인 파일 ID 가져오기
  const projectId = searchParams.get('projectId');
  const designFileId = searchParams.get('designFileId');
  const fromConfigurator = location.state?.fromConfigurator;

  const handleZoomIn = () => {
    const newZoom = Math.min(200, zoom + 10);
    onZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(50, zoom - 10);
    onZoomChange(newZoom);
  };

  const handleZoomReset = () => {
    onZoomChange(100);
  };

  const cycleFontSize = () => {
    const sizes: ('small' | 'medium' | 'large')[] = ['small', 'medium', 'large'];
    const currentIndex = sizes.indexOf(fontSize);
    const nextIndex = (currentIndex + 1) % sizes.length;
    onFontSizeChange(sizes[nextIndex]);
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <button 
          className={styles.backButton}
          onClick={() => {
            // URL 파라미터를 포함하여 Configurator로 돌아가기
            const params = new URLSearchParams();
            if (projectId) params.set('projectId', projectId);
            if (designFileId) params.set('designFileId', designFileId);
            const queryString = params.toString();
            
            // state로 CNC에서 돌아왔음을 표시
            navigate(`/configurator${queryString ? `?${queryString}` : ''}`, {
              state: { fromCNC: true, skipReload: true }
            });
          }}
        >
          <ArrowLeft />
        </button>
        <div className={styles.logo}>
          <span className={styles.title}>CNC Optimizer</span>
          {projectName && <span className={styles.projectName}>{projectName}</span>}
        </div>
      </div>

      <div className={styles.right}>
        {/* Zoom Controls */}
        <div className={styles.zoomGroup}>
          <button 
            className={styles.iconButton}
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <ZoomOut />
          </button>
          <button 
            className={styles.zoomValue}
            onClick={handleZoomReset}
            title="Reset Zoom"
          >
            {zoom}%
          </button>
          <button 
            className={styles.iconButton}
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <ZoomIn />
          </button>
        </div>

        {/* Font Size */}
        <button 
          className={styles.iconButton}
          onClick={cycleFontSize}
          title={`Font Size: ${fontSize}`}
        >
          <Type />
          <span className={styles.badge}>{fontSize[0].toUpperCase()}</span>
        </button>

        {/* Calculate */}
        <button 
          className={styles.primaryButton}
          onClick={onCalculate}
        >
          <Calculator />
          Calculate
        </button>

        {/* Save Dropdown */}
        <div className={styles.dropdown}>
          <button 
            className={styles.secondaryButton}
            onClick={onSave}
          >
            <Save />
            Save
            <span className={styles.dropdownArrow}>▼</span>
          </button>
        </div>

        {/* User Menu */}
        <button className={styles.userButton}>
          <User />
        </button>
      </div>
    </div>
  );
};

export default Toolbar;