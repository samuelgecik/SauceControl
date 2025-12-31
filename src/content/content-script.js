/**
 * SauceControl Content Script
 */

// Simple constants duplicate to avoid module complexity in content script
const CSS_PREFIX = 'sauce-control';

console.log('SauceControl Content Script Active');

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'BLOCK_SITE') {
        injectOverlay(message.reason);
    } else if (message.action === 'WARNING') {
        showToast(message.text || "One minute remaining!");
    }
});

function injectOverlay(reason) {
    if (document.getElementById(`${CSS_PREFIX}-overlay`)) return;

    const overlay = document.createElement('div');
    overlay.id = `${CSS_PREFIX}-overlay`;
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

function showToast(text) {
    // Todo: Implement Toast
    console.log('SauceControl Warning:', text);
}
