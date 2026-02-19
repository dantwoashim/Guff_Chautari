/**
 * @file components/admin/PersonaEditor.tsx
 * @description Create/Edit persona modal with reference image upload
 * Features: Upload, paste from clipboard, delete, 20-image limit
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Persona } from '../../types';
import { X, Upload, Trash2, Image as ImageIcon, Save, Loader2, Clipboard } from '../Icons';
import {
    createPersona,
    updatePersona,
    fetchReferenceImages,
    uploadReferenceImage,
    uploadFromClipboard,
    deleteReferenceImage,
    ReferenceImage
} from '../../services/adminService';

interface PersonaEditorProps {
    isOpen: boolean;
    onClose: () => void;
    persona: Persona | null; // null = creating new
    onSaved: () => void;
}

const IMAGE_TYPES = [
    { value: 'face_front', label: 'Face (Front)' },
    { value: 'face_side', label: 'Face (Side)' },
    { value: 'face_angle', label: 'Face (Angle)' },
    { value: 'full_body', label: 'Full Body' },
    { value: 'upper_body', label: 'Upper Body' },
    { value: 'casual', label: 'Casual Outfit' },
    { value: 'formal', label: 'Formal Outfit' },
    { value: 'sleepwear', label: 'Sleepwear' },
    { value: 'environment', label: 'Environment' },
    { value: 'art_style', label: 'Art Style Reference' },
    { value: 'other', label: 'Other' }
];

const MAX_REFERENCE_IMAGES = 20;

const PersonaEditor: React.FC<PersonaEditorProps> = ({
    isOpen,
    onClose,
    persona,
    onSaved
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [systemInstruction, setSystemInstruction] = useState('');
    const [statusText, setStatusText] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedImageType, setSelectedImageType] = useState('face_front');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load persona data when editing
    useEffect(() => {
        if (persona) {
            setName(persona.name || '');
            setDescription(persona.description || '');
            setSystemInstruction(persona.system_instruction || '');
            setStatusText((persona as any).status_text || '');
            setAvatarUrl(persona.avatar_url || '');
            loadReferenceImages(persona.id);
        } else {
            // Reset for new persona
            setName('');
            setDescription('');
            setSystemInstruction('');
            setStatusText('');
            setAvatarUrl('');
            setReferenceImages([]);
        }
    }, [persona, isOpen]);

    const loadReferenceImages = async (personaId: string) => {
        const images = await fetchReferenceImages(personaId);
        setReferenceImages(images);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert('Name is required');
            return;
        }

        setSaving(true);
        try {
            if (persona) {
                // Update existing
                await updatePersona(persona.id, {
                    name,
                    description,
                    system_instruction: systemInstruction,
                    avatar_url: avatarUrl || undefined
                } as any);
            } else {
                // Create new
                await createPersona({
                    name,
                    description,
                    system_instruction: systemInstruction,
                    avatar_url: avatarUrl || undefined
                } as any);
            }
            onSaved();
            onClose();
        } catch (e) {
            console.error('Failed to save persona:', e);
            alert('Failed to save persona');
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !persona) return;

        setUploading(true);
        try {
            const result = await uploadReferenceImage(persona.id, file, selectedImageType);
            if (result) {
                setReferenceImages(prev => [...prev, result]);
            }
        } catch (e) {
            console.error('Failed to upload image:', e);
            alert('Failed to upload image');
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDeleteImage = async (image: ReferenceImage) => {
        if (!confirm('Delete this reference image?')) return;

        const success = await deleteReferenceImage(image.id, image.storage_path);
        if (success) {
            setReferenceImages(prev => prev.filter(img => img.id !== image.id));
        }
    };

    // Handle clipboard paste
    const handlePaste = useCallback(async (e: ClipboardEvent) => {
        if (!persona) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (!blob) continue;

                if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
                    alert(`Maximum ${MAX_REFERENCE_IMAGES} reference images allowed`);
                    return;
                }

                setUploading(true);
                try {
                    const result = await uploadFromClipboard(persona.id, blob);
                    if (result) {
                        setReferenceImages(prev => [...prev, result]);
                    }
                } catch (err) {
                    console.error('Paste upload failed:', err);
                    alert('Failed to upload pasted image');
                } finally {
                    setUploading(false);
                }
                break;
            }
        }
    }, [persona, referenceImages.length]);

    // Set up paste listener
    useEffect(() => {
        if (isOpen && persona) {
            document.addEventListener('paste', handlePaste);
            return () => document.removeEventListener('paste', handlePaste);
        }
    }, [isOpen, persona, handlePaste]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[250] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#111b21] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl border border-[#2a3942]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[#2a3942]">
                    <h2 className="text-lg font-bold text-[#e9edef]">
                        {persona ? `Edit: ${persona.name}` : 'Create New Persona'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-[#2a3942] rounded-full">
                        <X size={20} className="text-[#8696a0]" />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-[#00a884] uppercase tracking-wide">Basic Info</h3>

                        <div>
                            <label className="block text-xs text-[#8696a0] mb-1">Name *</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-[#2a3942] border border-[#3b4a54] rounded-lg px-4 py-2.5 text-[#e9edef] 
                                         placeholder-[#8696a0] focus:outline-none focus:border-[#00a884]"
                                placeholder="e.g., Aanya"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-[#8696a0] mb-1">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                className="w-full bg-[#2a3942] border border-[#3b4a54] rounded-lg px-4 py-2.5 text-[#e9edef] 
                                         placeholder-[#8696a0] focus:outline-none focus:border-[#00a884]"
                                placeholder="Brief description"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-[#8696a0] mb-1">Status Text</label>
                            <input
                                type="text"
                                value={statusText}
                                onChange={e => setStatusText(e.target.value)}
                                className="w-full bg-[#2a3942] border border-[#3b4a54] rounded-lg px-4 py-2.5 text-[#e9edef] 
                                         placeholder-[#8696a0] focus:outline-none focus:border-[#00a884]"
                                placeholder="Hey there! I'm using Ashim"
                            />
                        </div>

                        {/* Avatar Upload Section */}
                        <div>
                            <label className="block text-xs text-[#8696a0] mb-2">Profile Avatar</label>
                            <div className="flex items-start gap-4">
                                {/* Avatar Preview */}
                                <div className="relative">
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt="Avatar preview"
                                            className="w-20 h-20 rounded-full object-cover border-2 border-[#00a884]"
                                        />
                                    ) : (
                                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00a884] to-[#128c7e] flex items-center justify-center">
                                            <span className="text-white text-2xl font-bold">
                                                {name?.charAt(0)?.toUpperCase() || '?'}
                                            </span>
                                        </div>
                                    )}
                                    {avatarUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setAvatarUrl('')}
                                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                                            title="Remove avatar"
                                        >
                                            <X size={12} className="text-white" />
                                        </button>
                                    )}
                                </div>

                                {/* Upload Controls */}
                                <div className="flex-1 space-y-2">
                                    <div className="flex gap-2">
                                        <input
                                            type="file"
                                            id="avatar-upload"
                                            accept="image/*"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                // Use existing uploadFileToStorage which handles RLS correctly
                                                setUploading(true);
                                                try {
                                                    const { supabase } = await import('../../lib/supabase');
                                                    const { uploadFileToStorage } = await import('../../services/geminiService');

                                                    // Get current user for the upload path
                                                    const { data: { user } } = await supabase.auth.getUser();
                                                    if (!user) {
                                                        throw new Error('Not authenticated');
                                                    }

                                                    console.log('[Avatar] Using uploadFileToStorage for user:', user.id);

                                                    // Use the working upload function (same as chat attachments)
                                                    const url = await uploadFileToStorage(file, 'chat-assets', undefined, user.id);

                                                    if (url) {
                                                        console.log('[Avatar] Upload success, URL:', url);
                                                        setAvatarUrl(url);
                                                    } else {
                                                        throw new Error('Upload returned no URL');
                                                    }
                                                } catch (err: any) {
                                                    console.error('[Avatar] Failed:', err?.message || err);
                                                    alert(`Failed to upload avatar: ${err?.message || 'Unknown error'}. Try using a URL instead.`);
                                                } finally {
                                                    setUploading(false);
                                                    e.target.value = '';
                                                }
                                            }}
                                            className="hidden"
                                        />
                                        <label
                                            htmlFor="avatar-upload"
                                            className="flex items-center gap-2 px-3 py-1.5 bg-[#00a884] text-[#111b21] rounded-lg 
                                                     font-medium text-sm cursor-pointer hover:bg-[#00a884]/80 transition-colors"
                                        >
                                            {uploading ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Upload size={14} />
                                            )}
                                            Upload
                                        </label>
                                    </div>
                                    <div className="text-xs text-[#8696a0]">or paste URL:</div>
                                    <input
                                        type="text"
                                        value={avatarUrl}
                                        onChange={e => setAvatarUrl(e.target.value)}
                                        className="w-full bg-[#2a3942] border border-[#3b4a54] rounded-lg px-3 py-1.5 text-[#e9edef] 
                                                 placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] text-sm"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* System Instruction */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-[#00a884] uppercase tracking-wide">Personality (System Instruction)</h3>
                        <textarea
                            value={systemInstruction}
                            onChange={e => setSystemInstruction(e.target.value)}
                            className="w-full h-48 bg-[#2a3942] border border-[#3b4a54] rounded-lg px-4 py-3 text-[#e9edef] 
                                     placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] resize-none font-mono text-sm"
                            placeholder="You are Aanya, a 23-year-old college student..."
                        />
                        <p className="text-xs text-[#8696a0]">
                            This defines the persona's personality, speaking style, and behavior.
                            The more detailed, the better the AI analysis.
                        </p>
                    </div>

                    {/* Reference Images (only for existing personas) */}
                    {persona && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-[#00a884] uppercase tracking-wide">Reference Images</h3>

                            {/* Upload Section */}
                            <div className="flex flex-wrap items-center gap-3">
                                <select
                                    value={selectedImageType}
                                    onChange={e => setSelectedImageType(e.target.value)}
                                    className="bg-[#2a3942] border border-[#3b4a54] rounded-lg px-3 py-2 text-[#e9edef] text-sm"
                                >
                                    {IMAGE_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading || referenceImages.length >= MAX_REFERENCE_IMAGES}
                                    className="flex items-center gap-2 px-4 py-2 bg-[#00a884] text-[#111b21] rounded-lg 
                                             font-medium text-sm hover:bg-[#00a884]/80 disabled:opacity-50 transition-colors"
                                >
                                    {uploading ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Upload size={16} />
                                    )}
                                    Upload
                                </button>
                                <div className="flex items-center gap-2 px-3 py-2 bg-[#2a3942]/50 rounded-lg border border-dashed border-[#3b4a54]">
                                    <Clipboard size={14} className="text-[#8696a0]" />
                                    <span className="text-xs text-[#8696a0]">Ctrl+V to paste</span>
                                </div>
                                <div className="ml-auto text-xs text-[#8696a0]">
                                    {referenceImages.length}/{MAX_REFERENCE_IMAGES} images
                                </div>
                            </div>

                            {referenceImages.length >= MAX_REFERENCE_IMAGES && (
                                <div className="text-xs text-amber-400 bg-amber-400/10 px-3 py-2 rounded-lg">
                                    ⚠️ Maximum limit reached. Delete some images to add more.
                                </div>
                            )}

                            {/* Image Grid */}
                            <div className="grid grid-cols-4 gap-3">
                                {referenceImages.map(image => (
                                    <div key={image.id} className="relative group">
                                        <img
                                            src={image.image_url}
                                            alt={image.image_type}
                                            className="w-full aspect-square object-cover rounded-lg border border-[#2a3942]"
                                        />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 
                                                      transition-opacity rounded-lg flex items-center justify-center">
                                            <button
                                                onClick={() => handleDeleteImage(image)}
                                                className="p-2 bg-red-500/80 rounded-full text-white"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] 
                                                      px-2 py-1 rounded-b-lg truncate">
                                            {IMAGE_TYPES.find(t => t.value === image.image_type)?.label || image.image_type}
                                        </div>
                                    </div>
                                ))}
                                {referenceImages.length === 0 && (
                                    <div className="col-span-4 py-8 text-center text-[#8696a0]">
                                        <ImageIcon size={32} className="mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No reference images yet</p>
                                        <p className="text-xs">Upload images for consistent AI image generation</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!persona && (
                        <div className="p-4 bg-[#2a3942]/50 rounded-lg border border-[#3b4a54]">
                            <p className="text-sm text-[#8696a0]">
                                💡 <strong>Tip:</strong> Save the persona first, then you can add reference images and run the AI analysis.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-[#2a3942]">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-[#8696a0] hover:text-[#e9edef] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !name.trim()}
                        className="flex items-center gap-2 px-6 py-2 bg-[#00a884] text-[#111b21] rounded-lg 
                                 font-medium hover:bg-[#00a884]/80 disabled:opacity-50 transition-colors"
                    >
                        {saving ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Save size={16} />
                        )}
                        {persona ? 'Save Changes' : 'Create Persona'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PersonaEditor;
