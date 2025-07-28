import { jsPDF } from 'jspdf';

// Load Google Fonts Noto Sans KR
const loadGoogleFont = () => {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
};

// Initialize Korean font support
loadGoogleFont();

// Function to convert text to image for Korean support
export const createTextImage = async (text: string, fontSize: number = 12, color: string = '#000000', fontWeight: string = '400'): Promise<string> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Canvas context not available');
  
  // Higher resolution for crisp text
  const scale = 3; // 3x resolution for sharp text
  
  // Set canvas size based on text with higher resolution
  ctx.font = `${fontWeight} ${fontSize}px "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const metrics = ctx.measureText(text);
  
  canvas.width = Math.ceil((metrics.width + 8) * scale);
  canvas.height = Math.ceil(fontSize * 1.8 * scale);
  
  // Scale context for higher resolution
  ctx.scale(scale, scale);
  
  // Enable font smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Clear and redraw with proper font
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontWeight} ${fontSize}px "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  
  // Add slight letter spacing for better readability
  if (fontWeight === '700' || fontWeight === '500') {
    ctx.letterSpacing = '0.5px';
  }
  
  ctx.fillText(text, 4, (fontSize * 1.8) / 2);
  
  return canvas.toDataURL('image/png', 1.0);
};

// Helper to add Korean text to PDF
export const addKoreanText = async (
  pdf: jsPDF, 
  text: string, 
  x: number, 
  y: number, 
  options?: {
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    fontWeight?: string;
  }
) => {
  const fontSize = options?.fontSize || 12;
  const color = options?.color || '#000000';
  const fontWeight = options?.fontWeight || '400';
  
  try {
    // Create text as image with higher resolution
    const textImage = await createTextImage(text, fontSize, color, fontWeight);
    
    // Calculate dimensions
    const img = new Image();
    img.src = textImage;
    await new Promise(resolve => img.onload = resolve);
    
    // Adjust scale for high resolution image
    const scale = 3; // Must match the scale in createTextImage
    const imgWidth = (img.width / scale) * 0.75; // Convert pixels to points
    const imgHeight = (img.height / scale) * 0.75;
    
    // Adjust x position based on alignment
    let adjustedX = x;
    if (options?.align === 'center') {
      adjustedX = x - imgWidth / 2;
    } else if (options?.align === 'right') {
      adjustedX = x - imgWidth;
    }
    
    // Add image to PDF with proper positioning
    pdf.addImage(textImage, 'PNG', adjustedX, y - imgHeight * 0.75, imgWidth, imgHeight);
    
    return { width: imgWidth, height: imgHeight };
  } catch (error) {
    console.error('Failed to add Korean text:', error);
    // Fallback to regular text
    pdf.text(text, x, y, options);
    return { width: 0, height: 0 };
  }
};

// Helper function to check if text contains Korean
export const containsKorean = (text: string): boolean => {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/g.test(text);
};

// Mixed text handler (Korean + English)
export const addMixedText = async (
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: {
    fontSize?: number;
    color?: string;
    font?: string;
    fontStyle?: string;
    align?: 'left' | 'center' | 'right';
    fontWeight?: string;
  }
) => {
  if (containsKorean(text)) {
    // Use image-based approach for Korean with font weight
    await addKoreanText(pdf, text, x, y, {
      ...options,
      fontWeight: options?.fontWeight || (options?.fontStyle === 'bold' ? '700' : '400')
    });
  } else {
    // Use regular PDF text for non-Korean
    if (options?.fontSize) pdf.setFontSize(options.fontSize);
    if (options?.color) {
      const r = parseInt(options.color.slice(1, 3), 16);
      const g = parseInt(options.color.slice(3, 5), 16);
      const b = parseInt(options.color.slice(5, 7), 16);
      pdf.setTextColor(r, g, b);
    }
    if (options?.font) pdf.setFont(options.font, options.fontStyle || 'normal');
    
    // Handle alignment
    const textOptions: any = {};
    if (options?.align) {
      textOptions.align = options.align;
    }
    
    pdf.text(text, x, y, textOptions);
  }
};