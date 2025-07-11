import React from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { PlacedModule } from '../types';

// 테스트용 샘플 모듈 데이터
const sampleModule: PlacedModule = {
  id: 'test-module-1',
  moduleId: 'box-shelf-single-400',
  position: { x: 0, y: 0, z: 0 },
  rotation: 0,
  hasDoor: false
};

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