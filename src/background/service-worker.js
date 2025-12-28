import { STORAGE_KEYS, DEFAULTS } from '../utils/constants.js';
import { getStorage, setStorage, updateSiteUsage } from '../utils/storage.js';

console.log('SauceControl Service Worker Loaded');

/**
 * Initialize default settings if active
 */
chrome.runtime.onInstalled.addListener(async () => {
    const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS);
    if (!settings.daily_reset_hour) {
        await setStorage(STORAGE_KEYS.USER_SETTINGS, DEFAULTS.USER_SETTINGS);
    }

    const timer = await getStorage(STORAGE_KEYS.TIMER_STATE);
    if (!timer.status) {
        await setStorage(STORAGE_KEYS.TIMER_STATE, DEFAULTS.TIMER_STATE);
    }
});

// Setup alarms
chrome.alarms.create('heartbeat', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'heartbeat') {
        await checkMidnightReset();
        await updateActiveTabUsage();
    } else if (alarm.name === 'timer_end') {
        await handleTimerComplete();
    }
});

// Listen for Popup Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_TIMER') {
        startTimer(message.duration, message.type);
    } else if (message.action === 'STOP_TIMER') {
        stopTimer();
    }
});

async function startTimer(minutes, type) {
    const durationMs = minutes * 60 * 1000;
    const endTimestamp = Date.now() + durationMs;

    await setStorage(STORAGE_KEYS.TIMER_STATE, {
        status: type || 'focus',
        end_timestamp: endTimestamp,
        duration_minutes: minutes
    });

    chrome.alarms.create('timer_end', { when: endTimestamp });
    console.log(`Timer started: ${type} for ${minutes}m`);
}

async function stopTimer() {
    await setStorage(STORAGE_KEYS.TIMER_STATE, DEFAULTS.TIMER_STATE);
    chrome.alarms.clear('timer_end');
    console.log('Timer stopped');
}

async function handleTimerComplete() {
    // Reset state
    await setStorage(STORAGE_KEYS.TIMER_STATE, DEFAULTS.TIMER_STATE);

    // Play sound or notify
    console.log('Timer Complete! Ding!');
    // Todo: Notification
}

/**
 * Tracks usage for the currently active tab.
 */
async function updateActiveTabUsage() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url) return;

    try {
        const url = new URL(activeTab.url);
        const domain = url.hostname.replace('www.', '');

        const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES) || {};
        const siteData = sites[domain];

        if (siteData) {
            // Check Timer State for Focus Override
            const timer = await getStorage(STORAGE_KEYS.TIMER_STATE);
            if (timer.status === 'focus') {
                console.log(`Blocking ${domain} (Focus Mode Active)`);
                chrome.tabs.sendMessage(activeTab.id, { action: 'BLOCK_SITE' });
                return; // Exit early, no tracking needed if blocked
            }

            // Increment usage
            const newUsage = (siteData.minutes_used_today || 0) + 1;
            console.log(`Tracking ${domain}: ${newUsage}/${siteData.daily_limit_minutes}m`);

            siteData.minutes_used_today = newUsage;

            // We need to update the entire object structure or just this key
            // Ideally getStorage returns the whole object, so we modify it and save back
            sites[domain] = siteData;
            await setStorage(STORAGE_KEYS.BLOCKED_SITES, sites);

            // Check limits
            const limit = siteData.daily_limit_minutes;
            const remaining = limit - newUsage;

            if (remaining <= 0) {
                chrome.tabs.sendMessage(activeTab.id, { action: 'BLOCK_SITE' });
            } else if (remaining === 1) {
                chrome.tabs.sendMessage(activeTab.id, { action: 'WARNING', text: 'Last bite! 1 minute left.' });
            }
        }
    } catch (e) {
        console.error('Error tracking tab:', e);
    }
}

/**
 * Checks if we've passed midnight and resets budgets if so.
 */
async function checkMidnightReset() {
    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES) || {};
    const todayStr = new Date().toDateString();
    let changed = false;

    for (const [domain, siteData] of Object.entries(sites)) {
        if (siteData.last_reset_date !== todayStr) {
            console.log(`Resetting budget for ${domain}`);
            sites[domain].minutes_used_today = 0;
            sites[domain].last_reset_date = todayStr;
            changed = true;
        }
    }

    if (changed) {
        await setStorage(STORAGE_KEYS.BLOCKED_SITES, sites);
    }
}
