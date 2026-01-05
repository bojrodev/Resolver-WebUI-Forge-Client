import sys
import os
import json
import threading
import socket
import subprocess
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
import winreg
from flask import Flask, request, jsonify

# --- SAFE IMPORTS ---
try:
    from pystray import Icon as TrayIcon, MenuItem as Item
    from PIL import Image, ImageDraw
except ImportError:
    pass

# --- CONFIGURATION ---
APP_NAME = "Bojro Dev Power v5"
PORT = 5000 
app_flask = Flask(__name__)

# --- GLOBAL STATE ---
config = {
    "forge_path": "", 
    "comfy_path": "", 
    "lm_path": "",
    "enable_forge": True,
    "enable_comfy": True,
    "enable_lm": True,
    "start_on_boot": False,
    "minimize_to_tray": True,
    "dark_mode": True 
}
root = None
tray_icon = None
gui_instance = None

# Process Handles
forge_process = None
comfy_process = None
lm_process = None
stop_event = threading.Event()

# --- HELPER FUNCTIONS ---
def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def clean_path(path):
    if not path: return ""
    return os.path.normpath(path)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def kill_existing_instance_on_port(port):
    print(f"Checking for ghost processes on port {port}...")
    try:
        output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
        for line in output.strip().split('\n'):
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                pid = parts[-1]
                if pid != "0":
                    print(f"Found old instance (PID: {pid}). Killing it...")
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True)
    except subprocess.CalledProcessError:
        pass
    except Exception as e:
        print(f"Error cleaning port: {e}")

# --- CONFIG MANAGEMENT ---
def get_appdata_config_path():
    app_data = os.getenv('APPDATA')
    folder = os.path.join(app_data, "BojroResolver")
    if not os.path.exists(folder):
        os.makedirs(folder)
    return os.path.join(folder, "config.json")

def load_config_at_startup():
    global config
    user_cfg = get_appdata_config_path()
    if os.path.exists(user_cfg):
        try:
            with open(user_cfg, 'r') as f:
                config.update(json.load(f))
        except: pass

def save_config():
    user_cfg = get_appdata_config_path()
    try:
        with open(user_cfg, 'w') as f:
            json.dump(config, f, indent=4)
        update_startup_registry()
    except Exception as e:
        messagebox.showerror("Save Error", str(e))

def update_startup_registry():
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_ALL_ACCESS)
        exe_path = sys.executable
        if getattr(sys, 'frozen', False):
            if config.get("start_on_boot"):
                cmd = f'"{exe_path}" --startup'
                winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, cmd)
            else:
                try: winreg.DeleteValue(key, APP_NAME)
                except: pass
        winreg.CloseKey(key)
    except: pass

# --- CORE LOGIC ---

def append_to_terminal(widget, text):
    if gui_instance and widget:
        widget.config(state=tk.NORMAL)
        widget.insert(tk.END, text)
        widget.see(tk.END)
        widget.config(state=tk.DISABLED)

def monitor_output(proc, widget):
    while True:
        line = proc.stdout.readline()
        if not line and proc.poll() is not None:
            break
        if line:
            try:
                text = line.decode('utf-8', errors='replace')
            except:
                text = str(line)
            if root:
                root.after(0, append_to_terminal, widget, text)

# --- INDIVIDUAL START FUNCTIONS ---

def start_forge():
    global forge_process
    if not config.get('enable_forge', True):
        append_to_terminal(gui_instance.term_forge, "--- Forge is disabled in settings ---\n")
        return

    raw_forge = config.get('forge_path', '')
    f_path = clean_path(raw_forge)
    
    if f_path and os.path.exists(f_path):
        if forge_process is None or forge_process.poll() is not None:
            try:
                forge_dir = os.path.dirname(f_path)
                append_to_terminal(gui_instance.term_forge, f">>> Starting Forge: {f_path}\n")
                
                forge_process = subprocess.Popen(
                    [f_path], cwd=forge_dir, shell=True,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.PIPE
                )
                t = threading.Thread(target=monitor_output, args=(forge_process, gui_instance.term_forge), daemon=True)
                t.start()
            except Exception as e:
                append_to_terminal(gui_instance.term_forge, f"!!! Error launching Forge: {e}\n")
    else:
        if f_path: append_to_terminal(gui_instance.term_forge, "!!! Forge path invalid.\n")

def start_comfy():
    global comfy_process
    if not config.get('enable_comfy', True):
        append_to_terminal(gui_instance.term_comfy, "--- ComfyUI is disabled in settings ---\n")
        return

    raw_comfy = config.get('comfy_path', '')
    c_path = clean_path(raw_comfy)

    if c_path and os.path.exists(c_path):
        if comfy_process is None or comfy_process.poll() is not None:
            try:
                comfy_dir = os.path.dirname(c_path)
                if gui_instance: gui_instance.notebook.select(1)
                append_to_terminal(gui_instance.term_comfy, f">>> Starting ComfyUI: {c_path}\n")
                
                comfy_process = subprocess.Popen(
                    [c_path], cwd=comfy_dir, shell=True,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.PIPE
                )
                t = threading.Thread(target=monitor_output, args=(comfy_process, gui_instance.term_comfy), daemon=True)
                t.start()
            except Exception as e:
                append_to_terminal(gui_instance.term_comfy, f"!!! Error launching ComfyUI: {e}\n")
    else:
        if c_path: append_to_terminal(gui_instance.term_comfy, "!!! ComfyUI path invalid.\n")

def start_lm():
    global lm_process
    if not config.get('enable_lm', True):
        return

    raw_lm = config.get('lm_path', '')
    l_path = clean_path(raw_lm)
    
    if l_path and os.path.exists(l_path):
        if lm_process is None or lm_process.poll() is not None:
            try:
                lm_dir = os.path.dirname(l_path)
                append_to_terminal(gui_instance.term_forge, f">>> Launching External App: {l_path}\n")
                lm_process = subprocess.Popen([l_path], cwd=lm_dir) 
            except Exception as e:
                append_to_terminal(gui_instance.term_forge, f"!!! Error launching App: {e}\n")

# --- INDIVIDUAL STOP FUNCTIONS ---

def stop_forge():
    global forge_process
    if forge_process:
        if forge_process.poll() is None:
            try:
                subprocess.run(f"taskkill /F /T /PID {forge_process.pid}", shell=True)
                append_to_terminal(gui_instance.term_forge, ">>> Forge terminated.\n")
            except Exception: pass
        forge_process = None

def stop_comfy():
    global comfy_process
    if comfy_process:
        if comfy_process.poll() is None:
            try:
                subprocess.run(f"taskkill /F /T /PID {comfy_process.pid}", shell=True)
                append_to_terminal(gui_instance.term_comfy, ">>> ComfyUI terminated.\n")
            except Exception: pass
        comfy_process = None

def stop_lm():
    global lm_process
    if lm_process:
        if lm_process.poll() is None:
            try:
                subprocess.run(f"taskkill /F /T /PID {lm_process.pid}", shell=True)
                append_to_terminal(gui_instance.term_forge, ">>> External App terminated.\n")
            except Exception: pass
        lm_process = None

# --- GLOBAL WRAPPERS (GUI Buttons & Master Switch) ---

def launch_services():
    global stop_event
    stop_event.clear()
    start_forge()
    start_comfy()
    start_lm()
    
def stop_services():
    append_to_terminal(gui_instance.term_forge, "\n>>> STOPPING ALL SERVICES...\n")
    stop_forge()
    stop_comfy()
    stop_lm()

# --- FLASK SERVER ---

def _cors_response(data=None):
    if data is None: data = {'status': 'ok'}
    response = jsonify(data)
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type")
    return response

# --- MASTER ENDPOINTS ---
@app_flask.route('/power', methods=['GET', 'POST', 'OPTIONS'])
def remote_power_on():
    if request.method == 'OPTIONS': return _cors_response()
    if root: root.after(0, launch_services)
    return _cors_response({'status': 'started_all'})

@app_flask.route('/power/off', methods=['POST', 'OPTIONS'])
def remote_power_off():
    if request.method == 'OPTIONS': return _cors_response()
    if root: root.after(0, stop_services)
    return _cors_response({'status': 'stopped_all'})

# --- FORGE ENDPOINTS ---
@app_flask.route('/power/forge/on', methods=['POST', 'OPTIONS'])
def remote_forge_on():
    if request.method == 'OPTIONS': return _cors_response()
    if root: root.after(0, start_forge)
    return _cors_response({'status': 'forge_started'})

@app_flask.route('/power/forge/off', methods=['POST', 'OPTIONS'])
def remote_forge_off():
    if request.method == 'OPTIONS': return _cors_response()
    if root: root.after(0, stop_forge)
    return _cors_response({'status': 'forge_stopped'})

# --- COMFYUI ENDPOINTS ---
@app_flask.route('/power/comfy/on', methods=['POST', 'OPTIONS'])
def remote_comfy_on():
    if request.method == 'OPTIONS': return _cors_response()
    if root: root.after(0, start_comfy)
    return _cors_response({'status': 'comfy_started'})

@app_flask.route('/power/comfy/off', methods=['POST', 'OPTIONS'])
def remote_comfy_off():
    if request.method == 'OPTIONS': return _cors_response()
    if root: root.after(0, stop_comfy)
    return _cors_response({'status': 'comfy_stopped'})

# --- LM ENDPOINTS ---
@app_flask.route('/power/lm/on', methods=['POST', 'OPTIONS'])
def remote_lm_on():
    if request.method == 'OPTIONS': return _cors_response()
    if root: root.after(0, start_lm)
    return _cors_response({'status': 'lm_started'})

@app_flask.route('/power/lm/off', methods=['POST', 'OPTIONS'])
def remote_lm_off():
    if request.method == 'OPTIONS': return _cors_response()
    if root: root.after(0, stop_lm)
    return _cors_response({'status': 'lm_stopped'})

def run_server():
    try: app_flask.run(host='0.0.0.0', port=PORT, use_reloader=False)
    except Exception as e: print(f"Server Error: {e}")

# --- TRAY & GUI ---
def run_tray_icon():
    global tray_icon
    def show_app(icon, item): root.after(0, root.deiconify)
    def quit_app(icon, item):
        icon.stop()
        root.after(0, root.destroy)
        os._exit(0)

    try: image = Image.open(resource_path("app.ico"))
    except: 
        image = Image.new('RGB', (64, 64), color=(255, 255, 255))
        d = ImageDraw.Draw(image)
        d.ellipse((8, 8, 56, 56), fill="#007bff", outline="black")

    menu = (Item('Open Settings', show_app), Item('Quit', quit_app))
    tray_icon = TrayIcon("BojroResolver", image, "Bojro Dev Power", menu)
    tray_icon.run()

class BojroGUI:
    def __init__(self, master):
        global gui_instance
        gui_instance = self
        self.master = master
        self.master.title(APP_NAME)
        
        self.master.geometry("650x700") 
        self.master.protocol("WM_DELETE_WINDOW", self.on_close)
        
        try: self.master.iconbitmap(resource_path("app.ico"))
        except: pass

        self.style = ttk.Style()

        # --- RESPONSIVE SCROLL SETUP START ---
        self.main_container = tk.Frame(self.master)
        self.main_container.pack(fill="both", expand=True)

        self.canvas = tk.Canvas(self.main_container, highlightthickness=0)
        self.scrollbar = ttk.Scrollbar(self.main_container, orient="vertical", command=self.canvas.yview)

        self.scrollable_frame = tk.Frame(self.canvas)

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )

        self.canvas_frame = self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")

        self.canvas.bind("<Configure>", self._on_canvas_configure)
        self.master.bind_all("<MouseWheel>", self._on_mousewheel)

        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        # --- RESPONSIVE SCROLL SETUP END ---

        # -- Header --
        self.lbl_title = tk.Label(self.scrollable_frame, text=APP_NAME, font=("Segoe UI", 16, "bold"))
        self.lbl_title.pack(pady=5)
        
        local_ip = get_local_ip()
        ip_text = f"Android URL: http://{local_ip}:{PORT}/power"
        self.lbl_ip = tk.Label(self.scrollable_frame, text=ip_text, font=("Consolas", 10), padx=10, pady=5)
        self.lbl_ip.pack(pady=5)
        
        # -- Controls (Master) --
        self.btn_frame = tk.Frame(self.scrollable_frame)
        self.btn_frame.pack(fill='x', padx=20, pady=5)
        
        self.btn_power = tk.Button(self.btn_frame, text="⚡ START ALL", font=("Segoe UI", 12, "bold"), 
                                   bg="#28a745", fg="white", height=2, width=15, command=launch_services)
        self.btn_power.pack(side="left", padx=5, expand=True, fill="x")

        self.btn_stop = tk.Button(self.btn_frame, text="🛑 STOP ALL", font=("Segoe UI", 12, "bold"), 
                                   bg="#dc3545", fg="white", height=2, width=15, command=stop_services)
        self.btn_stop.pack(side="right", padx=5, expand=True, fill="x")

        # -- Individual Controls --
        self.ind_frame = tk.LabelFrame(self.scrollable_frame, text="Individual Control", padx=10, pady=5)
        self.ind_frame.pack(fill="x", padx=20, pady=5)
        
        self.ind_frame.columnconfigure(1, weight=1)
        self.ind_frame.columnconfigure(2, weight=1)

        # Forge Row
        self.lbl_i_forge = tk.Label(self.ind_frame, text="Forge:", font=("Segoe UI", 10, "bold"))
        self.lbl_i_forge.grid(row=0, column=0, sticky="w", padx=5)
        self.btn_i_start_forge = tk.Button(self.ind_frame, text="Start", bg="#28a745", fg="white", command=start_forge)
        self.btn_i_start_forge.grid(row=0, column=1, sticky="ew", padx=2, pady=2)
        self.btn_i_stop_forge = tk.Button(self.ind_frame, text="Stop", bg="#dc3545", fg="white", command=stop_forge)
        self.btn_i_stop_forge.grid(row=0, column=2, sticky="ew", padx=2, pady=2)

        # Comfy Row
        self.lbl_i_comfy = tk.Label(self.ind_frame, text="ComfyUI:", font=("Segoe UI", 10, "bold"))
        self.lbl_i_comfy.grid(row=1, column=0, sticky="w", padx=5)
        self.btn_i_start_comfy = tk.Button(self.ind_frame, text="Start", bg="#28a745", fg="white", command=start_comfy)
        self.btn_i_start_comfy.grid(row=1, column=1, sticky="ew", padx=2, pady=2)
        self.btn_i_stop_comfy = tk.Button(self.ind_frame, text="Stop", bg="#dc3545", fg="white", command=stop_comfy)
        self.btn_i_stop_comfy.grid(row=1, column=2, sticky="ew", padx=2, pady=2)

        # LM Row
        self.lbl_i_lm = tk.Label(self.ind_frame, text="LM Studio:", font=("Segoe UI", 10, "bold"))
        self.lbl_i_lm.grid(row=2, column=0, sticky="w", padx=5)
        self.btn_i_start_lm = tk.Button(self.ind_frame, text="Start", bg="#28a745", fg="white", command=start_lm)
        self.btn_i_start_lm.grid(row=2, column=1, sticky="ew", padx=2, pady=2)
        self.btn_i_stop_lm = tk.Button(self.ind_frame, text="Stop", bg="#dc3545", fg="white", command=stop_lm)
        self.btn_i_stop_lm.grid(row=2, column=2, sticky="ew", padx=2, pady=2)

        # -- Console Controls (ADDED BUTTON HERE) --
        self.btn_clear_logs = tk.Button(self.scrollable_frame, text="🧹 Clear Logs", font=("Segoe UI", 9), command=self.clear_consoles)
        self.btn_clear_logs.pack(anchor="e", padx=20, pady=(10, 0))

        # -- Terminal Output --
        self.notebook = ttk.Notebook(self.scrollable_frame, height=300)
        self.notebook.pack(fill="both", expand=True, padx=20, pady=2)

        self.tab_forge = tk.Frame(self.notebook)
        self.notebook.add(self.tab_forge, text="Forge Console")
        self.term_forge = scrolledtext.ScrolledText(self.tab_forge, bg="black", fg="#00ff00", 
                                                    font=("Consolas", 9), state=tk.DISABLED, cursor="arrow")
        self.term_forge.pack(fill="both", expand=True)

        self.tab_comfy = tk.Frame(self.notebook)
        self.notebook.add(self.tab_comfy, text="ComfyUI Console")
        self.term_comfy = scrolledtext.ScrolledText(self.tab_comfy, bg="#1e1e1e", fg="#00ffff", 
                                                    font=("Consolas", 9), state=tk.DISABLED, cursor="arrow")
        self.term_comfy.pack(fill="both", expand=True)

        # -- Settings --
        self.settings_frame = tk.LabelFrame(self.scrollable_frame, text="Configuration", padx=10, pady=5)
        self.settings_frame.pack(fill="x", padx=20, pady=5)

        # Variables for toggles
        self.var_en_forge = tk.BooleanVar(value=config.get("enable_forge", True))
        self.var_en_comfy = tk.BooleanVar(value=config.get("enable_comfy", True))
        self.var_en_lm = tk.BooleanVar(value=config.get("enable_lm", True))

        # --- ROW 0: FORGE ---
        self.chk_en_forge = tk.Checkbutton(self.settings_frame, variable=self.var_en_forge, command=self.save_settings)
        self.chk_en_forge.grid(row=0, column=0, padx=2)
        
        self.btn_set_forge = tk.Button(self.settings_frame, text="Set Forge", command=self.set_forge)
        self.btn_set_forge.grid(row=0, column=1, sticky="ew", padx=5, pady=2)

        self.btn_clr_forge = tk.Button(self.settings_frame, text="✖", width=3, command=self.clear_forge)
        self.btn_clr_forge.grid(row=0, column=2, padx=2, pady=2)
        
        self.lbl_forge = tk.Label(self.settings_frame, text=config.get("forge_path", "Not Set"), anchor="w")
        self.lbl_forge.grid(row=0, column=3, sticky="ew", padx=5)

        # --- ROW 1: COMFY UI ---
        self.chk_en_comfy = tk.Checkbutton(self.settings_frame, variable=self.var_en_comfy, command=self.save_settings)
        self.chk_en_comfy.grid(row=1, column=0, padx=2)

        self.btn_set_comfy = tk.Button(self.settings_frame, text="Set ComfyUI", command=self.set_comfy)
        self.btn_set_comfy.grid(row=1, column=1, sticky="ew", padx=5, pady=2)

        self.btn_clr_comfy = tk.Button(self.settings_frame, text="✖", width=3, command=self.clear_comfy)
        self.btn_clr_comfy.grid(row=1, column=2, padx=2, pady=2)
        
        self.lbl_comfy = tk.Label(self.settings_frame, text=config.get("comfy_path", "Not Set"), anchor="w")
        self.lbl_comfy.grid(row=1, column=3, sticky="ew", padx=5)

        # --- ROW 2: EXTERNAL APP ---
        self.chk_en_lm = tk.Checkbutton(self.settings_frame, variable=self.var_en_lm, command=self.save_settings)
        self.chk_en_lm.grid(row=2, column=0, padx=2)

        self.btn_set_lm = tk.Button(self.settings_frame, text="Set Ext. App", command=self.set_lm)
        self.btn_set_lm.grid(row=2, column=1, sticky="ew", padx=5, pady=2)

        self.btn_clr_lm = tk.Button(self.settings_frame, text="✖", width=3, command=self.clear_lm)
        self.btn_clr_lm.grid(row=2, column=2, padx=2, pady=2)
        
        self.lbl_lm = tk.Label(self.settings_frame, text=config.get("lm_path", "Not Set"), anchor="w")
        self.lbl_lm.grid(row=2, column=3, sticky="ew", padx=5)
        
        self.settings_frame.columnconfigure(3, weight=1)

        # -- App Behavior --
        self.behavior_frame = tk.Frame(self.scrollable_frame)
        self.behavior_frame.pack(fill="x", padx=20, pady=5)
        
        self.var_boot = tk.BooleanVar(value=config.get("start_on_boot", False))
        self.chk_boot = tk.Checkbutton(self.behavior_frame, text="Start with Windows", variable=self.var_boot, command=self.save_settings)
        self.chk_boot.pack(side="left")

        self.var_tray = tk.BooleanVar(value=config.get("minimize_to_tray", True))
        self.chk_tray = tk.Checkbutton(self.behavior_frame, text="Minimize to Tray", variable=self.var_tray, command=self.save_settings)
        self.chk_tray.pack(side="left", padx=10)

        # -- DARK MODE TOGGLE --
        self.var_dark = tk.BooleanVar(value=config.get("dark_mode", True))
        self.chk_dark = tk.Checkbutton(self.behavior_frame, text="Dark Mode", variable=self.var_dark, command=self.toggle_theme)
        self.chk_dark.pack(side="right")

        self.apply_theme()

    # --- NEW CLEAR CONSOLE FUNCTION ---
    def clear_consoles(self):
        # We need to enable the widget to delete text, then disable it again
        for term in [self.term_forge, self.term_comfy]:
            term.config(state=tk.NORMAL)
            term.delete('1.0', tk.END)
            term.config(state=tk.DISABLED)

    def _on_canvas_configure(self, event):
        """Ensure the inner frame matches the canvas width"""
        self.canvas.itemconfig(self.canvas_frame, width=event.width)

    def _on_mousewheel(self, event):
        """Enable mousewheel scrolling"""
        # Note: If scrolling over the Text widgets (Console), this might be intercepted by them
        self.canvas.yview_scroll(int(-1*(event.delta/120)), "units")

    def toggle_theme(self):
        config['dark_mode'] = self.var_dark.get()
        self.apply_theme()
        self.save_settings()

    def apply_theme(self):
        is_dark = self.var_dark.get()
        
        bg_color = "#2b2b2b" if is_dark else "#f0f0f0"
        fg_color = "#ffffff" if is_dark else "#000000"
        btn_bg = "#404040" if is_dark else "#e1e1e1"
        btn_fg = "#ffffff" if is_dark else "#000000"
        
        ip_bg = "#3a3a3a" if is_dark else "#e6f3ff"
        ip_fg = "#58a6ff" if is_dark else "blue"

        # Update Main Container Backgrounds
        self.master.config(bg=bg_color)
        self.main_container.config(bg=bg_color)
        self.canvas.config(bg=bg_color)
        self.scrollable_frame.config(bg=bg_color)

        self.lbl_title.config(bg=bg_color, fg=fg_color)
        self.lbl_ip.config(bg=ip_bg, fg=ip_fg)
        self.btn_frame.config(bg=bg_color)
        self.behavior_frame.config(bg=bg_color)
        self.settings_frame.config(bg=bg_color, fg=fg_color)
        self.ind_frame.config(bg=bg_color, fg=fg_color)

        # Individual Control Labels
        for lbl in [self.lbl_i_forge, self.lbl_i_comfy, self.lbl_i_lm]:
            lbl.config(bg=bg_color, fg=fg_color)

        # Buttons (Set + Clear + NEW CLEAR LOGS)
        all_btns = [
            self.btn_set_forge, self.btn_set_comfy, self.btn_set_lm,
            self.btn_clr_forge, self.btn_clr_comfy, self.btn_clr_lm,
            self.btn_clear_logs # Added to theme list
        ]
        for btn in all_btns:
            btn.config(bg=btn_bg, fg=btn_fg, relief="flat" if is_dark else "raised")
        
        # Labels
        for lbl in [self.lbl_forge, self.lbl_comfy, self.lbl_lm]:
            lbl.config(bg=bg_color, fg=fg_color)

        # Checkbuttons
        for chk in [self.chk_boot, self.chk_tray, self.chk_dark, 
                    self.chk_en_forge, self.chk_en_comfy, self.chk_en_lm]:
            chk.config(bg=bg_color, fg=fg_color, selectcolor="#404040" if is_dark else "white",
                       activebackground=bg_color, activeforeground=fg_color)

        # Tabs
        if is_dark:
            self.style.theme_use('default')
            self.style.configure('TNotebook', background=bg_color, borderwidth=0)
            self.style.configure('TNotebook.Tab', background="#404040", foreground="white", padding=[10, 2])
            self.style.map('TNotebook.Tab', background=[('selected', '#28a745')], foreground=[('selected', 'white')])
        else:
            self.style.theme_use('default')
            self.style.configure('TNotebook', background=bg_color)
            self.style.configure('TNotebook.Tab', background="#e1e1e1", foreground="black")
            self.style.map('TNotebook.Tab', background=[('selected', '#ffffff')], foreground=[('selected', 'black')])

    # --- PATH SETTERS ---
    def set_forge(self):
        path = filedialog.askopenfilename(filetypes=[("Batch Files", "*.bat"), ("All Files", "*.*")])
        if path:
            config['forge_path'] = clean_path(path)
            self.lbl_forge.config(text=config['forge_path'])
            save_config()

    def set_comfy(self):
        path = filedialog.askopenfilename(filetypes=[("Batch/Exe", "*.bat *.exe"), ("All Files", "*.*")])
        if path:
            config['comfy_path'] = clean_path(path)
            self.lbl_comfy.config(text=config['comfy_path'])
            save_config()

    def set_lm(self):
        path = filedialog.askopenfilename(filetypes=[("Executables", "*.exe"), ("All Files", "*.*")])
        if path:
            config['lm_path'] = clean_path(path)
            self.lbl_lm.config(text=config['lm_path'])
            save_config()

    # --- PATH CLEARERS ---
    def clear_forge(self):
        config['forge_path'] = ""
        self.lbl_forge.config(text="Not Set")
        save_config()

    def clear_comfy(self):
        config['comfy_path'] = ""
        self.lbl_comfy.config(text="Not Set")
        save_config()

    def clear_lm(self):
        config['lm_path'] = ""
        self.lbl_lm.config(text="Not Set")
        save_config()

    def save_settings(self):
        config['start_on_boot'] = self.var_boot.get()
        config['minimize_to_tray'] = self.var_tray.get()
        config['dark_mode'] = self.var_dark.get()
        
        # Save Toggle States
        config['enable_forge'] = self.var_en_forge.get()
        config['enable_comfy'] = self.var_en_comfy.get()
        config['enable_lm'] = self.var_en_lm.get()
        
        save_config()

    def on_close(self):
        if config.get("minimize_to_tray", True):
            self.master.withdraw()
        else:
            if tray_icon: tray_icon.stop()
            self.master.destroy()
            os._exit(0)

if __name__ == "__main__":
    kill_existing_instance_on_port(PORT)
    load_config_at_startup()
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    
    root = tk.Tk()
    app = BojroGUI(root)
    
    if "--startup" in sys.argv:
        root.withdraw()
        
    tray_thread = threading.Thread(target=run_tray_icon, daemon=True)
    tray_thread.start()
    
    root.mainloop()