chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'PLAY_SOUND') {
        const audio = new Audio(chrome.runtime.getURL(msg.file));
        audio.volume = 1.0;
        audio.play().catch(error => console.error('Error playing sound:', error));
    }
});
