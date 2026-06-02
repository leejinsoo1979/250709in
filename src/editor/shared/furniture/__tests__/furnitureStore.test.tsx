import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '../types';

// 테스트용 샘플 모듈 데이터
const sampleModule: PlacedModule = {
  id: 'test-module-1',
  moduleId: 'single-shelf-500',
  moduleWidth: 500,
  freeWidth: 500,
  customWidth: 500,
  position: { x: 0, y: 0, z: 0 },
  rotation: 0,
  hasDoor: false
};

describe('Furniture Store Tests', () => {
  let store: any;

  beforeEach(() => {
    const { result } = renderHook(() => useFurnitureStore());
    store = result.current;
    
    // 각 테스트 시작 전 상태 초기화
    act(() => {
      store.clearAllModules();
      useSpaceConfigStore.getState().setSpaceInfo({
        width: 3000,
        height: 2400,
        depth: 600,
        installType: 'builtin',
        wallConfig: { left: true, right: true },
        hasFloorFinish: false,
        surroundType: 'no-surround',
        layoutMode: 'free-placement',
        gapConfig: { left: 0, right: 0 }
      });
    });
  });

  it('should add module correctly', () => {
    act(() => {
      store.addModule(sampleModule);
    });

    const modules = useFurnitureStore.getState().placedModules;
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject(sampleModule);
  });

  it('should remove module correctly', () => {
    act(() => {
      store.addModule(sampleModule);
      store.removeModule(sampleModule.id);
    });

    expect(useFurnitureStore.getState().placedModules).toHaveLength(0);
  });

  it('should clear all modules', () => {
    act(() => {
      store.addModule(sampleModule);
      store.addModule({ ...sampleModule, id: 'test-module-2' });
      store.clearAllModules();
    });

    expect(useFurnitureStore.getState().placedModules).toHaveLength(0);
  });

  it('keeps an insert-frame fixed to the placed side when popup width changes', () => {
    const leftNeighbor: PlacedModule = {
      id: 'left-neighbor',
      moduleId: 'single-shelf-500',
      moduleWidth: 500,
      freeWidth: 500,
      customWidth: 500,
      position: { x: -3.18, y: 0, z: 0 },
      rotation: 0,
      isFreePlacement: true,
      freePlacementCategory: 'full'
    };
    const insertFrame: PlacedModule = {
      id: 'insert-frame',
      moduleId: 'insert-frame-136',
      moduleWidth: 136,
      freeWidth: 136,
      customWidth: 136,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      isFreePlacement: true,
      freePlacementCategory: 'full'
    };

    act(() => {
      store.addModule(leftNeighbor);
      store.addModule(insertFrame);
      store.updatePlacedModule(insertFrame.id, {
        customWidth: 236,
        isSplit: true
      } as any);
    });

    const updated = useFurnitureStore.getState().placedModules.find(m => m.id === insertFrame.id)!;
    const oldLeftMm = insertFrame.position.x * 100 - 136 / 2;
    const nextLeftMm = updated.position.x * 100 - 236 / 2;
    const nextRightMm = updated.position.x * 100 + 236 / 2;

    expect(updated.hingePosition).toBe('left');
    expect(updated.freeWidth).toBe(236);
    expect(updated.moduleWidth).toBe(236);
    expect(updated.customWidth).toBe(236);
    expect(nextLeftMm).toBeCloseTo(oldLeftMm, 5);
    expect(nextRightMm).toBeCloseTo(oldLeftMm + 236, 5);
  });
});

/**
 * Furniture Store 테스트 컴포넌트
 * 개발 환경에서 Store가 제대로 작동하는지 확인용
 */
export const FurnitureStoreTest: React.FC = () => {
  // Store 사용
  const store = useFurnitureStore();

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '10px' }}>
      <h3>🧪 Furniture Store 테스트</h3>
      
      {/* Store 사용 */}
      <div>
        <h4>Store 사용:</h4>
        <p>배치된 모듈 수: {store.placedModules.length}</p>
        <button onClick={() => store.addModule(sampleModule)}>
          모듈 추가
        </button>
        <button onClick={() => store.addModule({
          ...sampleModule,
          id: 'test-module-2'
        })}>
          모듈 추가 (다른 ID)
        </button>
        <button onClick={() => store.clearAllModules()}>
          모든 모듈 삭제
        </button>
      </div>

      {/* 모듈 리스트 표시 */}
      <div style={{ marginTop: '20px' }}>
        <h4>현재 배치된 모듈들:</h4>
        {store.placedModules.length === 0 ? (
          <p>배치된 모듈이 없습니다.</p>
        ) : (
          <ul>
            {store.placedModules.map(module => (
              <li key={module.id}>
                {module.id} - {module.moduleId}
                <button 
                  onClick={() => store.removeModule(module.id)}
                  style={{ marginLeft: '10px' }}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}; 
