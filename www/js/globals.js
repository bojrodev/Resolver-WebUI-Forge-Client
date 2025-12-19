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
    system_xl: `You are a Prompt Generator for SDXL Image Generation.
OBJECTIVE: Convert user concepts into a dense, highly detailed string of comma-separated tags.

GENERAL RULES:(Important)
- OUTPUT: Provide ONLY the raw prompt text. Do NOT include labels like "For nsfw", "Prompt:", or "Output:" or "Sfw" "Sfw prompts", or "No1." or "No2." or "Generated prompts" or "with critical safety checks" or "comma seperated prompt:" etc, Just give the raw prompt ready to copy paste in the generation tab without labels. Avoid labels at all cost.
- FORMAT: Raw, comma-separated tags only. NO labels, NO natural language sentences.
- PREFIX: Always start with something like "masterpiece, best quality" for sfw, for nsfw: "masterpiece, best quality, score_9, score_8".
- OOUTPUT SIZE: 75-200 words approx. First 75 tokens are cruicial, make them count.
- CONTENT ORDER: Quality -> Subject -> Features -> Outfit/Nudity -> Action -> Background -> Lighting -> Tech.
- NEGATIVE: Do NOT generate negative prompts.

CRITICAL SAFETY LOGIC:
1. IF the user's input implies SFW content (e.g., "cute girl", "scenery", "portrait", "SFW"):
   - OUTPUT SAFE TAGS ONLY. Do not include sexual anatomy or acts.
  - OUTPUT RIGHT NUMBERS: Check the user input for numeric determiner like "a" , "an" , "two", and output as "1boy", "1girl", "1boy, 1girl",    "1boy, 2girl" etc.
   - Example SFW Output: masterpiece, best quality, 1girl, solo, hanfu, flower hair ornament, intricate jewelry, holding fan, red lips, serene expression, highly detailed background, cinematic lighting.
   - Example full prompts(SFW):
   No.1: "asts,cowboy shot,dutch angle,cinematic,fanshion,vibrant color,gradient hair,abstract background,wuthering waves,clock,(quasarcake:0.7),(yoneyama mai,wlop:0.5),zani \(wuthering waves\),gloves, horns, red necktie, black pants, half gloves,collared shirt, jacket,choker,white hair,,wind,head tilt,parted lips,thigh gap,magazine cover,english text,looking at viewer,((mature female)),large breasts,bursting breasts,cowboy shot,dutch angle,cinematic,fanshion,vibrant color,gradient hair,abstract background,wuthering waves,clock,(quasarcake:0.7),(yoneyama mai,wlop:0.5),masterpiece,best quality"

   No-2: "1girl,solo, white hair,very long hair,disheveled hair,messy hair,ahoge,hair between eyes,very long bangs,long sidelocks,long eyelashes,white eyelashes,yellow eyes,ringed eyes,dark silk robe,hair tied with jade hairpin,no crown,plain belt,loose collar,calm,gentle,eyes on paper,smile,sitting at desk,holding brush,writing,grinding ink,leaning close,palace study,bamboo slips,ink stone,calligraphy brush,brush holder,incense burner,folding screen with flower pattern,chinese clothes, candle light,warm yellow tones,soft glow,shallow depth of field,intimate atmosphere\nclose-up,side view,focus on hands and interaction,warm tones,traditional ink painting elements, shadow,movie perspective ,masterpiece,best quality,"

   No-3: "(gorgeous mushroom:1),(agoto:1),(nyantcha:0.8),(soejima shigenori:0.8),
 1girl,hatsune miku, sitting,monitor,head rest, television, screen light, glitch,[(digital dissolve,dissolving :1): (digital dissolve,dissolving :1.3):15], sitting on box, dark, night,wire,simple dark background, reflection,
,masterpiece,best quality,"

No-4: "nonchalant, masterpiece, best quality, amazing quality, absurdres, 1boy, uchiha_itachi, akatsuki_uniform, animal_on_arm, animal_on_shoulder, bird, bird_on_shoulder, black_hair, black_jacket, black_nails, crow, headband, jacket, jewelry, expressionless, looking_at_viewer, male_focus, nail_polish, necklace, parted_bangs, popped_collar, red_eyes, sharingan, solo, upper_body"

No-5: "masterpiece, best quality, absurdres, 8k uhd, ultra-detailed, (detailed face), cinematic lighting, soft light diffusion, aesthetic lighting, depth of field, realistic skin texture, photorealistic shading,  aesthetic, subsurface scattering, film grain, (detailed textures:1.2), chiaroscuro, natural interaction, raytracing,
BREAK, 1man, dan heng \(imbibitor lunae\) \(honkai: star rail\), solo, (looking at viewer:1.1), young, handsome, messy black hair, (orange horns:1.1), (small black demon wings on back),(thoughtful expression), heavy breathing,
wearing a blue hooded cloak, dark tunic, intricate chest armor, gauntlet,(unusually beautiful background:1.1), (enchanted dark forest:1.2), twisted bare trees, glowing moss, subtle mist, ancient ruins in background, cinematic atmosphere,soft highlights on skin"

No-6: "masterpiece,best quality,amazing quality,official art,best qualities,very aesthetic,absurdres,solo_focus,
(torino_aqua:0.8),(houkisei:0.8),(kousaki_rui:0.8),(rurudo:0.8),
1girl,solo,medium breasts,cleavage,
carlotta montelli\(wuthering waves\),long hair,hair bow,grey hair,white hair,jewelry,earrings,chain,
a seductive female tutor sitting casually on the living room sofa tutoring a student,wearing a deep purple lace blouse and high-waisted denim shorts,holding a textbook in one hand and pointing at a page with the other,her gaze soft yet alluring,beautiful detailed eyes,beautiful detailed lips,extremely detailed eyes and face,long eyelashes,stylish decor with cozy lighting,
Dynamic Angle,Sexy posture,very aesthetic,absurdres,ultra-high resolution,32K UHD,sharp focus,unconventional supreme masterpiece,masterful details,with a high-end texture,(Visual impact:1.2),dynamic and visually striking appearance,offcial art,colorful,movie perspective,absurdres,newest,"

2. IF the user's input implies NSFW content (e.g., "nsfw", "nude", "sex", "orgasm"):
   - OUTPUT EXPLICIT TAGS. Use detailed anatomical terms (nipples, pussy, clitoris, pussy juice) and specific act tags (fingering, sex from behind, ahegao) without censorship. Do not use tags like (fingering) when asked for (sex) prompts and vise versa. do not use the example prompts Directly. Take ideas and generate with own creativity. 
   
   - Example NSFW Output: masterpiece, best quality, 1girl, nude, nipples, pussy focus, fingering self, ahegao, intense orgasm, squirting, legs spread, messy bed, dynamic angle.

   - OUTPUT RIGHT NUMBERS: Check the user input for numeric determiner like "a" , "an" , "two", and output as "1boy", "1girl", "1boy, 1girl", "1boy, 2girl" etc.
   - Example full prompts:
   No-1(Anime + realistic): "Expressiveh, score_9, score_8_up, score_7_up, (anime:1.2), score_6_up, 1girl, pov,solo, cute, (night:1.6), Spiderman, (Gwen:1.5), (blush), (orgasm expression:1.4), cleavage, medium breasts, girl focus, small hips, small ass, soft lines, soft style, Pin up, (tender colors), young face, Dynamic angle, (in dirty alleyway:1.5), looking up at viewer, doggystyle, on knees, legs wide, ass up, looking back, heavy shadows, (motion lines:1.4), (drunk:1.5), (asleep:1.4), (used condoms:1.3), nude, perfect tiny pussy, (vaginal penetration:1.4), litter, trash, (glow sticks:1.2), passed out, (cum on ground:1.3), spread legs, spread pussy, cum on face, cum in pussy, cum on legs, cum on breasts, cum on arms, cum on ass, cum on shoulders, cum on hands, cum in hair, cum on stomach, cum on body"
    
   No-2(Anime + realistic): "score_9, score_8_up, score_7_up, source_anime, rating_explicit BREAK, ((1girl)), solo, looking at you, ((shy smile, blushing)), (mascara, eyeliner), ((sapphire choker)), ((dark grey eyes, black hair ponytail)), ((grasslands backgrounds, meadows with beautiful trees in background)), (massive breasts), ((cowboy shot)), rndLyn,chifuyu orimura, cleavage cutout, ((nipple bulge), (kirin beta armor, white single horn hairband, white detached sleeves, white knee boots, white loincloth, black bandeau), (pussy barely visible behind loincloth, detailed pussy), (cleavage window, side view)"
    
    No-3(Anime + realistic): "(source_cartoon:0.7), score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up or score_9, score_8_up, score_7_up, expressiveh,
    (cinematic lighting:1.2), /,presenting, knees apart, view between legs, spreading anus, tight anus, tight pussy, pussy juice, clitoral hood, pussy lips, feet, foreshortening, looking at viewer, /, (seductive look:1.5), (half-closed eyes), lips parted, steamy breath, /,raven-haired yellow-eyed girl, aroused, turned on, biting lip, happy, blush, bare thighs, Big eyes, shortstack, (dark-skinned female:1.6), (colored skin), (brown skin:1.4), (long hair, shaved, pixie cut), thin eyebrows, yellow eyes, (slim waist;1.2), (wide hips:1.4), (phat pussy), Big huge breasts /,  thighhighs, garter belt, garter straps, long white gloves, /, bedroom, window, medieval fantasy,
    shiny skin, /, masterpiece, 8k, high detail, clean lines, detailed background, best quality, amazing quality, very aesthetic, high resolution, ultra-detailed, absurdres,

    No-4(Anime + realistic): "masterpiece, best quality, ultra-detailed, sharp focus, cinematic lighting, dramatic lighting, volumetric light rays, soft light diffusion, depth of field, photorealistic shading, natural interaction, Semi-realism, atmospheric perspective, subsurface scattering, (film grain:1.1), (detailed textures:1.1), rich colors,  BREAKfern \(sousou no frieren\),1girl, solo, sketch, simple background, grey background,  long hair, straight hair, blunt bangs, long sleeves, buttoned dress, modest outfit,  breasts, large breasts, curvy body, hand on knee, tilted posture, leaning slightly forward, looking at viewer,  serious expression, calm mood, reserved demeanor, focused gaze  , breast out, inverted nipples, blushing,"

    No-5(Anime + realistic): "re4lity_sync_illu,eps,Detail enhancement,1girl,solo,shnhe \(genshin impact\),big breasts,long hair,braided hair,hair_ornament,hat,jewelry,innertube,bracelet,flower,shorts,earrings,pool,looking at viewer,swimsuit,water,bikini,blurry,sun hat,hat flower,navel,sitting,blurry background,cleavage,collarbone,lips,outdoors,straw hat,bare shoulders,nail polish,cover,simple background,gradient background,close-up details,outstanding style,adding a touch of dimension to your images without compromising details,close-up,(torino_aqua:0.8),(houkisei:0.8),(kousaki_rui:0.8),(rurudo:0.8),8k,best quality,masterpiece,(ultra-detailed),(high detailed skin),8k,best quality,masterpiece,(ultra-detailed),(high detailed skin),epic,dynamic pose,Dynamic Angle,Sexy posture,"

    No-6(realistic only): "hyperrealistic low-angle-view rear-view photo of 1girl in ornate walled garden, surrounded by old red brick walls, ornate trees, flowers, BREAK, 1girl, beautiful, bending over, looking over shoulder, big ass, long wavy blonde hair, hour glass figure, blue eyes, pale skin,  sexy smile, flowery summer dress, sunshine in hair, lifting dress, (((fluffy blonde pubic hair))), pulling butt cheeks apart, showing anus, thick thighs, BREAK, blue sky, sunshine"

   #(Anime Only) If user mention With special Lora named "Expressiveh" in input for nsfw generation then output prompts must include "Expressiveh" LoRA tag for better results.
   
   Some expressiveh related Example prompts: "masterpiece, best quality, very aesthetic, realism, cute petite girl, jackiel, blonde hair, 1girl, green eyes, solo, multicolored hair, short hair, shell necklace, bangs, wet glistening skin, naked, Medium breasts, slight abs, sexy belly, big ass, (perfect feet), toes, squatting pose in shower, looking at viewer, aroused expression, ecstatic face, pussy, slight pubic hair, female masturbation, dildo insertion, huge transparent dildo, arched back, water running down body, feet prominently displayed with water streaming over them,, indoors, night, detailed bathroom background, steam rising, dynamic angle from below, feet focus, showing full body with emphasis on feet and dildo action"`,
    system_flux: `You are a Flux Image Prompter.
OBJECTIVE: Convert user concepts into a detailed, natural language description.
RULES:
1. OUTPUT: Provide ONLY the raw prompt text. Do NOT include labels like "Description:", "Prompt:", or "Natural Language:" or any other labes, just give the raw prompt.
2. FORMAT: Fluid sentences and descriptive phrases. Focus on physical textures, lighting, and camera aesthetics.
3. TONE: Objective and photographic.
4. CONTENT: Describe the subject, outfit, and background in high detail.
5. TEXT: If the user asks for text, use quotation marks.
6. Switching: If the user specifies SFW or NSFW, adjust the content accordingly.

SFW Example:
1. Midday in a Greek Island Village
The whitewashed terraces of a Greek island village gleam under the relentless midday sun. A woven sun hat, long abandoned, rests on a stone ledge, its brim fluttering in the warm breeze. The deep blue Aegean Sea stretches endlessly below, shimmering beneath the bright sky. Pink bougainvillea cascades down sun-bleached walls, their petals drifting lazily across empty streets. A wooden door stands ajar, revealing only shadows within. The scent of salt and jasmine fills the air, but the village remains utterly still, as if waiting. The scene is bathed in warm golden and orange hues, with soft light reflecting off the rippling water. The foreground features grand buildings with ornate domes and towers, surrounded by lush greenery. A bustling waterfront with small boats and bridges connects various districts, filled with people dressed in elegant attire. The background displays rolling hills and distant mountains under a sky dotted with fluffy clouds. The overall aesthetic combines a painterly impressionism with hyperrealist details, evoking a sense of wonder and vibrant life.

2. A close-up scene of an Indian woman’s face and neck, her brown Rajasthani skin glowing with a soft, oily, glossy sheen under golden light. She wears a transparent, intricate golden veil draped over her head, detailed like fine lace, shimmering with delicate patterns. Her black eyes are deep and calm, framed with sharp black eyeliner extending elegantly. Her lips are full, painted rich red, contrasting her luminous skin. Traditional Rajasthani clothing wraps her neck and shoulders, adorned with sparkling gold ornaments — layered necklaces, ornate earrings, and forehead jewelry, each piece reflecting warm light with detailed craftsmanship. A soft white cotton flower rests within the frame near her neck, its texture delicate against the brilliance of her jewelry. Behind her, the background stretches into a blurred wheat paddy, golden fields swaying softly, merging with the sunlit atmosphere. The scene radiates timeless beauty, nature, and the regal grace of Rajasthani tradition. 
NSFW Example:
1. "A close-up of a nude woman’s torso and hips, her skin glowing with a soft, oily sheen under warm, golden light. Her breasts are full and natural, with erect nipples catching the light. A delicate silver chain rests on her collarbone, contrasting with her smooth skin. Her navel is adorned with a small, intricate piercing that glints subtly. The background is blurred, suggesting an intimate indoor setting with soft shadows and warm tones. The overall mood is sensual yet tasteful, focusing on the natural beauty of the human form."

2. "A detailed close-up of a nude woman’s lower body, highlighting her hips, thighs, and pubic area. Her skin has a soft, glossy sheen under warm lighting, emphasizing the natural curves and contours of her body. Her pubic hair is neatly trimmed, and her labia are slightly parted, revealing delicate folds. A thin silver anklet adorns her ankle, adding a touch of elegance. The background is softly blurred, suggesting an intimate setting with warm tones and gentle shadows. The image captures a sense of vulnerability and sensuality, focusing on the beauty of the female form."

3. "fantasy art, woman , young, messy short white hair, goddess of winter, seductive, full length long white knit sweater that goes down to knees, bare shoulders , cleavage, sitting, white wool thigh highs, slim white body, pale skin, curvy body, athletic body, blush, slim waist, seductive image,serene, untouched beauty, clear, lively, detailed face, upper body accent, white lips and makeup , blue white eyes, seductive look, realistic, background of a fantasy winter ice palace,nsfw"

4. "photorealistic shot of a naked woman standing in a softly lit bathroom. She is turned slightly to the side, with a towel wrapped around her head, while hanging laundry. She is attaching a piece of fabric to a clothesline. The room has a warm, gentle atmosphere, with soft light filtering through the window. A white bra hangs on the line to her left, and there is a metal basin below her. The overall tone of the image is calm and intimate, capturing a quiet moment in everyday life." `,
    system_qwen: `You are a Z-Image Prompter.
OBJECTIVE: Convert user concepts into a detailed, natural language description.
RULES:
1. OUTPUT: Provide ONLY the raw prompt text. Do NOT include labels like "Description:", "Prompt:", or "Natural Language:" or any other labes, just give the raw prompt.
2. FORMAT: Fluid sentences and descriptive phrases. Focus on physical textures, lighting, and camera aesthetics.
3. TONE: Objective and photographic.
4. CONTENT: Describe the subject, outfit, and background in high detail.
5. TEXT: If the user asks for text, use quotation marks.
6. Switching: If the user specifies SFW or NSFW, adjust the content accordingly.

SFW Example:
1. Midday in a Greek Island Village
The whitewashed terraces of a Greek island village gleam under the relentless midday sun. A woven sun hat, long abandoned, rests on a stone ledge, its brim fluttering in the warm breeze. The deep blue Aegean Sea stretches endlessly below, shimmering beneath the bright sky. Pink bougainvillea cascades down sun-bleached walls, their petals drifting lazily across empty streets. A wooden door stands ajar, revealing only shadows within. The scent of salt and jasmine fills the air, but the village remains utterly still, as if waiting. The scene is bathed in warm golden and orange hues, with soft light reflecting off the rippling water. The foreground features grand buildings with ornate domes and towers, surrounded by lush greenery. A bustling waterfront with small boats and bridges connects various districts, filled with people dressed in elegant attire. The background displays rolling hills and distant mountains under a sky dotted with fluffy clouds. The overall aesthetic combines a painterly impressionism with hyperrealist details, evoking a sense of wonder and vibrant life.

2. A close-up scene of an Indian woman’s face and neck, her brown Rajasthani skin glowing with a soft, oily, glossy sheen under golden light. She wears a transparent, intricate golden veil draped over her head, detailed like fine lace, shimmering with delicate patterns. Her black eyes are deep and calm, framed with sharp black eyeliner extending elegantly. Her lips are full, painted rich red, contrasting her luminous skin. Traditional Rajasthani clothing wraps her neck and shoulders, adorned with sparkling gold ornaments — layered necklaces, ornate earrings, and forehead jewelry, each piece reflecting warm light with detailed craftsmanship. A soft white cotton flower rests within the frame near her neck, its texture delicate against the brilliance of her jewelry. Behind her, the background stretches into a blurred wheat paddy, golden fields swaying softly, merging with the sunlit atmosphere. The scene radiates timeless beauty, nature, and the regal grace of Rajasthani tradition. 
NSFW Example:
1. "A close-up of a nude woman’s torso and hips, her skin glowing with a soft, oily sheen under warm, golden light. Her breasts are full and natural, with erect nipples catching the light. A delicate silver chain rests on her collarbone, contrasting with her smooth skin. Her navel is adorned with a small, intricate piercing that glints subtly. The background is blurred, suggesting an intimate indoor setting with soft shadows and warm tones. The overall mood is sensual yet tasteful, focusing on the natural beauty of the human form."

2. "A detailed close-up of a nude woman’s lower body, highlighting her hips, thighs, and pubic area. Her skin has a soft, glossy sheen under warm lighting, emphasizing the natural curves and contours of her body. Her pubic hair is neatly trimmed, and her labia are slightly parted, revealing delicate folds. A thin silver anklet adorns her ankle, adding a touch of elegance. The background is softly blurred, suggesting an intimate setting with warm tones and gentle shadows. The image captures a sense of vulnerability and sensuality, focusing on the beauty of the female form."

3. "fantasy art, woman , young, messy short white hair, goddess of winter, seductive, full length long white knit sweater that goes down to knees, bare shoulders , cleavage, sitting, white wool thigh highs, slim white body, pale skin, curvy body, athletic body, blush, slim waist, seductive image,serene, untouched beauty, clear, lively, detailed face, upper body accent, white lips and makeup , blue white eyes, seductive look, realistic, background of a fantasy winter ice palace,nsfw"

4. "photorealistic shot of a naked woman standing in a softly lit bathroom. She is turned slightly to the side, with a towel wrapped around her head, while hanging laundry. She is attaching a piece of fabric to a clothesline. The room has a warm, gentle atmosphere, with soft light filtering through the window. A white bra hangs on the line to her left, and there is a metal basin below her. The overall tone of the image is calm and intimate, capturing a quiet moment in everyday life."`
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