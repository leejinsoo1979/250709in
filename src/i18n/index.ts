import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// 번역 파일 import
import koTranslation from '../locales/ko.json';
import enTranslation from '../locales/en.json';
import jaTranslation from '../locales/ja.json';
import zhTranslation from '../locales/zh.json';

// 번역 리소스 정의
const resources = {
  ko: {
    translation: koTranslation
  },
  en: {
    translation: enTranslation
  },
  ja: {
    translation: jaTranslation
  },
  zh: {
    translation: zhTranslation
  }
};

// i18n 초기화
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('app-language') || 'ko', // 저장된 언어 또는 기본값 한국어
    fallbackLng: 'ko', // 번역이 없을 때 사용할 언어
    
    interpolation: {
      escapeValue: false // React는 XSS를 자동으로 방지하므로 false
    },
    
    // 네임스페이스 설정
    ns: ['translation'],
    defaultNS: 'translation',
    
    // 디버그 모드 (개발 환경에서만)
    debug: import.meta.env.DEV,
    
    // React 옵션
    react: {
      useSuspense: false // Suspense 비활성화 (로딩 처리를 직접 하기 위해)
    }
  });

// 언어 변경 이벤트 리스너 - 제거 (useTranslation에서 처리)

export default i18n;