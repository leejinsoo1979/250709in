/**
 * Firebase 데이터 구조 디버그 컴포넌트
 * 실제 저장된 프로젝트 데이터와 예상 구조를 비교
 */

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import styles from './FirebaseDataDebug.module.css';

interface DebugData {
  projectId: string;
  title: string;
  actualData: any;
  expectedStructure: any;
  missingFields: string[];
  unexpectedFields: string[];
}

const FirebaseDataDebug: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<DebugData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<DebugData | null>(null);

  useEffect(() => {
    if (user) {
      loadProjectsData();
    }
  }, [user]);

  const loadProjectsData = async () => {
    try {
      setLoading(true);
      
      // 기존 Firebase projects 컬렉션에서 데이터 로드
      const projectsQuery = query(
        collection(db, 'projects'),
        where('userId', '==', user!.uid)
      );
      
      const querySnapshot = await getDocs(projectsQuery);
      const debugData: DebugData[] = [];
      
      for (const docSnapshot of querySnapshot.docs) {
        const actualData = docSnapshot.data();
        console.log(`🔍 [Debug] 프로젝트 ${docSnapshot.id} 원본 데이터:`, actualData);
        
        const analysis = analyzeProjectStructure(actualData);
        
        debugData.push({
          projectId: docSnapshot.id,
          title: actualData.title || '제목 없음',
          actualData,
          expectedStructure: getExpectedStructure(),
          missingFields: analysis.missing,
          unexpectedFields: analysis.unexpected
        });
      }
      
      setProjects(debugData);
      
      // "위시티자이" 프로젝트 자동 선택
      const wishCityProject = debugData.find(p => 
        p.title.includes('위시티자이') || p.title.includes('위시')
      );
      if (wishCityProject) {
        setSelectedProject(wishCityProject);
      }
      
    } catch (error) {
      console.error('프로젝트 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeProjectStructure = (actualData: any) => {
    const expected = getExpectedStructure();
    const missing: string[] = [];
    const unexpected: string[] = [];
    
    // 예상 필드 확인
    checkFields(expected, actualData, '', missing, 'missing');
    
    // 예상치 못한 필드 확인
    checkFields(actualData, expected, '', unexpected, 'unexpected');
    
    return { missing, unexpected };
  };

  const checkFields = (
    source: any, 
    target: any, 
    prefix: string, 
    result: string[], 
    type: 'missing' | 'unexpected'
  ) => {
    for (const key in source) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (!(key in target)) {
        result.push(fullKey);
      } else if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        checkFields(source[key], target[key] || {}, fullKey, result, type);
      }
    }
  };

  const getExpectedStructure = () => ({
    id: 'string',
    userId: 'string',
    basicInfo: {
      title: 'string',
      location: 'string',
      description: 'string (optional)',
      version: 'string',
      createdAt: 'Timestamp',
      updatedAt: 'Timestamp',
      customerInfo: {
        name: 'string (optional)',
        phone: 'string (optional)',
        email: 'string (optional)'
      }
    },
    spaceConfig: {
      dimensions: {
        width: 'number',
        height: 'number',
        depth: 'number'
      },
      installType: "'builtin' | 'standalone' | 'freestanding'",
      wallPosition: "'left' | 'right' (for standalone)",
      damper: {
        agentPosition: "'none' | 'left' | 'right' | 'both'",
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
        type: "'nowall' | 'wall'",
        completed: 'boolean'
      },
      rack: {
        thickness: "'2mm' | '3mm'",
        completed: 'boolean',
        options: {
          isComposite: 'boolean'
        }
      },
      motor: {
        topHeight: 'number',
        completed: 'boolean'
      },
      ventilation: {
        type: "'no' | 'dry'",
        completed: 'boolean'
      },
      exhaust: {
        height: 'number',
        completed: 'boolean',
        fromFloor: 'boolean'
      }
    },
    metadata: {
      status: "'draft' | 'in_progress' | 'completed' | 'archived'",
      priority: "'low' | 'medium' | 'high' | 'urgent'",
      tags: 'string[]',
      isFavorite: 'boolean'
    },
    stats: {
      designFileCount: 'number',
      furnitureCount: 'number',
      completionRate: 'number',
      lastOpenedAt: 'Timestamp'
    },
    thumbnailUrl: 'string (optional)'
  });

  const renderStructureComparison = (project: DebugData) => {
    return (
      <div className={styles.comparisonContainer}>
        <div className={styles.comparisonSection}>
          <h3>🔍 실제 저장된 데이터</h3>
          <pre className={styles.actualData}>
            {JSON.stringify(project.actualData, null, 2)}
          </pre>
        </div>
        
        <div className={styles.comparisonSection}>
          <h3>📋 예상 데이터 구조</h3>
          <pre className={styles.expectedData}>
            {JSON.stringify(project.expectedStructure, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  const renderAnalysis = (project: DebugData) => {
    return (
      <div className={styles.analysisContainer}>
        <div className={styles.analysisSection}>
          <h4>❌ 누락된 필드들</h4>
          {project.missingFields.length > 0 ? (
            <ul className={styles.missingFields}>
              {project.missingFields.map(field => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.noIssues}>누락된 필드가 없습니다!</p>
          )}
        </div>
        
        <div className={styles.analysisSection}>
          <h4>⚠️ 예상치 못한 필드들</h4>
          {project.unexpectedFields.length > 0 ? (
            <ul className={styles.unexpectedFields}>
              {project.unexpectedFields.map(field => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.noIssues}>예상치 못한 필드가 없습니다!</p>
          )}
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className={styles.container}>
        <h1>🔐 로그인이 필요합니다</h1>
        <p>Firebase 데이터를 확인하려면 로그인해주세요.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <h1>🔄 데이터 로딩 중...</h1>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1>🔍 Firebase 프로젝트 데이터 구조 분석</h1>
      
      <div className={styles.projectSelector}>
        <h2>📁 프로젝트 목록 ({projects.length}개)</h2>
        <div className={styles.projectList}>
          {projects.map(project => (
            <button
              key={project.projectId}
              className={`${styles.projectButton} ${
                selectedProject?.projectId === project.projectId ? styles.selected : ''
              }`}
              onClick={() => setSelectedProject(project)}
            >
              <div className={styles.projectInfo}>
                <strong>{project.title}</strong>
                <small>{project.projectId}</small>
              </div>
              <div className={styles.projectStats}>
                <span className={styles.missingCount}>
                  누락: {project.missingFields.length}
                </span>
                <span className={styles.unexpectedCount}>
                  추가: {project.unexpectedFields.length}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedProject && (
        <div className={styles.selectedProject}>
          <h2>📊 선택된 프로젝트: {selectedProject.title}</h2>
          
          {renderAnalysis(selectedProject)}
          
          <div className={styles.tabContainer}>
            <details open>
              <summary className={styles.tabHeader}>
                📋 데이터 구조 비교
              </summary>
              {renderStructureComparison(selectedProject)}
            </details>
          </div>
          
          <div className={styles.recommendations}>
            <h3>💡 권장사항</h3>
            <ul>
              <li>새로운 스키마로 마이그레이션하려면 <code>projectDataService.ts</code>를 사용하세요</li>
              <li>기존 데이터와의 호환성을 위해 마이그레이션 스크립트를 작성하세요</li>
              <li>Step1-3 컴포넌트에서 생성한 데이터가 올바른 구조로 저장되는지 확인하세요</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirebaseDataDebug;