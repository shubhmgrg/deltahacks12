/**
 * API Client for SkySync backend
 * Handles all HTTP requests with automatic fallback to mock data
 */

// In dev, default to local backend if env isn't set.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000' : null);

// Track connection status
let connectionStatus = 'unknown'; // 'connected' | 'offline' | 'loading'
let statusListeners = [];

export const getConnectionStatus = () => connectionStatus;

export const subscribeToStatus = (listener) => {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
};

const setStatus = (status) => {
  connectionStatus = status;
  statusListeners.forEach(l => l(status));
};

/**
 * Make an API request with automatic mock fallback
 */
export async function apiRequest(endpoint, options = {}) {
  const { signal, params = {}, mockPath } = options;

  // If demo mode is forced or no API URL, use mock
  const demoMode = localStorage.getItem('skysync_demo_mode') === 'true';

  if (demoMode || !API_BASE_URL) {
    setStatus('offline');
    // Prefer mock in demo/offline mode, but if it's missing and we *do* have an API URL
    // (common in dev), fall back to the backend so features like heatmap can still work.
    try {
      return await fetchMock(mockPath, signal);
    } catch (e) {
      if (!API_BASE_URL) throw e;
      // fall through to network request
    }
  }

  setStatus('loading');

  try {
    const url = new URL(endpoint, API_BASE_URL);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    const response = await fetch(url.toString(), {
      signal,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    setStatus('connected');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }

    console.warn(`API request failed, falling back to mock data:`, error.message);
    setStatus('offline');
    return fetchMock(mockPath, signal);
  }
}

/**
 * Fetch mock data from /public/data
 */
async function fetchMock(mockPath, signal) {
  if (!mockPath) {
    throw new Error('No mock path provided for offline fallback');
  }

  const response = await fetch(`/data/${mockPath}`, { signal });

  if (!response.ok) {
    throw new Error(`Mock data not found: ${mockPath}`);
  }

  return response.json();
}

/**
 * Enable or disable demo mode
 */
export function setDemoMode(enabled) {
  localStorage.setItem('skysync_demo_mode', enabled ? 'true' : 'false');
  if (enabled) {
    setStatus('offline');
  }
}

/**
 * Check if demo mode is enabled
 */
export function isDemoMode() {
  return localStorage.getItem('skysync_demo_mode') === 'true' || !API_BASE_URL;
}
