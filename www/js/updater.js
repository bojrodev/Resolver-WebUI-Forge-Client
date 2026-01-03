// www/js/updater.js

async function checkForAppUpdate() {
    if (!CapacitorUpdater) {
        console.log("Updater plugin not active (Web Mode?)");
        return;
    }

    // 1. Tell the native shell the current app is working fine.
    // If we don't do this, the app might roll back updates automatically.
    CapacitorUpdater.notifyAppReady();

    try {
        console.log("Checking for updates...");
        
        // 2. FETCH THE VERSION LIST
        // You will need to host this "version.json" file somewhere (GitHub, your website, etc)
        // REPLACE THIS URL with your actual URL later
        const UPDATE_URL = 'https://your-website.com/updates/version.json';
        
        const response = await fetch(UPDATE_URL);
        if (!response.ok) throw new Error("Update check failed");
        
        const remoteData = await response.json();
        // remoteData looks like: { "version": "1.0.5", "url": "https://...", "note": "Fixes bugs" }

        // 3. COMPARE VERSIONS
        // You need to manually update this string inside the code whenever you release an update
        const currentVersion = '1.0.0'; 

        if (isNewer(currentVersion, remoteData.version)) {
            // 4. ASK THE USER
            const doUpdate = confirm(
                `New Update Available (v${remoteData.version})\n\n` +
                `Changes: ${remoteData.note}\n\n` +
                `Download and Install now?`
            );

            if (doUpdate) {
                if (typeof Toast !== 'undefined') Toast.show({text: 'Downloading update...', duration: 'long'});
                
                // 5. DOWNLOAD AND INSTALL
                const update = await CapacitorUpdater.download({
                    url: remoteData.url,
                    version: remoteData.version
                });
                
                // 6. RESTART APP
                await CapacitorUpdater.set(update);
            }
        } else {
            if (typeof Toast !== 'undefined') Toast.show({text: 'App is up to date', duration: 'short'});
        }

    } catch (error) {
        console.log("Offline or no update server found:", error);
        // Do nothing silently if offline
    }
}

// Helper to compare "1.0.0" vs "1.0.2"
function isNewer(current, remote) {
    const c = current.split('.').map(Number);
    const r = remote.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (r[i] > (c[i] || 0)) return true;
        if (r[i] < (c[i] || 0)) return false;
    }
    return false;
}