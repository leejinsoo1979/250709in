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
 * Show toast notification
 */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('data-type', type);
  toast.textContent = message;
  
  // Style the toast
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 9999;
    animation: slideIn 0.3s ease-out;
    transition: opacity 0.3s ease-out;
  `;
  
  // Set color based on type
  switch (type) {
    case 'success':
      toast.style.backgroundColor = 'hsl(var(--theme-500))';
      toast.style.color = 'white';
      break;
    case 'error':
      toast.style.backgroundColor = '#ef4444';
      toast.style.color = 'white';
      break;
    default:
      toast.style.backgroundColor = '#333';
      toast.style.color = 'white';
  }
  
  // Add to DOM
  document.body.appendChild(toast);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}