import { getStorage } from '../utils/storage.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { getSiteDomain, findTrackedDomain, getBlockReason } from '../utils/sites.js';

const SIGNS = {
    FOCUS_MODE: {
        title: "Simmering in Progress...",
        message: "Get back to cooking! Focus Mode is active.",
    },
    DAILY_LIMIT: {
        title: "Sorry, We're Closed!",
        message: "Kitchen is closed. You've used your ration for today.",
    },
};

// The worker puts the blocked address after the '#'
const blockedUrl = location.hash.slice(1);
const domain = getSiteDomain(blockedUrl);

/**
 * Asks the redirect rules rather than storage, so reopening the site can't bounce straight back here
 * while the worker is still updating them.
 */
async function isStillRedirected() {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const rulesByDomain = Object.fromEntries(rules.map((rule) => [rule.condition.requestDomains[0], rule]));
    return rulesByDomain[findTrackedDomain(domain, rulesByDomain)]?.action.type === 'redirect';
}

async function update() {
    if (domain && !await isStillRedirected()) {
        location.replace(blockedUrl);
        return;
    }

    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
    const timer = await getStorage(STORAGE_KEYS.TIMER_STATE);
    const reason = getBlockReason(domain, sites, timer) || 'DAILY_LIMIT';

    document.body.dataset.reason = reason;
    document.getElementById('title').textContent = SIGNS[reason].title;
    document.getElementById('message').textContent = SIGNS[reason].message;
    document.getElementById('site').textContent = domain || '';
}

update();

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'BLOCKING_UPDATED') {
        update();
    }
});
