/**
 * CSV generation and export utilities
 */

/**
 * Escape CSV value - handle quotes, commas, newlines
 */
export function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  
  // Check if escaping is needed
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  
  return str;
}

/**
 * Convert array to CSV row
 */
export function arrayToCsvRow(values: any[]): string {
  return values.map(escapeCsvValue).join(',');
}

/**
 * Convert data to CSV string
 */
export function toCsv(headers: string[], rows: any[][]): string {
  const lines: string[] = [];
  
  // Add headers
  lines.push(arrayToCsvRow(headers));
  
  // Add data rows
  rows.forEach(row => {
    lines.push(arrayToCsvRow(row));
  });
  
  return lines.join('\n');
}

/**
 * Download CSV file
 */
export function downloadCsv(content: string, filename: string): void {
  // Add UTF-8 BOM for Excel compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { 
    type: 'text/csv;charset=utf-8;' 
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Show toast notification - Center popup version
 * Returns a promise that resolves when the popup is closed
 */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', confirmText: string = '확인'): Promise<void> {
  return new Promise((resolve) => {
  // Remove any existing popups
  const existingOverlay = document.querySelector('.popup-overlay');
  if (existingOverlay) {
    document.body.removeChild(existingOverlay);
  }
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease-out;
  `;
  
  // Create popup element
  const popup = document.createElement('div');
  popup.className = 'popup-notification';
  popup.setAttribute('data-type', type);
  
  // Create icon based on type
  let iconSvg = '';
  let iconBgColor = '';
  switch (type) {
    case 'success':
      iconSvg = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>`;
      iconBgColor = 'hsl(var(--theme))';
      break;
    case 'error':
      iconSvg = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>`;
      iconBgColor = '#ef4444';
      break;
    default:
      iconSvg = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>`;
      iconBgColor = 'hsl(var(--theme) / 0.8)';
  }
  
  // Style the popup
  popup.style.cssText = `
    background: white;
    padding: 40px;
    border-radius: 20px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    font-size: 16px;
    font-weight: 500;
    min-width: 380px;
    max-width: 500px;
    text-align: center;
    animation: scaleIn 0.3s ease-out;
    position: relative;
    border: 1px solid rgba(0, 0, 0, 0.05);
  `;
  
  // Create content with better styling
  popup.innerHTML = `
    <div style="
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      background: ${iconBgColor};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px ${iconBgColor}40;
    ">
      ${iconSvg}
    </div>
    <div style="
      color: #1f2937;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.5;
      margin-bottom: 28px;
    ">${message}</div>
    <button style="
      background: hsl(var(--theme));
      color: white;
      border: none;
      padding: 12px 32px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 4px 14px hsl(var(--theme) / 0.3);
    " 
    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px hsl(var(--theme) / 0.4)'" 
    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 14px hsl(var(--theme) / 0.3)'">
      ${confirmText}
    </button>
  `;
  
  // Close function
  const closePopup = () => {
    overlay.style.animation = 'fadeOut 0.2s ease-out';
    popup.style.animation = 'scaleOut 0.2s ease-out';
    setTimeout(() => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      resolve(); // Resolve the promise when popup is closed
    }, 200);
  };
  
  // Add close functionality on overlay click
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  };
  
  // Add close functionality on button click
  const button = popup.querySelector('button');
  if (button) {
    button.onclick = closePopup;
  }
  
  // Add popup to overlay
  overlay.appendChild(popup);
  
  // Add to DOM
  document.body.appendChild(overlay);
  
  // Add CSS animations if not already present
  if (!document.querySelector('#popup-animations')) {
    const style = document.createElement('style');
    style.id = 'popup-animations';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes scaleIn {
        from { 
          opacity: 0;
          transform: scale(0.8);
        }
        to { 
          opacity: 1;
          transform: scale(1);
        }
      }
      @keyframes scaleOut {
        from { 
          opacity: 1;
          transform: scale(1);
        }
        to { 
          opacity: 0;
          transform: scale(0.8);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Auto-remove after duration (except for success type - wait for user confirmation)
  if (type !== 'success') {
    const duration = type === 'error' ? 4000 : 3000;
    setTimeout(() => {
      if (document.body.contains(overlay)) {
        overlay.style.animation = 'fadeOut 0.2s ease-out';
        popup.style.animation = 'scaleOut 0.2s ease-out';
        setTimeout(() => {
          if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }
          resolve(); // Resolve even on auto-close
        }, 200);
      }
    }, duration);
  }
  });
}