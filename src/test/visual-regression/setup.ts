import { chromium, Browser, Page, BrowserContext } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'fs';
import path from 'path';

export interface VisualRegressionConfig {
  baseUrl: string;
  screenshotDir: string;
  baselineDir: string;
  diffDir: string;
  threshold: number; // 0-1, percentage of pixels that can differ
  pixelThreshold: number; // 0-255, threshold for individual pixel comparison
}

export const defaultConfig: VisualRegressionConfig = {
  baseUrl: 'http://localhost:5173',
  screenshotDir: path.join(process.cwd(), 'test-results', 'screenshots'),
  baselineDir: path.join(process.cwd(), 'test-results', 'baseline'),
  diffDir: path.join(process.cwd(), 'test-results', 'diff'),
  threshold: 0.01, // 1% pixel difference allowed
  pixelThreshold: 10 // RGB difference threshold per pixel
};

export class VisualRegressionTester {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: VisualRegressionConfig;

  constructor(config: Partial<VisualRegressionConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    
    // Ensure directories exist
    [this.config.screenshotDir, this.config.baselineDir, this.config.diffDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async setup() {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    this.page = await this.context.newPage();
  }

  async teardown() {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  async navigateAndWait(url: string, selector?: string) {
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.goto(url, { waitUntil: 'networkidle' });
    
    if (selector) {
      await this.page.waitForSelector(selector, { state: 'visible' });
    }
    
    // Wait for animations to complete
    await this.page.waitForTimeout(500);
  }

  async captureElement(selector: string, name: string): Promise<Buffer> {
    if (!this.page) throw new Error('Page not initialized');
    
    const element = await this.page.locator(selector).first();
    const screenshot = await element.screenshot();
    
    const screenshotPath = path.join(this.config.screenshotDir, `${name}.png`);
    fs.writeFileSync(screenshotPath, screenshot);
    
    return screenshot;
  }

  async captureFullPage(name: string): Promise<Buffer> {
    if (!this.page) throw new Error('Page not initialized');
    
    const screenshot = await this.page.screenshot({ fullPage: true });
    
    const screenshotPath = path.join(this.config.screenshotDir, `${name}.png`);
    fs.writeFileSync(screenshotPath, screenshot);
    
    return screenshot;
  }

  async captureArea(x: number, y: number, width: number, height: number, name: string): Promise<Buffer> {
    if (!this.page) throw new Error('Page not initialized');
    
    const screenshot = await this.page.screenshot({
      clip: { x, y, width, height }
    });
    
    const screenshotPath = path.join(this.config.screenshotDir, `${name}.png`);
    fs.writeFileSync(screenshotPath, screenshot);
    
    return screenshot;
  }

  async setTheme(theme: 'light' | 'dark') {
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
    }, theme);
    
    // Wait for theme transition
    await this.page.waitForTimeout(300);
  }

  compareImages(baseline: Buffer, current: Buffer, name: string): {
    match: boolean;
    diffPixels: number;
    totalPixels: number;
    diffPercentage: number;
    diffImage?: Buffer;
  } {
    const baselineImg = PNG.sync.read(baseline);
    const currentImg = PNG.sync.read(current);
    
    if (baselineImg.width !== currentImg.width || baselineImg.height !== currentImg.height) {
      throw new Error(`Image dimensions don't match for ${name}`);
    }
    
    const { width, height } = baselineImg;
    const diff = new PNG({ width, height });
    
    const diffPixels = pixelmatch(
      baselineImg.data,
      currentImg.data,
      diff.data,
      width,
      height,
      { threshold: this.config.pixelThreshold / 255 }
    );
    
    const totalPixels = width * height;
    const diffPercentage = diffPixels / totalPixels;
    
    if (diffPixels > 0) {
      const diffPath = path.join(this.config.diffDir, `${name}-diff.png`);
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
    }
    
    return {
      match: diffPercentage <= this.config.threshold,
      diffPixels,
      totalPixels,
      diffPercentage,
      diffImage: diffPixels > 0 ? PNG.sync.write(diff) : undefined
    };
  }

  async analyzePixelAlpha(
    selector: string,
    theme: 'light' | 'dark'
  ): Promise<{
    averageAlpha: number;
    minAlpha: number;
    maxAlpha: number;
    transparentPixels: number;
    opaquePixels: number;
  }> {
    if (!this.page) throw new Error('Page not initialized');
    
    return await this.page.evaluate((sel) => {
      const element = document.querySelector(sel) as HTMLElement;
      if (!element) throw new Error(`Element not found: ${sel}`);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const rect = element.getBoundingClientRect();
      
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      // Draw element onto canvas (this is simplified, actual implementation would need html2canvas)
      // For testing, we'll analyze computed styles instead
      const computedStyle = window.getComputedStyle(element);
      const color = computedStyle.color;
      const backgroundColor = computedStyle.backgroundColor;
      const opacity = parseFloat(computedStyle.opacity);
      
      // Parse rgba values
      const parseRgba = (str: string) => {
        const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) return { r: 0, g: 0, b: 0, a: 1 };
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]),
          b: parseInt(match[3]),
          a: match[4] ? parseFloat(match[4]) : 1
        };
      };
      
      const textColor = parseRgba(color);
      const bgColor = parseRgba(backgroundColor);
      
      // Calculate effective alpha
      const effectiveAlpha = textColor.a * opacity;
      
      return {
        averageAlpha: effectiveAlpha,
        minAlpha: effectiveAlpha,
        maxAlpha: effectiveAlpha,
        transparentPixels: effectiveAlpha < 0.5 ? 1 : 0,
        opaquePixels: effectiveAlpha >= 0.5 ? 1 : 0
      };
    }, selector);
  }

  async detectVisibilityChange(
    selector: string,
    beforeTheme: 'light' | 'dark',
    afterTheme: 'light' | 'dark'
  ): Promise<{
    wasHidden: boolean;
    isVisible: boolean;
    visibilityImproved: boolean;
    colorContrast: {
      before: number;
      after: number;
    };
  }> {
    if (!this.page) throw new Error('Page not initialized');
    
    // Capture before state
    await this.setTheme(beforeTheme);
    const beforeAnalysis = await this.page.evaluate((sel) => {
      const element = document.querySelector(sel) as HTMLElement;
      if (!element) return null;
      
      const style = window.getComputedStyle(element);
      const parent = element.parentElement;
      const parentStyle = parent ? window.getComputedStyle(parent) : null;
      
      // Calculate contrast ratio
      const getLuminance = (r: number, g: number, b: number) => {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };
      
      const parseColor = (str: string) => {
        const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return { r: 0, g: 0, b: 0 };
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]),
          b: parseInt(match[3])
        };
      };
      
      const textColor = parseColor(style.color);
      const bgColor = parentStyle ? parseColor(parentStyle.backgroundColor) : { r: 255, g: 255, b: 255 };
      
      const textLuminance = getLuminance(textColor.r, textColor.g, textColor.b);
      const bgLuminance = getLuminance(bgColor.r, bgColor.g, bgColor.b);
      
      const contrast = (Math.max(textLuminance, bgLuminance) + 0.05) / 
                      (Math.min(textLuminance, bgLuminance) + 0.05);
      
      return {
        isVisible: style.visibility !== 'hidden' && style.display !== 'none' && parseFloat(style.opacity) > 0,
        contrast
      };
    }, selector);
    
    // Capture after state
    await this.setTheme(afterTheme);
    const afterAnalysis = await this.page.evaluate((sel) => {
      const element = document.querySelector(sel) as HTMLElement;
      if (!element) return null;
      
      const style = window.getComputedStyle(element);
      const parent = element.parentElement;
      const parentStyle = parent ? window.getComputedStyle(parent) : null;
      
      // Calculate contrast ratio (same as above)
      const getLuminance = (r: number, g: number, b: number) => {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };
      
      const parseColor = (str: string) => {
        const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return { r: 0, g: 0, b: 0 };
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]),
          b: parseInt(match[3])
        };
      };
      
      const textColor = parseColor(style.color);
      const bgColor = parentStyle ? parseColor(parentStyle.backgroundColor) : { r: 255, g: 255, b: 255 };
      
      const textLuminance = getLuminance(textColor.r, textColor.g, textColor.b);
      const bgLuminance = getLuminance(bgColor.r, bgColor.g, bgColor.b);
      
      const contrast = (Math.max(textLuminance, bgLuminance) + 0.05) / 
                      (Math.min(textLuminance, bgLuminance) + 0.05);
      
      return {
        isVisible: style.visibility !== 'hidden' && style.display !== 'none' && parseFloat(style.opacity) > 0,
        contrast
      };
    }, selector);
    
    if (!beforeAnalysis || !afterAnalysis) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    return {
      wasHidden: !beforeAnalysis.isVisible || beforeAnalysis.contrast < 1.5,
      isVisible: afterAnalysis.isVisible && afterAnalysis.contrast >= 3,
      visibilityImproved: afterAnalysis.contrast > beforeAnalysis.contrast,
      colorContrast: {
        before: beforeAnalysis.contrast,
        after: afterAnalysis.contrast
      }
    };
  }
}