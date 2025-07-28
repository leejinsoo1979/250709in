/**
 * DXF Korean text support utilities
 * 
 * Since @tarikjabiri/dxf doesn't support font selection directly,
 * we use alternative approaches to handle Korean text in DXF files
 */

/**
 * Check if text contains Korean characters
 * @param text Text to check
 * @returns True if contains Korean characters
 */
export const containsKorean = (text: string): boolean => {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/g.test(text);
};

/**
 * Convert Korean text to Unicode escape sequences for better DXF compatibility
 * @param text Text to convert
 * @returns Text with Korean characters converted to Unicode escapes
 */
export const escapeKoreanText = (text: string): string => {
  return text.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, (char) => {
    return `\\U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  });
};

/**
 * Create a romanized version of Korean text for fallback
 * This is a simple mapping - for production, consider using a proper library
 * @param text Korean text
 * @returns Romanized text
 */
export const romanizeKorean = (text: string): string => {
  // Common Korean words mapping for furniture terms
  const koreanToRoman: { [key: string]: string } = {
    '가구': 'Gagu',
    '정면도': 'Jeongmyeondo',
    '평면도': 'Pyeongmyeondo',
    '측면도': 'Cheukmyeondo',
    '작성일': 'Jakseongil',
    '도면': 'Domyeon',
    '축척': 'Chukchuk',
    '단위': 'Danwi',
    '폭': 'Pok',
    '높이': 'Nopi',
    '깊이': 'Gipi',
    '공간': 'Gonggan',
    '오픈박스': 'Open Box',
    '듀얼': 'Dual',
    '단': 'Dan',
    '선반': 'Seonban',
    '슬롯': 'Slot',
    '치수': 'Chisu',
    '배치': 'Baechi',
    '모듈': 'Module'
  };

  // Replace known terms
  let result = text;
  for (const [korean, roman] of Object.entries(koreanToRoman)) {
    result = result.replace(new RegExp(korean, 'g'), roman);
  }

  // For any remaining Korean characters, remove them or replace with placeholder
  result = result.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '');

  return result.trim() || text; // Return original if result is empty
};

/**
 * Format text for DXF with Korean support
 * Uses a combination of strategies to ensure text displays properly
 * @param text Original text
 * @param useFallback Whether to use romanization as fallback
 * @returns Formatted text safe for DXF
 */
export const formatDxfText = (text: string, useFallback: boolean = true): string => {
  if (!containsKorean(text)) {
    return text;
  }

  if (useFallback) {
    // Use romanization for better compatibility
    return romanizeKorean(text);
  } else {
    // Try to preserve Korean with Unicode escapes
    // Note: This may not work with all DXF viewers
    return escapeKoreanText(text);
  }
};

/**
 * Create bilingual text (Korean + English)
 * @param korean Korean text
 * @param english English translation
 * @returns Combined bilingual text
 */
export const createBilingualText = (korean: string, english: string): string => {
  return `${english} (${korean})`;
};

/**
 * Get safe furniture name for DXF
 * @param originalName Original furniture name
 * @returns Safe name for DXF
 */
export const getSafeFurnitureName = (originalName: string): string => {
  // Common furniture name mappings
  const furnitureNames: { [key: string]: string } = {
    '오픈박스': 'Open Box',
    '2단': '2-Shelf',
    '7단': '7-Shelf', 
    '듀얼2단': 'Dual 2-Shelf',
    '듀얼7단': 'Dual 7-Shelf',
    '가구': 'Furniture',
    '모듈': 'Module'
  };

  // Check if we have a direct mapping
  for (const [korean, english] of Object.entries(furnitureNames)) {
    if (originalName.includes(korean)) {
      return originalName.replace(korean, english);
    }
  }

  // Otherwise, format the text
  return formatDxfText(originalName);
};

/**
 * Format dimensions text for DXF
 * @param width Width in mm
 * @param height Height in mm
 * @param depth Depth in mm
 * @returns Formatted dimension string
 */
export const formatDimensionsText = (width: number, height: number, depth: number): string => {
  return `${width}W x ${height}H x ${depth}D`;
};

/**
 * Get drawing type name in safe format
 * @param drawingType Drawing type (front, plan, side)
 * @returns Safe drawing type name
 */
export const getSafeDrawingTypeName = (drawingType: string): { ko: string; en: string; safe: string } => {
  const drawingTypeNames: { [key: string]: { ko: string; en: string; safe: string } } = {
    front: { ko: '정면도', en: 'Front Elevation', safe: 'Front Elevation' },
    plan: { ko: '평면도', en: 'Plan View', safe: 'Plan View' },
    side: { ko: '측면도', en: 'Side Section', safe: 'Side Section' }
  };

  return drawingTypeNames[drawingType] || drawingTypeNames.front;
};

/**
 * Format date for DXF
 * @param date Date to format
 * @returns Formatted date string
 */
export const formatDxfDate = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};