import { vi } from 'vitest';

export const initializeApp = vi.fn(() => ({
  name: '[DEFAULT]',
  options: {},
  automaticDataCollectionEnabled: false
}));

export const getApps = vi.fn(() => []);
export const getApp = vi.fn(() => ({
  name: '[DEFAULT]',
  options: {},
  automaticDataCollectionEnabled: false
}));

export const deleteApp = vi.fn();