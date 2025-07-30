import React from 'react';
import { Wall } from '@/types/space';
import styles from './WallControl.module.css';

interface WallControlProps {
  walls: Wall[];
  onWallsChange: (walls: Wall[]) => void;
}

const WallControl: React.FC<WallControlProps> = ({ walls, onWallsChange }) => {
  return (
    <div className={styles.wallControl}>
      <div className={styles.header}>
        <h3>가벽</h3>
      </div>

    </div>
  );
};

export default WallControl;