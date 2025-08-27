// Polyfills for jsdom environment
import { vi } from 'vitest'

// TextEncoder/TextDecoder polyfills
if (typeof global !== 'undefined') {
  if (typeof global.TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('util')
    global.TextEncoder = TextEncoder
    global.TextDecoder = TextDecoder
  }

  // structuredClone polyfill
  if (typeof global.structuredClone === 'undefined') {
    global.structuredClone = vi.fn((obj) => JSON.parse(JSON.stringify(obj)))
  }
}

// Crypto polyfill for jsdom
if (typeof global !== 'undefined' && typeof global.crypto === 'undefined') {
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: () => {
        // Simple UUID v4 implementation for testing
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0
          const v = c === 'x' ? r : (r & 0x3 | 0x8)
          return v.toString(16)
        })
      },
      getRandomValues: (arr: any) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256)
        }
        return arr
      }
    }
  })
}

// URL.createObjectURL mock
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
}

if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn()
}

// IntersectionObserver mock
if (typeof global.IntersectionObserver === 'undefined') {
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: null,
    rootMargin: '',
    thresholds: [],
    takeRecords: vi.fn(() => [])
  }))
}

// requestAnimationFrame mock
if (typeof global.requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 0))
  global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id))
}

// Performance.now mock
if (typeof global.performance === 'undefined' || typeof global.performance.now === 'undefined') {
  global.performance = {
    now: vi.fn(() => Date.now()),
    ...global.performance
  }
}

export {}