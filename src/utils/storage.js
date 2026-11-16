import { STORAGE_KEYS, DEFAULTS } from './constants.js';

/**
 * Get data from storage
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getStorage(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            resolve(result[key] || DEFAULTS[key.toUpperCase()] || {});
        });
    });
}

/**
 * Set data to storage
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export async function setStorage(key, value) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => {
            resolve();
        });
    });
}

/**
 * Change the blocked sites atomically across the worker, popup and options page
 * @param {(sites: object) => boolean|void} mutate edits sites in place; return false to skip the write
 * @returns {Promise<void>}
 */
export async function updateBlockedSites(mutate) {
    await navigator.locks.request(STORAGE_KEYS.BLOCKED_SITES, async () => {
        const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
        if (mutate(sites) !== false) {
            await setStorage(STORAGE_KEYS.BLOCKED_SITES, sites);
        }
    });
}
