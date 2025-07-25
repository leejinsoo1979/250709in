import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { getCurrentUserAsync } from '@/firebase/auth';

interface DebugProject {
  id: string;
  title: string;
  data: any;
}

export const FirebaseDebug: React.FC = () => {
  const [projects, setProjects] = useState<DebugProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<DebugProject | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const user = await getCurrentUserAsync();
      if (!user) {
        setError('사용자가 로그인되지 않았습니다.');
        return;
      }

      const projectsQuery = query(
        collection(db, 'projects'),
        where('userId', '==', user.uid)
      );
      
      const snapshot = await getDocs(projectsQuery);
      const projectsData: DebugProject[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        projectsData.push({
          id: doc.id,
          title: data.title || 'Unknown',
          data: data
        });
      });
      
      setProjects(projectsData);
      
      // "위시티자이" 프로젝트 자동 선택
      const wishityProject = projectsData.find(p => 
        p.title.includes('위시티자이')
      );
      if (wishityProject) {
        setSelectedProject(wishityProject);
      }
      
    } catch (err) {
      console.error('Firebase 데이터 조회 실패:', err);
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const analyzeStructure = (data: any, expectedStructure: any, path = '') => {
    const analysis: { path: string; status: string; type: string; expected?: string }[] = [];
    
    // 예상 구조 검사
    Object.keys(expectedStructure).forEach(key => {
      const currentPath = path ? `${path}.${key}` : key;
      const exists = data && data.hasOwnProperty(key);
      const actualType = exists ? typeof data[key] : 'undefined';
      const expectedType = typeof expectedStructure[key];
      
      analysis.push({
        path: currentPath,
        status: exists ? '✅ 존재' : '❌ 없음',
        type: actualType,
        expected: expectedType
      });
      
      // 중첩 객체 분석
      if (exists && typeof data[key] === 'object' && data[key] !== null && 
          typeof expectedStructure[key] === 'object' && !Array.isArray(expectedStructure[key])) {
        analysis.push(...analyzeStructure(data[key], expectedStructure[key], currentPath));
      }
    });
    
    return analysis;
  };

  // 예상되는 프로젝트 구조 (새로운 스키마)
  const expectedProjectStructure = {
    id: 'string',
    userId: 'string',
    basicInfo: {
      title: 'string',
      location: 'string',
      createdAt: 'object', // Timestamp
      updatedAt: 'object', // Timestamp
      version: 'string',
      description: 'string',
      customerInfo: {
        name: 'string',
        phone: 'string',
        email: 'string'
      }
    },
    spaceConfig: {
      dimensions: {
        width: 'number',
        height: 'number',
        depth: 'number'
      },
      installType: 'string',
      wallPosition: 'string',
      damper: {
        agentPosition: 'string',
        size: {
          width: 'number',
          height: 'number'
        }
      },
      floorFinish: {
        enabled: 'boolean',
        height: 'number'
      }
    },
    customLayout: {
      wall: {
        type: 'string',
        completed: 'boolean'
      },
      rack: {
        thickness: 'string',
        completed: 'boolean'
      },
      motor: {
        topHeight: 'number',
        completed: 'boolean'
      },
      ventilation: {
        type: 'string',
        completed: 'boolean'
      },
      exhaust: {
        height: 'number',
        completed: 'boolean',
        fromFloor: 'boolean'
      }
    },
    metadata: {
      status: 'string',
      priority: 'string',
      tags: 'object', // Array
      isFavorite: 'boolean'
    },
    stats: {
      designFileCount: 'number',
      furnitureCount: 'number',
      completionRate: 'number'
    }
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      width: '100vw', 
      height: '100vh', 
      background: 'white', 
      zIndex: 9999, 
      overflow: 'auto',
      padding: '20px',
      fontFamily: 'monospace'
    }}>
      <h1>🔍 Firebase 데이터 구조 분석</h1>
      
      <button onClick={fetchProjects} disabled={loading}>
        {loading ? '로딩 중...' : '프로젝트 새로고침'}
      </button>
      
      {error && (
        <div style={{ color: 'red', margin: '10px 0' }}>
          ❌ {error}
        </div>
      )}
      
      <div style={{ margin: '20px 0' }}>
        <h2>📋 프로젝트 목록 ({projects.length}개)</h2>
        {projects.map(project => (
          <div 
            key={project.id}
            style={{ 
              padding: '10px', 
              border: selectedProject?.id === project.id ? '2px solid blue' : '1px solid #ccc',
              margin: '5px 0',
              cursor: 'pointer'
            }}
            onClick={() => setSelectedProject(project)}
          >
            <strong>{project.title}</strong> (ID: {project.id})
          </div>
        ))}
      </div>
      
      {selectedProject && (
        <div>
          <h2>🎯 선택된 프로젝트: {selectedProject.title}</h2>
          
          <h3>📄 실제 데이터 구조</h3>
          <pre style={{ 
            background: '#f5f5f5', 
            padding: '10px', 
            overflow: 'auto',
            maxHeight: '300px',
            fontSize: '12px'
          }}>
            {JSON.stringify(selectedProject.data, null, 2)}
          </pre>
          
          <h3>🔍 구조 분석 (새 스키마 vs 실제 데이터)</h3>
          <div style={{ background: '#f9f9f9', padding: '10px' }}>
            {analyzeStructure(selectedProject.data, expectedProjectStructure).map((item, index) => (
              <div key={index} style={{ 
                padding: '5px 0',
                borderBottom: '1px solid #eee',
                fontSize: '14px'
              }}>
                <strong>{item.path}:</strong> {item.status} 
                <span style={{ color: '#666', marginLeft: '10px' }}>
                  실제: {item.type} | 예상: {item.expected}
                </span>
              </div>
            ))}
          </div>
          
          <h3>📊 현재 사용 중인 구조 (기존 스키마)</h3>
          <div style={{ background: '#fff3cd', padding: '10px' }}>
            <p><strong>현재 데이터 필드들:</strong></p>
            <ul>
              {Object.keys(selectedProject.data).map(key => (
                <li key={key}>
                  <strong>{key}:</strong> {typeof selectedProject.data[key]} 
                  {selectedProject.data[key] && typeof selectedProject.data[key] === 'object' && (
                    <span> (keys: {Object.keys(selectedProject.data[key]).join(', ')})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      <div style={{ marginTop: '20px', padding: '10px', background: '#e7f3ff' }}>
        <h3>📝 분석 요약</h3>
        <p>이 디버그 도구는 현재 Firebase에 저장된 실제 데이터 구조와 새로운 TypeScript 인터페이스를 비교합니다.</p>
        <p>빨간색(❌)으로 표시된 필드들은 새 스키마에서 정의되었지만 실제 데이터에는 없는 필드들입니다.</p>
      </div>
    </div>
  );
};

export default FirebaseDebug;