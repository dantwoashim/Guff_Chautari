
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { supabase } from '../lib/supabase';
import { CharacterModel } from '../types';
import { modelManager } from './modelManager';

const getAiClient = () => {
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

// ============================================================================
// TYPES & CONFIG
// ============================================================================

export interface ReferenceImage {
    base64: string;
    mimeType: string;
    purpose?: string;
}

export interface ImageGenerationContext {
    userRequest: string;
    conversationMood: string;
    recentMessages: string[];
    referenceImages: ReferenceImage[];
    characterModels?: CharacterModel[];
    timeOfDay: string;
    location: string;
    model?: string; // Allow override
    lighting?: string; // Explicit lighting override
}

export interface PhotoResult {
    imageUrl: string;
    caption: string;
    preText?: string;
    metadata: any;
}

const PHOTO_LOGIC = {
    angles: [
        "High angle smartphone selfie (arm visible)",
        "Mirror selfie (phone covering half face)",
        "Low angle 'chin check' (unflattering but real)",
        "Side profile while looking at something else",
        "Reflection in a window",
        "Blurry 'moving' shot"
    ],
    imperfections: [
        "Slight motion blur on hand",
        "Film grain / High ISO noise",
        "Lens flare from dirty camera lens",
        "Flash reflection in mirror",
        "Poor white balance (too yellow/blue)",
        "Overexposed background window",
        "Red eye (subtle)"
    ],
    clutter: [
        "Unmade bed in background",
        "Clothes piled on a chair",
        "Coffee mugs on table",
        "Tangled charging cables",
        "Open laptop with messy screen",
        "Random receipts/papers"
    ],
    lighting: {
        day: "Natural window light, harsh shadows, uneven exposure",
        night: "Dim indoor bulb (2700K), smartphone screen glow on face, flash ON",
        outdoors: "Overcast flat light or direct harsh sun (squinting eyes)"
    }
};

function determinePhotoType(request: string): 'selfie' | 'mirror' | 'pov' | 'object' {
    const r = request.toLowerCase();
    if (r.includes('outfit') || r.includes('fit') || r.includes('wear')) return 'mirror';
    if (r.includes('doing') || r.includes('view') || r.includes('eating')) return 'pov';
    if (r.includes('room') || r.includes('cat') || r.includes('dog')) return 'object';
    return 'selfie';
}

function generateFollowUp(photoType: string, mood: string, location: string, activity: string): string {
    // Context-aware follow-up based on mood and situation
    const moodResponses: Record<string, string[]> = {
        happy: [
            "hehe",
            "😊",
            "look at meee",
            "cute na?"
        ],
        tired: [
            "i look dead lol",
            "ignore my face 💀",
            "no makeup day",
            "zombie mode"
        ],
        flirty: [
            "u like? 👀",
            "just for u",
            "miss u",
            "😏"
        ],
        bored: [
            "bored af",
            "do i look ok?",
            "idk",
            "whatever"
        ],
        neutral: [
            "there u go",
            "here",
            "",
            "👆"
        ]
    };

    // Location-specific follow-ups
    const locationResponses: Record<string, string[]> = {
        'Bedroom': ["messy bed ignore", "lazy day vibes", ""],
        'Kitchen': ["making food", "hungry", "snack time"],
        'Bathroom Mirror': ["getting ready", "mirror is dirty sry", "fit check"],
        'Outdoors': ["its cold", "nice weather tho", "outside rn"],
        'Study Desk': ["so much hw", "studying 📚", "cant focus"],
        'Gym': ["workout mode", "gym selfie lol", "💪"]
    };

    // 50% chance to use mood-based, 30% location-based, 20% random simple
    const rand = Math.random();
    if (rand < 0.5) {
        const moodOptions = moodResponses[mood] || moodResponses.neutral;
        return moodOptions[Math.floor(Math.random() * moodOptions.length)];
    } else if (rand < 0.8 && locationResponses[location]) {
        const locOptions = locationResponses[location];
        return locOptions[Math.floor(Math.random() * locOptions.length)];
    }

    // Simple fallback
    return ['', '👆', 'there', 'here u go'][Math.floor(Math.random() * 4)];
}

export async function generateHyperRealisticImage(
    ctx: ImageGenerationContext
): Promise<PhotoResult | null> {
    const ai = getAiClient();
    const photoType = determinePhotoType(ctx.userRequest);

    // Use explicit lighting if provided, otherwise fallback to logic
    let lighting = ctx.lighting;
    if (!lighting) {
        const isNight = ctx.timeOfDay.includes('night');
        lighting = isNight ? PHOTO_LOGIC.lighting.night : PHOTO_LOGIC.lighting.day;
    }

    const imperfection = PHOTO_LOGIC.imperfections[Math.floor(Math.random() * PHOTO_LOGIC.imperfections.length)];
    const clutter = PHOTO_LOGIC.clutter[Math.floor(Math.random() * PHOTO_LOGIC.clutter.length)];

    // Default model if not specified, use ModelManager logic
    const targetModel = ctx.model || modelManager.getModel('vision');

    let angle = "";
    if (photoType === 'selfie') angle = "Smartphone front camera, arm extended, slightly high angle";
    if (photoType === 'mirror') angle = "Mirror selfie, phone visible in hand, full body or torso";
    if (photoType === 'pov') angle = "First person point of view (POV), legs or hands visible at bottom";

    let activeModel: CharacterModel | null = null;
    let referenceImagePart: any = null;

    if (ctx.characterModels && ctx.characterModels.length > 0) {
        activeModel = ctx.characterModels[0];
        const modelB64 = await fetchImageAsBase64(activeModel.visualUrl);
        if (modelB64) {
            referenceImagePart = {
                inlineData: { mimeType: 'image/png', data: modelB64 }
            };
        }
    } else if (ctx.referenceImages && ctx.referenceImages.length > 0) {
        referenceImagePart = {
            inlineData: { mimeType: ctx.referenceImages[0].mimeType, data: ctx.referenceImages[0].base64 }
        };
    }

    const prompt = `
    [CRITICAL INSTRUCTION: GENERATE A BAD PHOTO]
    Do NOT generate a professional, artistic, or polished image.
    Generate a CASUAL, IMPERFECT, REALISTIC SMARTPHONE PHOTO.
    
    SUBJECT: ${activeModel ? "The person in the reference image" : "A young Nepali woman"}
    ACTION: ${ctx.userRequest || "Taking a photo"}
    
    VISUAL STYLE:
    - Camera: iPhone/Android front camera or snapchat camera.
    - Quality: Low fidelity, jpeg artifacts, slight grain.
    - Lighting: ${lighting}.
    - Framing: ${angle}. Imperfect framing (maybe cut off top of head slightly).
    - Skin: Natural texture, pores visible, maybe slight acne or uneven tone. NO AIRBRUSHING.
    
    ENVIRONMENT:
    - Location: ${ctx.location || "Bedroom"}.
    - Background: ${clutter}. MESSY. Lived-in.
    - Atmosphere: Authentic, candid, spontaneous.
    
    SPECIFIC IMPERFECTION TO INCLUDE: ${imperfection}.
    
    IDENTITY LOCK: ${referenceImagePart ? "Maintain strict facial consistency with reference." : "Generic nepali features."}
    `;

    const parts: any[] = [];
    if (referenceImagePart) parts.push(referenceImagePart);
    parts.push({ text: prompt });

    try {
        console.log(`[ImageGen] Generating using model: ${targetModel}`);

        return await modelManager.runWithFallback('vision', async (model) => {
            const response = await ai.models.generateContent({
                model: model,
                contents: [{ role: 'user', parts }],
                config: {
                    // @ts-ignore
                    imageConfig: { aspectRatio: photoType === 'pov' ? "16:9" : "3:4" },
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
                    ]
                }
            });

            const imageData = extractImage(response);
            if (!imageData) {
                throw new Error("No image data extracted from response");
            }

            const imageUrl = await uploadGeneratedImage(imageData);
            if (!imageUrl) {
                throw new Error("Failed to get image URL");
            }

            const caption = generateFollowUp(photoType, ctx.conversationMood, ctx.location, ctx.userRequest);
            const preText = getPreText(photoType, ctx.conversationMood, ctx.userRequest);

            return {
                imageUrl,
                caption,
                preText,
                metadata: {
                    type: photoType,
                    imperfection,
                    lighting
                }
            };
        });

    } catch (e) {
        console.error("Image Gen Failed", e);
        return null;
    }
}

function getPreText(type: string, mood: string, userRequest: string): string | undefined {
    // 40% chance to skip pre-text entirely for more natural flow
    if (Math.random() > 0.6) return undefined;

    // Context-aware pre-text based on user request
    const requestLower = userRequest.toLowerCase();

    // If user asked nicely or specifically
    if (requestLower.includes('please') || requestLower.includes('can u')) {
        return ['sure', 'ok', 'fine', 'yea'][Math.floor(Math.random() * 4)];
    }

    // If user is demanding
    if (requestLower.includes('now') || requestLower.includes('send')) {
        return ['okayy', 'chill', 'one sec', ''][Math.floor(Math.random() * 4)];
    }

    // If asking for selfie specifically
    if (type === 'selfie') {
        return ['lemme take one', 'sec', 'hold on', ''][Math.floor(Math.random() * 4)];
    }

    // If pov/view request
    if (type === 'pov') {
        return ['look', 'here', 'my view rn', ''][Math.floor(Math.random() * 4)];
    }

    return undefined;
}

function extractImage(response: any): string | null {
    const candidates = response.candidates || [];
    if (candidates.length > 0) {
        const parts = candidates[0].content?.parts || [];
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                return part.inlineData.data;
            }
        }
    }
    return null;
}

async function fetchImageAsBase64(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    } catch (e) {
        console.error("Failed to fetch image as base64", e);
        return "";
    }
}

async function uploadGeneratedImage(base64Data: string): Promise<string | null> {
    const dataUri = `data:image/png;base64,${base64Data}`;
    try {
        const padding = '='.repeat((4 - base64Data.length % 4) % 4);
        const base64 = (base64Data + padding).replace(/-/g, '+').replace(/_/g, '/');
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        const fileName = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

        const { error } = await supabase.storage.from('chat-assets').upload(fileName, blob, { upsert: true });
        if (error) {
            console.warn("Supabase upload failed (likely missing bucket), falling back to Data URI:", error.message);
            return dataUri;
        }

        const { data } = supabase.storage.from('chat-assets').getPublicUrl(fileName);
        return data.publicUrl;
    } catch (e) {
        console.error("Image upload exception, falling back to Data URI", e);
        return dataUri;
    }
}
