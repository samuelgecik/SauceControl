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
