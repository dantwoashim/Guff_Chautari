
import React, { useState } from 'react';
import { Library, Plus, Loader2, Film, Image, Check, Trash2, Dna, Wand2, Sparkles } from '../Icons';
import { ChatConfig, AssetAlbum, ReferenceAsset, CharacterModel } from '../../types';
import { characterRefinement } from '../../services/characterRefinement';

interface DataSettingsProps {
  config: ChatConfig;
  setConfig: (config: ChatConfig) => void;
  albums: AssetAlbum[];
  onSaveAlbum: () => void;
  onDeleteAlbum: (id: string) => void;
  onRestoreAlbum: (album: AssetAlbum) => void;
  onLoadLibrary: () => void;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeAsset: (id: string) => void;
  newAlbumName: string;
  setNewAlbumName: (name: string) => void;
  showSaveAlbum: boolean;
  setShowSaveAlbum: (show: boolean) => void;
}

const DataSettings: React.FC<DataSettingsProps> = ({
  config,
  setConfig,
  albums,
  onSaveAlbum,
  onDeleteAlbum,
  onRestoreAlbum,
  onLoadLibrary,
  uploading,
  fileInputRef,
  handleUpload,
  removeAsset,
  newAlbumName,
  setNewAlbumName,
  showSaveAlbum,
  setShowSaveAlbum
}) => {
  const [isRefining, setIsRefining] = useState(false);
  const [refineStatus, setRefineStatus] = useState("Idle");
  const [refineProgress, setRefineProgress] = useState(0);

  const startRefinement = async () => {
    if (!config.referenceAssets || config.referenceAssets.length === 0) {
        alert("Please upload at least one reference photo first.");
        return;
    }

    setIsRefining(true);
    setRefineStatus("Initializing...");
    setRefineProgress(0);

    try {
        const generator = characterRefinement.runRefinement(config.referenceAssets);
        let result = await generator.next();
        
        while (!result.done) {
            const val = result.value as { status: string; progress: number; message: string };
            setRefineStatus(val.message);
            setRefineProgress(val.progress);
            result = await generator.next();
        }

        const models = result.value as CharacterModel[];
        setConfig({
            ...config,
            characterModels: models
        });
        
    } catch (e) {
        console.error("Refinement failed", e);
        setRefineStatus("Failed.");
    } finally {
        setIsRefining(false);
        setRefineProgress(100);
    }
  };

  const removeModel = (id: string) => {
      const updated = config.characterModels?.filter(m => m.id !== id);
      setConfig({ ...config, characterModels: updated });
  };

  return (
    <div className="space-y-8 animate-slide-up">
      
      {/* 1. Raw Reference Assets */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Raw References (Input)
            </h3>

            <div className="flex items-center gap-2">
            <button
                onClick={() => setShowSaveAlbum(!showSaveAlbum)}
                className="btn btn-ghost px-3 py-2"
                type="button"
            >
                Save album
            </button>

            <button onClick={onLoadLibrary} className="btn btn-ghost px-3 py-2" type="button">
                <span className="inline-flex items-center gap-2 text-[12px] font-semibold">
                <Library size={14} />
                Library
                </span>
            </button>
            </div>
        </div>

        {showSaveAlbum && (
            <div className="flex gap-2">
            <input
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder="Album name…"
                className="input"
            />
            <button onClick={onSaveAlbum} className="btn btn-primary px-5" type="button">
                Save
            </button>
            </div>
        )}

        <div className="grid grid-cols-4 gap-3">
            {config.referenceAssets?.map((asset) => (
            <div
                key={asset.id}
                className="relative aspect-square rounded-2xl overflow-hidden border border-stroke/70 bg-surface/40"
            >
                {asset.type === 'video' ? (
                <div className="w-full h-full flex items-center justify-center">
                    <Film size={28} className="text-muted" />
                </div>
                ) : (
                <img src={asset.url} className="w-full h-full object-cover" alt={asset.name} />
                )}

                <button
                onClick={() => removeAsset(asset.id)}
                className="absolute top-1 right-1 p-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 hover:bg-red-500/50 transition-colors"
                type="button"
                >
                <Trash2 size={12} className="text-white" />
                </button>
            </div>
            ))}

            <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-2xl border border-dashed border-stroke/80 bg-surface/35 hover:bg-surface/55 transition-colors flex flex-col items-center justify-center gap-2"
            type="button"
            >
            {uploading ? (
                <Loader2 size={20} className="animate-spin text-muted" />
            ) : (
                <Plus size={20} className="text-muted" />
            )}
            </button>

            <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
            accept="image/*,video/*"
            multiple 
            />
        </div>
      </div>

      {/* 2. Character Refinement Engine */}
      <div className="pt-6 border-t border-stroke/50">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <Dna size={16} className="text-accent2" />
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                    Neural Identity Models
                </h3>
            </div>
            
            <button 
                onClick={startRefinement}
                disabled={isRefining || !config.referenceAssets?.length}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all
                    ${isRefining 
                        ? 'bg-surface border border-stroke text-muted cursor-not-allowed'
                        : 'bg-gradient-to-r from-accent to-accent2 text-white shadow-lg hover:shadow-accent/20 active:scale-95'}
                `}
            >
                {isRefining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {isRefining ? 'Synthesizing...' : 'Refine & Train'}
            </button>
        </div>

        {isRefining && (
            <div className="mb-6 p-4 rounded-2xl bg-surface/50 border border-stroke/70">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-accent">{refineStatus}</span>
                    <span className="text-xs font-mono opacity-50">{refineProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-stroke/30 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-accent to-accent2 transition-all duration-500" 
                        style={{ width: `${refineProgress}%` }} 
                    />
                </div>
            </div>
        )}

        {!config.characterModels || config.characterModels.length === 0 ? (
            <div className="p-8 rounded-3xl border border-dashed border-stroke/60 flex flex-col items-center text-center opacity-60">
                <Sparkles size={24} className="mb-3 text-muted" />
                <p className="text-sm font-medium">No Neural Models Generated</p>
                <p className="text-xs mt-1 max-w-xs">Run "Refine & Train" to convert raw photos into consistent, high-fidelity 3D-consistent character definitions.</p>
            </div>
        ) : (
            <div className="grid grid-cols-2 gap-3">
                {config.characterModels.map(model => (
                    <div key={model.id} className="relative group rounded-2xl overflow-hidden border border-stroke/70 bg-surface/40 aspect-[3/4]">
                        <img src={model.visualUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={model.name} />
                        
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-80" />
                        
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                            <div className="text-xs font-bold text-white mb-0.5">{model.name}</div>
                            <div className="text-[10px] text-white/60 line-clamp-1">{model.archetype}</div>
                        </div>

                        <button
                            onClick={() => removeModel(model.id)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80 text-white"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* 3. Album Management (Existing) */}
      {albums.length > 0 && (
        <div className="pt-6 border-t border-stroke/70">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">
            Saved albums
          </h4>

          <div className="space-y-2">
            {albums.map((album) => (
              <div
                key={album.id}
                className="p-4 rounded-2xl bg-surface/50 border border-stroke/70 hover:bg-surface/65 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-surface/60 border border-stroke/70">
                    <Image size={16} className="text-muted" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-ink">{album.name}</div>
                    <div className="text-[11px] text-muted">{album.assets.length} assets</div>
                  </div>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => onRestoreAlbum(album)}
                    className="btn btn-ghost px-3 py-2"
                    type="button"
                    title="Restore"
                  >
                    <Check size={16} className="text-accent2" />
                  </button>
                  <button
                    onClick={() => onDeleteAlbum(album.id)}
                    className="btn btn-ghost px-3 py-2"
                    type="button"
                    title="Delete"
                  >
                    <Trash2 size={16} className="text-danger" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataSettings;
