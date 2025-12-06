import http.server
import socketserver
import json
import os

# --- CONFIGURATION ---
PORT = 5000
VAE_PATH = r"Your vae folder path here"  # e.g., r"E:\Ai\IMG\StableDiffusionWebui\stable-diffusion-webui\models\VAE"
# ---------------------

class VAEHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*') # Allows phone to access
        self.end_headers()
        
        try:
            files = [f for f in os.listdir(VAE_PATH) if f.endswith(('.pt', '.safetensors', '.ckpt'))]
            self.wfile.write(json.dumps(files).encode())
            print(f"Sent {len(files)} VAE names to client.")
        except Exception as e:
            self.wfile.write(json.dumps(["Error: Check Path on PC script"]).encode())
            print(f"Error reading path: {e}")

print(f"Bojro Sidecar running on Port {PORT}...")
print(f"Serving VAEs from: {VAE_PATH}")
with socketserver.TCPServer(("", PORT), VAEHandler) as httpd:
    httpd.serve_forever()