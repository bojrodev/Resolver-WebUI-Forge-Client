// -----------------------------------------------------------
// APPLICATION ENTRY POINT
// -----------------------------------------------------------

window.onload = function() {
    try {
        console.log("Booting Resolver...");

        // 1. Initialize Icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // 2. Initialize Database
        // (Defined in utils.js)
        if (typeof initDatabase === 'function') {
            initDatabase();
        }

        // 3. Load Saved Settings & State
        injectConfigModal();       // ui.js
        loadHostIp();              // network.js
        loadQueueState();          // utils.js
        renderQueueAll();          // engine.js
        loadAutoDlState();         // ui.js
        loadLlmSettings();         // ui.js
        loadPowerSettings();       // ui.js
        loadSavedPrompts();        // ui.js - RESTORE PROMPTS

        // 4. Setup Background & Notifications
        setupBackgroundListeners(); // utils.js
        createNotificationChannel();// utils.js

        // 5. Initialize Graphics Engine
        initMainCanvas();          // editor.js
        setupEditorEvents();       // editor.js

        // 6. Battery Optimization Check
        if (!localStorage.getItem('bojroBatteryOpt')) {
            const batModal = document.getElementById('batteryModal');
            if (batModal) batModal.classList.remove('hidden');
        }

        // 7. Auto-Connect if IP is saved
        if (document.getElementById('hostIp').value) {
            console.log("Auto-connecting...");
            window.connect(true); // network.js
        }

        // =========================================================================
        // NEO BRIDGE: CONNECTS LORA.JS TO APP.JS
        // Allows the external LoraManager to inject prompts into the active UI
        // =========================================================================
        if (!window.Neo) window.Neo = {};
        
        window.Neo.appInjectConfig = async function(alias, name, textArea) {
            // 1. Get path from the LoraManager (if available)
            const loraEntry = window.LoraManager && window.LoraManager.allLoras 
                ? window.LoraManager.allLoras.find(l => l.name === name) 
                : null;

            let config = loraConfigs[name];

            // 2. Fetch Config if missing, using the helper
            if (!config && loraEntry && loraEntry.path) {
                if (Toast) Toast.show({
                    text: 'Fetching config...',
                    duration: 'short'
                });
                config = await loadSidecarConfig(name, loraEntry.path);
            }

            // 3. Build Tag
            const weight = config ? config.weight : 1.0;
            const trigger = config && config.trigger ? ` ${config.trigger}` : "";
            const tag = ` <lora:${alias}:${weight}>${trigger}`;

            // 4. Inject into Text Area
            if (!textArea.value.includes(`<lora:${alias}:`)) {
                textArea.value = textArea.value.trim() + tag;
                if (Toast) Toast.show({
                    text: `Added ${alias}`,
                    duration: 'short'
                });
            } else {
                if (Toast) Toast.show({
                    text: `Already added`,
                    duration: 'short'
                });
            }

            document.getElementById('loraModal').classList.add('hidden');
        };

        console.log("App Initialized Successfully");
    } catch (e) {
        console.error("Initialization Error:", e);
        alert("App Init Failed: " + e.message);
    }
}