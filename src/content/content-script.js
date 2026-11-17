/**
 * SauceControl Content Script
 */

// Scoped so that injecting into an open tab twice can't fail on redeclared constants
(() => {
    // Simple constants duplicate to avoid module complexity in content script
    const CSS_PREFIX = 'sauce-control';
    const TOAST_DURATION_MS = 5000;

    console.log('SauceControl Content Script Active');

    // Versions before the Closed page left an overlay that nothing else can remove after an update
    const legacyOverlay = document.getElementById(`${CSS_PREFIX}-overlay`);
    if (legacyOverlay) {
        document.body.style.overflow = legacyOverlay.dataset.previousOverflow ?? '';
        legacyOverlay.remove();
    }

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'REDIRECT') {
            sendResponse();
            // Replacing the history entry lets Back skip the blocked site instead of landing on it again
            location.replace(message.url);
        } else if (message.action === 'WARNING') {
            showToast(message.text || "One minute remaining!");
        }
    });

    function showToast(text) {
        document.getElementById(`${CSS_PREFIX}-toast`)?.remove();

        const toast = document.createElement('div');
        toast.id = `${CSS_PREFIX}-toast`;
        toast.setAttribute('role', 'status');
        toast.textContent = text;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), TOAST_DURATION_MS);
    }
})();
