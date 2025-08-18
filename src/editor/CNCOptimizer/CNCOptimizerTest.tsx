import React, { useEffect } from 'react';
import { useCNCOptimizerStore } from './cncStore';
import { recalc } from './actions/recalculate';
import ModeTabs from './components/ModeTabs';
import SheetPreview from './components/SheetPreview';
import CutsTable from './components/SidebarRight/CutsTable';
import StatsCard from './components/StatsCard';
import styles from './CNCOptimizerTest.module.css';

export default function CNCOptimizerTest() {
  const { setSheets, setPanels } = useCNCOptimizerStore();

  useEffect(() => {
    // Initialize with test data - multiple sheets of same material
    setSheets([
      {
        id: 'sheet1',
        width: 2440,
        length: 1220,
        trim: { left: 10, right: 10, top: 10, bottom: 10 }
      },
      {
        id: 'sheet2',
        width: 2440,
        length: 1220,
        trim: { left: 10, right: 10, top: 10, bottom: 10 }
      },
      {
        id: 'sheet3',
        width: 2440,
        length: 1220,
        trim: { left: 10, right: 10, top: 10, bottom: 10 }
      }
    ]);

    setPanels([
      {
        id: 'panel1',
        width: 600,
        length: 800,
        qty: 4,
        canRotate: true,
        grain: 'none'
      },
      {
        id: 'panel2',
        width: 400,
        length: 500,
        qty: 5,
        canRotate: true,
        grain: 'none'
      },
      {
        id: 'panel3',
        width: 800,
        length: 300,
        qty: 3,
        canRotate: true,
        grain: 'none'
      },
      {
        id: 'panel4',
        width: 350,
        length: 450,
        qty: 4,
        canRotate: true,
        grain: 'none'
      }
    ]);

    // Trigger initial calculation
    setTimeout(recalc, 100);
  }, [setSheets, setPanels]);

  return (
    <div className={styles.container}>
      <ModeTabs />
      <div className={styles.main}>
        <div className={styles.leftSidebar}>
          <StatsCard />
        </div>
        <div className={styles.center}>
          <SheetPreview />
        </div>
        <div className={styles.rightSidebar}>
          <CutsTable />
        </div>
      </div>
    </div>
  );
}