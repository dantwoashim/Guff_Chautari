/**
 * @file services/adminService.ts
 * @description Admin dashboard service functions - Updated for global persona system
 */
import { supabase } from '../lib/supabase';
import { Persona } from '../types';

const supabaseDb = supabase;


export interface UserStats {
    id: string;
    email: string;
    created_at: string;
    conversation_count: number;
    chat_count: number;
    last_active: string | null;
}

export interface SystemStats {
    total_users: number;
    active_users_today: number;
    total_conversations: number;
    total_personas: number;
    processed_personas: number;
}

export interface PersonaStats {
    persona_id: string;
    name: string;
    is_active: boolean;
    is_processed: boolean;
    user_count: number;
    conversation_count: number;
    image_count: number;
    created_at: string;
    processed_at: string | null;
}

export interface ReferenceImage {
    id: string;
    persona_id: string;
    image_url: string;
    storage_path: string;
    image_type: string;
    description: string | null;
    is_primary: boolean;
    display_order: number;
}

// ============================================
// ADMIN CHECK
// ============================================

export const checkIsAdmin = async (userId: string): Promise<boolean> => {
    try {
        const { data, error } = await supabaseDb
            .from('admin_users')
            .select('user_id')
            .eq('user_id', userId)
            .single();

        return !error && !!data;
    } catch {
        return false;
    }
};

// ============================================
// USER MANAGEMENT
// ============================================

export const fetchAllUsers = async (): Promise<UserStats[]> => {
    try {
        const { data, error } = await supabaseDb
            .from('users_view')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(u => ({
            id: u.id,
            email: u.email || 'Unknown',
            created_at: u.created_at,
            conversation_count: u.conversation_count || 0,
            chat_count: u.chat_count || 0,
            last_active: u.last_active
        }));
    } catch (e) {
        console.error('Failed to fetch users:', e);
        return [];
    }
};

// ============================================
// SYSTEM STATS
// ============================================

export const fetchSystemStats = async (): Promise<SystemStats | null> => {
    try {
        const [usersRes, convsRes, personasRes, processedRes] = await Promise.all([
            supabaseDb.from('users_view').select('id', { count: 'exact', head: true }),
            supabaseDb.from('conversations').select('id', { count: 'exact', head: true }),
            supabaseDb.from('personas').select('id', { count: 'exact', head: true }).eq('is_global', true),
            supabaseDb.from('personas').select('id', { count: 'exact', head: true }).eq('is_global', true).eq('is_processed', true)
        ]);

        return {
            total_users: usersRes.count || 0,
            active_users_today: 0,
            total_conversations: convsRes.count || 0,
            total_personas: personasRes.count || 0,
            processed_personas: processedRes.count || 0
        };
    } catch (e) {
        console.error('Failed to fetch stats:', e);
        return null;
    }
};

// ============================================
// PERSONA MANAGEMENT
// ============================================

export const fetchAllPersonas = async (): Promise<Persona[]> => {
    const { data, error } = await supabaseDb
        .from('personas')
        .select('*')
        .eq('is_global', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to fetch personas:', error);
        return [];
    }
    return data || [];
};

export const fetchPersonaStats = async (): Promise<PersonaStats[]> => {
    const { data, error } = await supabaseDb
        .from('persona_stats_view')
        .select('*');

    if (error) {
        console.error('Failed to fetch persona stats:', error);
        return [];
    }
    return data || [];
};

export const createPersona = async (
    persona: Partial<Persona>
): Promise<Persona | null> => {
    // Get current user's ID for RLS compliance
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error('No authenticated user');
        return null;
    }

    const { data, error } = await supabaseDb
        .from('personas')
        .insert({
            name: persona.name || 'New Persona',
            description: persona.description || '',
            system_instruction: persona.system_instruction || '',
            avatar_url: persona.avatar_url,
            status_text: (persona as any).status_text || 'Hey there!',
            is_global: true,  // Still global - visible to all users
            is_online: true,
            is_active: true,
            is_processed: false,
            user_id: user.id  // Use admin's ID to pass RLS (they're the "creator")
        })
        .select()
        .single();

    if (error) {
        console.error('Failed to create persona:', error);
        return null;
    }
    return data;
};

export const updatePersona = async (
    personaId: string,
    updates: Partial<Persona>
): Promise<boolean> => {
    const { error } = await supabaseDb
        .from('personas')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', personaId);

    if (error) {
        console.error('Failed to update persona:', error);
        return false;
    }
    return true;
};

/**
 * CASCADE DELETE PERSONA
 * Deletes persona and ALL related data:
 * 1. Reference images from storage
 * 2. Reference image records
 * 3. Messages in sessions using this persona
 * 4. Sessions using this persona
 * 5. The persona itself
 * 
 * NOTE: Individual steps are wrapped in try-catch to handle missing tables gracefully
 */
export const deletePersona = async (personaId: string): Promise<boolean> => {
    console.log(`%c[Admin] Starting cascade delete for persona: ${personaId}`, 'color: red; font-weight: bold');

    // 1. Try to delete reference images (table may not exist)
    try {
        const { data: images } = await supabaseDb
            .from('persona_reference_images')
            .select('id, storage_path')
            .eq('persona_id', personaId);

        if (images && images.length > 0) {
            console.log(`[Admin] Deleting ${images.length} reference images from storage`);
            const storagePaths = images.map(img => img.storage_path).filter(Boolean);
            if (storagePaths.length > 0) {
                await supabase.storage.from('persona-references').remove(storagePaths);
            }
            await supabaseDb.from('persona_reference_images').delete().eq('persona_id', personaId);
        }
    } catch (e) {
        console.warn('[Admin] Reference images cleanup skipped (table may not exist):', e);
    }

    // 2. Try to delete sessions (table may not exist)
    try {
        const { data: sessions } = await supabaseDb
            .from('sessions')
            .select('id')
            .eq('persona_id', personaId);

        if (sessions && sessions.length > 0) {
            const sessionIds = sessions.map(s => s.id);
            console.log(`[Admin] Deleting ${sessions.length} sessions and their messages`);

            for (const sessionId of sessionIds) {
                await supabaseDb.from('messages').delete().eq('session_id', sessionId);
            }
            await supabaseDb.from('sessions').delete().in('id', sessionIds);
        }
    } catch (e) {
        console.warn('[Admin] Sessions cleanup skipped (table may not exist):', e);
    }

    // 3. Try to delete conversations (table may not exist)
    try {
        const { data: convos } = await supabaseDb
            .from('conversations')
            .select('id')
            .eq('persona_id', personaId);

        if (convos && convos.length > 0) {
            const convoIds = convos.map(c => c.id);
            console.log(`[Admin] Deleting ${convos.length} conversations`);
            await supabaseDb.from('conversations').delete().in('id', convoIds);
        }
    } catch (e) {
        console.warn('[Admin] Conversations cleanup skipped (table may not exist):', e);
    }

    // 4. Finally delete the persona (this MUST succeed)
    try {
        console.log(`[Admin] Attempting to delete persona record from 'personas' table...`);

        const { error, count } = await supabaseDb
            .from('personas')
            .delete()
            .eq('id', personaId)
            .select('id');  // Return what was deleted

        if (error) {
            console.error('%c[Admin] Failed to delete persona record:', 'color: red', error);
            return false;
        }

        // Verify deletion
        const { data: checkData, error: checkError } = await supabaseDb
            .from('personas')
            .select('id, name')
            .eq('id', personaId)
            .maybeSingle();

        if (checkError) {
            console.log('[Admin] Verification query error (expected if RLS):', checkError);
        }

        if (checkData) {
            console.error('%c[Admin] DELETE FAILED - Persona still exists in database!', 'color: red; font-weight: bold', checkData);
            console.error('[Admin] This usually means RLS policy is blocking the delete. Check Supabase policies.');
            return false;
        }

        console.log(`%c[Admin] Successfully deleted persona ${personaId}`, 'color: green; font-weight: bold');
        return true;
    } catch (e) {
        console.error('%c[Admin] Critical error deleting persona:', 'color: red', e);
        return false;
    }
};

export const togglePersonaActive = async (personaId: string, isActive: boolean): Promise<boolean> => {
    return updatePersona(personaId, { is_active: isActive } as any);
};

// ============================================
// REFERENCE IMAGES
// Storage: library-images bucket (persistent per user)
// Limit: 20 images per persona
// ============================================

const REFERENCE_IMAGE_BUCKET = 'persona-references';
const MAX_REFERENCE_IMAGES = 20;

export const fetchReferenceImages = async (personaId: string): Promise<ReferenceImage[]> => {
    const { data, error } = await supabaseDb
        .from('persona_reference_images')
        .select('*')
        .eq('persona_id', personaId)
        .order('display_order', { ascending: true });

    if (error) {
        console.error('Failed to fetch reference images:', error);
        return [];
    }
    return data || [];
};

/**
 * Upload a reference image
 * - Stored in library-images bucket for persistence
 * - Limited to 20 images per persona
 * - Associated with user_id for cross-session persistence
 */
export const uploadReferenceImage = async (
    personaId: string,
    file: File,
    imageType: string,
    description?: string,
    userId?: string
): Promise<ReferenceImage | null> => {
    // 0. Check image limit
    const existing = await fetchReferenceImages(personaId);
    if (existing.length >= MAX_REFERENCE_IMAGES) {
        console.error(`Reference image limit (${MAX_REFERENCE_IMAGES}) reached for persona ${personaId}`);
        return null;
    }

    // 1. Upload to library-images bucket
    const fileName = `${personaId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from(REFERENCE_IMAGE_BUCKET)
        .upload(fileName, file);

    if (uploadError) {
        console.error('Failed to upload image:', uploadError);
        return null;
    }

    // 2. Get public URL
    const { data: urlData } = supabase.storage
        .from(REFERENCE_IMAGE_BUCKET)
        .getPublicUrl(fileName);

    // 3. Create database record with user_id for persistence
    const { data, error } = await supabaseDb
        .from('persona_reference_images')
        .insert({
            persona_id: personaId,
            user_id: userId,
            image_url: urlData.publicUrl,
            storage_path: fileName,
            image_type: imageType,
            description: description || null,
            is_primary: existing.length === 0, // First image is primary
            display_order: existing.length
        })
        .select()
        .single();

    if (error) {
        console.error('Failed to save reference image record:', error);
        // Cleanup uploaded file
        await supabase.storage.from(REFERENCE_IMAGE_BUCKET).remove([fileName]);
        return null;
    }

    console.log(`[Admin] Uploaded reference image for persona ${personaId}`);
    return data;
};

/**
 * Upload reference image from clipboard (pasted image)
 */
export const uploadFromClipboard = async (
    personaId: string,
    blob: Blob,
    userId?: string
): Promise<ReferenceImage | null> => {
    // Convert blob to File
    const file = new File([blob], `clipboard_${Date.now()}.png`, { type: blob.type || 'image/png' });
    return uploadReferenceImage(personaId, file, 'reference', 'Pasted from clipboard', userId);
};

/**
 * Delete reference image from storage and database
 */
export const deleteReferenceImage = async (imageId: string, storagePath: string): Promise<boolean> => {
    try {
        // 1. Delete from storage
        const { error: storageError } = await supabase.storage
            .from(REFERENCE_IMAGE_BUCKET)
            .remove([storagePath]);

        if (storageError) {
            console.warn('Storage delete warning:', storageError);
            // Continue anyway - record deletion is more important
        }

        // 2. Delete from database
        const { error } = await supabaseDb
            .from('persona_reference_images')
            .delete()
            .eq('id', imageId);

        if (error) {
            console.error('Failed to delete image record:', error);
            return false;
        }

        console.log(`[Admin] Deleted reference image ${imageId}`);
        return true;
    } catch (e) {
        console.error('Delete reference image failed:', e);
        return false;
    }
};

/**
 * Set an image as the primary reference
 */
export const setPrimaryImage = async (personaId: string, imageId: string): Promise<boolean> => {
    try {
        // Reset all images for this persona
        await supabaseDb
            .from('persona_reference_images')
            .update({ is_primary: false })
            .eq('persona_id', personaId);

        // Set the new primary
        const { error } = await supabaseDb
            .from('persona_reference_images')
            .update({ is_primary: true })
            .eq('id', imageId);

        return !error;
    } catch (e) {
        console.error('Set primary image failed:', e);
        return false;
    }
};

/**
 * Reorder reference images
 */
export const reorderReferenceImages = async (
    personaId: string,
    orderedImageIds: string[]
): Promise<boolean> => {
    try {
        // Update each image's display_order
        const updates = orderedImageIds.map((id, index) =>
            supabaseDb
                .from('persona_reference_images')
                .update({ display_order: index })
                .eq('id', id)
                .eq('persona_id', personaId)
        );

        await Promise.all(updates);
        return true;
    } catch (e) {
        console.error('Reorder images failed:', e);
        return false;
    }
};

/**
 * Get count of reference images for a persona
 */
export const getReferenceImageCount = async (personaId: string): Promise<number> => {
    const { count, error } = await supabaseDb
        .from('persona_reference_images')
        .select('id', { count: 'exact', head: true })
        .eq('persona_id', personaId);

    return error ? 0 : (count || 0);
};
