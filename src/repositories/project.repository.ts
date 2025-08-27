import { Firestore, Timestamp } from 'firebase/firestore';
import { BaseRepository, QueryOptions } from './base.repository';
import { FirebaseProject, CreateProjectData } from '../firebase/types';
import { db } from '../firebase/config';

export class ProjectRepository extends BaseRepository<FirebaseProject> {
  protected collectionName = 'projects';
  protected db: Firestore = db;

  /**
   * 사용자별 프로젝트 조회
   */
  async findByUserId(userId: string, options?: QueryOptions): Promise<FirebaseProject[]> {
    const queryOptions: QueryOptions = {
      where: [{ field: 'userId', operator: '==', value: userId }],
      orderBy: options?.orderBy || [{ field: 'updatedAt', direction: 'desc' }],
      ...options
    };

    return this.findAll(queryOptions);
  }

  /**
   * 프로젝트 생성 (커스텀 로직 포함)
   */
  async createProject(userId: string, data: CreateProjectData): Promise<FirebaseProject> {
    const projectData: Omit<FirebaseProject, 'id'> = {
      userId,
      title: data.title,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      version: '1.0.0',
      stats: {
        designFileCount: 0,
        lastOpenedAt: Timestamp.now()
      }
    };

    return this.create(projectData);
  }

  /**
   * 프로젝트 통계 업데이트
   */
  async updateStats(
    projectId: string, 
    stats: Partial<FirebaseProject['stats']>
  ): Promise<FirebaseProject> {
    const currentProject = await this.findById(projectId);
    if (!currentProject) {
      throw new Error('Project not found');
    }

    return this.update(projectId, {
      stats: {
        ...currentProject.stats,
        ...stats,
        lastOpenedAt: Timestamp.now()
      }
    });
  }

  /**
   * 최근 열린 프로젝트 조회
   */
  async findRecentProjects(
    userId: string, 
    limit: number = 10
  ): Promise<FirebaseProject[]> {
    return this.findByUserId(userId, {
      orderBy: [{ field: 'stats.lastOpenedAt', direction: 'desc' }],
      limit
    });
  }

  /**
   * 프로젝트 검색
   */
  async searchProjects(
    userId: string,
    searchTerm: string
  ): Promise<FirebaseProject[]> {
    // Firestore는 전문 검색을 지원하지 않으므로
    // 클라이언트 사이드 필터링 필요
    const projects = await this.findByUserId(userId);
    const lowerSearch = searchTerm.toLowerCase();
    
    return projects.filter(project => 
      project.title.toLowerCase().includes(lowerSearch)
    );
  }

  /**
   * 프로젝트 삭제 (관련 데이터 정리 포함)
   */
  async deleteProject(projectId: string): Promise<void> {
    // 트랜잭션으로 관련 데이터도 함께 삭제
    await this.runTransaction(async (transaction) => {
      const projectRef = this.getDocRef(projectId);
      
      // TODO: designs, folders 등 하위 컬렉션 삭제
      // Firestore는 하위 컬렉션을 자동으로 삭제하지 않음
      
      transaction.delete(projectRef);
    });
  }

  /**
   * 프로젝트 소유권 확인
   */
  async isOwner(projectId: string, userId: string): Promise<boolean> {
    const project = await this.findById(projectId);
    return project?.userId === userId;
  }

  /**
   * 배치 프로젝트 생성
   */
  async createBatchProjects(
    userId: string,
    projectsData: CreateProjectData[]
  ): Promise<FirebaseProject[]> {
    const batch = this.createBatch();
    const projectIds: string[] = [];
    const timestamp = Timestamp.now();

    projectsData.forEach(data => {
      const projectRef = this.collectionRef.doc();
      projectIds.push(projectRef.id);
      
      batch.set(projectRef, {
        userId,
        title: data.title,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: '1.0.0',
        stats: {
          designFileCount: 0,
          lastOpenedAt: timestamp
        }
      });
    });

    await this.executeBatch(batch);
    
    // 생성된 프로젝트들 조회
    return Promise.all(projectIds.map(id => this.findById(id)))
      .then(projects => projects.filter(p => p !== null) as FirebaseProject[]);
  }
}