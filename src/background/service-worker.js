import { STORAGE_KEYS, DEFAULTS, BLOCKED_PAGE } from '../utils/constants.js';
import { getStorage, setStorage, updateBlockedSites } from '../utils/storage.js';
import { getSiteDomain, findTrackedDomain, getBudgetDay, getBlockReason } from '../utils/sites.js';

console.log('SauceControl Service Worker Loaded');

const DURATION_SETTINGS = {
    focus: 'focus_duration',
    short_break: 'short_break_duration',
    long_break: 'long_break_duration',
};

const IDLE_THRESHOLD_SECONDS = 60;
const TIMER_END_TOLERANCE_MS = 5000;

const withTimerLock = (fn) => navigator.locks.request(STORAGE_KEYS.TIMER_STATE, fn);

/**
 * Initialize default settings if active
 */
chrome.runtime.onInstalled.addListener(async (details) => {
    await setStorage(STORAGE_KEYS.USER_SETTINGS, {
        ...DEFAULTS.USER_SETTINGS,
        ...await getStorage(STORAGE_KEYS.USER_SETTINGS),
    });
    await setStorage(STORAGE_KEYS.TIMER_STATE, {
        ...DEFAULTS.TIMER_STATE,
        ...await getStorage(STORAGE_KEYS.TIMER_STATE),
    });

    await checkDailyReset();
    await reconcileTimer();
    if (details.reason === 'update') {
        await restoreClosedTabs();
    }
    await injectIntoOpenTabs();
    await syncBlocking();
});

chrome.runtime.onStartup.addListener(async () => {
    await checkDailyReset();
    await reconcileTimer();
    await syncBlocking();
    await saveClosedTabs(); // Tab IDs change across browser restarts
});

// Setup alarms
ensureHeartbeat();

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'heartbeat') {
        await checkDailyReset();
        await trackUsage();
    } else if (alarm.name === 'timer_end') {
        await withTimerLock(handleTimerComplete);
    }
});

// Listen for Popup Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_TIMER') {
        withTimerLock(() => startTimer(message.type));
    } else if (message.action === 'STOP_TIMER') {
        withTimerLock(stopTimer);
    } else if (message.action === 'PLAY_SOUND') {
        playAudio(message.file);
    }
});

// Re-evaluate the redirect rules and open tabs whenever the timer or the budgets change
chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.BLOCKED_SITES] || changes[STORAGE_KEYS.TIMER_STATE]) {
        syncBlocking();
    }
});

// Catches pages the redirect rules can't, such as one restored from the back-forward cache
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        redirectBlockedTabs([tab]);
        saveClosedTabs();
    }
});

chrome.tabs.onRemoved.addListener(() => saveClosedTabs());
chrome.tabs.onMoved.addListener(() => saveClosedTabs());
chrome.tabs.onAttached.addListener(() => saveClosedTabs());

/**
 * Creating an alarm replaces any existing one, which would restart the countdown on every worker wake.
 */
async function ensureHeartbeat() {
    if (!await chrome.alarms.get('heartbeat')) {
        chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
    }
}

/**
 * Tabs opened before install have no content script.
 */
async function injectIntoOpenTabs() {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    await Promise.all(tabs.map(async (tab) => {
        const target = { tabId: tab.id };
        try {
            await chrome.scripting.insertCSS({ target, files: ['src/content/toast.css'] });
            await chrome.scripting.executeScript({ target, files: ['src/content/content-script.js'] });
        } catch (e) {
            console.log(`Could not inject into tab ${tab.id}:`, e.message);
        }
    }));
}

async function getDuration(type) {
    const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS);
    const key = DURATION_SETTINGS[type];
    return settings[key] > 0 ? settings[key] : DEFAULTS.USER_SETTINGS[key];
}

async function startTimer(type) {
    const duration = await getDuration(type);
    const durationMs = duration * 60 * 1000;
    const endTimestamp = Date.now() + durationMs;

    const currentState = await getStorage(STORAGE_KEYS.TIMER_STATE);

    await setStorage(STORAGE_KEYS.TIMER_STATE, {
        ...currentState,
        status: type,
        end_timestamp: endTimestamp,
        duration_minutes: duration,
    });

    chrome.alarms.create('timer_end', { when: endTimestamp });
    console.log(`Timer started: ${type} for ${duration}m`);

    // Sound effects
    if (type === 'focus') {
        await playAudio('assets/sounds/igniter.ogg');
    } else if (type === 'short_break' || type === 'long_break') {
        await playAudio('assets/sounds/coffee_pour.ogg');
    }
}

async function stopTimer() {
    const currentState = await getStorage(STORAGE_KEYS.TIMER_STATE);
    await setStorage(STORAGE_KEYS.TIMER_STATE, {
        ...currentState,
        status: 'idle',
        end_timestamp: null,
    });
    await chrome.alarms.clear('timer_end');
    console.log('Timer stopped');
}

async function handleTimerComplete() {
    const currentState = await getStorage(STORAGE_KEYS.TIMER_STATE);

    // The alarm and reconcileTimer can both report one timer; the second call sees the next timer's future end
    if (currentState.status === 'idle' || currentState.end_timestamp - Date.now() > TIMER_END_TOLERANCE_MS) {
        return;
    }

    const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS);

    // Play sound
    console.log('Timer Complete! Ding!');
    await playAudio('assets/sounds/ding.ogg');

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

        await startTimer(nextType);

    } else if (settings.auto_start_focus) {
        console.log('Break complete. Auto-starting Focus.');
        await startTimer('focus');
    } else {
        // Break is over, return to idle but keep cycle count
        console.log('Break complete. Waiting for user to start focus.');
        await setStorage(STORAGE_KEYS.TIMER_STATE, {
            ...currentState,
            status: 'idle',
            end_timestamp: null,
        });
    }
}

/**
 * Chrome may drop alarms when the browser restarts or the extension updates.
 * Without this the timer would stay running forever, and tracked sites blocked with it.
 */
async function reconcileTimer() {
    const timer = await getStorage(STORAGE_KEYS.TIMER_STATE);
    if (timer.status === 'idle' || await chrome.alarms.get('timer_end')) return;

    if (timer.end_timestamp > Date.now()) {
        chrome.alarms.create('timer_end', { when: timer.end_timestamp });
    } else {
        await withTimerLock(handleTimerComplete);
    }
}

let creatingOffscreen = null;

async function createOffscreen() {
    if (await chrome.offscreen.hasDocument()) return;
    creatingOffscreen ??= chrome.offscreen.createDocument({
        url: 'src/offscreen/offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play timer notification sound',
    }).finally(() => {
        creatingOffscreen = null;
    });
    await creatingOffscreen;
}

async function playAudio(file) {
    try {
        const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS);
        if (settings.sound_enabled === false) return;

        await createOffscreen();
        await chrome.runtime.sendMessage({ action: 'OFFSCREEN_PLAY_SOUND', file });
    } catch (e) {
        console.error('Failed to play audio:', e);
    }
}

function sendToTab(tabId, message) {
    // Restricted pages and pages still loading have no listener
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

/**
 * One rule per tracked site: blocked sites redirect to the Closed page, the rest are allowed.
 * The deepest domain takes priority, as in findTrackedDomain, so a.example.com keeps its own budget.
 */
async function updateRedirectRules(sites, timer) {
    const blockedPage = chrome.runtime.getURL(BLOCKED_PAGE);
    const addRules = Object.keys(sites).filter(Boolean).map((domain, index) => ({
        id: index + 1,
        priority: domain.split('.').length,
        action: getBlockReason(domain, sites, timer)
            ? { type: 'redirect', redirect: { regexSubstitution: `${blockedPage}#\\1` } }
            : { type: 'allow' },
        condition: { regexFilter: '^(.+)$', requestDomains: [domain], resourceTypes: ['main_frame'] },
    }));

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRules.map((rule) => rule.id),
        addRules,
    });
}

async function redirectTab(tab) {
    const url = `${chrome.runtime.getURL(BLOCKED_PAGE)}#${tab.url}`;
    try {
        await chrome.tabs.sendMessage(tab.id, { action: 'REDIRECT', url });
    } catch (e) {
        // No content script to replace the history entry, so navigate the tab, unless it has already left the site
        const current = await chrome.tabs.get(tab.id).catch(() => null);
        if (current && getSiteDomain(current.pendingUrl || current.url) === getSiteDomain(tab.url)) {
            await chrome.tabs.update(tab.id, { url }).catch(() => {});
        }
    }
}

/**
 * Moves the given tabs to the Closed page if their site is blocked.
 */
async function redirectBlockedTabs(tabs) {
    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
    const timer = await getStorage(STORAGE_KEYS.TIMER_STATE);

    await Promise.all(tabs
        .filter((tab) => getBlockReason(getSiteDomain(tab.url), sites, timer))
        .map(redirectTab));
}

async function applyBlocking() {
    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
    const timer = await getStorage(STORAGE_KEYS.TIMER_STATE);

    try {
        await updateRedirectRules(sites, timer);
    } catch (e) {
        console.error('Failed to update redirect rules:', e);
    }

    // The rules only catch new page loads
    await redirectBlockedTabs(await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }));

    // Closed pages check the new rules and reopen their site if it's no longer blocked
    chrome.runtime.sendMessage({ action: 'BLOCKING_UPDATED' }).catch(() => {});
}

let closedTabsSave = Promise.resolve();

/**
 * Chrome closes tabs showing extension pages during an update without telling the old worker,
 * so keep a note of the tabs on the Closed page for restoreClosedTabs.
 */
function saveClosedTabs() {
    closedTabsSave = closedTabsSave.then(async () => {
        const blockedPage = chrome.runtime.getURL(BLOCKED_PAGE);
        const tabs = await chrome.tabs.query({});
        await setStorage(STORAGE_KEYS.CLOSED_TABS, tabs
            .filter((tab) => tab.url?.startsWith(blockedPage))
            .map(({ url, windowId, index }) => ({ url, windowId, index })));
    }).catch((e) => console.error('Failed to save Closed page tabs:', e));
    return closedTabsSave;
}

/**
 * Reopens the Closed page tabs that the update closed. Each page returns to its site if that's no longer blocked.
 */
async function restoreClosedTabs() {
    const savedTabs = await getStorage(STORAGE_KEYS.CLOSED_TABS);
    const tabs = await chrome.tabs.query({});
    const windowIds = new Set(tabs.map((tab) => tab.windowId));
    const openUrls = tabs.map((tab) => tab.url);

    for (const saved of [...savedTabs].sort((a, b) => a.index - b.index)) {
        // Skip tabs that are still open, such as ones the browser restored itself after a restart
        const openIndex = openUrls.indexOf(saved.url);
        if (openIndex !== -1) {
            openUrls.splice(openIndex, 1);
            continue;
        }

        await chrome.tabs.create({
            url: saved.url,
            index: saved.index,
            active: false,
            ...(windowIds.has(saved.windowId) && { windowId: saved.windowId }),
        }).catch((e) => console.error('Failed to reopen a Closed page tab:', e));
    }
}

let blockingSync = Promise.resolve();

/**
 * Runs one sync at a time, so the rules always end up matching the latest state.
 */
function syncBlocking() {
    blockingSync = blockingSync.then(applyBlocking).catch((e) => console.error('Failed to sync blocking:', e));
    return blockingSync;
}

/**
 * Gets the tabs the user is actually using: the active tab of each open window while the user
 * is at Chrome, otherwise only those playing sound, such as a video watched without touching the mouse.
 */
async function getTabsInUse() {
    const idleState = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);
    if (idleState === 'locked') return [];

    const windows = await chrome.windows.getAll({ populate: true });
    const userAtChrome = idleState === 'active' && windows.some((win) => win.focused);

    return windows
        .filter((win) => win.state !== 'minimized')
        .map((win) => win.tabs.find((tab) => tab.active))
        .filter((tab) => tab && (userAtChrome || tab.audible));
}

/**
 * Adds one heartbeat's worth of usage to each tracked site in use.
 */
async function trackUsage() {
    const timer = await getStorage(STORAGE_KEYS.TIMER_STATE);
    if (timer.status === 'focus') return; // Tracked sites are blocked, so nothing to count

    const tabs = await getTabsInUse();
    const tabsToWarn = [];
    let limitReached = false;

    await updateBlockedSites((sites) => {
        const tabsBySite = new Map();
        for (const tab of tabs) {
            const trackedDomain = findTrackedDomain(getSiteDomain(tab.url), sites);
            if (trackedDomain) {
                tabsBySite.set(trackedDomain, [...(tabsBySite.get(trackedDomain) || []), tab]);
            }
        }

        let changed = false;
        for (const [domain, siteTabs] of tabsBySite) {
            const site = sites[domain];
            if (site.minutes_used_today >= site.daily_limit_minutes) continue;

            site.minutes_used_today += 1;
            changed = true;
            console.log(`Tracking ${domain}: ${site.minutes_used_today}/${site.daily_limit_minutes}m`);

            const remaining = site.daily_limit_minutes - site.minutes_used_today;
            if (remaining <= 0) {
                limitReached = true;
            } else if (remaining === 1) {
                tabsToWarn.push(...siteTabs);
            }
        }
        return changed;
    });

    tabsToWarn.forEach((tab) => {
        sendToTab(tab.id, { action: 'WARNING', text: 'Last bite! 1 minute left.' });
    });

    // The storage write above already triggered the block itself
    if (limitReached) {
        await playAudio('assets/sounds/metal_grill_door.ogg');
    } else if (tabsToWarn.length > 0) {
        await playAudio('assets/sounds/boiling_lid.ogg');
    }
}

/**
 * Checks if we've passed the reset hour and resets budgets and the cycle count if so.
 */
async function checkDailyReset() {
    const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS);
    const budgetDay = getBudgetDay(settings.daily_reset_hour);

    await updateBlockedSites((sites) => {
        let changed = false;
        for (const [domain, siteData] of Object.entries(sites)) {
            if (siteData.last_reset_date !== budgetDay) {
                console.log(`Resetting budget for ${domain}`);
                siteData.minutes_used_today = 0;
                siteData.last_reset_date = budgetDay;
                changed = true;
            }
        }
        return changed;
    });

    await withTimerLock(async () => {
        const timer = await getStorage(STORAGE_KEYS.TIMER_STATE);
        if (timer.pomodoro_day !== budgetDay) {
            await setStorage(STORAGE_KEYS.TIMER_STATE, {
                ...timer,
                pomodoros_completed: 0,
                pomodoro_day: budgetDay,
            });
        }
    });
}
