import { getStorage, setStorage } from '../utils/storage.js';
import { STORAGE_KEYS, DEFAULTS } from '../utils/constants.js';

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('btn-save').addEventListener('click', saveOptions);

async function restoreOptions() {
    console.log("Restoring options...");
    const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS) || DEFAULTS.USER_SETTINGS;

    document.getElementById('reset-hour').value = settings.daily_reset_hour !== undefined ? settings.daily_reset_hour : 0;
    document.getElementById('sound-enabled').checked = settings.sound_enabled !== undefined ? settings.sound_enabled : true;
    document.getElementById('focus-duration').value = settings.focus_duration || 25;
    document.getElementById('short-break-duration').value = settings.short_break_duration || 5;
    document.getElementById('long-break-duration').value = settings.long_break_duration || 15;
    document.getElementById('auto-start-focus').checked = settings.auto_start_focus || false;

    // Render Ration List
    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
    const listContainer = document.getElementById('ration-list-edit');
    listContainer.innerHTML = '';

    const domains = Object.keys(sites || {});
    if (domains.length === 0) {
        listContainer.innerHTML = '<li>No sites added yet.</li>';
    } else {
        domains.forEach(domain => {
            const site = sites[domain];
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="domain-name">${domain}</span>
                <div class="limit-input-container">
                    <input type="number" class="diner-input-small site-limit-input" data-domain="${domain}" value="${site.daily_limit_minutes}" min="1">
                    <span>min</span>
                </div>
            `;
            listContainer.appendChild(li);
        });
    }
}

async function saveOptions() {
    const dailyResetHour = parseInt(document.getElementById('reset-hour').value, 10);
    const soundEnabled = document.getElementById('sound-enabled').checked;
    const focusDuration = parseInt(document.getElementById('focus-duration').value, 10);
    const shortBreakDuration = parseInt(document.getElementById('short-break-duration').value, 10);
    const longBreakDuration = parseInt(document.getElementById('long-break-duration').value, 10);
    const autoStartFocus = document.getElementById('auto-start-focus').checked;

    const newSettings = {
        daily_reset_hour: dailyResetHour,
        sound_enabled: soundEnabled,
        focus_duration: focusDuration,
        short_break_duration: shortBreakDuration,
        long_break_duration: longBreakDuration,
        auto_start_focus: autoStartFocus
    };

    await setStorage(STORAGE_KEYS.USER_SETTINGS, newSettings);

    // Save Blocked Sites Limits
    const sites = await getStorage(STORAGE_KEYS.BLOCKED_SITES);
    const limitInputs = document.querySelectorAll('.site-limit-input');

    limitInputs.forEach(input => {
        const domain = input.dataset.domain;
        const newLimit = parseInt(input.value, 10);
        if (sites[domain] && !isNaN(newLimit) && newLimit > 0) {
            sites[domain].daily_limit_minutes = newLimit;
        }
    });

    await setStorage(STORAGE_KEYS.BLOCKED_SITES, sites);

    const status = document.getElementById('status');
    status.textContent = 'Order updated!';
    setTimeout(() => {
        status.textContent = '';
    }, 2000);
}
