import { useTranslation as useI18nTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';

/**
 * 번역 Hook
 * i18next의 useTranslation을 래핑하여 프로젝트에 맞게 커스터마이징
 */
export const useTranslation = () => {
  const { t, i18n, ready } = useI18nTranslation();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  
  // i18n 언어 변경 감지
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setCurrentLanguage(lng);
      // 언어 변경 이벤트 발생
      window.dispatchEvent(new CustomEvent('languageChange', { detail: lng }));
    };
    
    i18n.on('languageChanged', handleLanguageChanged);
    
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);
  
  /**
   * 중첩된 키를 사용한 번역
   * 예: t('settings.title') -> '설정'
   */
  const translate = (key: string, options?: any) => {
    return t(key, options);
  };
  
  /**
   * 언어 변경 함수
   */
  const changeLanguage = async (language: string) => {
    await i18n.changeLanguage(language);
    localStorage.setItem('app-language', language);
  };
  
  /**
   * 사용 가능한 언어 목록
   */
  const availableLanguages = [
    { code: 'ko', name: '한국어' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' }
  ];
  
  return {
    t: translate,
    i18n,
    ready,
    currentLanguage,
    changeLanguage,
    availableLanguages
  };
};

export default useTranslation;