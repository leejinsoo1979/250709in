import React from 'react';

const TestDashboard: React.FC = () => {
  return (
    <div style={{ padding: '20px' }}>
      <h1>테스트 대시보드</h1>
      <p>대시보드가 정상적으로 로드되었습니다!</p>
      <button onClick={() => console.log('버튼 클릭됨')}>
        테스트 버튼
      </button>
    </div>
  );
};

export default TestDashboard;