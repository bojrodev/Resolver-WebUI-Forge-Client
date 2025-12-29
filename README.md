# Resolver: Native Android Client for WebUI Forge (Flux, SDXL & Qwen)

![Version](https://img.shields.io/badge/Version-1.2-purple.svg)
![Platform](https://img.shields.io/badge/Platform-Android%2010+-green.svg)
![Backend](https://img.shields.io/badge/Backend-Forge%20Neo-blue)
![License](https://img.shields.io/badge/License-GPLv3-red.svg)

**Resolver** is a high-performance, native Android interface for [Stable Diffusion WebUI Forge Neo](https://github.com/Haoming02/sd-webui-forge-classic/tree/neo).

**New in v1.2:** Resolver now features a centralized **Configuration (CFG)** tab, allowing for seamless switching between Local LAN (HTTP) and External Cloud/Ngrok (HTTPS) connections, custom service ports, and a new remote "Kill Switch" for system management.

Unlike standard browser wrappers, Resolver is built with a **Hybrid Architecture** (Capacitor 6.0 + Vanilla JS) and utilizes **Native Android Foreground Services** to ensure your generation queues never die in the background.

---

## 📸 Screenshots

<table>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/73bc7ab2-47ea-4598-9757-c86be9ad03c7" width="200" /><br />
      <b>Home / SDXL</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/e132a4d3-e33a-479f-af4a-566bd81b04a5" width="200" /><br />
      <b>Flux UI</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/4147b392-b351-4e70-8716-38c4c2e7cc30" width="200" /><br />
      <b>LoRA Manager</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/b489e035-32e3-4392-87b8-fbcfde706134" width="200" /><br />
      <b>Inpainting</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/38ab45ce-663c-4b45-91e8-ba77be3f67d9" width="200" /><br />
      <b>Qwen Turbo</b>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://placehold.co/200x440/1a1a1a/ffffff?text=Coming+Soon" width="200" /><br />
      <b>Placeholder 1</b>
    </td>
    <td align="center">
      <img src="https://placehold.co/200x440/1a1a1a/ffffff?text=Coming+Soon" width="200" /><br />
      <b>Placeholder 2</b>
    </td>
    <td align="center">
      <img src="https://placehold.co/200x440/1a1a1a/ffffff?text=Coming+Soon" width="200" /><br />
      <b>Placeholder 3</b>
    </td>
    <td align="center">
      <img src="https://placehold.co/200x440/1a1a1a/ffffff?text=Coming+Soon" width="200" /><br />
      <b>Placeholder 4</b>
    </td>
    <td align="center">
      <img src="https://placehold.co/200x440/1a1a1a/ffffff?text=Coming+Soon" width="200" /><br />
      <b>Placeholder 5</b>
    </td>
  </tr>
</table>

---

## 🚀 Key Features

### ⚡ v1.2 Connectivity & Power
* **Smart Connection Mode:** Toggle instantly between **Local Mode** (Auto-appends ports to local IPs) and **External Mode** (Enforces HTTPS for Ngrok/Cloud tunnels, ignoring ports).
* **Custom Service Ports:** Define independent ports for your WebUI (Default: `7860`), LLM Server (`1234`), and Power Service (`5000`) inside the new CFG tab.
* **Remote Wake & Kill:** Use the "Bojro Dev Power" controls to send Wake-on-LAN signals or a **KILL!** signal to immediately halt the backend server from your phone.

### ⚡ True Background Generation
* **Native Foreground Service:** Uses a Java-based service and Wake Locks to keep WebSocket connections alive during long Flux GGUF workflows or massive batch queues, even when the screen is off.
* **Queue Persistence:** robust state management system for Ongoing, Next, and Completed jobs.

### 🎨 Advanced Generation Engines
* **Flux GGUF Optimized:** Includes dedicated selectors for VAE, CLIP, and T5-XXL models, with support for specific quantization bits (bnb-nf4, fp8-e4m3fn, etc.).
* **Qwen / Z-Image Turbo:** Specialized "Turbo Generate" mode for Qwen models with dense narrative support.
* **SDXL Powerhouse:** Full control over sampling, scheduling, and aspect ratio locking.
* **Mobile Inpainting:** A touch-optimized canvas editor with mask blurring, soft inpainting, and denoising controls.

### 🧠 Magic Prompt (Local LLM)
* **Smart Expansion:** Integrates with local LLM servers (LM Studio, Ollama) to translate simple ideas into professional prompts.
* **Dynamic Mode Switching:** Automatically applies specialized system prompts for SDXL, Flux, and Qwen narratives.

---

## 🤖 Magic Prompt (LLM) Setup

To use the "Magic Prompt" feature, it is highly recommended to host a **Bojro PromptMaster** model on your PC.

1.  **Download a Model:** Get the GGUF version of your choice from Hugging Face:
    * 👉 **[PromptMaster v2 (Uncensored)](https://huggingface.co/bojrodev/BojroPromptMaster_uncensored_v2-8B)** (Recommended)
    * 👉 **[PromptMaster v1 (Uncensored)](https://huggingface.co/bojrodev/BojroPromptMaster-v1-8B)**
2.  **Run Server:** Load the model into **LM Studio** or **Ollama** and ensure it is serving on your local network (e.g., `http://192.168.1.10:1234`).
3.  **Connect App:**
    * In Resolver, tap the **Bot Icon** to open the Magic Prompt modal.
    * Enter your LLM Server URL (or configure the Port in the **CFG Tab**) and tap **Connect**.
    * The app will automatically use specialized system instructions for each image generation mode.

---

## 🔌 Remote PC Wake (The Power Button)

Resolver features a remote power signal to start (or stop) your WebUI directly from the app home screen.

**Requirement:** Requires the `BojroPowerv2portable.exe` helper running on your PC.

1.  **Run Helper:** Execute the helper app on your PC.
2.  **Configure:** Go to the **CFG Tab** in Resolver and set your **Wake Port** (Default: `5000`).
3.  **Wake:** Tap the Power Button (ტ) to send a start signal.
4.  **Kill:** Tap the **KILL!** button to remotely stop the services.

---

## 📂 Workflow & LoRA Management
* **Neo Bridge:** Browse LoRAs by folder with smart thumbnail caching.
* **Config Injection:** Set preferred weights and trigger words that auto-inject into your prompts.
* **Metadata Analysis:** Built-in PNG Info reader with one-tap "Copy to Mode" functionality to restore parameters from history.

---

## 🛠️ Installation & Building

### Installation
1.  Install **WebUI Forge (Neo)** on your PC.
2.  Download the latest `.apk` from the **Releases Page**.
3.  Ensure your phone and PC are on the same Wi-Fi.
4.  Navigate to the **CFG Tab**, enter your PC's IP, and tap **Save Configuration**.

### Building from Source
```bash
# Clone the repository
git clone [https://github.com/bojrodev/Resolver-WebUI-Forge-Client.git](https://github.com/bojrodev/Resolver-WebUI-Forge-Client.git)

# Install dependencies
npm install

# Sync and open Android project
npx cap sync
npx cap open android
# Open the Android Project in Android Studio
