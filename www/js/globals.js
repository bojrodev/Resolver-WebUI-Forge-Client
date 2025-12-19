// Initialize Icons
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// --- CAPACITOR PLUGINS ---
// We define these globally so all other modules can access them
const Filesystem = window.Capacitor ? window.Capacitor.Plugins.Filesystem : null;
const Toast = window.Capacitor ? window.Capacitor.Plugins.Toast : null;
const LocalNotifications = window.Capacitor ? window.Capacitor.Plugins.LocalNotifications : null;
const App = window.Capacitor ? window.Capacitor.Plugins.App : null;
const CapacitorHttp = window.Capacitor ? window.Capacitor.Plugins.CapacitorHttp : null;
const ResolverService = window.Capacitor ? window.Capacitor.Plugins.ResolverService : null;

// --- GLOBAL STATE ---
let currentMode = 'xl';
let currentTask = 'txt'; // 'txt', 'inp'
let currentInpaintMode = 'fill'; // 'fill' (Whole) or 'mask' (Only Masked)
let currentBrushMode = 'draw'; // 'draw' or 'erase'
let db; // IndexedDB instance

// EDITOR STATE (Graphics Engine)
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

// LLM / PROMPT GENERATION STATE
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