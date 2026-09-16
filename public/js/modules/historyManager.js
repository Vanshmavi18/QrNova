/**
 * QrNova History Manager
 * Dual History Tracking (Generated & Scanned) with MongoDB Sync & Offline Storage
 */

const LOCAL_STORAGE_KEY = 'qrnova_history_cache_v1';

let historyCache = [];

/**
 * Load history items (combining local cache with server API)
 */
export async function loadHistory({ source, token } = {}) {
  // 1. Read from local storage first for instant UI response
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) historyCache = JSON.parse(raw);
  } catch (e) {
    historyCache = [];
  }

  // 2. Fetch from backend API
  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url = '/api/qr?';
    if (source) url += `source=${source}&`;

    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        // Merge server items with local items
        const serverMap = new Map(data.items.map((it) => [it._id || it.id, it]));
        
        // Add non-duplicate local items
        historyCache.forEach((localItem) => {
          const key = localItem._id || localItem.id;
          if (!serverMap.has(key)) {
            serverMap.set(key, localItem);
          }
        });

        historyCache = Array.from(serverMap.values());
        saveToLocalStorage(historyCache);
      }
    }
  } catch (err) {
    console.warn('History server sync unavailable, using local cache:', err.message);
  }

  return filterHistoryBySource(source);
}

/**
 * Add a new history item
 */
export async function recordHistoryItem(item, token) {
  const newItem = {
    _id: item._id || 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    title: item.title || 'Untitled QR',
    notes: item.notes || '',
    type: item.type || 'text',
    payload: item.payload,
    styleConfig: item.styleConfig || {},
    isPasswordProtected: Boolean(item.isPasswordProtected),
    isFavorite: Boolean(item.isFavorite),
    isSaved: Boolean(item.isSaved),
    source: item.source || 'generated',
    expiryDate: item.expiryDate || null,
    createdAt: new Date().toISOString(),
  };

  historyCache.unshift(newItem);
  saveToLocalStorage(historyCache);

  // Sync with backend API
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/qr', {
      method: 'POST',
      headers,
      body: JSON.stringify(newItem),
    });

    if (res.ok) {
      const serverData = await res.json();
      if (serverData.success && serverData.item) {
        // Update local item with MongoDB _id
        newItem._id = serverData.item._id;
        saveToLocalStorage(historyCache);
      }
    }
  } catch (e) {
    console.warn('Could not sync history item with backend:', e.message);
  }

  return newItem;
}

/**
 * Update an existing history item (title, favorite, saved)
 */
export async function updateHistoryItem(id, updates, token) {
  const item = historyCache.find((it) => (it._id || it.id) === id);
  if (item) {
    Object.assign(item, updates);
    saveToLocalStorage(historyCache);
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`/api/qr/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
    });
  } catch (e) {
    console.warn('Backend update failed, saved locally:', e.message);
  }

  return item;
}

/**
 * Delete a history item
 */
export async function deleteHistoryItem(id, token) {
  historyCache = historyCache.filter((it) => (it._id || it.id) !== id);
  saveToLocalStorage(historyCache);

  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    await fetch(`/api/qr/${id}`, { method: 'DELETE', headers });
  } catch (e) {
    console.warn('Backend delete failed, removed locally:', e.message);
  }
}

/**
 * Clear all history (by source)
 */
export async function clearAllHistory(source, token) {
  if (source) {
    historyCache = historyCache.filter((it) => it.source !== source || it.isSaved);
  } else {
    historyCache = historyCache.filter((it) => it.isSaved);
  }
  saveToLocalStorage(historyCache);

  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    await fetch(`/api/qr/actions/clear?source=${source || ''}`, { method: 'DELETE', headers });
  } catch (e) {
    console.warn('Backend clear history failed:', e.message);
  }
}

/**
 * Check if item is expired
 */
export function isItemExpired(item) {
  if (!item.expiryDate) return false;
  return new Date() > new Date(item.expiryDate);
}

/**
 * Check if item is expiring soon (< 1 hour remaining)
 */
export function isItemExpiringSoon(item) {
  if (!item.expiryDate) return false;
  const now = Date.now();
  const exp = new Date(item.expiryDate).getTime();
  const diff = exp - now;
  return diff > 0 && diff <= 60 * 60 * 1000;
}

function filterHistoryBySource(source) {
  if (!source) return historyCache;
  return historyCache.filter((it) => it.source === source);
}

function saveToLocalStorage(items) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('LocalStorage error:', e);
  }
}
