import { logEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { analytics } from './config';

/**
 * Firebase Analytics 이벤트 로깅 유틸리티
 */

// 페이지 뷰 추적
export const logPageView = (pageName: string, pageTitle?: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'page_view', {
      page_name: pageName,
      page_title: pageTitle || pageName,
      page_location: window.location.href,
      page_path: window.location.pathname
    });
    console.log('📊 Analytics: page_view -', pageName);
  } catch (error) {
    console.warn('⚠️ Analytics logPageView failed:', error);
  }
};

// 사용자 로그인 추적
export const logUserLogin = (method: string, userId?: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'login', {
      method // 'google', 'email', etc.
    });

    if (userId) {
      setUserId(analytics, userId);
    }

    console.log('📊 Analytics: login -', method, userId);
  } catch (error) {
    console.warn('⚠️ Analytics logUserLogin failed:', error);
  }
};

// 사용자 회원가입 추적
export const logUserSignup = (method: string, userId?: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'sign_up', {
      method
    });

    if (userId) {
      setUserId(analytics, userId);
    }

    console.log('📊 Analytics: sign_up -', method, userId);
  } catch (error) {
    console.warn('⚠️ Analytics logUserSignup failed:', error);
  }
};

// 사용자 속성 설정
export const setUserAnalyticsProperties = (properties: {
  plan?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}) => {
  if (!analytics) return;

  try {
    setUserProperties(analytics, properties);
    console.log('📊 Analytics: user_properties -', properties);
  } catch (error) {
    console.warn('⚠️ Analytics setUserProperties failed:', error);
  }
};

// 프로젝트 생성 추적
export const logProjectCreated = (projectId: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'project_created', {
      project_id: projectId
    });
    console.log('📊 Analytics: project_created -', projectId);
  } catch (error) {
    console.warn('⚠️ Analytics logProjectCreated failed:', error);
  }
};

// 디자인 저장 추적
export const logDesignSaved = (designId: string, projectId: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'design_saved', {
      design_id: designId,
      project_id: projectId
    });
    console.log('📊 Analytics: design_saved -', designId);
  } catch (error) {
    console.warn('⚠️ Analytics logDesignSaved failed:', error);
  }
};

// 공유 링크 생성 추적
export const logShareLinkCreated = (shareLinkId: string, projectId: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'share_link_created', {
      share_link_id: shareLinkId,
      project_id: projectId
    });
    console.log('📊 Analytics: share_link_created -', shareLinkId);
  } catch (error) {
    console.warn('⚠️ Analytics logShareLinkCreated failed:', error);
  }
};

// 공유 링크 접근 추적
export const logShareLinkAccessed = (shareLinkId: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'share_link_accessed', {
      share_link_id: shareLinkId
    });
    console.log('📊 Analytics: share_link_accessed -', shareLinkId);
  } catch (error) {
    console.warn('⚠️ Analytics logShareLinkAccessed failed:', error);
  }
};

// 파일 다운로드 추적
export const logFileDownload = (fileType: string, fileName: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'file_download', {
      file_type: fileType,
      file_name: fileName
    });
    console.log('📊 Analytics: file_download -', fileType, fileName);
  } catch (error) {
    console.warn('⚠️ Analytics logFileDownload failed:', error);
  }
};

// 에러 추적
export const logError = (errorMessage: string, errorContext?: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'error', {
      error_message: errorMessage,
      error_context: errorContext
    });
    console.log('📊 Analytics: error -', errorMessage);
  } catch (error) {
    console.warn('⚠️ Analytics logError failed:', error);
  }
};

// 검색 추적
export const logSearch = (searchTerm: string, searchContext?: string) => {
  if (!analytics) return;

  try {
    logEvent(analytics, 'search', {
      search_term: searchTerm,
      search_context: searchContext
    });
    console.log('📊 Analytics: search -', searchTerm);
  } catch (error) {
    console.warn('⚠️ Analytics logSearch failed:', error);
  }
};

// 커스텀 이벤트 추적
export const logCustomEvent = (eventName: string, eventParams?: Record<string, any>) => {
  if (!analytics) return;

  try {
    logEvent(analytics, eventName, eventParams);
    console.log('📊 Analytics: custom_event -', eventName, eventParams);
  } catch (error) {
    console.warn('⚠️ Analytics logCustomEvent failed:', error);
  }
};
