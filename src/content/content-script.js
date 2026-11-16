/**
 * SauceControl Content Script
 */

// Scoped so that injecting into an open tab twice can't fail on redeclared constants
(() => {
    // Simple constants duplicate to avoid module complexity in content script
    const CSS_PREFIX = 'sauce-control';
    const TOAST_DURATION_MS = 5000;

    console.log('SauceControl Content Script Active');

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'BLOCK_SITE') {
            injectOverlay(message.reason);
        } else if (message.action === 'UNBLOCK_SITE') {
            removeOverlay();
        } else if (message.action === 'WARNING') {
            showToast(message.text || "One minute remaining!");
        }
    });

    function injectOverlay(reason) {
        const existing = document.getElementById(`${CSS_PREFIX}-overlay`);
        if (existing) {
            if (existing.dataset.reason === reason) return;
            removeOverlay();
        }

        const overlay = document.createElement('div');
        overlay.id = `${CSS_PREFIX}-overlay`;
        overlay.dataset.reason = reason;
        overlay.dataset.previousOverflow = document.body.style.overflow;
        const imageUrl = chrome.runtime.getURL('assets/images/closed.jpg');

        let title = "Sorry, We're Closed!";
        let message = "Kitchen is closed. You've used your ration for today.";

        if (reason === 'FOCUS_MODE') {
            title = "Simmering in Progress...";
            message = "Get back to cooking! Focus Mode is active.";
        }

        overlay.innerHTML = `
    <div class="${CSS_PREFIX}-container">
      <img src="${imageUrl}" class="${CSS_PREFIX}-image" alt="Kitchen Closed" />
      <h1 class="${CSS_PREFIX}-title">${title}</h1>
      <p class="${CSS_PREFIX}-message">${message}</p>
    </div>
  `;

        document.body.appendChild(overlay);
        // We will style this with src/content/overlay.css
        document.body.style.overflow = 'hidden'; // Stop scrolling
    }

    function removeOverlay() {
        const overlay = document.getElementById(`${CSS_PREFIX}-overlay`);
        if (!overlay) return;

        document.body.style.overflow = overlay.dataset.previousOverflow;
        overlay.remove();
    }

    function showToast(text) {
        document.getElementById(`${CSS_PREFIX}-toast`)?.remove();

        const toast = document.createElement('div');
        toast.id = `${CSS_PREFIX}-toast`;
        toast.setAttribute('role', 'status');
        toast.textContent = text;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), TOAST_DURATION_MS);
    }

    // The worker can't reach this script until it has loaded, so ask once it has
    chrome.runtime.sendMessage({ action: 'CHECK_BLOCK' }).catch(() => {});
})();
