/**
 * QrNova Saved QR Manager ("My QR")
 * Persistent Vault for Custom Named QR Codes with MongoDB and Offline Storage
 */

import { loadHistory, updateHistoryItem, deleteHistoryItem } from './historyManager.js';

/**
 * Get all Saved QR Codes
 */
export async function getSavedQrs(token) {
  const allItems = await loadHistory({ token });
  return allItems.filter((it) => it.isSaved);
}

/**
 * Save a generated or scanned QR to "My QR"
 */
export async function saveQrToVault(item, { title, notes, expiryDate }, token) {
  const id = item._id || item.id;
  const updates = {
    isSaved: true,
    title: title || item.title || 'Saved QR',
    notes: notes || item.notes || '',
    expiryDate: expiryDate !== undefined ? expiryDate : item.expiryDate,
  };

  return await updateHistoryItem(id, updates, token);
}

/**
 * Remove a QR code from "My QR"
 */
export async function removeFromVault(id, token) {
  return await updateHistoryItem(id, { isSaved: false }, token);
}
