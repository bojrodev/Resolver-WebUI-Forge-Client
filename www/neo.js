/**
 * NEO MODULE (Cleaned)
 * Specialized logic for Z-Image Turbo (Qwen) and S3-DiT Architectures.
 * Isolated from main app logic to prevent regression.
 * * NOTE: LoRA logic has been moved to lora.js
 */

const Neo = {
    // defaults optimized for Z-Image Turbo (Decoupled-DMD) with LCM
    defaults: {
        steps: 8,
        cfg: 1.0,  
        sampler: "LCM", 
        scheduler: "Normal"
    },

    // Called by app.js when models are fetched
    populateModels: function(models) {
        const sel = document.getElementById('qwen_modelSelect');
        if(!sel) return;
        
        const currentVal = sel.value;
        sel.innerHTML = "";
        
        models.forEach(m => {
            sel.appendChild(new Option(m.model_name, m.title));
        });

        const saved = localStorage.getItem('bojroModel_qwen');
        if (saved) {
            sel.value = saved;
        } else if (currentVal) {
            sel.value = currentVal;
        }
    },

    // Called by app.js when samplers are fetched
    populateSamplers: function(samplers) {
         const sel = document.getElementById('qwen_sampler');
         if(!sel) return;
         sel.innerHTML = "";
         samplers.forEach(s => {
             sel.appendChild(new Option(s.name, s.name));
         });
         
         // Set LCM as default if available (Critical for Turbo)
         if(Array.from(sel.options).some(o => o.value === "LCM")) {
             sel.value = "LCM";
         } else if(Array.from(sel.options).some(o => o.value === "Euler a")) {
             sel.value = "Euler a";
         }
    },

    // Populates the Dual Dropdowns (VAE and Qwen/TE)
    populateDual: function(modulesList) {
        const slots = [
            document.getElementById('qwen_vae'), 
            document.getElementById('qwen_te')
        ];

        // Reset
        slots.forEach((s, index) => {
            if(!s) return;
            s.innerHTML = index === 0 ? "<option value='Automatic'>Automatic</option>" : "<option value='None'>None</option>";
        });

        if(modulesList.length > 0) {
            slots.forEach(sel => {
                if(!sel) return;
                modulesList.forEach(name => {
                    if (name !== "Automatic" && !Array.from(sel.options).some(o => o.value === name)) {
                        sel.appendChild(new Option(name, name));
                    }
                });
            });
        }

        // Restore saved
        ['qwen_vae', 'qwen_te'].forEach(id => {
            const saved = localStorage.getItem('bojro_' + id);
            const el = document.getElementById(id);
            if(saved && el && Array.from(el.options).some(o => o.value === saved)) {
                el.value = saved;
            }
        });
    },

    saveDual: function() {
        ['qwen_vae', 'qwen_te'].forEach(id => {
            const el = document.getElementById(id);
            if(el) localStorage.setItem('bojro_' + id, el.value);
        });
    },

    // The Bridge: Constructs the API payload for Forge
    buildJob: function() {
        const modelTitle = document.getElementById('qwen_modelSelect').value;
        if(!modelTitle || modelTitle.includes("Link first")) {
            alert("Neo System: Please select a Qwen/Turbo model first.");
            return null;
        }

        // 1. Gather Inputs
        const prompt = document.getElementById('qwen_prompt').value;
        const neg = document.getElementById('qwen_neg').value;
        
        const steps = parseInt(document.getElementById('qwen_steps').value) || 8;
        const cfg = parseFloat(document.getElementById('qwen_cfg').value) || 1.0;
        const width = parseInt(document.getElementById('qwen_width').value) || 1024;
        const height = parseInt(document.getElementById('qwen_height').value) || 1024;
        const seed = parseInt(document.getElementById('qwen_seed').value) || -1;
        const batchSize = parseInt(document.getElementById('qwen_batch_size').value) || 1;
        const batchCount = parseInt(document.getElementById('qwen_batch_count').value) || 1;

        const sampler = document.getElementById('qwen_sampler').value;
        const scheduler = document.getElementById('qwen_scheduler').value;

        // 2. Define Overrides
        const vae = document.getElementById('qwen_vae').value;
        const te = document.getElementById('qwen_te').value;
        
        // Get Low Bits setting (from app.js UI logic)
        const bits = document.getElementById('qwen_bits') ? document.getElementById('qwen_bits').value : "Automatic (fp16 LoRA)";

        const modulesToLoad = [vae, te].filter(v => v && v !== "Automatic" && v !== "None");

        let overrides = {
            "sd_model_checkpoint": modelTitle,
            "sd_vae": vae === "Automatic" ? "Automatic" : "Automatic", 
            "forge_additional_modules": modulesToLoad, 
            "forge_unet_storage_dtype": bits
        };

        // 3. Construct Payload
        const payload = {
            "prompt": prompt,
            "negative_prompt": neg,
            "steps": steps,
            "cfg_scale": cfg,
            "width": width,
            "height": height,
            "batch_size": batchSize,
            "n_iter": batchCount,
            "sampler_name": sampler,
            "scheduler": scheduler,
            "seed": seed,
            "save_images": true,
            "override_settings": overrides
        };

        return {
            mode: 'qwen',
            modelTitle: modelTitle,
            payload: payload,
            desc: `Qwen: ${prompt.substring(0, 30)}...`
        };
    }
};

// Expose to window for app.js to find
if(window) window.Neo = Neo;