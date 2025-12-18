// Initialize Icons
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// --- CAPACITOR PLUGINS ---
const Filesystem = window.Capacitor ? window.Capacitor.Plugins.Filesystem : null;
const Toast = window.Capacitor ? window.Capacitor.Plugins.Toast : null;
const LocalNotifications = window.Capacitor ? window.Capacitor.Plugins.LocalNotifications : null;
const App = window.Capacitor ? window.Capacitor.Plugins.App : null;
const CapacitorHttp = window.Capacitor ? window.Capacitor.Plugins.CapacitorHttp : null;
const ResolverService = window.Capacitor ? window.Capacitor.Plugins.ResolverService : null;

// --- STATE ---
let currentMode = 'xl';
let currentTask = 'txt'; // 'txt', 'inp'
let currentInpaintMode = 'fill'; // 'fill' (Whole) or 'mask' (Only Masked)
let currentBrushMode = 'draw'; // 'draw' or 'erase'
let db;

// EDITOR STATE
let editorImage = null;
let editorScale = 1;
let editorTranslateX = 0;
let editorTranslateY = 0;
let editorMinScale = 1;
let editorTargetW = 1024;
let editorTargetH = 1024;
let cropBox = {
    x: 0,
    y: 0,
    w: 0,
    h: 0
};

let isEditorActive = false;
let pinchStartDist = 0;
let panStart = {
    x: 0,
    y: 0
};
let startScale = 1;
let startTranslate = {
    x: 0,
    y: 0
};

// MAIN CANVAS STATE (Inpainting)
let mainCanvas, mainCtx;
let maskCanvas, maskCtx; // Hidden canvas for mask logic (Black/White)
let sourceImageB64 = null; // The final cropped image string
let isDrawing = false;
let historyStates = [];

// DATA & PAGINATION
let historyImagesData = [];
let currentGalleryImages = [];
let currentGalleryIndex = 0;
let galleryPage = 1;
const ITEMS_PER_PAGE = 50;

// LoRA Configuration Storage
let loraConfigs = {};
let HOST = "";

// QUEUE PERSISTENCE
let queueState = {
    ongoing: [],
    next: [],
    completed: []
};
let isQueueRunning = false;
let totalBatchSteps = 0;
let currentBatchProgress = 0;
let isSingleJobRunning = false;

let isSelectionMode = false;
let selectedImageIds = new Set();
let currentAnalyzedPrompts = null;

let llmSettings = {
    baseUrl: 'http://localhost:11434',
    key: '',
    model: '',
    system_xl: `You are a Prompt Generator for Image Generation. OBJECTIVE: Convert user concepts into a dense, highly detailed string of comma-separated tags.`,
    system_flux: `You are a Image Prompter. OBJECTIVE: Convert user concepts into a detailed, natural language description.`,
    system_qwen: `You are a Prompt Generator for Z-Image Turbo. OBJECTIVE: Precise, high-fidelity natural language descriptions.`
};
let llmState = {
    xl: {
        input: "",
        output: ""
    },
    flux: {
        input: "",
        output: ""
    },
    qwen: {
        input: "",
        output: ""
    }
};
let activeLlmMode = 'xl';

// --- INITIALIZATION ---
window.onload = function() {
    try {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        injectConfigModal();
        loadHostIp();
        loadQueueState();
        renderQueueAll();
        loadAutoDlState();
        setupBackgroundListeners();
        createNotificationChannel();
        loadLlmSettings();
        loadPowerSettings();

        // Init Inpainting Systems
        initMainCanvas();
        setupEditorEvents();

        // Battery Check
        if (!localStorage.getItem('bojroBatteryOpt')) {
            const batModal = document.getElementById('batteryModal');
            if (batModal) batModal.classList.remove('hidden');
        }

        // Auto-Connect
        if (document.getElementById('hostIp').value) {
            console.log("Auto-connecting...");
            window.connect(true);
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

// --- UTILITIES ---

function injectConfigModal() {
    if (document.getElementById('loraConfigModal')) return;
    const div = document.createElement('div');
    div.id = 'loraConfigModal';
    div.className = 'modal hidden';
    div.innerHTML = `
        <div class="modal-content" style="max-height: 60vh;">
            <div class="modal-header">
                <h3 id="cfgLoraTitle" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;">Config</h3>
                <button class="close-btn" onclick="closeConfigModal()">×</button>
            </div>
            <div class="col" style="gap: 15px; padding: 10px 0;">
                <div>
                    <label style="display:flex; justify-content:space-between;">
                        <span>Preferred Weight</span>
                        <span id="cfgWeightDisplay" style="color:var(--accent-primary);">1.0</span>
                    </label>
                    <input type="range" id="cfgWeight" class="orange-slider" min="-2" max="2" step="0.1" value="1" oninput="updateWeightDisplay(this.value)" style="margin-top:5px;">
                </div>
                <div>
                    <label>Activation / Trigger Text</label>
                    <textarea id="cfgTrigger" rows="3" placeholder="trigger, words, here" style="margin-top:5px;"></textarea>
                </div>
                <button id="cfgSaveBtn" class="btn-small" style="background: var(--accent-gradient); color: white; margin-top:10px;">SAVE CONFIG</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}
// *** BATTERY FIX: Dynamic Plugin Access ***
window.requestBatteryPerm = function() {
    // FIX: Grab plugin dynamically to solve initialization race condition
    const svc = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ResolverService) ? window.Capacitor.Plugins.ResolverService : ResolverService;

    if (svc) {
        svc.requestBatteryOpt();
    } else {
        console.log("ResolverService plugin not found");
    }

    localStorage.setItem('bojroBatteryOpt', 'true');
    document.getElementById('batteryModal').classList.add('hidden');
    if (Toast) Toast.show({
        text: 'Opening Settings...',
        duration: 'short'
    });
}

window.skipBatteryPerm = function() {
    localStorage.setItem('bojroBatteryOpt', 'true');
    document.getElementById('batteryModal').classList.add('hidden');
}

function loadQueueState() {
    const saved = localStorage.getItem('bojroQueueState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.ongoing) queueState.ongoing = parsed.ongoing;
            if (parsed.next) queueState.next = parsed.next;
            if (parsed.completed) queueState.completed = parsed.completed;
            updateQueueBadge();
        } catch (e) {}
    }
}

function saveQueueState() {
    localStorage.setItem('bojroQueueState', JSON.stringify(queueState));
    updateQueueBadge();
}

function updateQueueBadge() {
    const totalPending = queueState.ongoing.length + queueState.next.length;
    const badge = document.getElementById('queueBadge');
    if (badge) {
        badge.innerText = totalPending;
        badge.classList.toggle('hidden', totalPending === 0);
    }
}

async function createNotificationChannel() {
    if (!LocalNotifications) return;
    try {
        await LocalNotifications.createChannel({
            id: 'gen_complete_channel',
            name: 'Generation Complete',
            importance: 4,
            visibility: 1,
            vibration: true
        });
        await LocalNotifications.createChannel({
            id: 'batch_channel',
            name: 'Generation Status',
            importance: 2,
            visibility: 1,
            vibration: false
        });
    } catch (e) {}
}

function setupBackgroundListeners() {
    if (!App) return;
    App.addListener('resume', async () => {
        if (LocalNotifications) {
            try {
                const pending = await LocalNotifications.getPending();
                if (pending.notifications.length > 0) await LocalNotifications.cancel(pending);
            } catch (e) {}
        }
        // Only auto-connect if we don't have models loaded
        if (document.getElementById('hostIp').value) {
            window.connect(true);
        }
    });
}

async function updateBatchNotification(title, force = false, body = "") {
    let progressVal = 0;
    try {
        if (body && body.includes(" / ")) {
            const parts = body.split(" / ");
            const current = parseInt(parts[0].replace(/\D/g, '')) || 0;
            const total = parseInt(parts[1].replace(/\D/g, '')) || 1;
            if (total > 0) progressVal = Math.floor((current / total) * 100);
        }
    } catch (e) {
        progressVal = 0;
    }

    if (ResolverService) {
        try {
            await ResolverService.updateProgress({
                title: title,
                body: body,
                progress: progressVal
            });
            return;
        } catch (e) {
            console.error("Native Service Error:", e);
        }
    }
}

async function sendCompletionNotification(msg) {
    if (LocalNotifications) {
        try {
            await LocalNotifications.schedule({
                notifications: [{
                    title: "Mission Complete",
                    body: msg,
                    id: 2002,
                    channelId: 'gen_complete_channel',
                    smallIcon: "ic_launcher"
                }]
            });
        } catch (e) {}
    }
}

window.toggleTheme = function() {
    const root = document.documentElement;
    if (root.getAttribute('data-theme') === 'light') {
        root.removeAttribute('data-theme');
        document.getElementById('themeToggle').innerHTML = '<i data-lucide="sun"></i>';
    } else {
        root.setAttribute('data-theme', 'light');
        document.getElementById('themeToggle').innerHTML = '<i data-lucide="moon"></i>';
    }
    lucide.createIcons();
}

const getHeaders = () => ({
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
});

async function saveToMobileGallery(base64Data) {
    try {
        const isNative = window.Capacitor && window.Capacitor.isNative;
        if (isNative) {
            const cleanBase64 = base64Data.split(',')[1];
            const fileName = `Bojro_${Date.now()}.png`;
            try {
                await Filesystem.mkdir({
                    path: 'Resolver',
                    directory: 'DOCUMENTS',
                    recursive: false
                });
            } catch (e) {}
            await Filesystem.writeFile({
                path: `Resolver/${fileName}`,
                data: cleanBase64,
                directory: 'DOCUMENTS'
            });
            if (Toast) await Toast.show({
                text: 'Image saved to Documents/Resolver',
                duration: 'short',
                position: 'bottom'
            });
        } else {
            const link = document.createElement('a');
            link.href = base64Data;
            link.download = `Bojro_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch (e) {
        console.error("Save failed", e);
    }
}

// *** FIXED VRAM PROFILE LOGIC FOR FLUX (12GB 3060) ***
function getVramMapping() {
    const profile = document.getElementById('vramProfile').value;
    switch (profile) {
        case 'low':
            // "Neo" Safety Mode: Reserves 6GB.
            // Available: ~6GB. Forces aggressive offloading. Safe but might slow down main model.
            return 6144; 
        case 'mid':
            // "Goldilocks Zone": Reserves 4.5 GB.
            // Logic: 12GB - 4.5GB = 7.5GB Available.
            // Flux (6.65) fits.
            // Remaining ~0.85GB -> Too small for T5 (4.55GB) -> T5 forced to RAM.
            return 4608; 
        case 'high':
            // "Risky": Reserves 1GB.
            // Available: ~11GB. Tries to fit everything. Risk of OOM/Swap.
            return 1024; 
        default:
            return 4608;
    }
}

// DB
const request = indexedDB.open("BojroHybridDB", 1);
request.onupgradeneeded = e => {
    db = e.target.result;
    db.createObjectStore("images", {
        keyPath: "id",
        autoIncrement: true
    });
};
request.onsuccess = e => {
    db = e.target.result;
    loadGallery();
};

function saveImageToDB(base64) {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve(null);
            return;
        }
        const tx = db.transaction(["images"], "readwrite");
        const store = tx.objectStore("images");
        const req = store.add({
            data: base64,
            date: new Date().toLocaleString()
        });
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
    });
}

window.clearDbGallery = function() {
    if (confirm("Delete entire history? This cannot be undone.")) {
        const tx = db.transaction(["images"], "readwrite");
        tx.objectStore("images").clear();
        tx.oncomplete = () => {
            isSelectionMode = false;
            selectedImageIds.clear();
            document.getElementById('galDeleteBtn').classList.add('hidden');
            galleryPage = 1;
            loadGallery();
        };
    }
}

// -----------------------------------------------------------
// FIXED: IMAGE EDITOR LOGIC (CANVAS-BASED)
// -----------------------------------------------------------

function setupEditorEvents() {
    const cvs = document.getElementById('editorCanvas');
    if (!cvs) return;

    cvs.style.touchAction = 'none';

    // Touch
    cvs.addEventListener('touchstart', handleTouchStart, {
        passive: false
    });
    cvs.addEventListener('touchmove', handleTouchMove, {
        passive: false
    });
    cvs.addEventListener('touchend', handleTouchEnd);

    // Mouse
    cvs.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

window.openEditorFromFile = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const img = new Image();
        img.src = evt.target.result;
        img.onload = () => {
            editorImage = img;

            // 1. Show modal FIRST to ensure canvas has dimensions
            document.getElementById('editorModal').classList.remove('hidden');

            // 2. Wait for layout, then calculate dimensions and force center (Late Init)
            setTimeout(() => {
                editorTargetW = 1024;
                editorTargetH = 1024;
                recalcEditorLayout();
                resetEditorView();
            }, 50);
        };
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

window.setEditorRatio = function(targetW, targetH) {
    editorTargetW = targetW;
    editorTargetH = targetH;
    recalcEditorLayout();
    resetEditorView();
}

function recalcEditorLayout() {
    if (!editorImage) return;
    const viewport = document.getElementById('editorViewport');
    const cvs = document.getElementById('editorCanvas');

    // 1. Resize canvas to match screen
    cvs.width = viewport.clientWidth;
    cvs.height = viewport.clientHeight;

    // 2. Calculate Box Size (fit within canvas with padding)
    const padding = 20;
    const availableW = cvs.width - (padding * 2);
    const availableH = cvs.height - (padding * 2);

    const targetRatio = editorTargetW / editorTargetH;

    let boxW = availableW;
    let boxH = boxW / targetRatio;

    if (boxH > availableH) {
        boxH = availableH;
        boxW = boxH * targetRatio;
    }

    // 3. Center the box
    cropBox = {
        x: (cvs.width - boxW) / 2,
        y: (cvs.height - boxH) / 2,
        w: boxW,
        h: boxH
    };

    drawEditor();
}

function resetEditorView() {
    if (!editorImage) return;

    // Calculate min scale to cover the crop box
    const scaleW = cropBox.w / editorImage.naturalWidth;
    const scaleH = cropBox.h / editorImage.naturalHeight;
    editorMinScale = Math.max(scaleW, scaleH);

    // Set current scale to min (cover)
    editorScale = editorMinScale;

    // Center image relative to the CANVAS center
    editorTranslateX = (document.getElementById('editorCanvas').width - (editorImage.naturalWidth * editorScale)) / 2;
    editorTranslateY = (document.getElementById('editorCanvas').height - (editorImage.naturalHeight * editorScale)) / 2;

    // Reset Sliders
    document.getElementById('editScale').value = 1;
    document.getElementById('editX').value = 0;
    document.getElementById('editY').value = 0;

    drawEditor();
}

window.updateEditorTransform = function() {
    if (!editorImage) return;

    const scaleMult = parseFloat(document.getElementById('editScale').value);
    const offX = parseFloat(document.getElementById('editX').value);
    const offY = parseFloat(document.getElementById('editY').value);

    const cvs = document.getElementById('editorCanvas');

    // Calculate current dimensions
    const currentW = editorImage.naturalWidth * (editorMinScale * scaleMult);
    const currentH = editorImage.naturalHeight * (editorMinScale * scaleMult);

    // Base is centered relative to canvas
    const baseX = (cvs.width - currentW) / 2;
    const baseY = (cvs.height - currentH) / 2;

    editorScale = editorMinScale * scaleMult;
    editorTranslateX = baseX + offX;
    editorTranslateY = baseY + offY;

    drawEditor();
}

function drawEditor() {
    if (!editorImage) return;
    const cvs = document.getElementById('editorCanvas');
    const ctx = cvs.getContext('2d');

    // 1. Clear
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // 2. Draw Image (Transformed)
    ctx.save();
    ctx.translate(editorTranslateX, editorTranslateY);
    ctx.scale(editorScale, editorScale);
    ctx.drawImage(editorImage, 0, 0);
    ctx.restore();

    // 3. Draw Dimmed Overlay with "Hole" using Path Winding
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    // Outer Rectangle (Clockwise)
    ctx.rect(0, 0, cvs.width, cvs.height);
    // Inner Rectangle (Counter-Clockwise) -> Creates Hole
    ctx.rect(cropBox.x + cropBox.w, cropBox.y, -cropBox.w, cropBox.h);
    ctx.fill();

    // 4. Draw Border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
}

// Touch Handling
function handleTouchStart(e) {
    if (e.target.closest('input')) return;
    e.preventDefault();
    if (e.touches.length === 2) {
        pinchStartDist = getDist(e.touches[0], e.touches[1]);
        startScale = editorScale;
        startTranslate = {
            x: editorTranslateX,
            y: editorTranslateY
        };
    } else if (e.touches.length === 1) {
        isEditorActive = true;
        panStart = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
        startTranslate = {
            x: editorTranslateX,
            y: editorTranslateY
        };
    }
}

function handleTouchMove(e) {
    if (e.target.closest('input')) return;
    e.preventDefault();
    if (e.touches.length === 2 && pinchStartDist > 0) {
        const dist = getDist(e.touches[0], e.touches[1]);
        const scaleFactor = dist / pinchStartDist;
        editorScale = startScale * scaleFactor;

        const cvs = document.getElementById('editorCanvas');
        const centerX = cvs.width / 2;
        const centerY = cvs.height / 2;
        editorTranslateX = centerX - (centerX - startTranslate.x) * scaleFactor;
        editorTranslateY = centerY - (centerY - startTranslate.y) * scaleFactor;
        drawEditor();
    } else if (e.touches.length === 1 && isEditorActive) {
        const dx = e.touches[0].clientX - panStart.x;
        const dy = e.touches[0].clientY - panStart.y;
        editorTranslateX = startTranslate.x + dx;
        editorTranslateY = startTranslate.y + dy;
        drawEditor();
    }
}

function handleTouchEnd() {
    isEditorActive = false;
    pinchStartDist = 0;
}

function handleMouseDown(e) {
    isEditorActive = true;
    panStart = {
        x: e.clientX,
        y: e.clientY
    };
    startTranslate = {
        x: editorTranslateX,
        y: editorTranslateY
    };
}

function handleMouseMove(e) {
    if (!isEditorActive) return;
    e.preventDefault();
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    editorTranslateX = startTranslate.x + dx;
    editorTranslateY = startTranslate.y + dy;
    drawEditor();
}

function handleMouseUp() {
    isEditorActive = false;
}

function getDist(t1, t2) {
    return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
}

window.applyEditorChanges = function() {
    const finalCvs = document.createElement('canvas');
    finalCvs.width = editorTargetW;
    finalCvs.height = editorTargetH;
    const ctx = finalCvs.getContext('2d');

    // Map visual crop box coords to image coords
    const relX = cropBox.x - editorTranslateX;
    const relY = cropBox.y - editorTranslateY;

    const sourceX = relX / editorScale;
    const sourceY = relY / editorScale;
    const sourceW = cropBox.w / editorScale;
    const sourceH = cropBox.h / editorScale;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(editorImage, sourceX, sourceY, sourceW, sourceH, 0, 0, editorTargetW, editorTargetH);

    sourceImageB64 = finalCvs.toDataURL('image/png');
    resetInpaintCanvas();

    document.getElementById('img-input-container').style.display = 'none';
    document.getElementById('canvasWrapper').classList.remove('hidden');
    document.getElementById('editorModal').classList.add('hidden');

    const mode = currentMode;
    document.getElementById(`${mode}_width`).value = editorTargetW;
    document.getElementById(`${mode}_height`).value = editorTargetH;
}

window.closeEditor = () => document.getElementById('editorModal').classList.add('hidden');

// --- INPAINTING CANVAS LOGIC ---
function initMainCanvas() {
    mainCanvas = document.getElementById('paintCanvas');
    if (!mainCanvas) return;
    mainCtx = mainCanvas.getContext('2d');
    maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas.getContext('2d');

    mainCanvas.style.touchAction = 'none';

    mainCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startPaint(e.touches[0]);
    }, {
        passive: false
    });
    mainCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        painting(e.touches[0]);
    }, {
        passive: false
    });
    mainCanvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopPaint();
    }, {
        passive: false
    });

    mainCanvas.addEventListener('mousedown', startPaint);
    mainCanvas.addEventListener('mousemove', painting);
    mainCanvas.addEventListener('mouseup', stopPaint);
    mainCanvas.addEventListener('mouseleave', stopPaint);
}

// FIX: Set image as background instead of drawing it (allows real erasing)
function resetInpaintCanvas() {
    if (!sourceImageB64) return;

    // 1. Set CSS Background
    mainCanvas.width = editorTargetW;
    mainCanvas.height = editorTargetH;
    mainCanvas.style.backgroundImage = `url(${sourceImageB64})`;
    mainCanvas.style.backgroundSize = "100% 100%";

    // 2. Clear Visual Canvas (It should only hold strokes)
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

    // 3. Reset Mask Canvas (Solid Black)
    maskCanvas.width = editorTargetW;
    maskCanvas.height = editorTargetH;
    maskCtx.fillStyle = "black";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    historyStates = [];
    saveHistory();
}

function startPaint(e) {
    isDrawing = true;
    const rect = mainCanvas.getBoundingClientRect();
    const scaleX = mainCanvas.width / rect.width;
    const scaleY = mainCanvas.height / rect.height;

    const clientX = e.clientX;
    const clientY = e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    mainCtx.beginPath();
    mainCtx.moveTo(x, y);
    maskCtx.beginPath();
    maskCtx.moveTo(x, y);
}

function painting(e) {
    if (!isDrawing) return;
    const rect = mainCanvas.getBoundingClientRect();
    const scaleX = mainCanvas.width / rect.width;
    const scaleY = mainCanvas.height / rect.height;

    const clientX = e.clientX;
    const clientY = e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const size = document.getElementById('brushSize').value;

    mainCtx.lineWidth = size;
    mainCtx.lineCap = 'round';
    mainCtx.lineJoin = 'round';
    maskCtx.lineWidth = size;
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';

    if (currentBrushMode === 'draw') {
        // Draw Orange on Visual, White on Mask
        mainCtx.globalCompositeOperation = 'source-over';
        mainCtx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.strokeStyle = 'white';
    } else {
        // FIX: Erase mode should remove orange (destination-out) and paint black on mask
        mainCtx.globalCompositeOperation = 'destination-out';
        mainCtx.strokeStyle = 'rgba(0,0,0,1)'; // Color doesn't matter for dest-out

        maskCtx.globalCompositeOperation = 'source-over'; // Paint over with black
        maskCtx.strokeStyle = 'black';
    }

    mainCtx.lineTo(x, y);
    mainCtx.stroke();
    maskCtx.lineTo(x, y);
    maskCtx.stroke();
}

function stopPaint() {
    if (isDrawing) {
        isDrawing = false;
        mainCtx.closePath();
        maskCtx.closePath();
        mainCtx.globalCompositeOperation = 'source-over';
        // FIX: Removed destructive logic that was wiping the canvas
        saveHistory();
    }
}

function saveHistory() {
    if (historyStates.length > 10) historyStates.shift();
    historyStates.push({
        visual: mainCanvas.toDataURL(),
        mask: maskCanvas.toDataURL()
    });
}

window.undoLastStroke = function() {
    if (historyStates.length > 1) {
        historyStates.pop();
        const lastState = historyStates[historyStates.length - 1];
        const imgV = new Image();
        imgV.src = lastState.visual;
        const imgM = new Image();
        imgM.src = lastState.mask;
        imgV.onload = () => {
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            mainCtx.drawImage(imgV, 0, 0);
        };
        imgM.onload = () => {
            maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            maskCtx.drawImage(imgM, 0, 0);
        }
    } else {
        resetInpaintCanvas();
    }
}

window.clearMask = () => resetInpaintCanvas();
window.setBrushMode = function(mode) {
    currentBrushMode = mode;
    document.querySelectorAll('#inpaintControls .toggle-opt').forEach(el => el.classList.remove('active'));
    document.getElementById(`tool-${mode}`).classList.add('active');
}
window.setInpaintMode = function(mode) {
    currentInpaintMode = mode;
    document.getElementById('mode-fill').classList.toggle('active', mode === 'fill');
    document.getElementById('mode-mask').classList.toggle('active', mode === 'mask');
}

// -----------------------------------------------------------
// GENERAL APP LOGIC
// -----------------------------------------------------------

window.switchTab = function(view) {
    document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-' + view).classList.remove('hidden');
    const items = document.querySelectorAll('.dock-item');
    items.forEach(item => item.classList.remove('active'));
    if (view === 'gen') {
        items[0].classList.add('active');
        currentTask = 'txt';
    }
    if (view === 'inp') {
        items[1].classList.add('active');
        currentTask = 'inp';
    }
    if (view === 'que') {
        items[2].classList.add('active');
        renderQueueAll();
    }
    if (view === 'gal') {
        items[3].classList.add('active');
        loadGallery();
    }
    if (view === 'ana') items[4].classList.add('active');
}

window.setMode = async function(mode) {
    // FIX 2: Universal VRAM Unload on Mode Switch (Restored behavior)
    if (currentMode !== mode) {
        if (HOST) {
            await unloadModel(true);
        }
    }

    currentMode = mode;
    const root = document.documentElement;
    const btnXL = document.getElementById('btn-xl');
    const btnFlux = document.getElementById('btn-flux');
    // --- NEO HOOK: QWEN BTN ---
    const btnQwen = document.getElementById('btn-qwen');

    const xlRow = document.getElementById('row-xl-model');
    const fluxRow = document.getElementById('row-flux-model');
    // --- NEO HOOK: QWEN ROW ---
    const qwenRow = document.getElementById('row-qwen-model');

    const xlCont = document.getElementById('mode-xl-container');
    const fluxCont = document.getElementById('mode-flux-container');
    // --- NEO HOOK: QWEN CONT ---
    const qwenCont = document.getElementById('mode-qwen-container');

    // Reset all
    btnXL.classList.remove('active');
    btnFlux.classList.remove('active');
    if (btnQwen) btnQwen.classList.remove('active');

    xlRow.classList.add('hidden');
    fluxRow.classList.add('hidden');
    if (qwenRow) qwenRow.classList.add('hidden');

    xlCont.classList.add('hidden');
    fluxCont.classList.add('hidden');
    if (qwenCont) qwenCont.classList.add('hidden');

    if (mode === 'flux') {
        root.setAttribute('data-mode', 'flux');
        btnFlux.classList.add('active');
        fluxRow.classList.remove('hidden');
        fluxCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = "QUANTUM GENERATE";
        document.getElementById('appTitle').innerText = "BOJRO FLUX";
    } else if (mode === 'qwen') {
        // --- NEO HOOK: QWEN LOGIC ---
        root.setAttribute('data-mode', 'qwen');
        if (btnQwen) btnQwen.classList.add('active');
        if (qwenRow) qwenRow.classList.remove('hidden');
        if (qwenCont) qwenCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = "TURBO GENERATE";
        document.getElementById('appTitle').innerText = "BOJRO NEO";
    } else {
        root.removeAttribute('data-mode');
        btnXL.classList.add('active');
        xlRow.classList.remove('hidden');
        xlCont.classList.remove('hidden');
        document.getElementById('genBtn').innerText = "GENERATE";
        document.getElementById('appTitle').innerText = "BOJRO RESOLVER";
    }
}

function loadHostIp() {
    const ip = localStorage.getItem('bojroHostIp');
    if (ip) document.getElementById('hostIp').value = ip;
}

window.connect = async function(silent = false) {
    HOST = document.getElementById('hostIp').value.replace(/\/$/, "");
    const dot = document.getElementById('statusDot');
    if (!silent) dot.style.background = "yellow";

    try {
        if (LocalNotifications && !silent) {
            const perm = await LocalNotifications.requestPermissions();
            if (perm.display === 'granted') await createNotificationChannel();
        }

        const res = await fetch(`${HOST}/sdapi/v1/sd-models`, {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error("Status " + res.status);

        dot.style.background = "#00e676";
        dot.classList.add('on');
        localStorage.setItem('bojroHostIp', HOST);
        document.getElementById('genBtn').disabled = false;

        // MODIFIED: Fetch everything EXCEPT LoRAs (Lazy load them)
        // fetchLoras();  <-- Commented out to prevent startup freeze
        await Promise.all([fetchModels(), fetchSamplers(), fetchVaes()]);

        if (!silent)
            if (Toast) Toast.show({
                text: 'Server Linked Successfully',
                duration: 'short',
                position: 'center'
            });
    } catch (e) {
        dot.style.background = "#f44336";
        if (!silent) alert("Failed: " + e.message);
    }
}

async function fetchModels() {
    try {
        const res = await fetch(`${HOST}/sdapi/v1/sd-models`, {
            headers: getHeaders()
        });
        const data = await res.json();
        const selXL = document.getElementById('xl_modelSelect');
        selXL.innerHTML = "";
        const selFlux = document.getElementById('flux_modelSelect');
        selFlux.innerHTML = "";
        const selInp = document.getElementById('inp_modelSelect');
        selInp.innerHTML = "";
        data.forEach(m => {
            selXL.appendChild(new Option(m.model_name, m.title));
            selFlux.appendChild(new Option(m.model_name, m.title));
            selInp.appendChild(new Option(m.model_name, m.title));
        });
        ['xl', 'flux', 'inp'].forEach(mode => {
            const saved = localStorage.getItem('bojroModel_' + mode);
            if (saved) document.getElementById(mode + '_modelSelect').value = saved;
        });

        // --- NEO HOOK: POPULATE QWEN MODELS ---
        if (window.Neo && window.Neo.populateModels) window.Neo.populateModels(data);

    } catch (e) {}
}

async function fetchSamplers() {
    try {
        const res = await fetch(`${HOST}/sdapi/v1/samplers`, {
            headers: getHeaders()
        });
        const data = await res.json();
        const selXL = document.getElementById('xl_sampler');
        selXL.innerHTML = "";
        const selFlux = document.getElementById('flux_sampler');
        selFlux.innerHTML = "";
        const selInp = document.getElementById('inp_sampler');
        selInp.innerHTML = "";
        data.forEach(s => {
            selXL.appendChild(new Option(s.name, s.name));
            selInp.appendChild(new Option(s.name, s.name));
            const opt = new Option(s.name, s.name);
            if (s.name === "Euler") opt.selected = true;
            selFlux.appendChild(opt);
        });

        // --- NEO HOOK: POPULATE QWEN SAMPLERS ---
        if (window.Neo && window.Neo.populateSamplers) window.Neo.populateSamplers(data);

    } catch (e) {}
}

async function fetchVaes() {
    const slots = [document.getElementById('flux_vae'), document.getElementById('flux_clip'), document.getElementById('flux_t5')];
    slots.forEach(s => s.innerHTML = "<option value='Automatic'>Automatic</option>");
    let list = [];
    try {
        const res = await fetch(`${HOST}/sdapi/v1/sd-modules`, {
            headers: getHeaders()
        });
        const data = await res.json();
        if (data && data.length) {
            list = data.map(m => m.model_name);
            slots.forEach(sel => {
                list.forEach(name => {
                    if (name !== "Automatic" && !Array.from(sel.options).some(o => o.value === name)) sel.appendChild(new Option(name, name));
                });
            });
            // --- NEO HOOK: POPULATE DUAL (VAE/TE) for QWEN ---
            if (window.Neo && window.Neo.populateDual) window.Neo.populateDual(list);
        }
    } catch (e) {}
    ['flux_vae', 'flux_clip', 'flux_t5'].forEach(id => {
        const saved = localStorage.getItem('bojro_' + id);
        if (saved && Array.from(document.getElementById(id).options).some(o => o.value === saved)) document.getElementById(id).value = saved;
    });
    const savedBits = localStorage.getItem('bojro_flux_bits');
    if (savedBits) document.getElementById('flux_bits').value = savedBits;

    // --- NEO HOOK: RESTORE QWEN BITS ---
    const savedQwenBits = localStorage.getItem('bojro_qwen_bits');
    if (savedQwenBits && document.getElementById('qwen_bits')) document.getElementById('qwen_bits').value = savedQwenBits;
}

// Helper needed for the Smart Bridge (Neo/LoRA)
async function loadSidecarConfig(loraName, loraPath) {
    if (loraConfigs[loraName]) return loraConfigs[loraName];
    if (!loraPath) return {
        weight: 1.0,
        trigger: ""
    };
    try {
        const basePath = loraPath.substring(0, loraPath.lastIndexOf('.'));
        const jsonUrl = `${HOST}/file=${basePath}.json`;
        const res = await fetch(jsonUrl);
        if (res.ok) {
            const data = await res.json();
            const newConfig = {
                weight: data["preferred weight"] || data["weight"] || 1.0,
                trigger: data["activation text"] || data["trigger words"] || data["trigger"] || ""
            };
            loraConfigs[loraName] = newConfig;
            return newConfig;
        }
    } catch (e) {}
    return {
        weight: 1.0,
        trigger: ""
    };
}

window.saveSelection = function(key) {
    if (key === 'xl') localStorage.setItem('bojroModel_xl', document.getElementById('xl_modelSelect').value);
    else if (key === 'flux') localStorage.setItem('bojroModel_flux', document.getElementById('flux_modelSelect').value);
    else if (key === 'inp') localStorage.setItem('bojroModel_inp', document.getElementById('inp_modelSelect').value);
    else if (key === 'flux_bits') localStorage.setItem('bojro_flux_bits', document.getElementById('flux_bits').value);
    // --- NEO HOOK: SAVE QWEN ---
    else if (key === 'qwen') localStorage.setItem('bojroModel_qwen', document.getElementById('qwen_modelSelect').value);
    else if (key === 'qwen_bits') localStorage.setItem('bojro_qwen_bits', document.getElementById('qwen_bits').value);
}

window.saveTrident = function() {
    ['flux_vae', 'flux_clip', 'flux_t5'].forEach(id => localStorage.setItem('bojro_' + id, document.getElementById(id).value));
}

window.unloadModel = async function(silent = false) {
    if (!silent && !confirm("Unload current model?")) return;
    try {
        await fetch(`${HOST}/sdapi/v1/unload-checkpoint`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!silent) alert("Unloaded");
    } catch (e) {}
}

async function postOption(payload) {
    const res = await fetch(`${HOST}/sdapi/v1/options`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API Error " + res.status);
}

window.setRes = (mode, w, h) => {
    document.getElementById(`${mode}_width`).value = w;
    document.getElementById(`${mode}_height`).value = h;
}
window.flipRes = (mode) => {
    const w = document.getElementById(`${mode}_width`);
    const h = document.getElementById(`${mode}_height`);
    const t = w.value;
    w.value = h.value;
    h.value = t;
}

function normalize(str) {
    if (!str) return "";
    const noHash = str.split(' [')[0].trim();
    return noHash.replace(/\\/g, '/').split('/').pop().toLowerCase();
}

// --- LORA CONFIG MODAL (Legacy but useful for tweaking) ---
window.openLoraSettings = async (e, loraName, loraPath) => {
    e.stopPropagation();
    const modal = document.getElementById('loraConfigModal');
    modal.classList.remove('hidden');
    document.getElementById('cfgLoraTitle').innerText = "Loading...";

    let cfg = loraConfigs[loraName];
    if (!cfg) cfg = await loadSidecarConfig(loraName, loraPath);

    document.getElementById('cfgLoraTitle').innerText = loraName;
    document.getElementById('cfgWeight').value = cfg.weight;
    document.getElementById('cfgWeightDisplay').innerText = cfg.weight;
    document.getElementById('cfgTrigger').value = cfg.trigger;

    document.getElementById('cfgSaveBtn').onclick = () => {
        const newWeight = document.getElementById('cfgWeight').value;
        const newTrigger = document.getElementById('cfgTrigger').value;
        loraConfigs[loraName] = {
            weight: parseFloat(newWeight),
            trigger: newTrigger
        };
        localStorage.setItem('bojroLoraConfigs', JSON.stringify(loraConfigs));
        modal.classList.add('hidden');
        if (Toast) Toast.show({
            text: 'Saved',
            duration: 'short'
        });
    };
}

window.closeConfigModal = () => document.getElementById('loraConfigModal').classList.add('hidden');
window.updateWeightDisplay = (val) => document.getElementById('cfgWeightDisplay').innerText = val;

window.openLlmModal = (mode) => {
    activeLlmMode = mode;
    document.getElementById('llmModal').classList.remove('hidden');
    const inputEl = document.getElementById('llmInput');
    const outputEl = document.getElementById('llmOutput');
    inputEl.value = llmState[mode].input;
    outputEl.value = llmState[mode].output;
    let savedSys = llmSettings.system_xl;
    if (activeLlmMode === 'flux') savedSys = llmSettings.system_flux;
    else if (activeLlmMode === 'qwen') savedSys = llmSettings.system_qwen;
    document.getElementById('llmSystemPrompt').value = savedSys || "";
    updateLlmButtonState();
    if (!inputEl.value) inputEl.focus();
}

window.closeLlmModal = () => document.getElementById('llmModal').classList.add('hidden');
window.toggleLlmSettings = () => document.getElementById('llmSettingsBox').classList.toggle('hidden');
window.updateLlmState = function() {
    llmState[activeLlmMode].input = document.getElementById('llmInput').value;
}

function updateLlmButtonState() {
    const hasOutput = llmState[activeLlmMode].output.trim().length > 0;
    document.getElementById('llmGenerateBtn').innerText = hasOutput ? "ITERATE" : "GENERATE PROMPT";
}

function loadLlmSettings() {
    const s = localStorage.getItem('bojroLlmConfig');
    if (s) {
        const loaded = JSON.parse(s);
        llmSettings = { ...llmSettings,
            ...loaded
        };
        document.getElementById('llmApiBase').value = llmSettings.baseUrl || '';
        document.getElementById('llmApiKey').value = llmSettings.key || '';
        if (llmSettings.model) {
            const sel = document.getElementById('llmModelSelect');
            sel.innerHTML = `<option value="${llmSettings.model}">${llmSettings.model}</option>`;
            sel.value = llmSettings.model;
        }
    }
}

window.saveLlmGlobalSettings = function() {
    llmSettings.baseUrl = document.getElementById('llmApiBase').value.replace(/\/$/, "");
    llmSettings.key = document.getElementById('llmApiKey').value;
    llmSettings.model = document.getElementById('llmModelSelect').value;
    const sysVal = document.getElementById('llmSystemPrompt').value;
    if (activeLlmMode === 'xl') llmSettings.system_xl = sysVal;
    else if (activeLlmMode === 'flux') llmSettings.system_flux = sysVal;
    else if (activeLlmMode === 'qwen') llmSettings.system_qwen = sysVal;
    localStorage.setItem('bojroLlmConfig', JSON.stringify(llmSettings));
    if (Toast) Toast.show({
        text: 'Settings & Model Saved',
        duration: 'short'
    });
}

window.connectToLlm = async function() {
    if (!CapacitorHttp) return alert("Native HTTP Plugin not loaded! Rebuild App.");
    const baseUrl = document.getElementById('llmApiBase').value.replace(/\/$/, "");
    const key = document.getElementById('llmApiKey').value;
    if (!baseUrl) return alert("Enter Server URL first");

    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "...";
    btn.disabled = true;

    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (key) headers['Authorization'] = `Bearer ${key}`;
        const response = await CapacitorHttp.get({
            url: `${baseUrl}/v1/models`,
            headers: headers
        });
        const data = response.data;
        if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
        const select = document.getElementById('llmModelSelect');
        select.innerHTML = "";
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(m => {
                select.appendChild(new Option(m.id, m.id));
            });
            if (Toast) Toast.show({
                text: `Found ${data.data.length} models`,
                duration: 'short'
            });
        } else {
            throw new Error("Invalid model format");
        }
        document.getElementById('llmApiBase').value = baseUrl;
        saveLlmGlobalSettings();
    } catch (e) {
        alert("Link Error: " + (e.message || JSON.stringify(e)));
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

window.generateLlmPrompt = async function() {
    if (!CapacitorHttp) return alert("Native HTTP Plugin not loaded!");
    const btn = document.getElementById('llmGenerateBtn');
    const inputVal = document.getElementById('llmInput').value;
    const baseUrl = document.getElementById('llmApiBase').value.replace(/\/$/, "");
    const model = document.getElementById('llmModelSelect').value;
    if (!inputVal) return alert("Please enter an idea!");
    if (!baseUrl) return alert("Please connect to server first!");

    btn.disabled = true;
    btn.innerText = "GENERATING...";
    const sysPrompt = document.getElementById('llmSystemPrompt').value;
    // --- NEO HOOK: QWEN PROMPT CONTEXT ---
    const contextMode = activeLlmMode === 'qwen' ? 'Qwen/Turbo' : (activeLlmMode === 'xl' ? 'Sdxl' : 'Flux');
    const promptTemplate = `1.Prompt(natural language): ${inputVal} Model: ${contextMode}`;

    try {
        const payload = {
            model: model || "default",
            messages: [{
                role: "system",
                content: sysPrompt
            }, {
                role: "user",
                content: promptTemplate
            }],
            stream: false
        };
        const headers = {
            'Content-Type': 'application/json'
        };
        if (llmSettings.key) headers['Authorization'] = `Bearer ${llmSettings.key}`;
        const response = await CapacitorHttp.post({
            url: `${baseUrl}/v1/chat/completions`,
            headers: headers,
            data: payload
        });
        if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
        const data = response.data;
        let result = "";
        if (data.choices && data.choices[0] && data.choices[0].message) {
            result = data.choices[0].message.content;
        } else if (data.response) {
            result = data.response;
        }
        document.getElementById('llmOutput').value = result;
        llmState[activeLlmMode].output = result;
        updateLlmButtonState();
        if (Toast) Toast.show({
            text: 'Prompt Generated!',
            duration: 'short'
        });
    } catch (e) {
        alert("Generation failed: " + (e.message || JSON.stringify(e)));
    } finally {
        btn.disabled = false;
        updateLlmButtonState();
    }
}

window.useLlmPrompt = function() {
    const result = document.getElementById('llmOutput').value;
    if (!result) return alert("Generate a prompt first!");

    // --- NEO HOOK: TARGET QWEN PROMPT ---
    let targetId;
    if (activeLlmMode === 'xl') targetId = 'xl_prompt';
    else if (activeLlmMode === 'flux') targetId = 'flux_prompt';
    else if (activeLlmMode === 'qwen') targetId = 'qwen_prompt';

    document.getElementById(targetId).value = result;
    closeLlmModal();
    if (Toast) Toast.show({
        text: 'Applied to main prompt!',
        duration: 'short'
    });
}

// -----------------------------------------------------------
// JOB BUILDER & INPAINTING
// -----------------------------------------------------------

function buildJobFromUI() {
    // FIX 1: Prioritize Inpaint Task Check BEFORE Qwen Mode Check

    let payload = {};
    let overrides = {};
    // CRITICAL: Ensure we use the new calculated profiles
    overrides["forge_inference_memory"] = getVramMapping();
    overrides["forge_unet_storage_dtype"] = "Automatic (fp16 LoRA)";

    // If Inpainting, read from new controls
    if (currentTask === 'inp') {
        const model = document.getElementById('inp_modelSelect').value;
        const prompt = document.getElementById('inp_prompt').value;
        if (!model || model.includes('Loading')) return alert("Select Model");

        payload = {
            "prompt": prompt,
            "negative_prompt": document.getElementById('inp_neg').value,
            "steps": parseInt(document.getElementById('inp_steps').value),
            "cfg_scale": parseFloat(document.getElementById('inp_cfg').value),
            // Resize to editor crop resolution
            "width": editorTargetW,
            "height": editorTargetH,
            "sampler_name": document.getElementById('inp_sampler').value,
            "scheduler": document.getElementById('inp_scheduler').value,
            "batch_size": 1,
            "n_iter": 1,
            "save_images": true,
            "mask_blur": parseInt(document.getElementById('inp_mask_blur').value) || 4 //
        };

        if (!sourceImageB64) {
            alert("Image missing!");
            return null;
        }

        // init_images must be a list
        payload.init_images = [sourceImageB64.split(',')[1]];
        payload.denoising_strength = parseFloat(document.getElementById('denoisingStrength').value);
        payload.resize_mode = 0;

        if (maskCanvas) {
            const cleanMask = maskCanvas.toDataURL().split(',')[1];
            payload.mask = cleanMask;
            payload.inpainting_mask_invert = 0;

            // explicitly set inpainting_fill to 1 (Original) as default logic
            payload.inpainting_fill = 1;

            if (currentInpaintMode === 'mask') {
                // Masked Only Mode
                payload.inpaint_full_res = true;
                payload.inpaint_full_res_padding = 32;
            } else {
                // Whole Picture Mode
                payload.inpaint_full_res = false;
            }
        }

        // Soft Inpainting Logic 
        const useSoftInpaint = document.getElementById('inp_soft_inpaint').checked;
        if (useSoftInpaint) {
            payload.alwayson_scripts = {
                "soft inpainting": {
                    "args": [
                        true, // Enabled
                        1.0, // Schedule Bias
                        0.5, // Preservation Strength
                        4.0, // Transition Contrast Boost
                        0.0, // Mask Influence
                        0.5, // Difference Threshold
                        2.0 // Difference Contrast
                    ]
                }
            };
            // Recommendation: Increase mask blur slightly for soft inpainting
            if (payload.mask_blur < 8) payload.mask_blur = 8;
        }

        // Use Model Override logic for generic Inpaint
        // AND CRITICALLY: Unload any Flux/SDXL modules that might be lingering
        overrides["sd_model_checkpoint"] = model;
        overrides["forge_additional_modules"] = []; // FORCE CLEAR
        overrides["sd_vae"] = "Automatic"; // RESET VAE

        payload.override_settings = overrides;

        return {
            mode: 'inp',
            modelTitle: model,
            payload: payload,
            desc: `Inpaint: ${prompt.substring(0,20)}...`
        };
    }

    // --- NEO HOOK: DELEGATE TO NEO IF QWEN MODE ---
    // Moved below currentTask check to prevent hijacking
    if (currentMode === 'qwen' && window.Neo && window.Neo.buildJob) {
        return window.Neo.buildJob();
    }

    // Existing XL / Flux Logic
    const mode = currentMode;
    const targetModelTitle = mode === 'xl' ? document.getElementById('xl_modelSelect').value : document.getElementById('flux_modelSelect').value;
    if (!targetModelTitle || targetModelTitle.includes("Link first")) return null;

    if (mode === 'xl') {
        overrides["forge_additional_modules"] = [];
        overrides["sd_vae"] = "Automatic";
        payload = {
            "prompt": document.getElementById('xl_prompt').value,
            "negative_prompt": document.getElementById('xl_neg').value,
            "steps": parseInt(document.getElementById('xl_steps').value),
            "cfg_scale": parseFloat(document.getElementById('xl_cfg').value),
            "width": parseInt(document.getElementById('xl_width').value),
            "height": parseInt(document.getElementById('xl_height').value),
            "batch_size": parseInt(document.getElementById('xl_batch_size').value),
            "n_iter": parseInt(document.getElementById('xl_batch_count').value),
            "sampler_name": document.getElementById('xl_sampler').value,
            "scheduler": document.getElementById('xl_scheduler').value,
            "seed": parseInt(document.getElementById('xl_seed').value),
            "save_images": true,
            "override_settings": overrides
        };
    } else {
        const modulesList = [document.getElementById('flux_vae').value, document.getElementById('flux_clip').value, document.getElementById('flux_t5').value].filter(v => v && v !== "Automatic");
        if (modulesList.length > 0) overrides["forge_additional_modules"] = modulesList;
        
        const bits = document.getElementById('flux_bits').value;
        if (bits) overrides["forge_unet_storage_dtype"] = bits;
        
        const distCfg = parseFloat(document.getElementById('flux_distilled').value);
        payload = {
            "prompt": document.getElementById('flux_prompt').value,
            "negative_prompt": "",
            "steps": parseInt(document.getElementById('flux_steps').value),
            "cfg_scale": parseFloat(document.getElementById('flux_cfg').value),
            "distilled_cfg_scale": isNaN(distCfg) ? 3.5 : distCfg,
            "width": parseInt(document.getElementById('flux_width').value),
            "height": parseInt(document.getElementById('flux_height').value),
            "batch_size": parseInt(document.getElementById('flux_batch_size').value),
            "n_iter": parseInt(document.getElementById('flux_batch_count').value),
            "sampler_name": document.getElementById('flux_sampler').value,
            "scheduler": document.getElementById('flux_scheduler').value,
            "seed": parseInt(document.getElementById('flux_seed').value),
            "save_images": true,
            "override_settings": overrides
        };
    }
    return {
        mode: mode,
        modelTitle: targetModelTitle,
        payload: payload,
        desc: `${payload.prompt.substring(0, 30)}...`
    };
}

window.addToQueue = function() {
    const job = buildJobFromUI();
    if (!job) return alert("Please select a model first.");
    job.id = Date.now().toString();
    job.timestamp = new Date().toLocaleString();

    queueState.ongoing.push(job);
    saveQueueState();
    renderQueueAll();

    const badge = document.getElementById('queueBadge');
    badge.style.transform = "scale(1.5)";
    setTimeout(() => badge.style.transform = "scale(1)", 200);
}

function renderQueueAll() {
    renderList('ongoing', queueState.ongoing);
    renderList('next', queueState.next);
    renderList('completed', queueState.completed);
    updateQueueBadge();
}

function renderList(type, listData) {
    const container = document.getElementById(`list-${type}`);
    container.innerHTML = "";
    if (listData.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:11px;padding:10px;">Empty</div>`;
        return;
    }

    listData.forEach((job, index) => {
        const item = document.createElement('div');
        item.className = 'q-card';
        if (type !== 'completed') {
            item.draggable = true;
            item.ondragstart = (e) => dragStart(e, type, index);
        }
        let deleteBtn = `<button onclick="removeJob('${type}', ${index})" class="btn-icon" style="width:24px;height:24px;color:#f44336;border:none;"><i data-lucide="x" size="14"></i></button>`;
        const handle = type !== 'completed' ? `<div class="q-handle"><i data-lucide="grip-vertical" size="14"></i></div>` : "";
        item.innerHTML = `${handle}<div class="q-details"><div style="font-weight:bold; font-size:11px; color:var(--text-main);">${job.mode.toUpperCase()}</div><div class="q-meta">${job.desc}</div></div>${deleteBtn}`;
        container.appendChild(item);
    });
    lucide.createIcons();
}

window.removeJob = function(type, index) {
    queueState[type].splice(index, 1);
    saveQueueState();
    renderQueueAll();
}

window.clearQueueSection = function(type) {
    if (confirm(`Clear all ${type.toUpperCase()} items?`)) {
        queueState[type] = [];
        saveQueueState();
        renderQueueAll();
    }
}

let draggedItem = null;
window.dragStart = function(e, type, index) {
    draggedItem = {
        type,
        index
    };
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
}
window.allowDrop = function(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}
window.drop = function(e, targetType) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!draggedItem) return;
    if (draggedItem.type !== targetType) {
        const item = queueState[draggedItem.type].splice(draggedItem.index, 1)[0];
        queueState[targetType].push(item);
        saveQueueState();
        renderQueueAll();
    }
    document.querySelectorAll('.dragging').forEach(d => d.classList.remove('dragging'));
    draggedItem = null;
}

window.processQueue = async function() {
    if (isQueueRunning) return;
    if (queueState.ongoing.length === 0) return alert("Queue empty!");

    isQueueRunning = true;
    totalBatchSteps = queueState.ongoing.reduce((acc, job) => acc + ((job.payload.n_iter || 1) * job.payload.steps), 0);
    currentBatchProgress = 0;

    document.getElementById('queueProgressBox').classList.remove('hidden');
    const btn = document.getElementById('startQueueBtn');
    const oldText = btn.innerText;
    btn.innerText = "RUNNING...";
    btn.disabled = true;

    if (document.hidden) updateBatchNotification("Starting batch job...", true, `0 / ${totalBatchSteps} steps`);

    while (queueState.ongoing.length > 0) {
        const job = queueState.ongoing[0];
        try {
            await runJob(job, true);
            const finishedJob = queueState.ongoing.shift();
            finishedJob.finishedAt = new Date().toLocaleString();
            queueState.completed.push(finishedJob);
            saveQueueState();
            renderQueueAll();
        } catch (e) {
            console.error(e);
            updateBatchNotification("Batch Paused", true, "Error occurred");
            alert("Batch paused: " + e.message);
            break;
        }
    }
    isQueueRunning = false;
    btn.innerText = oldText;
    btn.disabled = false;
    document.getElementById('queueProgressBox').classList.add('hidden');

    // Stop persistent notification
    if (ResolverService) {
        try {
            await ResolverService.stop();
        } catch (e) {}
    }

    // Send completion notification
    await sendCompletionNotification("Batch Complete: All images ready.");

    if (queueState.ongoing.length === 0) alert("Batch Complete!");
}

window.generate = async function() {
    const job = buildJobFromUI();
    if (!job) return alert("Please select a model first.");
    isSingleJobRunning = true;
    await runJob(job, false);
    isSingleJobRunning = false;

    // Stop persistent notification
    if (ResolverService) {
        try {
            await ResolverService.stop();
        } catch (e) {}
    }

    // Send completion notification
    await sendCompletionNotification("Generation Complete: Image Ready");
}

window.clearGenResults = function() {
    if (currentTask === 'inp') {
        const gal = document.getElementById('inpGallery');
        if (gal) gal.innerHTML = '';
    } else {
        const gal = document.getElementById('gallery');
        if (gal) gal.innerHTML = '';
    }
}

async function runJob(job, isBatch = false) {
    // --- UPDATED ISOLATION LOGIC ---
    const isInpaintJob = job.mode === 'inp';

    // Select specific elements based on job mode
    const btnId = isInpaintJob ? 'inpGenBtn' : 'genBtn';
    const spinnerId = isInpaintJob ? 'inpLoadingSpinner' : 'loadingSpinner';
    const galleryId = isInpaintJob ? 'inpGallery' : 'gallery';

    const btn = document.getElementById(btnId);
    const spinner = document.getElementById(spinnerId);
    const gal = document.getElementById(galleryId);

    btn.disabled = true;
    spinner.style.display = 'block';

    try {
        let isReady = false;
        let attempts = 0;
        // Check if model is loaded. Logic:
        // 1. Get Options.
        // 2. Normalize Names.
        // 3. If mismatch, POST options.
        while (!isReady && attempts < 40) {
            const optsReq = await fetch(`${HOST}/sdapi/v1/options`, {
                headers: getHeaders()
            });
            const opts = await optsReq.json();

            // Normalize: lowercase, remove hash, remove path
            if (normalize(opts.sd_model_checkpoint) === normalize(job.modelTitle)) {
                isReady = true;
                break;
            }

            if (attempts % 5 === 0) {
                btn.innerText = `ALIGNING... (${attempts})`;
                // Force overrides here as well to ensure alignment
                const loadPayload = {
                    "sd_model_checkpoint": job.modelTitle,
                    "forge_unet_storage_dtype": "Automatic (fp16 LoRA)"
                };

                // CRITICAL FIX: If Inpainting, ensure we clear flux modules during alignment too
                if (job.mode === 'inp') {
                    loadPayload["forge_additional_modules"] = [];
                    loadPayload["sd_vae"] = "Automatic";
                }

                await postOption(loadPayload);
            }
            attempts++;
            await new Promise(r => setTimeout(r, 1500));
        }
        if (!isReady) throw new Error("Timeout: Server failed to load model.");

        btn.innerText = "PROCESSING...";
        await updateBatchNotification("Starting Generation", true, "Initializing...");

        const jobTotalSteps = (job.payload.n_iter || 1) * job.payload.steps;

        const progressInterval = setInterval(async () => {
            try {
                const res = await fetch(`${HOST}/sdapi/v1/progress`, {
                    headers: getHeaders()
                });
                const data = await res.json();
                if (data.state && data.state.sampling_steps > 0) {
                    const currentJobIndex = data.state.job_no || 0;
                    const currentStepInBatch = data.state.sampling_step;
                    const jobStep = (currentJobIndex * job.payload.steps) + currentStepInBatch;
                    btn.innerText = `Step ${jobStep}/${jobTotalSteps}`;
                    const msg = `Step ${jobStep} / ${jobTotalSteps}`;
                    if (isBatch) {
                        const actualTotal = currentBatchProgress + jobStep;
                        document.getElementById('queueProgressText').innerText = `Step ${actualTotal} / ${totalBatchSteps}`;
                        updateBatchNotification("Batch Running", false, `Step ${actualTotal} / ${totalBatchSteps}`);
                    } else {
                        updateBatchNotification("Generating...", false, msg);
                    }
                } else if (btn.innerText.includes("Step")) {
                    updateBatchNotification("Finalizing...", false, "Receiving Images...");
                }
            } catch (e) {}
        }, 1000);

        const endpoint = job.mode === 'inp' ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img';
        const res = await fetch(`${HOST}${endpoint}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(job.payload)
        });

        clearInterval(progressInterval);
        if (!res.ok) throw new Error("Server Error " + res.status);

        const data = await res.json();
        if (isBatch) currentBatchProgress += jobTotalSteps;

        if (data.images) {
            for (let i = 0; i < data.images.length; i++) {
                const b64 = data.images[i];
                const finalB64 = "data:image/png;base64," + b64;
                const newId = await saveImageToDB(finalB64);

                const img = document.createElement('img');
                img.src = finalB64;
                img.className = 'gen-result';
                img.loading = "lazy";
                img.onclick = () => window.openFullscreen([finalB64], 0, img, newId);

                if (gal.firstChild) gal.insertBefore(img, gal.firstChild);
                else gal.appendChild(img);
                const autoDl = document.getElementById('autoDlCheck');
                if (autoDl && autoDl.checked) saveToMobileGallery(finalB64);
            }
        }
    } catch (e) {
        throw e;
    } finally {
        spinner.style.display = 'none';
        btn.disabled = false;
        // --- NEO HOOK: BUTTON TEXT ---
        if (currentTask === 'inp') {
            btn.innerText = "GENERATE";
        } else {
            if (currentMode === 'xl') btn.innerText = "GENERATE";
            else if (currentMode === 'flux') btn.innerText = "QUANTUM GENERATE";
            else if (currentMode === 'qwen') btn.innerText = "TURBO GENERATE";
        }
    }
}

// ... [Keep existing Gallery/Analysis Logic] ...
function loadGallery() {
    const grid = document.getElementById('savedGalleryGrid');
    grid.innerHTML = "";
    if (!db) return;
    db.transaction(["images"], "readonly").objectStore("images").getAll().onsuccess = e => {
        const imgs = e.target.result;
        if (!imgs || imgs.length === 0) {
            grid.innerHTML = "<div style='text-align:center;color:#777;margin-top:20px;grid-column:1/-1;'>No images</div>";
            return;
        }

        const reversed = imgs.reverse();
        const totalPages = Math.ceil(reversed.length / ITEMS_PER_PAGE);
        if (galleryPage < 1) galleryPage = 1;
        if (galleryPage > totalPages) galleryPage = totalPages;

        const start = (galleryPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageItems = reversed.slice(start, end);
        historyImagesData = pageItems;

        pageItems.forEach((item, index) => {
            const container = document.createElement('div');
            container.style.position = 'relative';
            const img = document.createElement('img');
            img.src = item.data;
            img.className = 'gal-thumb';
            img.loading = 'lazy';
            img.onclick = () => {
                if (isSelectionMode) toggleSelectionForId(item.id, container);
                else window.openFullscreenFromGallery(index);
            };
            const tick = document.createElement('div');
            tick.className = 'gal-tick hidden';
            tick.innerHTML = '<i data-lucide="check-circle" size="24" color="#00e676" fill="black"></i>';
            tick.style.position = 'absolute';
            tick.style.top = '5px';
            tick.style.right = '5px';
            container.appendChild(img);
            container.appendChild(tick);
            container.dataset.id = item.id;
            grid.appendChild(container);
        });
        document.getElementById('pageIndicator').innerText = `Page ${galleryPage} / ${totalPages}`;
        document.getElementById('prevPageBtn').disabled = galleryPage === 1;
        document.getElementById('nextPageBtn').disabled = galleryPage === totalPages;
        lucide.createIcons();
    }
}

window.changeGalleryPage = function(dir) {
    galleryPage += dir;
    loadGallery();
}

window.toggleGallerySelectionMode = function() {
    isSelectionMode = !isSelectionMode;
    const btn = document.getElementById('galSelectBtn');
    const delBtn = document.getElementById('galDeleteBtn');
    if (isSelectionMode) {
        btn.style.background = "var(--accent-primary)";
        btn.style.color = "white";
        delBtn.classList.remove('hidden');
    } else {
        btn.style.background = "var(--input-bg)";
        btn.style.color = "var(--text-main)";
        delBtn.classList.add('hidden');
        selectedImageIds.clear();
        document.querySelectorAll('.gal-tick').forEach(t => t.classList.add('hidden'));
        updateDeleteBtn();
    }
}

function toggleSelectionForId(id, container) {
    const tick = container.querySelector('.gal-tick');
    if (selectedImageIds.has(id)) {
        selectedImageIds.delete(id);
        tick.classList.add('hidden');
    } else {
        selectedImageIds.add(id);
        tick.classList.remove('hidden');
    }
    updateDeleteBtn();
}

function updateDeleteBtn() {
    document.getElementById('galDeleteBtn').innerText = `DELETE (${selectedImageIds.size})`;
}

window.deleteSelectedImages = function() {
    if (selectedImageIds.size === 0) return;
    if (!confirm(`Delete ${selectedImageIds.size} images?`)) return;
    const tx = db.transaction(["images"], "readwrite");
    const store = tx.objectStore("images");
    selectedImageIds.forEach(id => store.delete(id));
    tx.oncomplete = () => {
        selectedImageIds.clear();
        isSelectionMode = false;
        document.getElementById('galSelectBtn').style.background = "var(--input-bg)";
        document.getElementById('galDeleteBtn').classList.add('hidden');
        loadGallery();
    };
}

window.openFullscreenFromGallery = function(index) {
    currentGalleryImages = [...historyImagesData];
    currentGalleryIndex = index;
    updateLightboxImage();
    document.getElementById('fullScreenModal').classList.remove('hidden');
}
window.openFullscreen = function(imagesArray, index, domElement = null, dbId = null) {
    currentGalleryImages = imagesArray.map(b64 => ({
        id: dbId,
        data: b64,
        domElement: domElement
    }));
    currentGalleryIndex = index;
    updateLightboxImage();
    document.getElementById('fullScreenModal').classList.remove('hidden');
}

function updateLightboxImage() {
    if (currentGalleryImages.length > 0 && currentGalleryImages[currentGalleryIndex]) {
        document.getElementById('fsImage').src = currentGalleryImages[currentGalleryIndex].data;
    }
}
window.slideImage = function(dir) {
    if (currentGalleryImages.length === 0) return;
    currentGalleryIndex += dir;
    if (currentGalleryIndex < 0) currentGalleryIndex = currentGalleryImages.length - 1;
    if (currentGalleryIndex >= currentGalleryImages.length) currentGalleryIndex = 0;
    updateLightboxImage();
}
window.deleteCurrentFsImage = function() {
    const currentItem = currentGalleryImages[currentGalleryIndex];
    if (!currentItem) return;
    if (confirm("Delete this image?")) {
        if (currentItem.id) {
            const tx = db.transaction(["images"], "readwrite");
            tx.objectStore("images").delete(currentItem.id);
            tx.oncomplete = () => {
                currentGalleryImages.splice(currentGalleryIndex, 1);
                finishDeleteAction(currentItem);
            };
        } else {
            currentGalleryImages.splice(currentGalleryIndex, 1);
            finishDeleteAction(currentItem);
        }
    }
}

function finishDeleteAction(item) {
    if (item.domElement) item.domElement.remove();
    if (currentGalleryImages.length === 0) {
        window.closeFsModal();
        loadGallery();
    } else {
        if (currentGalleryIndex >= currentGalleryImages.length) currentGalleryIndex--;
        updateLightboxImage();
        loadGallery();
    }
}
window.downloadCurrent = function() {
    const src = document.getElementById('fsImage').src;
    saveToMobileGallery(src);
}
window.closeFsModal = () => document.getElementById('fullScreenModal').classList.add('hidden');

function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
}
window.analyzeCurrentFs = () => {
    window.closeFsModal();
    window.switchTab('ana');
    fetch(document.getElementById('fsImage').src).then(res => res.blob()).then(processImageForAnalysis);
}
window.handleFileSelect = e => {
    const file = e.target.files[0];
    if (!file) return;
    processImageForAnalysis(file);
}

async function processImageForAnalysis(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        const w = img.width;
        const h = img.height;
        const d = gcd(w, h);
        document.getElementById('resOut').innerText = `${w} x ${h}`;
        document.getElementById('arOut').innerText = `${w/d}:${h/d}`;
        document.getElementById('anaPreview').src = url;
        document.getElementById('anaGallery').classList.remove('hidden');
    };
    img.src = url;
    const text = await readPngMetadata(blob);
    document.getElementById('anaMeta').innerText = text || "No parameters found.";
    const btnContainer = document.getElementById('anaCopyButtons');
    if (text) {
        currentAnalyzedPrompts = parseGenInfo(text);
        if (btnContainer) btnContainer.classList.remove('hidden');
    } else {
        currentAnalyzedPrompts = null;
        if (btnContainer) btnContainer.classList.add('hidden');
    }
}

function parseGenInfo(rawText) {
    if (!rawText) return {
        pos: "",
        neg: ""
    };
    let pos = "";
    let neg = "";
    const negSplit = rawText.split("Negative prompt:");
    if (negSplit.length > 1) {
        pos = negSplit[0].trim();
        const paramsSplit = negSplit[1].split(/(\nSteps: |Steps: )/);
        if (paramsSplit.length > 1) {
            neg = paramsSplit[0].trim();
        } else {
            neg = negSplit[1].trim();
        }
    } else {
        const paramSplit = rawText.split(/(\nSteps: |Steps: )/);
        if (paramSplit.length > 1) {
            pos = paramSplit[0].trim();
        } else {
            pos = rawText.trim();
        }
    }
    return {
        pos,
        neg
    };
}
window.copyToSdxl = function() {
    if (!currentAnalyzedPrompts) return;
    document.getElementById('xl_prompt').value = currentAnalyzedPrompts.pos;
    document.getElementById('xl_neg').value = currentAnalyzedPrompts.neg;
    window.setMode('xl');
    window.switchTab('gen');
    if (Toast) Toast.show({
        text: 'Copied to SDXL',
        duration: 'short'
    });
}
window.copyToFlux = function() {
    if (!currentAnalyzedPrompts) return;
    document.getElementById('flux_prompt').value = currentAnalyzedPrompts.pos;
    window.setMode('flux');
    window.switchTab('gen');
    if (Toast) Toast.show({
        text: 'Copied to FLUX',
        duration: 'short'
    });
}
// --- NEO HOOK: ANALYZER COPY ---
window.copyToQwen = function() {
    if (!currentAnalyzedPrompts) return;
    document.getElementById('qwen_prompt').value = currentAnalyzedPrompts.pos;
    document.getElementById('qwen_neg').value = currentAnalyzedPrompts.neg || "bad quality, blur, watermark";
    window.setMode('qwen');
    window.switchTab('gen');
    if (Toast) Toast.show({
        text: 'Copied to QWEN',
        duration: 'short'
    });
}

function loadAutoDlState() {
    const c = document.getElementById('autoDlCheck');
    if (c) c.checked = localStorage.getItem('bojroAutoSave') === 'true';
}
window.saveAutoDlState = () => localStorage.setItem('bojroAutoSave', document.getElementById('autoDlCheck').checked);

async function readPngMetadata(blob) {
    try {
        const buffer = await blob.arrayBuffer();
        const view = new DataView(buffer);
        let offset = 8;
        let metadata = "";
        while (offset < view.byteLength) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
            if (type === 'tEXt') {
                const data = new Uint8Array(buffer, offset + 8, length);
                metadata += new TextDecoder().decode(data) + "\n";
            }
            if (type === 'iTXt') {
                const data = new Uint8Array(buffer, offset + 8, length);
                const text = new TextDecoder().decode(data);
                metadata += text + "\n";
            }
            offset += 12 + length;
        }
        metadata = metadata.trim();
        if (!metadata) return null;
        metadata = metadata.replace(/^parameters\0/, '');
        return metadata;
    } catch (e) {
        console.error("Metadata read error:", e);
        return null;
    }
}


// -----------------------------------------------------------
// 13. BOJRO POWER BUTTON LOGIC
// -----------------------------------------------------------

function loadPowerSettings() {
    const savedIP = localStorage.getItem('bojro_power_ip');
    if (savedIP) {
        document.getElementById('power-server-ip').value = savedIP;
    }
}

window.togglePowerSettings = function() {
    const modal = document.getElementById('powerSettingsModal');
    modal.classList.toggle('hidden');
}

window.savePowerSettings = function() {
    const ipInput = document.getElementById('power-server-ip').value.trim();

    if (ipInput) {
        // Ensure protocol exists (http://)
        let formattedIP = ipInput;
        if (!formattedIP.startsWith('http')) {
            formattedIP = 'http://' + formattedIP;
        }

        // Remove trailing slash if present
        if (formattedIP.endsWith('/')) {
            formattedIP = formattedIP.slice(0, -1);
        }

        localStorage.setItem('bojro_power_ip', formattedIP);
        togglePowerSettings();
        if (Toast) Toast.show({
            text: 'Power Config Saved',
            duration: 'short'
        });
    } else {
        alert("Please enter a valid IP address.");
    }
}

window.sendPowerSignal = async function() {
    const btn = document.getElementById('power-btn-mini');
    const serverUrl = localStorage.getItem('bojro_power_ip');

    if (!serverUrl) {
        alert("Please set the PC Server IP in settings first!");
        togglePowerSettings();
        return;
    }

    // Visual Feedback
    btn.classList.add('active');
    if (Toast) Toast.show({
        text: 'Sending Wake Signal...',
        duration: 'short'
    });

    try {
        const targetUrl = `${serverUrl}/power`;

        // STANDARD FETCH (No-CORS removed to match connect() behavior)
        await fetch(targetUrl, {
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
        // Even if it fails (e.g. CORS error but signal sent, or network down),
        // we display a generic toast because a simple server script might not respond cleanly.
        if (Toast) Toast.show({
            text: 'Signal Sent (Or Check Connection)',
            duration: 'short'
        });
        btn.classList.remove('active');
    }
}