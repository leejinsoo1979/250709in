/**
 * FAQ 데이터를 Firebase로 마이그레이션하는 스크립트
 * 실행 방법: npm run migrate-qas
 */

import admin from 'firebase-admin';
import { faqData } from '../data/faqData';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// .env.local 로드
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env.local') });

// Firebase Admin 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

// 카테고리 매핑
const categoryMap: Record<string, string> = {
  '프로젝트': '기능',
  '가구': '기능',
  '공간': '기능',
  '뷰': '기능',
  'DXF': '기능',
  '계정': '일반',
  '지원': '기술지원',
  '튜토리얼': '일반',
  '챗봇': '기술지원',
};

async function migrateQAs() {
  console.log('📦 FAQ 마이그레이션 시작...');
  console.log(`총 ${faqData.length}개 항목 마이그레이션 예정\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < faqData.length; i++) {
    const faq = faqData[i];

    try {
      // 질문 텍스트는 첫 번째 한글 키워드 사용
      const koreanKeyword = faq.keywords.find(k => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(k));
      const question = koreanKeyword || faq.keywords[0];

      // 카테고리 추론 (키워드 기반)
      let category = '일반';
      for (const [key, value] of Object.entries(categoryMap)) {
        if (faq.keywords.some(k => k.includes(key))) {
          category = value;
          break;
        }
      }

      const qaData = {
        question: `${question}는 어떻게 하나요?`,
        answer: faq.answer,
        category,
        isActive: true,
        priority: i + 1,
        createdBy: 'system',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection('chatbotQA').add(qaData);
      console.log(`✅ [${i + 1}/${faqData.length}] ${question} 추가 완료`);
      successCount++;

    } catch (error) {
      console.error(`❌ [${i + 1}/${faqData.length}] 실패:`, error);
      errorCount++;
    }
  }

  console.log('\n📊 마이그레이션 완료!');
  console.log(`✅ 성공: ${successCount}개`);
  console.log(`❌ 실패: ${errorCount}개`);
}

migrateQAs()
  .then(() => {
    console.log('\n🎉 모든 작업 완료!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 마이그레이션 실패:', error);
    process.exit(1);
  });
