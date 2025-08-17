/**
 * Theme color management system
 * Handles parsing, conversion, and CSS variable updates
 */

/**
 * Parse hex color to HSL values
 */
export function parseHexToHsl(hex: string): { h: number; s: number; l: number } {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  
  // Parse RGB values
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Parse HSL string to HSL values
 */
export function parseHslString(hsl: string): { h: number; s: number; l: number } | null {
  // Try modern CSS format (space-separated)
  let match = hsl.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
  
  // Fallback to old format (comma-separated)
  if (!match) {
    match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  }
  
  if (!match) return null;
  
  return {
    h: parseInt(match[1]),
    s: parseInt(match[2]),
    l: parseInt(match[3])
  };
}

/**
 * Set theme color in CSS variables
 */
export function setThemeColor(color: string): void {
  let h: number, s: number, l: number;
  
  // Check if it's HSL or hex
  if (color.startsWith('hsl')) {
    const parsed = parseHslString(color);
    if (!parsed) {
      console.warn('Invalid HSL color:', color);
      return;
    }
    ({ h, s, l } = parsed);
  } else {
    // Assume hex
    ({ h, s, l } = parseHexToHsl(color));
  }
  
  // Update CSS variables
  const root = document.documentElement;
  
  // Main theme color (HSL channels for Tailwind)
  root.style.setProperty('--theme', `${h} ${s}% ${l}%`);
  
  // Generate variations
  root.style.setProperty('--theme-50', `${h} ${s}% ${Math.min(98, l + 48)}%`);
  root.style.setProperty('--theme-100', `${h} ${s}% ${Math.min(95, l + 40)}%`);
  root.style.setProperty('--theme-200', `${h} ${s}% ${Math.min(90, l + 30)}%`);
  root.style.setProperty('--theme-300', `${h} ${s}% ${Math.min(80, l + 20)}%`);
  root.style.setProperty('--theme-400', `${h} ${s}% ${Math.min(70, l + 10)}%`);
  root.style.setProperty('--theme-500', `${h} ${s}% ${l}%`);
  root.style.setProperty('--theme-600', `${h} ${Math.max(10, s - 5)}% ${Math.max(20, l - 10)}%`);
  root.style.setProperty('--theme-700', `${h} ${Math.max(10, s - 10)}% ${Math.max(15, l - 20)}%`);
  root.style.setProperty('--theme-800', `${h} ${Math.max(10, s - 15)}% ${Math.max(10, l - 30)}%`);
  root.style.setProperty('--theme-900', `${h} ${Math.max(10, s - 20)}% ${Math.max(5, l - 40)}%`);
  
  // Store the current theme color
  localStorage.setItem('themeColor', color);
}

/**
 * Get current theme color from localStorage or default
 */
export function getThemeColor(): string {
  return localStorage.getItem('themeColor') || '#7C5CFF';
}

/**
 * Initialize theme on app load
 */
export function initializeTheme(): void {
  const savedColor = getThemeColor();
  setThemeColor(savedColor);
}