import { getStorage, setStorage, getBlockedSite } from '../utils/storage.js';
import { STORAGE_KEYS } from '../utils/constants.js';

console.log('Popup script loaded');
// Ensure DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    const timeDisplay = document.getElementById('time-display');
    const timerLiquid = document.getElementById('timer-liquid');
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const btnAddSite = document.getElementById('btn-add-site');
    const rationList = document.getElementById('ration-list');

    // --- Timer Logic ---
    let timerInterval;

    function updateTimerUI(state) {
        if (state.status === 'focus' && state.end_timestamp) {
            const now = Date.now();
            const remaining = Math.max(0, state.end_timestamp - now);
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);

            timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Animation (Liquid height)
            const totalMs = (state.duration_minutes || 25) * 60 * 1000;
            const percent = (remaining / totalMs) * 100;
            if (timerLiquid) timerLiquid.style.height = `${percent}%`;

            btnStart.classList.add('hidden');
            btnStop.classList.remove('hidden');

            if (remaining <= 0) {
                clearInterval(timerInterval);
            }
        } else {
            timeDisplay.textContent = `${state.duration_minutes || 25}:00`;
            if (timerLiquid) timerLiquid.style.height = '100%';
            btnStart.classList.remove('hidden');
            btnStop.classList.add('hidden');
        }
    }

    // Initial Load & Listeners
    const timerState = await getStorage(STORAGE_KEYS.TIMER_STATE);
    updateTimerUI(timerState);

    if (timerState.status === 'focus') {
        timerInterval = setInterval(async () => {
            const now = Date.now();
            // We use the end_timestamp from the initial read or updated state
            // But to be robust against BG updates, we rely on the state logic
            const currentState = await getStorage(STORAGE_KEYS.TIMER_STATE);
            if (currentState.status !== 'focus') clearInterval(timerInterval);
            updateTimerUI(currentState);
        }, 1000);
    }

    // Storage Listener for background updates
    chrome.storage.onChanged.addListener((changes) => {
        if (changes[STORAGE_KEYS.TIMER_STATE]) {
            const newState = changes[STORAGE_KEYS.TIMER_STATE].newValue;
            clearInterval(timerInterval); // Reset loop
            updateTimerUI(newState);

            if (newState.status === 'focus') {
                timerInterval = setInterval(() => updateTimerUI(newState), 1000);
            }
        }
        if (changes[STORAGE_KEYS.BLOCKED_SITES]) {
            renderList(changes[STORAGE_KEYS.BLOCKED_SITES].newValue);
        }
    });

    // Buttons
    btnStart.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'START_TIMER', duration: 25, type: 'focus' });
    });

    btnStop.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'STOP_TIMER' });
    });

    // --- Ration List Logic ---
    async function renderList(sites) {
        if (!rationList) return;
        rationList.innerHTML = '';
        const domains = Object.keys(sites || {});

        if (domains.length === 0) {
            rationList.innerHTML = '<li class="empty-state">No side orders yet.</li>';
            return;
        }

        domains.forEach(domain => {
            const data = sites[domain];
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${domain}</span>
                <span>${data.minutes_used_today}/${data.daily_limit_minutes}m</span>
            `;
            rationList.appendChild(li);
        });
    }

    // Initial List Load
    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
    renderList(sites);

    // --- Add Site Logic ---
    btnAddSite.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
            try {
                const url = new URL(tab.url);
                const domain = url.hostname.replace('www.', '');

                // Check if already exists
                const currentSites = await getStorage(STORAGE_KEYS.BLOCKED_SITES) || {};
                if (currentSites[domain]) return;

                // Add new site
                const limitInput = document.getElementById('site-limit');
                const dailyLimit = parseInt(limitInput.value, 10);

                if (isNaN(dailyLimit) || dailyLimit <= 0) {
                    alert("Please enter a valid time limit.");
                    return;
                }

                currentSites[domain] = {
                    daily_limit_minutes: dailyLimit,
                    minutes_used_today: 0,
                    last_reset_date: new Date().toDateString(),
                    created_at: Date.now()
                };

                await setStorage(STORAGE_KEYS.BLOCKED_SITES, currentSites);
            } catch (e) {
                console.error("Invalid URL");
            }
        } else {
            alert("Cannot add this page.");
        }
    });

    const btnSettings = document.getElementById('btn-settings');
    btnSettings.addEventListener('click', () => {
        // Simple toggle for now, or just log
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            console.log("Settings clicked");
        }
    });
});
