import { getStorage, updateBlockedSites } from '../utils/storage.js';
import { getSiteDomain, findTrackedDomain, getBudgetDay } from '../utils/sites.js';
import { STORAGE_KEYS, DEFAULTS } from '../utils/constants.js';

const TIMER_LABELS = {
    idle: 'Ready to Cook',
    focus: 'Simmering',
    short_break: 'Coffee Break',
    long_break: 'Long Break',
};

console.log('Popup script loaded');
// Ensure DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    const timeDisplay = document.getElementById('time-display');
    const timerLiquid = document.getElementById('timer-liquid');
    const timerStatus = document.getElementById('timer-status');
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const btnAddSite = document.getElementById('btn-add-site');
    const rationList = document.getElementById('ration-list');

    // --- Timer Logic ---
    let timerInterval;

    // Cached settings
    let currentSettings = await getStorage(STORAGE_KEYS.USER_SETTINGS);

    function isRunning(state) {
        return ['focus', 'short_break', 'long_break'].includes(state.status);
    }

    function updateTimerUI(state) {
        timerStatus.textContent = `${TIMER_LABELS[state.status]} · ${state.pomodoros_completed || 0} done`;
        timerLiquid.classList.toggle('on-break', state.status === 'short_break' || state.status === 'long_break');

        if (isRunning(state) && state.end_timestamp) {
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
            // Idle State
            // Show configured focus duration
            const displayMinutes = currentSettings.focus_duration > 0
                ? currentSettings.focus_duration
                : DEFAULTS.USER_SETTINGS.focus_duration;
            timeDisplay.textContent = `${displayMinutes}:00`;
            if (timerLiquid) timerLiquid.style.height = '100%';
            btnStart.classList.remove('hidden');

            // Update button text contextually? optional
            btnStop.classList.add('hidden');
        }
    }

    function showTimer(state) {
        clearInterval(timerInterval); // Reset loop
        updateTimerUI(state);

        if (isRunning(state)) {
            timerInterval = setInterval(() => updateTimerUI(state), 1000);
        }
    }

    // Initial Load & Listeners
    showTimer(await getStorage(STORAGE_KEYS.TIMER_STATE));

    // Storage Listener for background updates
    chrome.storage.onChanged.addListener((changes) => {
        if (changes[STORAGE_KEYS.USER_SETTINGS]) {
            currentSettings = changes[STORAGE_KEYS.USER_SETTINGS].newValue;
            // Refresh UI if idle to show new default
            getStorage(STORAGE_KEYS.TIMER_STATE).then(state => {
                if (!isRunning(state)) {
                    updateTimerUI(state);
                }
            });
        }
        if (changes[STORAGE_KEYS.TIMER_STATE]) {
            showTimer(changes[STORAGE_KEYS.TIMER_STATE].newValue);
        }
        if (changes[STORAGE_KEYS.BLOCKED_SITES]) {
            renderList(changes[STORAGE_KEYS.BLOCKED_SITES].newValue);
        }
    });

    // Buttons
    btnStart.addEventListener('click', async () => {
        // Always start a focus session from idle
        chrome.runtime.sendMessage({ action: 'START_TIMER', type: 'focus' });
    });

    btnStop.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'PLAY_SOUND', file: 'assets/sounds/click.ogg' });
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
        const domain = getSiteDomain(tab?.url);

        if (!domain) {
            alert("Cannot add this page.");
            return;
        }

        const limitInput = document.getElementById('site-limit');
        if (!limitInput.reportValidity()) return;

        let existingDomain = null;
        await updateBlockedSites((currentSites) => {
            // Check if already covered
            existingDomain = findTrackedDomain(domain, currentSites);
            if (existingDomain) return false;

            // Add new site
            currentSites[domain] = {
                daily_limit_minutes: parseInt(limitInput.value, 10),
                minutes_used_today: 0,
                last_reset_date: getBudgetDay(currentSettings.daily_reset_hour),
                created_at: Date.now()
            };
        });

        if (existingDomain) {
            alert(`${existingDomain} is already on the menu.`);
            return;
        }

        chrome.runtime.sendMessage({ action: 'PLAY_SOUND', file: 'assets/sounds/cash_register.ogg' });
    });

    const btnSettings = document.getElementById('btn-settings');
    btnSettings.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'PLAY_SOUND', file: 'assets/sounds/click.ogg' });
        // Simple toggle for now, or just log
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            console.log("Settings clicked");
        }
    });
});
