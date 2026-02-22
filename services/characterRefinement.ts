
/**
 * @file services/characterRefinement.ts
 */

import { GoogleGenAI } from "@google/genai";
import { ReferenceAsset, CharacterModel } from '../types';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

// Safe lazy initialization
const getAiClient = () => {
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
    return new GoogleGenAI({ apiKey: apiKey || '' });
};

// --------------------------------------------------------
// HELPERS
// --------------------------------------------------------

async function urlToBase64(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    } catch (e) {
        console.error("Failed to convert image to base64", e);
        return "";
    }
}

// --------------------------------------------------------
// STEP 1: DEEP ANATOMICAL EXTRACTION
// --------------------------------------------------------

async function analyzeIdentity(base64Images: string[], mimeTypes: string[]): Promise<string> {
    if (base64Images.length === 0) throw new Error("No reference images found.");

    const ai = getAiClient();
    const parts = base64Images.map((b64, i) => ({
        inlineData: {
            data: b64,
            mimeType: mimeTypes[i]
        }
    }));

    const prompt = `
    Conduct a forensic-level anatomical analysis of the person in these images.
    
    Extract the following details for a 3D reconstruction text-prompt:
    1. Facial Geometry: Face shape, jawline strength, cheekbone height, forehead width.
    2. Eyes: Exact shape (almond, round, etc), canthal tilt, iris color patterns, eyelash density.
    3. Nose & Lips: Bridge width, tip shape, lip fullness, cupid's bow definition.
    4. Skin: Underlying skin tone (hex code approx), texture (freckles, moles, pores), undertones.
    5. Hair: Root density, exact color blend, texture, natural flow.
    6. Body: Estimated build, posture.
    
    Output a single, dense paragraph describing this person's physical "Digital DNA". 
    Focus ONLY on physical features, not clothing or background.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts: [...parts, { text: prompt }] }]
    });

    return response.text || "Analysis failed.";
}

interface ArchetypeDef {
    name: string;
    context: string;
    lighting: string;
    expression: string;
    outfit: string;
}

const ARCHETYPES: ArchetypeDef[] = [
    { name: "The Candid", context: "Coffee shop, mid-laugh", lighting: "Natural window light", expression: "Genuine laughter, eyes crinkled", outfit: "Casual oversized sweater" },
    { name: "The Professional", context: "Modern office, blurred background", lighting: "Soft studio lighting", expression: "Confident, slight smile", outfit: "Sharp blazer or smart casual" },
    { name: "Golden Hour", context: "Outdoor sunset, city balcony", lighting: "Warm backlighting, lens flare", expression: "Serene, looking away", outfit: "Sundress or light shirt" },
    { name: "Deep Focus", context: "Library or desk, late night", lighting: "Monitor glow, moody", expression: "Intense concentration", outfit: "Comfortable hoodie" },
    { name: "The Traveler", context: "Busy street in a foreign city", lighting: "Overcast day, diffuse", expression: "Curious, looking at surroundings", outfit: "Jacket and scarf" },
    { name: "Morning Raw", context: "Bedroom, messy sheets", lighting: "Bright morning sun", expression: "Sleepy, rubbing eyes, no makeup", outfit: "Pajamas or t-shirt" },
    { name: "Elegant Evening", context: "Dimly lit restaurant", lighting: "Candlelight, warm bokeh", expression: "Alluring, direct eye contact", outfit: "Evening wear, jewelry" },
    { name: "Fitness/Active", context: "Gym or hiking trail", lighting: "Harsh daylight or fluorescent", expression: "Determined, slightly sweaty", outfit: "Athletic wear" },
    { name: "Rainy Mood", context: "Inside car or by window, rain on glass", lighting: "Cool tones, grey light", expression: "Melancholic, pensive", outfit: "Cozy knitwear" },
    { name: "Social Butterfly", context: "Party or crowded room", lighting: "Dynamic, colorful ambient light", expression: "Excited, talking", outfit: "Trendy party outfit" }
];

async function defineModels(dna: string): Promise<CharacterModel[]> {
    const ai = getAiClient();
    const models: CharacterModel[] = [];

    const fusionPrompt = `
    I have a "Digital DNA" description of a person:
    "${dna}"

    I need you to create 10 distinct Image Generation Prompts based on the following archetypes.
    For each archetype, combine the Digital DNA (anatomy) with the Scene Context.
    
    Archetypes: ${JSON.stringify(ARCHETYPES)}

    Return JSON array of objects: { "archetype": string, "prompt": string }
    The 'prompt' must be highly detailed, photorealistic, 8k, ensuring identity consistency.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{ role: 'user', parts: [{ text: fusionPrompt }] }],
        config: { 
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 10 }
        }
    });

    const data = JSON.parse(response.text || '[]');
    
    data.forEach((item: any) => {
        models.push({
            id: uuidv4(),
            name: item.archetype,
            archetype: item.archetype,
            description: item.prompt,
            visualUrl: '',
            createdAt: Date.now(),
            facialGeometry: dna
        });
    });

    return models;
}

async function generateModelImage(
    model: CharacterModel, 
    referenceB64: string, 
    referenceMime: string
): Promise<string> {
    const ai = getAiClient();
    try {
        const prompt = `
        IDENTITY REQUIREMENT: The person in this image MUST be the exact same person as provided in the image input.
        Maintain facial features, bone structure, and ethnicity precisely.
        
        SCENE: ${model.description}
        
        STYLE: 8k resolution, photorealistic, cinematic.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image', 
            contents: [{ 
                role: 'user', 
                parts: [
                    { inlineData: { mimeType: referenceMime, data: referenceB64 } }, 
                    { text: prompt }
                ] 
            }],
            config: {
                // @ts-ignore
                imageConfig: { aspectRatio: "3:4" }
            }
        });

        let imageData = "";
        const candidates = response.candidates || [];
        if (candidates.length > 0) {
            const parts = candidates[0].content?.parts || [];
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    imageData = part.inlineData.data;
                    break;
                }
            }
        }

        if (!imageData) return "";

        const fileName = `archetype-${model.name.replace(/\s/g, '-')}-${Date.now()}.png`;
        const dataUri = `data:image/png;base64,${imageData}`;

        // Try Upload
        try {
            const padding = '='.repeat((4 - imageData.length % 4) % 4);
            const base64 = (imageData + padding).replace(/-/g, '+').replace(/_/g, '/');
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });

            const { error } = await supabase.storage.from('chat-assets').upload(fileName, blob, { upsert: true });
            if (error) {
                console.warn("Refinement upload failed, using fallback URI", error);
                return dataUri;
            }

            const { data } = supabase.storage.from('chat-assets').getPublicUrl(fileName);
            return data.publicUrl;
        } catch (e) {
            console.warn("Upload exception", e);
            return dataUri;
        }

    } catch (e) {
        console.error(`Failed to generate image for ${model.name}`, e);
        return "";
    }
}

export const characterRefinement = {
    async *runRefinement(assets: ReferenceAsset[]) {
        yield { status: 'loading', progress: 5, message: "Loading reference images..." };
        
        const imageAssets = assets.filter(a => a.type === 'image');
        if (imageAssets.length === 0) throw new Error("No images to refine.");

        const base64Images: string[] = [];
        const mimeTypes: string[] = [];

        for (const asset of imageAssets.slice(0, 3)) {
            const b64 = await urlToBase64(asset.url);
            if (b64) {
                base64Images.push(b64);
                mimeTypes.push(asset.mimeType);
            }
        }

        if (base64Images.length === 0) throw new Error("Could not load reference images.");

        yield { status: 'analyzing', progress: 15, message: "Extracting Digital DNA..." };
        const dna = await analyzeIdentity(base64Images, mimeTypes);
        
        yield { status: 'analyzing', progress: 30, message: "Defining Archetypes..." };
        const models = await defineModels(dna);

        yield { status: 'generating', progress: 40, message: "Synthesizing 10 Neural Models..." };
        const finishedModels: CharacterModel[] = [];
        
        const anchorImage = base64Images[0];
        const anchorMime = mimeTypes[0];

        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            const url = await generateModelImage(model, anchorImage, anchorMime);
            
            if (url) {
                finishedModels.push({ ...model, visualUrl: url });
            }
            
            const percent = 40 + Math.round(((i + 1) / models.length) * 60);
            yield { status: 'generating', progress: percent, message: `Rendered ${model.name}...` };
        }

        return finishedModels;
    }
};
