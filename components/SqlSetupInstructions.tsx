
import React, { useState } from 'react';
import { X, Copy, Check, Sparkles } from './Icons';

interface SqlSetupInstructionsProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const REQUIRED_SQL = `-- =====================================================
-- ASHIM ASI - COMPLETE DATABASE SCHEMA & STORAGE FIX
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Create Buckets (Idempotent)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-assets', 'chat-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('library-images', 'library-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Storage Policies
DROP POLICY IF EXISTS "Public Access chat-assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload chat-assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update chat-assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete chat-assets" ON storage.objects;

CREATE POLICY "Public Access chat-assets" ON storage.objects FOR SELECT USING ( bucket_id = 'chat-assets' );
CREATE POLICY "Auth Insert chat-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'chat-assets' );
CREATE POLICY "Auth Update chat-assets" ON storage.objects FOR UPDATE TO authenticated USING ( bucket_id = 'chat-assets' );
CREATE POLICY "Auth Delete chat-assets" ON storage.objects FOR DELETE TO authenticated USING ( bucket_id = 'chat-assets' );

DROP POLICY IF EXISTS "Public Access library-images" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload library-images" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update library-images" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete library-images" ON storage.objects;

CREATE POLICY "Public Access library-images" ON storage.objects FOR SELECT USING ( bucket_id = 'library-images' );
CREATE POLICY "Auth Insert library-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'library-images' );
CREATE POLICY "Auth Update library-images" ON storage.objects FOR UPDATE TO authenticated USING ( bucket_id = 'library-images' );
CREATE POLICY "Auth Delete library-images" ON storage.objects FOR DELETE TO authenticated USING ( bucket_id = 'library-images' );

-- 4. NEW: Persona References Bucket (for persona-specific reference images)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('persona-references', 'persona-references', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access persona-references" ON storage.objects;
DROP POLICY IF EXISTS "Auth Insert persona-references" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update persona-references" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete persona-references" ON storage.objects;

CREATE POLICY "Public Access persona-references" ON storage.objects FOR SELECT USING ( bucket_id = 'persona-references' );
CREATE POLICY "Auth Insert persona-references" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'persona-references' );
CREATE POLICY "Auth Update persona-references" ON storage.objects FOR UPDATE TO authenticated USING ( bucket_id = 'persona-references' );
CREATE POLICY "Auth Delete persona-references" ON storage.objects FOR DELETE TO authenticated USING ( bucket_id = 'persona-references' );

-- =====================================================
-- CORE TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  persona_id UUID, 
  is_active BOOLEAN DEFAULT FALSE,
  session_config JSONB DEFAULT '{}',
  processed_persona JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  title TEXT,
  messages JSONB DEFAULT '[]',
  branch_tree JSONB,
  active_branch_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  system_instruction TEXT,
  active_persona_id UUID,
  reference_assets JSONB DEFAULT '[]',
  living_persona JSONB,
  agi_state JSONB,
  processing_status TEXT DEFAULT 'idle',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_instruction TEXT,
  avatar_url TEXT,
  status_text TEXT,
  is_online BOOLEAN DEFAULT FALSE,
  is_inferred BOOLEAN DEFAULT FALSE,
  inference_data JSONB,
  confidence FLOAT DEFAULT 0,
  -- Global & Active status
  is_global BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  -- Preprocessing state
  is_processed BOOLEAN DEFAULT FALSE,
  living_persona JSONB,
  agi_state JSONB,
  quantum_state JSONB,
  meta_state JSONB,
  temporal_state JSONB,
  life_context JSONB,
  social_graph_data JSONB,
  gossip_seeds JSONB,
  voice_dna JSONB,
  processing_version TEXT,
  processing_progress INT DEFAULT 0,
  processing_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ensure all columns exist for personas (for existing tables)
ALTER TABLE personas ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS status_text TEXT;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS living_persona JSONB;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS processing_version TEXT;

-- CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES personas(id) ON DELETE CASCADE,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INT DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- FIX: Ensure updated_at exists in conversations if table was created by older script
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ADVANCED AGI TABLES (Ensure they exist)
CREATE TABLE IF NOT EXISTS persona_consciousness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  persona_id UUID,
  session_id UUID,
  quantum_state JSONB DEFAULT '{}',
  meta_state JSONB DEFAULT '{}',
  temporal_state JSONB DEFAULT '{}',
  social_state JSONB DEFAULT '{}',
  current_day JSONB DEFAULT '{}',
  mood_history JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, persona_id)
);

CREATE TABLE IF NOT EXISTS relationship_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  persona_id UUID NOT NULL,
  partner_id UUID NOT NULL,
  stage TEXT,
  trust_score FLOAT,
  vulnerability_level FLOAT,
  conflict_history JSONB DEFAULT '[]',
  inside_jokes JSONB DEFAULT '[]',
  shared_memories JSONB DEFAULT '[]',
  partner_knowledge JSONB DEFAULT '{}',
  mood_carryover JSONB DEFAULT '{}',
  message_count INT DEFAULT 0,
  days_together INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(persona_id, partner_id)
);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(768),
  decay_factor FLOAT DEFAULT 1.0,
  emotional_valence FLOAT DEFAULT 0,
  connections UUID[] DEFAULT '{}',
  source_session_id UUID REFERENCES chats(id),
  metadata JSONB DEFAULT '{}',
  last_accessed TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_a UUID REFERENCES memories(id) ON DELETE CASCADE,
  memory_b UUID REFERENCES memories(id) ON DELETE CASCADE,
  strength FLOAT DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(memory_a, memory_b)
);

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  urgency FLOAT DEFAULT 0.5,
  relevance FLOAT DEFAULT 0.5,
  was_delivered BOOLEAN DEFAULT FALSE,
  was_accepted BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  timeframe TEXT,
  evidence TEXT[],
  was_accurate BOOLEAN,
  suggested_action TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  validated_at TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS preemptive_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID REFERENCES predictions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  result JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  themes TEXT[] NOT NULL,
  artifacts JSONB NOT NULL,
  emotional_tone TEXT,
  source_conversations UUID[],
  was_viewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  parent_branch_id UUID REFERENCES conversation_branches(id),
  fork_point INTEGER NOT NULL,
  label TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cognitive_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  data JSONB NOT NULL,
  signature TEXT NOT NULL,
  is_shareable BOOLEAN DEFAULT FALSE,
  share_link_id TEXT UNIQUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruction_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- PERSONA REFERENCE IMAGES (for AI image generation consistency)
CREATE TABLE IF NOT EXISTS persona_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  image_type TEXT DEFAULT 'reference',
  description TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE preemptive_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruction_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_consciousness ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationship_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can CRUD their own sessions" ON sessions;
    CREATE POLICY "Users can CRUD their own sessions" ON sessions FOR ALL USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own chats" ON chats;
    CREATE POLICY "Users can CRUD their own chats" ON chats FOR ALL USING (auth.uid() = user_id);

    -- FIXED: Allow reading global personas (is_global=true) OR own personas
    DROP POLICY IF EXISTS "Users can CRUD their own personas" ON personas;
    DROP POLICY IF EXISTS "Users can read global personas" ON personas;
    DROP POLICY IF EXISTS "Users can modify their own personas" ON personas;
    
    CREATE POLICY "Users can read global personas" ON personas 
        FOR SELECT USING (auth.uid() = user_id OR is_global = true);
    CREATE POLICY "Users can modify their own personas" ON personas 
        FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can update their own personas" ON personas 
        FOR UPDATE USING (auth.uid() = user_id);
    CREATE POLICY "Users can delete their own personas" ON personas 
        FOR DELETE USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own config" ON user_config;
    CREATE POLICY "Users can CRUD their own config" ON user_config FOR ALL USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own presets" ON instruction_presets;
    CREATE POLICY "Users can CRUD their own presets" ON instruction_presets FOR ALL USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own memories" ON memories;
    CREATE POLICY "Users can CRUD their own memories" ON memories FOR ALL USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own predictions" ON predictions;
    CREATE POLICY "Users can CRUD their own predictions" ON predictions FOR ALL USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own dreams" ON dreams;
    CREATE POLICY "Users can CRUD their own dreams" ON dreams FOR ALL USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own branches" ON conversation_branches;
    CREATE POLICY "Users can CRUD their own branches" ON conversation_branches FOR ALL USING (auth.uid() = (SELECT user_id FROM chats WHERE id = session_id LIMIT 1));

    DROP POLICY IF EXISTS "Users can CRUD their own consciousness" ON persona_consciousness;
    CREATE POLICY "Users can CRUD their own consciousness" ON persona_consciousness FOR ALL USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own relationships" ON relationship_states;
    CREATE POLICY "Users can CRUD their own relationships" ON relationship_states FOR ALL USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "Users can CRUD their own conversations" ON conversations;
    CREATE POLICY "Users can CRUD their own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);

    -- PERSONA REFERENCE IMAGES: Allow authenticated users to manage reference images for personas
    -- Note: For global personas, admin users (who created them) can manage the reference images
    DROP POLICY IF EXISTS "Users can CRUD reference images" ON persona_reference_images;
    CREATE POLICY "Users can CRUD reference images" ON persona_reference_images FOR ALL USING (auth.uid() = user_id);
END $$;

ALTER TABLE persona_reference_images ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION match_memories(
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT,
  filter_user_id UUID
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  type TEXT,
  similarity FLOAT,
  decay_factor FLOAT,
  created_at TIMESTAMP,
  metadata JSONB,
  connections UUID[],
  emotional_valence FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.type,
    1 - (m.embedding <=> query_embedding) AS similarity,
    m.decay_factor,
    m.created_at,
    m.metadata,
    m.connections,
    m.emotional_valence
  FROM memories m
  WHERE m.user_id = filter_user_id
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION append_chat_message(
    p_chat_id UUID,
    p_message JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE chats 
    SET 
        messages = COALESCE(messages, '[]'::jsonb) || p_message,
        updated_at = NOW()
    WHERE id = p_chat_id;
END;
$$;

-- IMPORTANT: Reload PostgREST cache to fix PGRST204 errors
NOTIFY pgrst, 'reload config';
`;

const SqlSetupInstructions: React.FC<SqlSetupInstructionsProps> = ({ isOpen, onClose, isDarkMode }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(REQUIRED_SQL.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-500 animate-fade-in ${isDarkMode ? 'bg-black/60' : 'bg-onyx-900/20'}`}>
      <div className={`w-full max-w-2xl rounded-[24px] shadow-2xl border overflow-hidden animate-scale-in flex flex-col max-h-[90vh]
        ${isDarkMode
          ? 'bg-onyx-950 border-white/10 shadow-black/50'
          : 'bg-white border-white/50 shadow-xl'}
      `}>
        <div className={`px-8 py-6 border-b flex justify-between items-center backdrop-blur-md
          ${isDarkMode ? 'border-white/5 bg-onyx-900/50' : 'border-onyx-50 bg-white/80'}
        `}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`font-display font-semibold text-xl ${isDarkMode ? 'text-white' : 'text-onyx-900'}`}>
                Database Schema Update
              </h2>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-onyx-400' : 'text-onyx-500'}`}>
                Run this to fix PGRST204 errors (missing columns) and 23503 foreign key issues.
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`transition-colors p-2 rounded-full ${isDarkMode ? 'text-onyx-400 hover:text-white hover:bg-white/10' : 'text-onyx-400 hover:text-onyx-900 hover:bg-onyx-50'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-8 overflow-y-auto">
          <div className={`p-4 rounded-xl border mb-6 ${isDarkMode ? 'bg-sage-900/10 border-sage-500/20 text-sage-200' : 'bg-sage-50 border-sage-100 text-sage-800'}`}>
            <p className="text-sm font-medium">Instructions:</p>
            <ol className="text-sm mt-2 space-y-1 list-decimal list-inside opacity-90">
              <li>Copy the SQL code block below.</li>
              <li>Go to <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noreferrer" className="underline font-bold hover:text-white transition-colors">Supabase SQL Editor</a>.</li>
              <li>Paste the code and click <strong>Run</strong>.</li>
              <li>Refresh this page.</li>
            </ol>
          </div>
          <div className="relative group">
            <div className={`absolute top-3 right-3 p-2 rounded-lg cursor-pointer transition-all border shadow-sm z-10 ${isDarkMode ? 'bg-onyx-800 border-white/10 hover:bg-onyx-700' : 'bg-white border-onyx-200 hover:bg-onyx-50'}`} onClick={handleCopy}>
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className={isDarkMode ? 'text-white' : 'text-onyx-900'} />}
            </div>
            <pre className={`p-6 rounded-xl text-[11px] font-mono overflow-x-auto leading-relaxed border shadow-inner ${isDarkMode ? 'bg-[#0D1117] border-white/5 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
              {REQUIRED_SQL.trim()}
            </pre>
          </div>
        </div>
        <div className={`px-8 py-5 flex justify-end gap-4 border-t flex-none ${isDarkMode ? 'bg-onyx-900 border-white/5' : 'bg-onyx-50 border-onyx-100'}`}>
          <button onClick={onClose} className={`px-5 py-2.5 text-sm font-medium transition-colors ${isDarkMode ? 'text-onyx-400 hover:text-white' : 'text-onyx-500 hover:text-onyx-900'}`}>Close</button>
          <button onClick={() => { window.open('https://supabase.com/dashboard/project/_/sql', '_blank'); }} className={`px-6 py-2.5 text-sm font-semibold rounded-xl shadow-lg transform active:scale-95 transition-all duration-300 flex items-center gap-2 ${isDarkMode ? 'bg-white text-onyx-950 hover:bg-gray-100 shadow-white/5' : 'bg-onyx-900 hover:bg-black text-white shadow-onyx-900/20'}`}>
            Open SQL Editor <span className="text-xs opacity-50">↗</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SqlSetupInstructions;
