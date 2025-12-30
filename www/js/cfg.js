// -----------------------------------------------------------
// CONFIGURATION & SETTINGS PAGE LOGIC
// -----------------------------------------------------------

// Load configuration from localStorage
function loadConnectionConfig() {
    const saved = localStorage.getItem('bojroConnectionConfig');
    if (saved) {
        connectionConfig = { ...connectionConfig, ...JSON.parse(saved) };
    }
    
    // Update UI fields
    const elBase = document.getElementById('cfgBaseIp');
    if (elBase) elBase.value = connectionConfig.baseIp || '';
    
    const elWeb = document.getElementById('cfgPortWebUI');
    if (elWeb) elWeb.value = connectionConfig.portWebUI || 7860;
    
    const elLlm = document.getElementById('cfgPortLlm');
    if (elLlm) elLlm.value = connectionConfig.portLlm || 1234;
    
    const elWake = document.getElementById('cfgPortWake');
    if (elWake) elWake.value = connectionConfig.portWake || 5000;

    // NEW: Comfy Port
    const elComfy = document.getElementById('cfgPortComfy');
    if (elComfy) elComfy.value = connectionConfig.portComfy || 8188;
    
    // Update Toggle Switch for Remote/External Mode
    const elMode = document.getElementById('cfgModeSwitch');
    if (elMode) {
        elMode.checked = connectionConfig.isRemote || false;
    }
}

// Save configuration to localStorage
function saveConnectionConfig() {
    localStorage.setItem('bojroConnectionConfig', JSON.stringify(connectionConfig));
}

// Helper to construct URLs based on Mode (Local vs External)
function constructServiceUrl(port) {
    if (!connectionConfig.baseIp) return '';
    
    let url = connectionConfig.baseIp.trim();
    
    // Clean up trailing slash just in case
    url = url.replace(/\/$/, "");

    if (connectionConfig.isRemote) {
        // --- EXTERNAL MODE (HTTPS, Ignore Ports) ---
        
        // Ensure protocol is HTTPS
        if (url.startsWith("http://")) {
            url = url.replace("http://", "https://");
        } else if (!url.startsWith("https://")) {
            url = "https://" + url;
        }
        
        // Return strictly the URL (ngrok/cloud usually handles routing without ports)
        return url;

    } else {
        // --- LOCAL MODE (HTTP, Append Port) ---
        
        // Strip any existing protocol to ensure we force HTTP
        url = url.replace(/^https?:\/\//, '');
        
        // Ensure Port is appended
        // We check if the remaining string already has a port (contains a colon)
        // logic: 192.168.1.5 -> no colon -> add port
        // logic: 192.168.1.5:8888 -> has colon -> keep existing
        if (port && !url.includes(':')) {
            url += `:${port}`;
        }
        
        return `http://${url}`;
    }
}

// Build full URLs from base IP and ports
function buildWebUIUrl() {
    return constructServiceUrl(connectionConfig.portWebUI || 7860);
}

function buildLlmUrl() {
    return constructServiceUrl(connectionConfig.portLlm || 1234);
}

function buildWakeUrl() {
    return constructServiceUrl(connectionConfig.portWake || 5000);
}

// NEW: Comfy URL Builder
function buildComfyUrl() {
    return constructServiceUrl(connectionConfig.portComfy || 8188);
}

// Update connection status display
function updateConnectionStatus(service, status) {
    if(!connectionState) return;
    connectionState[service] = status;
    
    // Update UI elements based on service
    if (service === 'webui') {
        const btn = document.getElementById('webuiLinkBtn');
        const dot = document.getElementById('webuiStatusDot');
        const statusText = document.getElementById('connectionStatus');
        
        if (!btn || !dot || !statusText) return;
        
        // Remove all state classes
        btn.classList.remove('connecting', 'connected', 'disconnected');
        dot.classList.remove('connecting', 'connected', 'disconnected');
        
        if (status === 'connecting') {
            btn.classList.add('connecting');
            btn.innerText = 'LINKING...';
            dot.classList.add('connecting');
            statusText.innerText = 'Connecting...';
            statusText.style.color = 'var(--accent-primary)';
        } else if (status === 'connected') {
            btn.classList.add('connected');
            btn.innerText = 'CONNECTED';
            dot.classList.add('connected');
            statusText.innerText = `Connected to ${connectionConfig.baseIp}`;
            statusText.style.color = 'var(--success)';
        } else {
            btn.classList.add('disconnected');
            btn.innerText = 'LINK';
            dot.classList.add('disconnected');
            statusText.innerText = 'Not Connected';
            statusText.style.color = 'var(--text-muted)';
        }
    }
    
    if (service === 'llm') {
        const btn = document.getElementById('llmLinkBtn');
        const dot = document.getElementById('llmStatusDot');
        
        if (!btn || !dot) return;
        
        // Remove all state classes
        btn.classList.remove('connecting', 'connected', 'disconnected');
        dot.classList.remove('connecting', 'connected', 'disconnected');
        
        if (status === 'connecting') {
            btn.classList.add('connecting');
            btn.innerText = 'LINKING...';
            dot.classList.add('connecting');
        } else if (status === 'connected') {
            btn.classList.add('connected');
            btn.innerText = 'CONNECTED';
            dot.classList.add('connected');
        } else {
            btn.classList.add('disconnected');
            btn.innerText = 'LINK';
            dot.classList.add('disconnected');
        }
    }
}

// Settings page functions
window.saveConfiguration = function() {
    const baseIp = document.getElementById('cfgBaseIp').value.trim();
    const isRemote = document.getElementById('cfgModeSwitch').checked;
    
    const portWebUI = document.getElementById('cfgPortWebUI').value ? parseInt(document.getElementById('cfgPortWebUI').value) : '';
    const portLlm = document.getElementById('cfgPortLlm').value ? parseInt(document.getElementById('cfgPortLlm').value) : '';
    const portWake = document.getElementById('cfgPortWake').value ? parseInt(document.getElementById('cfgPortWake').value) : '';
    const portComfy = document.getElementById('cfgPortComfy').value ? parseInt(document.getElementById('cfgPortComfy').value) : ''; // NEW
    
    // Validation
    if (!baseIp) {
        alert('Please enter an IP address or URL');
        return;
    }
    
    if (portWebUI && (isNaN(portWebUI) || portWebUI < 1 || portWebUI > 65535)) {
        alert('Please enter a valid WebUI port (1-65535)');
        return;
    }
    
    if (portLlm && (isNaN(portLlm) || portLlm < 1 || portLlm > 65535)) {
        alert('Please enter a valid LLM port (1-65535)');
        return;
    }
    
    if (portWake && (isNaN(portWake) || portWake < 1 || portWake > 65535)) {
        alert('Please enter a valid Wake port (1-65535)');
        return;
    }

    if (portComfy && (isNaN(portComfy) || portComfy < 1 || portComfy > 65535)) {
        alert('Please enter a valid Comfy port (1-65535)');
        return;
    }
    
    // Save configuration
    connectionConfig.baseIp = baseIp;
    connectionConfig.isRemote = isRemote; 
    connectionConfig.portWebUI = portWebUI !== '' ? portWebUI : null; 
    connectionConfig.portLlm = portLlm !== '' ? portLlm : null;    
    connectionConfig.portWake = portWake !== '' ? portWake : null;
    connectionConfig.portComfy = portComfy !== '' ? portComfy : null; // NEW
    connectionConfig.isConfigured = true;
    
    saveConnectionConfig();
    
    // Update global HOST variable
    HOST = buildWebUIUrl();
    
    // Update legacy localStorage keys for backward compatibility
    localStorage.setItem('bojroHostIp', HOST);
    localStorage.setItem('bojro_power_ip', buildWakeUrl());
    
    // Also update Comfy Host immediately if using centralized config
    const comfyUrl = buildComfyUrl();
    localStorage.setItem('comfyHost', comfyUrl.replace('http://','').replace('https://',''));

    if (Toast) Toast.show({
        text: 'Configuration Saved Successfully',
        duration: 'short'
    });
    
    // Switch to GEN tab
    switchTab('gen');
}

window.resetAppConfig = function() {
    if (confirm('Reset all app configuration? This will clear all saved settings and return to the first-time setup.')) {
        // Clear connection config
        localStorage.removeItem('bojroConnectionConfig');
        
        // Clear legacy keys
        localStorage.removeItem('bojroHostIp');
        localStorage.removeItem('bojro_power_ip');
        localStorage.removeItem('bojroLlmConfig');
        localStorage.removeItem('bojroBatteryOpt');
        localStorage.removeItem('bojro_model_visibility'); 
        localStorage.removeItem('comfyHost');
        
        // Reset global variables
        connectionConfig = {
            baseIp: "",
            portWebUI: 7860,
            portLlm: 1234,
            portWake: 5000,
            portComfy: 8188,
            isRemote: false,
            isConfigured: false
        };
        
        HOST = "";
        
        // Reset UI
        loadConnectionConfig();
        
        // Switch to CFG tab
        switchTab('cfg');
        
        if (Toast) Toast.show({
            text: 'Configuration Reset',
            duration: 'short'
        });
    }
}

// Test connection functions
window.connectToWebUI = async function() {
    if (!connectionConfig.baseIp) {
        alert('Please configure your connection settings first');
        switchTab('cfg');
        return;
    }
    
    if (LocalNotifications) {
        try {
            const perm = await LocalNotifications.requestPermissions();
            if (perm.display === 'granted') await createNotificationChannel();
            console.log("Permissions requested via LINK button");
        } catch (e) {
            console.warn("Notification permission error:", e);
        }
    }
    
    const btn = document.getElementById('webuiLinkBtn');
    
    updateConnectionStatus('webui', 'connecting');
    
    try {
        const url = buildWebUIUrl();
        const res = await fetch(`${url}/sdapi/v1/sd-models`, {
            headers: getHeaders()
        });
        
        if (!res.ok) throw new Error("Status " + res.status);
        
        // Update global HOST for backward compatibility
        HOST = url;
        localStorage.setItem('bojroHostIp', HOST);
        
        // Enable generation button
        document.getElementById('genBtn').disabled = false;
        
        // Fetch models, samplers, VAEs
        await Promise.all([fetchModels(), fetchSamplers(), fetchVaes()]);
        
        updateConnectionStatus('webui', 'connected');
        
        if (Toast) Toast.show({
            text: 'WebUI Linked Successfully',
            duration: 'short'
        });
    } catch (e) {
        updateConnectionStatus('webui', 'disconnected');
        alert("Failed to connect: " + e.message);
    }
}

window.connectToLlmService = async function() {
    if (!connectionConfig.baseIp) {
        alert('Please configure your connection settings first');
        switchTab('cfg');
        return;
    }
    
    const btn = document.getElementById('llmLinkBtn');
    
    updateConnectionStatus('llm', 'connecting');
    
    try {
        const url = buildLlmUrl();
        
        if (!CapacitorHttp) {
            throw new Error("Native HTTP Plugin not loaded!");
        }
        
        const response = await CapacitorHttp.get({
            url: `${url}/v1/models`,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
        
        const data = response.data;
        if (data.data && Array.isArray(data.data)) {
            const select = document.getElementById('llmModelSelect');
            select.innerHTML = "";
            data.data.forEach(m => {
                select.appendChild(new Option(m.id, m.id));
            });
            
            // Update LLM settings for backward compatibility
            llmSettings.baseUrl = url;
            localStorage.setItem('bojroLlmConfig', JSON.stringify(llmSettings));
            
            updateConnectionStatus('llm', 'connected');
            
            if (Toast) Toast.show({
                text: `Found ${data.data.length} models`,
                duration: 'short'
            });
        } else {
            throw new Error("Invalid model format");
        }
    } catch (e) {
        updateConnectionStatus('llm', 'disconnected');
        alert("Link Error: " + (e.message || JSON.stringify(e)));
    }
}

// Enhanced wake signal using centralized config
window.sendPowerSignal = async function() {
    if (!connectionConfig.baseIp) {
        alert('Please configure your connection settings first');
        switchTab('cfg');
        return;
    }
    
    const btn = document.getElementById('power-btn-mini');
    const serverUrl = buildWakeUrl();
    
    if (!serverUrl) {
        alert("Invalid wake server configuration");
        return;
    }
    
    // Visual Feedback
    btn.classList.add('active');
    if (Toast) Toast.show({
        text: 'Sending Wake Signal...',
        duration: 'short'
    });
    
    try {
        await fetch(serverUrl, {
            method: 'POST'
        });
        
        if (Toast) Toast.show({
            text: 'Signal Sent! Starting Services...',
            duration: 'long'
        });
        
        setTimeout(() => {
            btn.classList.remove('active');
        }, 3000);
        
    } catch (error) {
        console.error(error);
        if (Toast) Toast.show({
            text: 'Signal Sent (Or Check Connection)',
            duration: 'short'
        });
        btn.classList.remove('active');
    }
}

// Initialize configuration on page load
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('cfgBaseIp')) {
        loadConnectionConfig();
    }
    
    loadModelVisibility(); 

    // Initialize connection status displays
    updateConnectionStatus('webui', 'disconnected');
    updateConnectionStatus('llm', 'disconnected');
});

// Add CFG tab support to switchTab function
const originalSwitchTab = window.switchTab;
window.switchTab = function(view) {
    if (originalSwitchTab) {
        originalSwitchTab(view);
    }
    
    // Handle CFG tab specifically
    if (view === 'cfg') {
        const items = document.querySelectorAll('.dock-item');
        items.forEach(item => item.classList.remove('active'));
        // Find 6th item safely
        if(items.length > 5) items[5].classList.add('active'); 
        
        // Load configuration into UI
        loadConnectionConfig();
    }
};

// --- INTERFACE VISIBILITY LOGIC (UPDATED FOR COMFY) ---

window.loadModelVisibility = function() {
    const saved = localStorage.getItem('bojro_model_visibility');
    const config = saved ? JSON.parse(saved) : { xl: true, flux: true, qwen: true, comfy: false };

    const elXl = document.getElementById('cfgShowXl');
    const elFlux = document.getElementById('cfgShowFlux');
    const elQwen = document.getElementById('cfgShowQwen');
    const elComfy = document.getElementById('cfgShowComfy'); 

    if (elXl) elXl.checked = config.xl;
    if (elFlux) elFlux.checked = config.flux;
    if (elQwen) elQwen.checked = config.qwen;
    if (elComfy) elComfy.checked = config.comfy; 

    applyModelVisibility(config);
}

window.saveModelVisibility = function() {
    const config = {
        xl: document.getElementById('cfgShowXl').checked,
        flux: document.getElementById('cfgShowFlux').checked,
        qwen: document.getElementById('cfgShowQwen').checked,
        comfy: document.getElementById('cfgShowComfy').checked 
    };
    localStorage.setItem('bojro_model_visibility', JSON.stringify(config));
    applyModelVisibility(config);
}

function applyModelVisibility(config) {
    const btnXl = document.getElementById('btn-xl');
    const btnFlux = document.getElementById('btn-flux');
    const btnQwen = document.getElementById('btn-qwen');
    const dockComfy = document.getElementById('dock-comfy'); 

    if (btnXl) config.xl ? btnXl.classList.remove('hidden') : btnXl.classList.add('hidden');
    if (btnFlux) config.flux ? btnFlux.classList.remove('hidden') : btnFlux.classList.add('hidden');
    if (btnQwen) config.qwen ? btnQwen.classList.remove('hidden') : btnQwen.classList.add('hidden');
    
    if (dockComfy) config.comfy ? dockComfy.classList.remove('hidden') : dockComfy.classList.add('hidden');
}