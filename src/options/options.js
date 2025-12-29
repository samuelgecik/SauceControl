import { getStorage, setStorage } from '../utils/storage.js';
import { STORAGE_KEYS, DEFAULTS } from '../utils/constants.js';

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('btn-save').addEventListener('click', saveOptions);

async function restoreOptions() {
    console.log("Restoring options...");
    const settings = await getStorage(STORAGE_KEYS.USER_SETTINGS) || DEFAULTS.USER_SETTINGS;

    document.getElementById('reset-hour').value = settings.daily_reset_hour !== undefined ? settings.daily_reset_hour : 0;
    document.getElementById('sound-enabled').checked = settings.sound_enabled !== undefined ? settings.sound_enabled : true;
}

async function saveOptions() {
    const dailyResetHour = parseInt(document.getElementById('reset-hour').value, 10);
    const soundEnabled = document.getElementById('sound-enabled').checked;

    const newSettings = {
        daily_reset_hour: dailyResetHour,
        sound_enabled: soundEnabled
    };

    await setStorage(STORAGE_KEYS.USER_SETTINGS, newSettings);

    const status = document.getElementById('status');
    status.textContent = 'Settings saved!';
    setTimeout(() => {
        status.textContent = '';
    }, 2000);
}
