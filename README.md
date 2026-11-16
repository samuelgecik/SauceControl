# SauceControl 🍅

**SauceControl** is a Diner-themed productivity Chrome extension that combines a Pomodoro timer with a daily "allowance" for distracting websites.

## 🚀 Installation

1.  **Clone or Download** this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer Mode** (toggle in the top right).
4.  Click **Load unpacked**.
5.  Select the `SauceControl` directory (the folder containing `manifest.json`).

## 🍔 Features

*   **Sauce Budget**: Visit a distracting site, click the extension icon, and hit **"Add Side"** to give it a daily limit (30 minutes by default). A limit on `reddit.com` also covers subdomains such as `old.reddit.com`.
    *   **What counts**: One minute is added per minute the site is the active tab of an open window while you are at Chrome. If you step away or switch to another app, only tabs playing sound keep counting.
    *   **Change or remove**: Adjust limits or remove sites in **Kitchen Settings**.
*   **Kitchen Closed**: Once your limit is reached, the site is blocked in every tab until the next reset.
*   **Simmer Mode (Timer)**: Click **"Order Up!"** to start a focus session (25 minutes by default). A break starts automatically when it ends, with a long break after every fourth session.
    *   **Focus Override**: While a focus session is running, ALL tracked sites are blocked immediately. They reopen when the session ends or you click **"Ditch It!"**.
*   **Daily Reset**: Your budget and session count reset automatically at the **Daily Reset Hour**, which defaults to 00:00 local time.

## 🎨 Assets

All assets are bundled. The fonts are Lobster (display), Quicksand (body) and Vibur (popup logo).

## 🛠 Tech Stack

*   Vanilla JavaScript (ES Modules)
*   HTML5 / CSS3 (CSS Variables for theming)
*   Chrome Extension Manifest V3
    *   `storage`, `tabs`, `scripting`, `alarms`, `offscreen`, `idle` permissions.
