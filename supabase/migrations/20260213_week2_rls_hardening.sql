-- Week 2 RLS hardening migration
-- Date: 2026-02-13
-- Goal: ensure all user-scoped tables have explicit RLS + ownership policies.

DO $$
BEGIN
  -- insights: user-scoped table with user_id
  IF to_regclass('public.insights') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can CRUD their own insights" ON public.insights';
    EXECUTE 'CREATE POLICY "Users can CRUD their own insights" ON public.insights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;

  -- preemptive_actions: user-scoped table with user_id
  IF to_regclass('public.preemptive_actions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.preemptive_actions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can CRUD their own preemptive actions" ON public.preemptive_actions';
    EXECUTE 'CREATE POLICY "Users can CRUD their own preemptive actions" ON public.preemptive_actions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;

  -- cognitive_dna: user-scoped table with user_id
  IF to_regclass('public.cognitive_dna') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.cognitive_dna ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can CRUD their own cognitive dna" ON public.cognitive_dna';
    EXECUTE 'CREATE POLICY "Users can CRUD their own cognitive dna" ON public.cognitive_dna FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;

  -- memory_connections: ownership via connected memories
  IF to_regclass('public.memory_connections') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.memory_connections ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can CRUD their own memory connections" ON public.memory_connections';
    EXECUTE '
      CREATE POLICY "Users can CRUD their own memory connections"
      ON public.memory_connections
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.memories m
          WHERE m.id = memory_connections.memory_a
            AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.memories m
          WHERE m.id = memory_connections.memory_a
            AND m.user_id = auth.uid()
        )
      )';
  END IF;

  -- session_checkpoints: ownership via chat/user relationship
  IF to_regclass('public.session_checkpoints') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.session_checkpoints ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can CRUD their own checkpoints" ON public.session_checkpoints';
    EXECUTE '
      CREATE POLICY "Users can CRUD their own checkpoints"
      ON public.session_checkpoints
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.chats c
          WHERE c.id = session_checkpoints.chat_id
            AND c.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.chats c
          WHERE c.id = session_checkpoints.chat_id
            AND c.user_id = auth.uid()
        )
      )';
  END IF;

  -- persona_reference_images: ownership via user_id or parent persona ownership
  IF to_regclass('public.persona_reference_images') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.persona_reference_images ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can CRUD their own persona reference images" ON public.persona_reference_images';
    EXECUTE '
      CREATE POLICY "Users can CRUD their own persona reference images"
      ON public.persona_reference_images
      FOR ALL
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1
          FROM public.personas p
          WHERE p.id = persona_reference_images.persona_id
            AND p.user_id = auth.uid()
        )
      )
      WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1
          FROM public.personas p
          WHERE p.id = persona_reference_images.persona_id
            AND p.user_id = auth.uid()
        )
      )';
  END IF;

  -- messages: ownership via parent chat/session
  IF to_regclass('public.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can CRUD their own messages" ON public.messages';
    EXECUTE '
      CREATE POLICY "Users can CRUD their own messages"
      ON public.messages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.chats c
          WHERE c.id = messages.session_id
            AND c.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.chats c
          WHERE c.id = messages.session_id
            AND c.user_id = auth.uid()
        )
      )';
  END IF;
END $$;
