// What kind of device is this panel running on? Per-device defaults hang off it.
//   wall tablet (installed app): voice panel, idle screen, face lock
//   phone (iPhone home-screen app, or any phone browser): just the widgets, away from home
//   laptop browser tab: widgets; no voice panel, no idle screen
export const isInstalledApp = () => {
    try {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;   // iOS home screen
    } catch { return false; }
};

// iPhones and Android phones (Android tablets say "Android" without "Mobile")
export const isPhone = () => {
    try {
        const ua = navigator.userAgent || '';
        return /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua));
    } catch { return false; }
};

// The wall panel: installed, and not a phone. Only it runs what the Pi mic hears (else
// opening the iPhone app would pull Pi commands onto the phone: the backend sends each
// command to the newest panel), shows the idle screen, and starts face-locked.
export const isWallPanel = () => isInstalledApp() && !isPhone();
