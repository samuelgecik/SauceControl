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

// Immediate usage check on tab updates
chrome.tabs.onActivated.addListener(() => {
    updateActiveTabUsage();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        updateActiveTabUsage();
    }
});

async function startTimer(minutes, type) {
    let duration = minutes;

    // specific lookup if not provided
    if (!duration) {
        const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS) || DEFAULTS.USER_SETTINGS;
        if (type === 'focus') duration = settings.focus_duration || 25;
        else if (type === 'short_break') duration = settings.short_break_duration || 5;
        else if (type === 'long_break') duration = settings.long_break_duration || 15;
        else duration = 25;
    }

    const durationMs = duration * 60 * 1000;
    const endTimestamp = Date.now() + durationMs;

    // Get current state to preserve pomodoros_completed if not resetting
    const currentState = await getStorage(STORAGE_KEYS.TIMER_STATE) || DEFAULTS.TIMER_STATE;
    const pomodorosCompleted = type === 'focus' ? currentState.pomodoros_completed : currentState.pomodoros_completed;

    await setStorage(STORAGE_KEYS.TIMER_STATE, {
        status: type || 'focus',
        end_timestamp: endTimestamp,
        duration_minutes: duration,
        pomodoros_completed: pomodorosCompleted
    });

    chrome.alarms.create('timer_end', { when: endTimestamp });
    console.log(`Timer started: ${type} for ${duration}m`);
}

async function stopTimer() {
    await setStorage(STORAGE_KEYS.TIMER_STATE, DEFAULTS.TIMER_STATE);
    chrome.alarms.clear('timer_end');
    console.log('Timer stopped');
}

async function handleTimerComplete() {
    const currentState = await getStorage(STORAGE_KEYS.TIMER_STATE);
    const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS) || DEFAULTS.USER_SETTINGS;

    // Play sound
    console.log('Timer Complete! Ding!');
    await playAudio('assets/sounds/ding.mp3');

    if (currentState.status === 'focus') {
        const newPomodoros = (currentState.pomodoros_completed || 0) + 1;

        let nextType = 'short_break';
        if (newPomodoros % 4 === 0) {
            nextType = 'long_break';
        }

        // Auto-start break
        console.log(`Focus complete. Starting ${nextType}. Cycles: ${newPomodoros}`);

        // Update pomodoros count first
        await setStorage(STORAGE_KEYS.TIMER_STATE, {
            ...currentState,
            pomodoros_completed: newPomodoros
        });

        await startTimer(null, nextType);

    } else if (currentState.status === 'short_break' || currentState.status === 'long_break') {
        const autoStart = settings.auto_start_focus;

        if (autoStart) {
            console.log('Break complete. Auto-starting Focus.');
            // Preserve pomodoro count
            await setStorage(STORAGE_KEYS.TIMER_STATE, {
                ...currentState,
                status: 'idle' // Temporary reset to standard
            });
            await startTimer(null, 'focus');
        } else {
            // Break is over, return to idle but keep cycle count
            console.log('Break complete. Waiting for user to start focus.');
            await setStorage(STORAGE_KEYS.TIMER_STATE, {
                ...DEFAULTS.TIMER_STATE,
                pomodoros_completed: currentState.pomodoros_completed // Preserve progress
            });
        }
    } else {
        // Should not happen, but reset just in case
        await setStorage(STORAGE_KEYS.TIMER_STATE, DEFAULTS.TIMER_STATE);
    }
}

async function createOffscreen() {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
        url: 'src/offscreen/offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play timer notification sound',
    });
}

async function playAudio(file) {
    try {
        await createOffscreen();
        chrome.runtime.sendMessage({ action: 'PLAY_SOUND', file });
    } catch (e) {
        console.error('Failed to play audio:', e);
    }
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
                chrome.tabs.sendMessage(activeTab.id, { action: 'BLOCK_SITE', reason: 'FOCUS_MODE' });
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
                chrome.tabs.sendMessage(activeTab.id, { action: 'BLOCK_SITE', reason: 'DAILY_LIMIT' });
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
