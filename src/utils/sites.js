/**
 * Get the domain a URL is tracked under
 * @param {string} urlString
 * @returns {string|null} null for anything other than a web page
 */
export function getSiteDomain(urlString) {
    try {
        const url = new URL(urlString);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
    } catch (e) {
        return null;
    }
}

/**
 * Find the entry covering a domain, so that reddit.com also covers old.reddit.com
 * @param {string|null} domain
 * @param {object} sites
 * @returns {string|null} the most specific matching key of sites
 */
export function findTrackedDomain(domain, sites) {
    let candidate = domain;
    while (candidate) {
        if (Object.hasOwn(sites, candidate)) return candidate;
        const dot = candidate.indexOf('.');
        if (dot === -1) return null;
        candidate = candidate.slice(dot + 1);
    }
    return null;
}

/**
 * Get why a domain is blocked right now
 * @param {string|null} domain
 * @param {object} sites
 * @param {object} timer
 * @returns {'FOCUS_MODE'|'DAILY_LIMIT'|null}
 */
export function getBlockReason(domain, sites, timer) {
    const trackedDomain = findTrackedDomain(domain, sites);
    if (!trackedDomain) return null;
    if (timer.status === 'focus') return 'FOCUS_MODE';

    const site = sites[trackedDomain];
    return site.minutes_used_today >= site.daily_limit_minutes ? 'DAILY_LIMIT' : null;
}

/**
 * Get the budget day a moment belongs to. Hours before the reset hour count towards the previous day.
 * @param {number} resetHour
 * @param {Date} now
 * @returns {string}
 */
export function getBudgetDay(resetHour, now = new Date()) {
    const day = new Date(now);
    if (day.getHours() < resetHour) day.setDate(day.getDate() - 1);
    return day.toDateString();
}
