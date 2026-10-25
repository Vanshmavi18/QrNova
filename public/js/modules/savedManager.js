/**
 * QrNova Saved QR Manager ("My QR")
 * Persistent Vault for Custom Named QR Codes with MongoDB and Offline Storage
 */

import { loadHistory, recordHistoryItem, updateHistoryItem, deleteHistoryItem } from './historyManager.js';

/**
 * Get all Saved QR Codes
 */
export async function getSavedQrs(token) {
  const allItems = await loadHistory({ token });
  return allItems.filter((it) => it && it.isSaved);
}

/**
 * Save a generated or scanned QR to "My QR" Vault
 * If item doesn't exist yet, it creates a new record in MongoDB and local cache.
 */
export async function saveQrToVault(item, { title, notes, expiryDate }, token) {
  const id = item._id || item.id;
  const updates = {
    isSaved: true,
    title: title || item.title || 'Saved QR',
    notes: notes || item.notes || '',
    expiryDate: expiryDate !== undefined ? expiryDate : (item.expiryDate || null),
  };

  if (!id) {
    // Brand new item from Generator or Scanner studio
    return await recordHistoryItem({
      ...item,
      ...updates,
    }, token);
  }

  // Existing item updated in vault
  return await updateHistoryItem(id, updates, token);
}

/**
 * Remove a QR code from "My QR" Vault (keeps in history but marks isSaved: false)
 */
export async function removeFromVault(id, token) {
  return await updateHistoryItem(id, { isSaved: false }, token);
}
