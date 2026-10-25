/**
 * QrNova History Manager
 * Dual History Tracking (Generated & Scanned) with MongoDB Sync & Isolated Per-User Offline Storage
 */

function getStorageKey() {
  try {
    const userJson = localStorage.getItem('qrnova_auth_user');
    if (userJson) {
      const u = JSON.parse(userJson);
      if (u && (u.id || u._id)) {
        return `qrnova_history_cache_${u.id || u._id}`;
      }
    }
  } catch (e) {}
  return 'qrnova_history_cache_guest';
}

let historyCache = [];

/**
 * Load history items (combining local cache with server API)
 */
export async function loadHistory({ source, token } = {}) {
  const storageKey = getStorageKey();

  // 1. Read from isolated local storage first for instant UI response
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      historyCache = Array.isArray(parsed) 
        ? parsed.filter((it) => it && it.title !== 'Company Wi-Fi Guest Access' && it.shortCode !== '614804ed')
        : [];
    } else {
      historyCache = [];
    }
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
        const serverItems = data.items.filter((it) => it && it.title !== 'Company Wi-Fi Guest Access');
        const serverMap = new Map(serverItems.map((it) => [it._id || it.id, it]));

        if (token) {
          // Authenticated: Keep pending local-only items that haven't reached server yet
          historyCache.forEach((localItem) => {
            const key = localItem._id || localItem.id;
            if (key && String(key).startsWith('local_') && !serverMap.has(key)) {
              serverMap.set(key, localItem);
            }
          });
        } else {
          // Guest mode: preserve local offline items
          historyCache.forEach((localItem) => {
            const key = localItem._id || localItem.id;
            if (!serverMap.has(key)) {
              serverMap.set(key, localItem);
            }
          });
        }

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
 * Migrate guest items to authenticated account in MongoDB Atlas
 */
export async function migrateGuestItemsToUser(token) {
  if (!token) return;
  try {
    const guestRaw = localStorage.getItem('qrnova_history_cache_guest');
    if (!guestRaw) return;
    const guestItems = JSON.parse(guestRaw);
    if (!Array.isArray(guestItems) || guestItems.length === 0) return;

    for (const item of guestItems) {
      if (!item || item.title === 'Company Wi-Fi Guest Access') continue;
      await fetch('/api/qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: item.title,
          notes: item.notes,
          type: item.type,
          payload: item.payload,
          styleConfig: item.styleConfig,
          isPasswordProtected: item.isPasswordProtected,
          isFavorite: item.isFavorite,
          isSaved: item.isSaved,
          source: item.source,
          expiryDate: item.expiryDate,
        }),
      });
    }

    // Clean up guest cache after successful migration
    localStorage.removeItem('qrnova_history_cache_guest');
  } catch (err) {
    console.warn('Could not migrate guest items to account:', err.message);
  }
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
    const storageKey = getStorageKey();
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (e) {
    console.error('LocalStorage error:', e);
  }
}
