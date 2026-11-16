/**
 * SauceControl Constants
 */

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
        pomodoro_day: null,
    },
};
