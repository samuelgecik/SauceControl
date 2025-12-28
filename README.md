# SauceControl 🍅

**SauceControl** is a Diner-themed productivity Chrome extension that combines a Pomodoro timer with a daily "allowance" for distracting websites.

## 🚀 Installation

1.  **Clone or Download** this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer Mode** (toggle in the top right).
4.  Click **Load unpacked**.
5.  Select the `SauceControl` directory (the folder containing `manifest.json`).

## 🎨 Asset Requirements

The following assets are referenced in the code but may be missing. Please add them to the `assets/` directory:

*   **Fonts** (`assets/fonts/`):
    *   `Lobster.ttf` (Display)
    *   `Quicksand.ttf` (Body)
    *   `CourierPrime.ttf` (Receipts)
*   **Icons** (`assets/icons/`):
    *   `icon16.png`, `icon48.png`, `icon128.png`
*   **Images** (`assets/images/`):
    *   (Optional) Bottle illustrations or textures.

## 🍔 Features

*   **Sauce Budget**: Visit a distracting site, click the extension icon, and hit **"+ Add Side"**. You now have a 30-minute daily limit for that site.
*   **Kitchen Closed**: Once your limit is reached, the site is blocked.
*   **Simmer Mode (Timer)**: Click **"Order Up!"** to start a 25-minute focus session.
    *   **Focus Override**: While the timer is running, ALL tracked sites are blocked immediately.
*   **Midnight Reset**: Your budget resets automatically at 00:00 local time.

## 🛠 Tech Stack

*   Vanilla JavaScript (ES Modules)
*   HTML5 / CSS3 (CSS Variables for theming)
*   Chrome Extension Manifest V3
    *   `storage`, `alarms`, `scripting`, `activeTab` permissions.
