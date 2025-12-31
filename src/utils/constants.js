/**
 * SauceControl Constants & Design Tokens
 */

export const COLORS = {
    KETCHUP_RED: '#E02130',
    MUSTARD_YELLOW: '#F4B324',
    MILKSHAKE_TEAL: '#6CD4C4',
    GUEST_CHECK_CREAM: '#F9F4E0',
    DINER_CHROME: '#E8E8E8',
    COFFEE_BLACK: '#2C2C2C',
};

export const FONTS = {
    DISPLAY: "'Lobster', cursive",
    BODY: "'Quicksand', sans-serif",
    RECEIPT: "'Courier Prime', monospace",
};

export const STORAGE_KEYS = {
    USER_SETTINGS: 'user_settings',
    BLOCKED_SITES: 'blocked_sites',
    TIMER_STATE: 'timer_state',
};

export const DEFAULTS = {
    USER_SETTINGS: {
        daily_reset_hour: 0,
        sound_enabled: true,
        focus_duration: 25,
        short_break_duration: 5,
        long_break_duration: 15,
        auto_start_focus: false,
    },
    TIMER_STATE: {
        status: 'idle', // 'idle' | 'focus' | 'short_break' | 'long_break'
        end_timestamp: null,
        duration_minutes: 25,
        pomodoros_completed: 0,
    },
};
