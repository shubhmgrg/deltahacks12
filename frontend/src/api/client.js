/**
 * API Client for SkySync backend
 * Handles all HTTP requests with automatic fallback to mock data
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || null;

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
    return fetchMock(mockPath, signal);
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
      // Try to get error message from response body
      let errorMessage = `API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // If response is not JSON, use status text
        const text = await response.text();
        if (text) {
          errorMessage = text.substring(0, 200); // Limit error message length
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    setStatus('connected');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }

    // If no mock path is available, throw the original error instead of trying mock fallback
    if (!mockPath) {
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
    // If no mock path is provided and we're in offline mode, 
    // re-throw the original error instead of a generic mock error
    throw new Error('This feature is not available offline');
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
