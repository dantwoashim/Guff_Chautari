
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Sparkles, Globe, Settings as SettingsIcon, LogOut,
  Cpu, Image, Check, Film, Loader2, Library
} from '../Icons';
import { ChatConfig, InstructionPreset, ReferenceAsset, AssetAlbum } from '../../types';
import {
  uploadFileToStorage,
  fetchPresets,
  savePreset,
  deletePreset,
  fetchLibraryFiles
} from '../../services/geminiService';
import { generatePersonaPreview } from '../../services/personaProcessor';
import { v4 as uuidv4 } from 'uuid';

// Import Sub-Components
import PersonaSettings from './PersonaSettings';
import GeneralSettings from './GeneralSettings';
import DataSettings from './DataSettings';
import AdvancedSettings from './AdvancedSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChatConfig;
  onSave: (config: ChatConfig) => void;
  userId?: string;
  isProcessingPersona?: boolean;
  onLogout?: () => void;
  isDarkMode?: boolean;
}

const ALBUM_STORAGE_KEY = 'ashim_asset_albums';

const TABS = [
  { id: 'persona', icon: Sparkles, label: 'Persona' },
  { id: 'general', icon: Globe, label: 'General' },
  { id: 'data', icon: Image, label: 'World' },
  { id: 'advanced', icon: Cpu, label: 'Advanced' },
] as const;

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  userId,
  isProcessingPersona,
  onLogout,
  isDarkMode
}) => {
  const [localConfig, setLocalConfig] = useState<ChatConfig>(config);
  const [activeTab, setActiveTab] = useState<'persona' | 'general' | 'data' | 'advanced'>('persona');

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState<any[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  const [uploadingRef, setUploadingRef] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  const [presets, setPresets] = useState<InstructionPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [isPresetLoading, setIsPresetLoading] = useState(false);

  const [albums, setAlbums] = useState<AssetAlbum[]>([]);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [showSaveAlbum, setShowSaveAlbum] = useState(false);

  const [personaPreview, setPersonaPreview] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    setLocalConfig(config);
    if (userId && isOpen) loadPresets();
    loadAlbums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, isOpen, userId]);

  // Global paste handler for Reference Assets
  useEffect(() => {
    if (!isOpen || activeTab !== 'data') return;

    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('video') !== -1) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        setUploadingRef(true);
        const newAssets: ReferenceAsset[] = [];
        for (const file of files) {
             const url = await uploadFileToStorage(file, 'library-images', undefined, userId);
             if (url) {
                 newAssets.push({
                     id: uuidv4(),
                     url,
                     mimeType: file.type,
                     type: file.type.startsWith('video/') ? 'video' : 'image',
                     name: file.name
                 });
             }
        }
        if (newAssets.length > 0) {
            setLocalConfig(prev => ({
                ...prev,
                referenceAssets: [...(prev.referenceAssets || []), ...newAssets]
            }));
        }
        setUploadingRef(false);
      }
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [isOpen, activeTab, userId]);

  const loadPresets = async () => {
    if (!userId) return;
    setIsPresetLoading(true);
    const data = await fetchPresets(userId);
    setPresets(data);
    setIsPresetLoading(false);
  };

  const loadAlbums = () => {
    const saved = localStorage.getItem(ALBUM_STORAGE_KEY);
    if (saved) setAlbums(JSON.parse(saved));
  };

  const saveAlbum = useCallback(() => {
    if (!newAlbumName.trim() || !localConfig.referenceAssets?.length) return;

    const newAlbum: AssetAlbum = {
      id: uuidv4(),
      name: newAlbumName,
      assets: localConfig.referenceAssets,
      createdAt: Date.now(),
    };
    const updated = [newAlbum, ...albums];
    setAlbums(updated);
    localStorage.setItem(ALBUM_STORAGE_KEY, JSON.stringify(updated));
    setNewAlbumName('');
    setShowSaveAlbum(false);
  }, [newAlbumName, localConfig.referenceAssets, albums]);

  const deleteAlbum = (id: string) => {
    const updated = albums.filter(a => a.id !== id);
    setAlbums(updated);
    localStorage.setItem(ALBUM_STORAGE_KEY, JSON.stringify(updated));
  };

  const restoreAlbum = (album: AssetAlbum) => {
    setLocalConfig(prev => ({ ...prev, referenceAssets: album.assets }));
  };

  const loadLibrary = async () => {
    setIsLoadingLibrary(true);
    // Pass userId for isolation
    const assets = await fetchLibraryFiles('chat-assets', userId);
    const library = await fetchLibraryFiles('library-images', userId);
    setLibraryFiles([...assets, ...library]);
    setIsLoadingLibrary(false);
    setIsLibraryOpen(true);
  };

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  const handleRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    setUploadingRef(true);
    const files: File[] = Array.from(e.target.files);
    const newAssets: ReferenceAsset[] = [];

    for (const file of files) {
      const url = await uploadFileToStorage(file, 'library-images', undefined, userId);

      if (url) {
        newAssets.push({
          id: uuidv4(),
          url,
          mimeType: file.type,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          name: file.name
        });
      }
    }

    if (newAssets.length > 0) {
      setLocalConfig(prev => ({
        ...prev,
        referenceAssets: [...(prev.referenceAssets || []), ...newAssets]
      }));
    }
    
    setUploadingRef(false);
    if (refInputRef.current) refInputRef.current.value = '';
  };

  const toggleLibraryAsset = (file: any) => {
    const isSelected = localConfig.referenceAssets?.some(a => a.url === file.url);

    if (isSelected) {
      setLocalConfig(prev => ({
        ...prev,
        referenceAssets: prev.referenceAssets?.filter(a => a.url !== file.url)
      }));
    } else {
      const newAsset: ReferenceAsset = {
        id: uuidv4(),
        url: file.url,
        mimeType: file.mimeType,
        type: file.mimeType.startsWith('video/') ? 'video' : 'image',
        name: file.name
      };
      setLocalConfig(prev => ({
        ...prev,
        referenceAssets: [...(prev.referenceAssets || []), newAsset]
      }));
    }
  };

  const isAssetSelected = (url: string) => {
    return localConfig.referenceAssets?.some(a => a.url === url);
  };

  const removeAsset = (id: string) => {
    setLocalConfig(prev => ({
      ...prev,
      referenceAssets: prev.referenceAssets?.filter(a => a.id !== id)
    }));
  };

  const handleSavePreset = async () => {
    if (!presetName.trim() || !userId) return;
    const newPreset = await savePreset(userId, presetName, localConfig.systemInstruction);
    if (newPreset) {
      setPresets([newPreset, ...presets]);
      setPresetName('');
      setShowSavePreset(false);
    }
  };

  const handleDeletePreset = async (id: string) => {
    await deletePreset(id);
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  const handleGeneratePreview = async () => {
    if (!localConfig.livingPersona) return;
    setIsLoadingPreview(true);
    try {
      const preview = await generatePersonaPreview(localConfig.livingPersona, "Hey, how's it going?");
      setPersonaPreview(preview);
    } catch {
      setPersonaPreview('[Preview generation failed]');
    }
    setIsLoadingPreview(false);
  };

  if (!isOpen) return null;

  const selectedCount = localConfig.referenceAssets?.length || 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-ink/55 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal shell */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden pointer-events-auto panel specular">
          {/* Header */}
          <header className="px-6 py-5 border-b border-stroke/70 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-accent/25 to-accent2/25 border border-stroke/70">
                <SettingsIcon size={18} className="text-ink/80" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-ink">Settings</h2>
                <p className="text-[11px] text-muted">Refine persona, world context, and voice</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="btn btn-ghost px-3 py-2"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </header>

          {/* Tabs */}
          <div className="px-6 pt-5">
            <div className="p-1 rounded-2xl bg-surface/50 border border-stroke/70">
              <div className="grid grid-cols-4 gap-1">
                {TABS.map(tab => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        flex items-center justify-center gap-2
                        px-3 py-2.5 rounded-xl text-[12px] font-semibold
                        transition-colors border
                        ${active
                          ? 'bg-surface/75 border-stroke/80 text-ink'
                          : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface/60 hover:border-stroke/70'}
                      `}
                    >
                      <tab.icon size={14} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'persona' && (
              <PersonaSettings 
                config={localConfig} 
                setConfig={setLocalConfig} 
                isProcessing={isProcessingPersona}
                personaPreview={personaPreview}
                isLoadingPreview={isLoadingPreview}
                onGeneratePreview={handleGeneratePreview}
                presets={presets}
                onSavePreset={handleSavePreset}
                onDeletePreset={handleDeletePreset}
                presetName={presetName}
                setPresetName={setPresetName}
                showSavePreset={showSavePreset}
                setShowSavePreset={setShowSavePreset}
                isPresetLoading={isPresetLoading}
              />
            )}

            {activeTab === 'general' && (
              <GeneralSettings 
                config={localConfig} 
                setConfig={setLocalConfig} 
                isDarkMode={isDarkMode} 
              />
            )}

            {activeTab === 'data' && (
              <DataSettings 
                config={localConfig} 
                setConfig={setLocalConfig}
                albums={albums}
                onSaveAlbum={saveAlbum}
                onDeleteAlbum={deleteAlbum}
                onRestoreAlbum={restoreAlbum}
                onLoadLibrary={loadLibrary}
                uploading={uploadingRef}
                fileInputRef={refInputRef}
                handleUpload={handleRefUpload}
                removeAsset={removeAsset}
                newAlbumName={newAlbumName}
                setNewAlbumName={setNewAlbumName}
                showSaveAlbum={showSaveAlbum}
                setShowSaveAlbum={setShowSaveAlbum}
              />
            )}

            {activeTab === 'advanced' && (
              <AdvancedSettings 
                config={localConfig} 
                setConfig={setLocalConfig} 
              />
            )}
          </div>

          {/* Footer */}
          <footer className="px-6 py-4 border-t border-stroke/70 flex justify-between gap-2">
            {onLogout && (
                <button 
                    onClick={onLogout}
                    className="btn btn-ghost px-4 text-danger hover:bg-danger/10 hover:border-danger/20 flex items-center gap-2"
                    type="button"
                >
                    <LogOut size={16} />
                    Sign Out
                </button>
            )}
            <div className="flex gap-2">
                <button onClick={onClose} className="btn btn-ghost px-4" type="button">
                Cancel
                </button>
                <button onClick={handleSave} className="btn btn-primary px-6" type="button">
                Apply changes
                </button>
            </div>
          </footer>
        </div>
      </div>

      {/* Library picker */}
      {isLibraryOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-ink/60 backdrop-blur-md"
            onClick={() => setIsLibraryOpen(false)}
          />

          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 pointer-events-none">
            <div className="w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden pointer-events-auto panel specular">
              <header className="p-5 border-b border-stroke/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-gradient-to-br from-accent/20 to-accent2/20 border border-stroke/70">
                    <Library size={18} className="text-ink/80" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-ink">Storage library</h3>
                    <p className="text-[11px] text-muted">Select reference assets</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted px-3 py-2 rounded-2xl bg-surface/50 border border-stroke/70">
                    {selectedCount} selected
                  </span>
                  <button
                    onClick={() => setIsLibraryOpen(false)}
                    className="btn btn-primary px-5"
                    type="button"
                  >
                    Done
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-6">
                {isLoadingLibrary ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="animate-spin text-muted" size={32} />
                  </div>
                ) : libraryFiles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-14 h-14 rounded-2xl bg-surface/50 border border-stroke/70 flex items-center justify-center mb-4">
                      <Image size={26} className="text-muted" />
                    </div>
                    <p className="text-[13px] text-ink/70">No files in library</p>
                    <p className="text-[11px] text-muted mt-1">Upload images/videos to use as references</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {libraryFiles.map((file, i) => {
                      const selected = isAssetSelected(file.url);
                      return (
                        <button
                          key={i}
                          onClick={() => toggleLibraryAsset(file)}
                          className={`
                            relative aspect-square rounded-2xl overflow-hidden
                            border transition-colors
                            ${selected ? 'border-accent/55' : 'border-stroke/70 hover:border-stroke'}
                          `}
                          type="button"
                        >
                          {file.mimeType.startsWith('image/') ? (
                            <img src={file.url} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-surface/45">
                              <Film className="text-muted" size={28} />
                            </div>
                          )}

                          <div
                            className={`
                              absolute inset-0 flex items-center justify-center
                              transition-opacity
                              ${selected ? 'opacity-100 bg-ink/45' : 'opacity-0 hover:opacity-100 bg-ink/35'}
                            `}
                          >
                            <div
                              className={`
                                w-10 h-10 rounded-full flex items-center justify-center
                                border border-stroke/60
                                ${selected ? 'bg-accent text-bg' : 'bg-surface/60 text-ink'}
                              `}
                            >
                              <Check size={20} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default SettingsModal;
