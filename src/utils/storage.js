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
 * Get specific blocked site data
 * @param {string} domain 
 */
export async function getBlockedSite(domain) {
    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
    return sites[domain];
}

/**
 * Update budget for a site
 * @param {string} domain 
 * @param {number} minutesUsed 
 */
export async function updateSiteUsage(domain, minutesUsed) {
    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
    if (sites[domain]) {
        sites[domain].minutes_used_today = minutesUsed;
        await setStorage(STORAGE_KEYS.BLOCKED_SITES, sites);
    }
}
