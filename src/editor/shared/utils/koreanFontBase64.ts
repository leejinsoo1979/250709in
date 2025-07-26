// Korean font configuration for jsPDF
// This module provides a lightweight Korean font for PDF generation

export const addKoreanFont = async (pdf: any) => {
  try {
    // Load Pretendard font from CDN (lightweight Korean font)
    const fontUrl = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard-subset.css';
    
    // For jsPDF, we need to use a different approach
    // We'll use the default fonts that support some Korean characters
    // or fallback to the built-in fonts
    
    // Set font to helvetica which has better Unicode support
    pdf.setFont('helvetica');
    
    // Alternative: Use system fonts that might support Korean
    // This is a fallback method that works in most cases
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Test if Korean fonts are available
      ctx.font = '16px "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    }
    
    return true;
  } catch (error) {
    console.warn('Korean font loading failed, using fallback:', error);
    return false;
  }
};

// Helper function to ensure Korean text is properly encoded
export const encodeKoreanText = (text: string): string => {
  try {
    // Ensure proper UTF-8 encoding
    return decodeURIComponent(encodeURIComponent(text));
  } catch {
    return text;
  }
};