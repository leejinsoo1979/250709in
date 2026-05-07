/**
 * 관리자 페이지용: 사용자별 사용량 통계 집계
 *
 * ⚠️ Firestore read 비용 주의:
 *  - projects 컬렉션 전체를 1회 read (count는 서버에서 못 함, userId별로 분리해야 하므로)
 *  - 결과는 sessionStorage에 캐싱하여 같은 세션 내 재조회 방지
 */

import { collection, getDocs, query, collectionGroup } from 'firebase/firestore';
import { db } from './config';
import { Timestamp } from 'firebase/firestore';

export interface UserUsageStats {
  uid: string;
  projectCount: number;
  designFileCount: number;
  lastActivityAt: number | null; // ms timestamp - 가장 최근 프로젝트 updatedAt
}

const CACHE_KEY = 'admin_user_usage_stats_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

interface CachedPayload {
  fetchedAt: number;
  stats: Record<string, UserUsageStats>;
}

function readCache(): Record<string, UserUsageStats> | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as CachedPayload;
    if (Date.now() - payload.fetchedAt > CACHE_TTL_MS) return null;
    return payload.stats;
  } catch {
    return null;
  }
}

function writeCache(stats: Record<string, UserUsageStats>) {
  try {
    const payload: CachedPayload = { fetchedAt: Date.now(), stats };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * 모든 사용자의 사용량 통계 집계
 * @param force true면 캐시 무시하고 새로 조회
 */
export async function getAllUserUsageStats(
  force = false
): Promise<Record<string, UserUsageStats>> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }

  const stats: Record<string, UserUsageStats> = {};

  try {
    // 1) projects 컬렉션 1회 조회
    const projectsSnap = await getDocs(collection(db, 'projects'));
    projectsSnap.forEach((doc) => {
      const data = doc.data() as {
        userId?: string;
        updatedAt?: Timestamp;
        stats?: { designFileCount?: number };
      };
      const uid = data.userId;
      if (!uid) return;

      if (!stats[uid]) {
        stats[uid] = {
          uid,
          projectCount: 0,
          designFileCount: 0,
          lastActivityAt: null,
        };
      }
      stats[uid].projectCount += 1;

      // 프로젝트 stats.designFileCount 사용 (없으면 0)
      const dfc = data.stats?.designFileCount ?? 0;
      stats[uid].designFileCount += dfc;

      const updatedMs = data.updatedAt?.toMillis?.();
      if (updatedMs && (stats[uid].lastActivityAt === null || updatedMs > stats[uid].lastActivityAt!)) {
        stats[uid].lastActivityAt = updatedMs;
      }
    });

    // 2) 디자인 파일 수가 stats에 누락된 경우를 대비해 collectionGroup으로 보강 (선택적)
    // → projects.stats.designFileCount가 정확하지 않을 수 있어 별도 집계
    try {
      const designsSnap = await getDocs(query(collectionGroup(db, 'designs')));
      // userId별 정확한 디자인 파일 수로 덮어쓰기
      const exactDesignCount: Record<string, number> = {};
      designsSnap.forEach((doc) => {
        const data = doc.data() as { userId?: string };
        const uid = data.userId;
        if (!uid) return;
        exactDesignCount[uid] = (exactDesignCount[uid] || 0) + 1;
      });
      Object.entries(exactDesignCount).forEach(([uid, count]) => {
        if (stats[uid]) {
          stats[uid].designFileCount = count;
        } else {
          stats[uid] = {
            uid,
            projectCount: 0,
            designFileCount: count,
            lastActivityAt: null,
          };
        }
      });
    } catch (err) {
      // collectionGroup 인덱스가 없으면 무시 (stats.designFileCount만 사용)
      console.warn('designs collectionGroup 조회 실패 — stats.designFileCount 사용:', err);
    }
  } catch (err) {
    console.error('사용자 사용량 집계 실패:', err);
    return {};
  }

  writeCache(stats);
  return stats;
}

/**
 * 캐시 무효화 (관리자가 수동 새로고침할 때 사용)
 */
export function clearUserUsageStatsCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
