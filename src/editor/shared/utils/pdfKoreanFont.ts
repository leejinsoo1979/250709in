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
export const createTextImage = async (text: string, fontSize: number = 12, color: string = '#000000'): Promise<string> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Canvas context not available');
  
  // Set canvas size based on text
  ctx.font = `${fontSize}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width) + 4;
  canvas.height = fontSize * 1.5;
  
  // Clear and redraw with proper font
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontSize}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 2, canvas.height / 2);
  
  return canvas.toDataURL('image/png');
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
  }
) => {
  const fontSize = options?.fontSize || 12;
  const color = options?.color || '#000000';
  
  try {
    // Create text as image
    const textImage = await createTextImage(text, fontSize, color);
    
    // Calculate dimensions
    const img = new Image();
    img.src = textImage;
    await new Promise(resolve => img.onload = resolve);
    
    const imgWidth = img.width * 0.75; // Convert pixels to points
    const imgHeight = img.height * 0.75;
    
    // Adjust x position based on alignment
    let adjustedX = x;
    if (options?.align === 'center') {
      adjustedX = x - imgWidth / 2;
    } else if (options?.align === 'right') {
      adjustedX = x - imgWidth;
    }
    
    // Add image to PDF
    // For Korean text, we need to adjust the y position differently
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
  }
) => {
  if (containsKorean(text)) {
    // Use image-based approach for Korean
    await addKoreanText(pdf, text, x, y, options);
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