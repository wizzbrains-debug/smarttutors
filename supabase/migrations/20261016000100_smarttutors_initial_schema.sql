-- =====================================================================
-- SmartTutors — Initial Supabase Production Migration (Revision 5.2)
-- Migration ID: 20261016000100_smarttutors_initial_schema
-- Target Project: https://gfzffxvpmotjuydcvfav.supabase.co
-- Region: ap-south-1 (Mumbai, India)
-- Author: SmartTutors Architecture & Security Pair
-- Review Status: PROPOSAL FOR HUMAN REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- =====================================================================

BEGIN;

-- 0. EXTENSIONS & PREREQUISITES
-- pgcrypto provides gen_random_uuid() if not standard in PostgreSQL 15+
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. UTILITY FUNCTIONS & TRIGGERS
-- =====================================================================

-- 1.1 Automated updated_at timestamp refresher
-- Invoker security: Runs with caller privileges (no elevated access needed)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1.2 Automated student marketing consent timestamp sync (F-04)
-- Enforces hardened search_path and manages explicit consent lifecycle states
CREATE OR REPLACE FUNCTION public.handle_student_consent_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- When marketing_consent transitions to true (initial opt-in or re-opt-in)
  IF NEW.marketing_consent = true AND (OLD.marketing_consent = false OR OLD.marketing_consent IS NULL) THEN
    NEW.marketing_consent_recorded_at = NOW();
    NEW.marketing_consent_withdrawn_at = NULL;
  -- When marketing_consent transitions to false (withdrawal, F-03 & F-04)
  ELSIF NEW.marketing_consent = false AND OLD.marketing_consent = true THEN
    NEW.marketing_consent_withdrawn_at = NOW();
    -- Retain historical opt-in timestamp intact for audit trail
    NEW.marketing_consent_recorded_at = COALESCE(OLD.marketing_consent_recorded_at, NOW());
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- 2. APPLICATION TABLES
-- Strict versioned table creation (halts on pre-existing naming collisions)
-- =====================================================================

-- 2.1 public.students
-- Secure student profile linked 1:1 with auth.users
CREATE TABLE public.students (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  mobile TEXT,
  qualification TEXT NOT NULL,
  is_minor BOOLEAN NOT NULL DEFAULT true,
  guardian_consent BOOLEAN NOT NULL DEFAULT false,
  guardian_consent_recorded_at TIMESTAMPTZ,
  service_terms_accepted BOOLEAN NOT NULL DEFAULT false,
  service_terms_accepted_at TIMESTAMPTZ,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  marketing_consent_recorded_at TIMESTAMPTZ,
  marketing_consent_withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Data validity constraints
  CONSTRAINT students_full_name_length CHECK (char_length(trim(full_name)) >= 2 AND char_length(full_name) <= 100),
  CONSTRAINT students_mobile_format CHECK (mobile IS NULL OR mobile ~ '^[0-9+\s\-()]{10,20}$'),
  CONSTRAINT students_qualification_allowed CHECK (qualification IN ('o-level', 'a-level')),

  -- Consent timestamp consistency & audit constraints (F-03, F-04)
  -- 1. Service terms: permanently bound once accepted
  CONSTRAINT students_terms_ts_consistent CHECK (
    (service_terms_accepted = false AND service_terms_accepted_at IS NULL)
    OR
    (service_terms_accepted = true AND service_terms_accepted_at IS NOT NULL)
  ),
  -- 2. Guardian consent: strictly coupled with verified audit timestamp
  CONSTRAINT students_guardian_ts_consistent CHECK (
    (guardian_consent = false AND guardian_consent_recorded_at IS NULL)
    OR
    (guardian_consent = true AND guardian_consent_recorded_at IS NOT NULL)
  ),
  -- 3. Marketing consent: three mutually exclusive valid lifecycle states:
  --   a) Never opted in (both timestamps NULL)
  --   b) Currently opted in (recorded_at set, withdrawn_at NULL)
  --   c) Withdrawn (both timestamps set, withdrawn_at >= recorded_at, status false)
  CONSTRAINT students_marketing_ts_consistent CHECK (
    (marketing_consent = false AND marketing_consent_recorded_at IS NULL AND marketing_consent_withdrawn_at IS NULL)
    OR
    (marketing_consent = true AND marketing_consent_recorded_at IS NOT NULL AND marketing_consent_withdrawn_at IS NULL)
    OR
    (marketing_consent = false AND marketing_consent_recorded_at IS NOT NULL AND marketing_consent_withdrawn_at IS NOT NULL AND marketing_consent_withdrawn_at >= marketing_consent_recorded_at)
  )
);

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_students_marketing_consent
  BEFORE UPDATE OF marketing_consent ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_student_consent_update();

-- 2.2 public.ai_daily_usage
-- Enforces 5 questions/day limit for free registered students (UTC/Karachi midnight)
CREATE TABLE public.ai_daily_usage (
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  questions_used INTEGER NOT NULL DEFAULT 0,
  last_question_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (student_id, usage_date),
  CONSTRAINT ai_daily_usage_count_nonnegative CHECK (questions_used >= 0)
);

CREATE INDEX idx_ai_daily_usage_date ON public.ai_daily_usage(usage_date);

-- 2.3 public.ai_guest_usage
-- Enforces 1 question lifetime allowance for unregistered guests via server hash
CREATE TABLE public.ai_guest_usage (
  guest_id_hash TEXT PRIMARY KEY,
  questions_used INTEGER NOT NULL DEFAULT 0,
  first_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_guest_usage_hash_hex CHECK (char_length(guest_id_hash) = 64 AND guest_id_hash ~ '^[0-9a-fA-F]{64}$'),
  CONSTRAINT ai_guest_usage_count_nonnegative CHECK (questions_used >= 0)
);

-- 2.4 public.subject_subscriptions
-- Subject-specific premium access (e.g., physics 5054, chemistry 5070)
CREATE TABLE public.subject_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'direct',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sub_subject_allowed CHECK (subject IN ('chemistry', 'physics', 'math', 'biology', 'english')),
  CONSTRAINT sub_status_allowed CHECK (status IN ('active', 'expired', 'canceled')),
  CONSTRAINT sub_source_allowed CHECK (source IN ('direct', 'bundled_human_tutoring')),
  CONSTRAINT sub_dates_valid CHECK (expires_at > starts_at)
);

CREATE INDEX idx_sub_lookup 
  ON public.subject_subscriptions(student_id, subject, status, starts_at, expires_at);

-- 2.5 public.ai_question_reservations
-- Concurrency-safe two-phase reservation & finalization queue
CREATE TABLE public.ai_question_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  guest_id_hash TEXT,
  subject TEXT NOT NULL,
  quota_date DATE,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 seconds'),
  finalized_at TIMESTAMPTZ,

  CONSTRAINT res_identity_exclusive CHECK (
    (student_id IS NOT NULL AND guest_id_hash IS NULL AND quota_date IS NOT NULL)
    OR
    (student_id IS NULL AND guest_id_hash IS NOT NULL AND quota_date IS NULL AND is_premium = false)
  ),
  CONSTRAINT res_subject_allowed CHECK (subject IN ('chemistry', 'physics', 'math', 'biology', 'english')),
  CONSTRAINT res_status_allowed CHECK (status IN ('pending', 'committed', 'released', 'expired')),
  CONSTRAINT res_guest_hash_hex CHECK (guest_id_hash IS NULL OR (char_length(guest_id_hash) = 64 AND guest_id_hash ~ '^[0-9a-fA-F]{64}$'))
);

CREATE INDEX idx_res_student_active 
  ON public.ai_question_reservations(student_id, quota_date, status, expires_at)
  WHERE status = 'pending';

CREATE INDEX idx_res_guest_active 
  ON public.ai_question_reservations(guest_id_hash, status, expires_at)
  WHERE status = 'pending';

-- Partial index for high-throughput batch expiry sweeps (F-02)
CREATE INDEX idx_res_pending_expiry 
  ON public.ai_question_reservations(expires_at) 
  WHERE status = 'pending';

-- =====================================================================
-- 3. CONCURRENCY-SAFE BUSINESS LOGIC FUNCTIONS
-- Lock Hierarchy & Concurrency Design:
-- Any path that updates quota commits Table A (ai_daily_usage / ai_guest_usage)
-- FIRST, and Table B (ai_question_reservations) SECOND.
-- Non-quota paths (Premium, Release, Expired) touch Table B only and never
-- acquire Table A locks, guaranteeing cycle-free execution.
-- =====================================================================

-- 3.1 Explicit Service Terms Acceptance RPC (F-01, Revision 5.2 Identity Safety & History Preservation)
-- Derives student identity strictly from verified session if invoked by authenticated student,
-- or accepts verified student ID if invoked by service_role backend.
-- Preserves original service_terms_accepted_at on repeated acceptance calls.
DROP FUNCTION IF EXISTS public.accept_service_terms();
DROP FUNCTION IF EXISTS public.accept_service_terms(UUID);

CREATE OR REPLACE FUNCTION public.accept_service_terms(
  p_student_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_target_id UUID;
  v_accepted_at TIMESTAMPTZ;
BEGIN
  -- Strict identity derivation:
  -- If caller is authenticated, ALWAYS override with auth.uid() to prevent identity spoofing.
  -- If caller is service_role, use backend-validated p_student_id.
  IF auth.role() = 'authenticated' THEN
    v_target_id := auth.uid();
  ELSIF auth.role() = 'service_role' THEN
    v_target_id := p_student_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized_role');
  END IF;

  IF v_target_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'missing_student_id');
  END IF;

  -- Verify student has confirmed email address before accepting binding terms
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_target_id
      AND email_confirmed_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'email_not_confirmed');
  END IF;

  -- Repeated acceptance preserves the original accepted_at timestamp
  UPDATE public.students
  SET service_terms_accepted = true,
      service_terms_accepted_at = COALESCE(service_terms_accepted_at, NOW())
  WHERE id = v_target_id
  RETURNING service_terms_accepted_at INTO v_accepted_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'student_not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'student_id', v_target_id,
    'service_terms_accepted', true,
    'service_terms_accepted_at', v_accepted_at
  );
END;
$$;

-- 3.2 Reserve question allowance for an authenticated student (F-05, F-06, Revision 5 Concurrency)
CREATE OR REPLACE FUNCTION public.reserve_student_ai_question(
  p_student_id UUID,
  p_subject TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_today_karachi DATE;
  v_is_premium BOOLEAN := false;
  v_terms_accepted BOOLEAN := false;
  v_used INTEGER := 0;
  v_pending INTEGER := 0;
  v_reservation_id UUID;
  v_max_daily CONSTANT INTEGER := 5;
BEGIN
  -- Validate subject whitelist (explicit NULL check prevents constraint violation)
  IF p_subject IS NULL OR p_subject NOT IN ('chemistry', 'physics', 'math', 'biology', 'english') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_subject');
  END IF;

  -- 1. Verify that student exists and has deliberately accepted service terms (F-01)
  SELECT service_terms_accepted INTO v_terms_accepted
  FROM public.students
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'student_not_found');
  END IF;

  IF NOT v_terms_accepted THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'service_terms_not_accepted');
  END IF;

  -- 2. Verify email confirmation on auth.users directly (F-05 defense-in-depth)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = p_student_id
      AND email_confirmed_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'email_not_confirmed');
  END IF;

  -- Determine trusted quota date in Asia/Karachi
  v_today_karachi := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;

  -- 3. Check for active subject-specific subscription with full temporal validity
  SELECT EXISTS (
    SELECT 1 FROM public.subject_subscriptions
    WHERE student_id = p_student_id
      AND subject = p_subject
      AND status = 'active'
      AND starts_at <= NOW()
      AND expires_at > NOW()
  ) INTO v_is_premium;

  -- 4. PREMIUM STUDENT PATH:
  -- Premium bypasses daily quota accounting entirely. Never locks Table A.
  IF v_is_premium THEN
    -- Passive cleanup of stale holds for this student on Table B
    UPDATE public.ai_question_reservations
    SET status = 'expired',
        finalized_at = NOW()
    WHERE student_id = p_student_id
      AND is_premium = true
      AND status = 'pending'
      AND expires_at < NOW();

    INSERT INTO public.ai_question_reservations (
      student_id,
      guest_id_hash,
      subject,
      quota_date,
      is_premium,
      status,
      created_at,
      expires_at
    ) VALUES (
      p_student_id,
      NULL,
      p_subject,
      v_today_karachi,
      true,
      'pending',
      NOW(),
      NOW() + INTERVAL '90 seconds'
    ) RETURNING id INTO v_reservation_id;

    RETURN jsonb_build_object(
      'allowed', true,
      'is_premium', true,
      'reservation_id', v_reservation_id,
      'quota_date', v_today_karachi,
      'questions_remaining', -1
    );
  END IF;

  -- 5. FREE STUDENT PATH — Strict Coordinated Lock Hierarchy:
  -- Step 1: Acquire exclusive row lock on usage parent row (Table A) FIRST
  INSERT INTO public.ai_daily_usage (student_id, usage_date, questions_used, last_question_at)
  VALUES (p_student_id, v_today_karachi, 0, NOW())
  ON CONFLICT (student_id, usage_date) DO NOTHING;

  SELECT questions_used INTO v_used
  FROM public.ai_daily_usage
  WHERE student_id = p_student_id
    AND usage_date = v_today_karachi
  FOR UPDATE;

  -- Step 2: Under parent row lock, passively clean up stale pending holds for this student and date (Table B)
  UPDATE public.ai_question_reservations
  SET status = 'expired',
      finalized_at = NOW()
  WHERE student_id = p_student_id
    AND quota_date = v_today_karachi
    AND is_premium = false
    AND status = 'pending'
    AND expires_at < NOW();

  -- Step 3: Under parent row lock, count active unexpired pending reservations (Table B)
  SELECT COUNT(*) INTO v_pending
  FROM public.ai_question_reservations
  WHERE student_id = p_student_id
    AND quota_date = v_today_karachi
    AND is_premium = false
    AND status = 'pending'
    AND expires_at >= NOW();

  -- Step 4: Check if combined committed + pending usage reaches or exceeds limit
  IF (v_used + v_pending) >= v_max_daily THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'is_premium', false,
      'reason', 'daily_limit_reached',
      'limit', v_max_daily,
      'used', v_used,
      'pending', v_pending,
      'questions_remaining', 0,
      'quota_date', v_today_karachi
    );
  END IF;

  -- Step 5: Insert pending reservation ticket
  INSERT INTO public.ai_question_reservations (
    student_id,
    guest_id_hash,
    subject,
    quota_date,
    is_premium,
    status,
    created_at,
    expires_at
  ) VALUES (
    p_student_id,
    NULL,
    p_subject,
    v_today_karachi,
    false,
    'pending',
    NOW(),
    NOW() + INTERVAL '90 seconds'
  ) RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'is_premium', false,
    'reservation_id', v_reservation_id,
    'quota_date', v_today_karachi,
    'questions_remaining', v_max_daily - (v_used + v_pending + 1)
  );
END;
$$;

-- 3.3 Reserve question allowance for an anonymous guest
CREATE OR REPLACE FUNCTION public.reserve_guest_ai_question(
  p_guest_id_hash TEXT,
  p_subject TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_used INTEGER := 0;
  v_pending INTEGER := 0;
  v_reservation_id UUID;
  v_max_guest CONSTANT INTEGER := 1;
BEGIN
  -- Strict validation of guest hash (64 hex characters) and subject
  IF p_guest_id_hash IS NULL OR char_length(p_guest_id_hash) <> 64 OR p_guest_id_hash !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_guest_hash');
  END IF;

  -- Explicit NULL check on subject
  IF p_subject IS NULL OR p_subject NOT IN ('chemistry', 'physics', 'math', 'biology', 'english') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_subject');
  END IF;

  -- Lock Order Step 1: Acquire lock on guest usage parent row (Table A) FIRST
  INSERT INTO public.ai_guest_usage (guest_id_hash, questions_used, first_used_at, last_used_at)
  VALUES (p_guest_id_hash, 0, NOW(), NOW())
  ON CONFLICT (guest_id_hash) DO NOTHING;

  SELECT questions_used INTO v_used
  FROM public.ai_guest_usage
  WHERE guest_id_hash = p_guest_id_hash
  FOR UPDATE;

  -- Lock Order Step 2: Under parent row lock, passively clean up stale holds for this guest
  UPDATE public.ai_question_reservations
  SET status = 'expired',
      finalized_at = NOW()
  WHERE guest_id_hash = p_guest_id_hash
    AND status = 'pending'
    AND expires_at < NOW();

  -- Lock Order Step 3: Under parent row lock, count active unexpired pending reservations
  SELECT COUNT(*) INTO v_pending
  FROM public.ai_question_reservations
  WHERE guest_id_hash = p_guest_id_hash
    AND status = 'pending'
    AND expires_at >= NOW();

  -- Lock Order Step 4: Reject if already used or pending
  IF (v_used + v_pending) >= v_max_guest THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'guest_limit_reached',
      'limit', v_max_guest,
      'questions_remaining', 0
    );
  END IF;

  -- Lock Order Step 5: Insert reservation ticket
  INSERT INTO public.ai_question_reservations (
    student_id,
    guest_id_hash,
    subject,
    quota_date,
    is_premium,
    status,
    created_at,
    expires_at
  ) VALUES (
    NULL,
    p_guest_id_hash,
    p_subject,
    NULL,
    false,
    'pending',
    NOW(),
    NOW() + INTERVAL '90 seconds'
  ) RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'reservation_id', v_reservation_id,
    'questions_remaining', 0
  );
END;
$$;

-- 3.4 Finalize reservation (Idempotent Commit / Release with Coordinated Lock Order)
-- Handles p_success = NULL as an ordinary failed request (release without consuming quota)
-- Safely detects missing or concurrently deleted reservation rows
CREATE OR REPLACE FUNCTION public.finalize_ai_question_reservation(
  p_reservation_id UUID,
  p_success BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_res RECORD;
  v_status TEXT;
  v_expires_at TIMESTAMPTZ;
  v_dummy_int INTEGER;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'missing_reservation_id');
  END IF;

  -- Non-locking snapshot pre-check to identify identity & quick exit for terminal states
  SELECT student_id, guest_id_hash, quota_date, is_premium, status, expires_at
  INTO v_res
  FROM public.ai_question_reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'not_found');
  END IF;

  -- Fast idempotent exit for already finalized states
  IF v_res.status = 'committed' THEN
    RETURN jsonb_build_object('finalized', true, 'status', 'committed', 'already_finalized', true);
  END IF;

  IF v_res.status = 'released' THEN
    RETURN jsonb_build_object('finalized', true, 'status', 'released', 'already_finalized', true);
  END IF;

  IF v_res.status = 'expired' THEN
    RETURN jsonb_build_object('finalized', false, 'status', 'expired', 'reason', 'reservation_already_expired');
  END IF;

  -- PATH A: Non-quota transitions (Release, Failed requests, p_success IS NOT TRUE, Premium commit, or Expired lease)
  -- These transitions NEVER mutate Table A. Therefore, they lock Table B directly
  -- and do not participate in any Table A lock hierarchy.
  IF p_success IS NOT TRUE OR v_res.is_premium OR v_res.expires_at < NOW() THEN
    -- Lock reservation row on Table B exclusively
    SELECT status, expires_at INTO v_status, v_expires_at
    FROM public.ai_question_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    -- Concurrently deleted reservation check
    IF NOT FOUND THEN
      RETURN jsonb_build_object('finalized', false, 'reason', 'not_found');
    END IF;

    -- Re-check state under row lock
    IF v_status = 'committed' THEN
      RETURN jsonb_build_object('finalized', true, 'status', 'committed', 'already_finalized', true);
    ELSIF v_status = 'released' THEN
      RETURN jsonb_build_object('finalized', true, 'status', 'released', 'already_finalized', true);
    ELSIF v_status = 'expired' THEN
      RETURN jsonb_build_object('finalized', false, 'status', 'expired', 'reason', 'reservation_already_expired');
    END IF;

    -- If lease has elapsed, mark expired under lock
    IF v_expires_at < NOW() THEN
      UPDATE public.ai_question_reservations
      SET status = 'expired',
          finalized_at = NOW()
      WHERE id = p_reservation_id;

      RETURN jsonb_build_object('finalized', false, 'status', 'expired', 'reason', 'lease_expired');
    END IF;

    -- If failed request or p_success is NULL/false, release reservation (quota untouched)
    IF p_success IS NOT TRUE THEN
      UPDATE public.ai_question_reservations
      SET status = 'released',
          finalized_at = NOW()
      WHERE id = p_reservation_id;

      RETURN jsonb_build_object('finalized', true, 'status', 'released', 'consumed', false);
    END IF;

    -- If premium request, commit without touching quota Table A
    IF v_res.is_premium THEN
      UPDATE public.ai_question_reservations
      SET status = 'committed',
          finalized_at = NOW()
      WHERE id = p_reservation_id;

      RETURN jsonb_build_object('finalized', true, 'status', 'committed', 'is_premium', true, 'consumed', false);
    END IF;
  END IF;

  -- PATH B: Quota-Consuming Commit (p_success IS TRUE AND NOT v_res.is_premium AND valid lease)
  -- Coordinated Lock Order:
  -- Lock Order Step 1: Acquire exclusive row lock on usage parent row (Table A) FIRST
  IF v_res.student_id IS NOT NULL THEN
    SELECT questions_used INTO v_dummy_int
    FROM public.ai_daily_usage
    WHERE student_id = v_res.student_id AND usage_date = v_res.quota_date
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.ai_daily_usage (student_id, usage_date, questions_used, last_question_at)
      VALUES (v_res.student_id, v_res.quota_date, 0, NOW())
      ON CONFLICT (student_id, usage_date) DO NOTHING;

      SELECT questions_used INTO v_dummy_int
      FROM public.ai_daily_usage
      WHERE student_id = v_res.student_id AND usage_date = v_res.quota_date
      FOR UPDATE;
    END IF;
  ELSIF v_res.guest_id_hash IS NOT NULL THEN
    SELECT questions_used INTO v_dummy_int
    FROM public.ai_guest_usage
    WHERE guest_id_hash = v_res.guest_id_hash
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.ai_guest_usage (guest_id_hash, questions_used, first_used_at, last_used_at)
      VALUES (v_res.guest_id_hash, 0, NOW(), NOW())
      ON CONFLICT (guest_id_hash) DO NOTHING;

      SELECT questions_used INTO v_dummy_int
      FROM public.ai_guest_usage
      WHERE guest_id_hash = v_res.guest_id_hash
      FOR UPDATE;
    END IF;
  END IF;

  -- Lock Order Step 2: Lock reservation row (Table B) SECOND
  SELECT status, expires_at INTO v_status, v_expires_at
  FROM public.ai_question_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  -- Concurrently deleted reservation check
  IF NOT FOUND THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'not_found');
  END IF;

  -- Re-check idempotency under lock in case of concurrent finalization
  IF v_status = 'committed' THEN
    RETURN jsonb_build_object('finalized', true, 'status', 'committed', 'already_finalized', true);
  ELSIF v_status = 'released' THEN
    RETURN jsonb_build_object('finalized', true, 'status', 'released', 'already_finalized', true);
  ELSIF v_status = 'expired' THEN
    RETURN jsonb_build_object('finalized', false, 'status', 'expired', 'reason', 'reservation_already_expired');
  END IF;

  -- Guard against committing an expired lease under lock:
  -- If expired, do NOT increment usage Table A
  IF v_status = 'pending' AND v_expires_at < NOW() THEN
    UPDATE public.ai_question_reservations
    SET status = 'expired',
        finalized_at = NOW()
    WHERE id = p_reservation_id;

    RETURN jsonb_build_object('finalized', false, 'status', 'expired', 'reason', 'lease_expired');
  END IF;

  -- Commit reservation ticket on Table B
  UPDATE public.ai_question_reservations
  SET status = 'committed',
      finalized_at = NOW()
  WHERE id = p_reservation_id;

  -- Increment usage counter on Table A
  IF v_res.student_id IS NOT NULL THEN
    INSERT INTO public.ai_daily_usage (student_id, usage_date, questions_used, last_question_at)
    VALUES (v_res.student_id, v_res.quota_date, 1, NOW())
    ON CONFLICT (student_id, usage_date)
    DO UPDATE SET questions_used = public.ai_daily_usage.questions_used + 1,
                  last_question_at = NOW();
  ELSIF v_res.guest_id_hash IS NOT NULL THEN
    INSERT INTO public.ai_guest_usage (guest_id_hash, questions_used, first_used_at, last_used_at)
    VALUES (v_res.guest_id_hash, 1, NOW(), NOW())
    ON CONFLICT (guest_id_hash)
    DO UPDATE SET questions_used = public.ai_guest_usage.questions_used + 1,
                  last_used_at = NOW();
  END IF;

  RETURN jsonb_build_object('finalized', true, 'status', 'committed', 'is_premium', false, 'consumed', true);
END;
$$;

-- 3.5 Lease extension for long-running upstream AI requests
CREATE OR REPLACE FUNCTION public.extend_ai_question_reservation(
  p_reservation_id UUID,
  p_extension_seconds INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_new_expires_at TIMESTAMPTZ;
  v_clamped_seconds INTEGER;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN jsonb_build_object('extended', false, 'reason', 'missing_reservation_id');
  END IF;

  -- Clamp extension between 10s and 120s
  v_clamped_seconds := GREATEST(10, LEAST(120, COALESCE(p_extension_seconds, 60)));

  UPDATE public.ai_question_reservations
  SET expires_at = NOW() + (v_clamped_seconds || ' seconds')::INTERVAL
  WHERE id = p_reservation_id
    AND status = 'pending'
    AND expires_at >= NOW()
  RETURNING expires_at INTO v_new_expires_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('extended', false, 'reason', 'reservation_not_active');
  END IF;

  RETURN jsonb_build_object('extended', true, 'expires_at', v_new_expires_at);
END;
$$;

-- 3.6 Periodic cleanup of expired pending reservations
CREATE OR REPLACE FUNCTION public.recover_expired_ai_reservations(
  p_batch_limit INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  WITH expired_rows AS (
    SELECT id
    FROM public.ai_question_reservations
    WHERE status = 'pending'
      AND expires_at < NOW()
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_question_reservations
  SET status = 'expired',
      finalized_at = NOW()
  WHERE id IN (SELECT id FROM expired_rows);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- 3.7 Automated student profile initialization on auth signup
-- Strict Zero-Trust Input Handling (F-01, F-06):
-- Terms of service, marketing consent, and guardian consent all initialize to false/NULL.
-- Mobile input is sanitized against regex; invalid format gracefully stored as NULL so signup never fails.
CREATE OR REPLACE FUNCTION public.smarttutors_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_raw_name TEXT;
  v_full_name TEXT;
  v_mobile TEXT;
  v_qualification TEXT;
BEGIN
  -- 1. Sanitize and validate full_name
  v_raw_name := trim(COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  IF char_length(v_raw_name) >= 2 AND char_length(v_raw_name) <= 100 THEN
    v_full_name := v_raw_name;
  ELSE
    v_full_name := SUBSTRING(split_part(NEW.email, '@', 1) FROM 1 FOR 100);
    IF char_length(v_full_name) < 2 THEN
      v_full_name := 'Student User';
    END IF;
  END IF;

  -- 2. Sanitize and validate mobile against format regex
  v_mobile := NULLIF(trim(NEW.raw_user_meta_data->>'mobile'), '');
  IF v_mobile IS NOT NULL AND v_mobile !~ '^[0-9+\s\-()]{10,20}$' THEN
    -- Prevent malformed client metadata from crashing auth signup; gracefully store as NULL
    v_mobile := NULL;
  END IF;

  -- 3. Validate qualification
  v_qualification := lower(trim(COALESCE(NEW.raw_user_meta_data->>'qualification', 'o-level')));
  IF v_qualification NOT IN ('o-level', 'a-level') THEN
    v_qualification := 'o-level';
  END IF;

  -- 4. Insert profile with strict security defaults:
  -- is_minor defaults to true for secondary education students
  -- guardian_consent defaults to false / NULL
  -- service_terms_accepted strictly defaults to false / NULL (must be affirmed via accept_service_terms)
  -- marketing_consent strictly defaults to false / NULL (must be affirmed via explicit authenticated action)
  INSERT INTO public.students (
    id,
    full_name,
    mobile,
    qualification,
    is_minor,
    guardian_consent,
    guardian_consent_recorded_at,
    service_terms_accepted,
    service_terms_accepted_at,
    marketing_consent,
    marketing_consent_recorded_at,
    marketing_consent_withdrawn_at,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    v_full_name,
    v_mobile,
    v_qualification,
    true,
    false,
    NULL,
    false,
    NULL,
    false,
    NULL,
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Dedicated namespaced trigger on auth.users for SmartTutors signups
DROP TRIGGER IF EXISTS trg_smarttutors_auth_user_created ON auth.users;
CREATE TRIGGER trg_smarttutors_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.smarttutors_handle_new_user();

-- 3.8 Idempotent Backfill for Pre-Existing auth.users Accounts (Revision 5.2 / SEC-AUD-02)
-- Guarantees any user created prior to migration execution has a valid student profile
-- skeleton with protective zero-trust defaults (terms unaccepted, guardian consent unaccepted)
INSERT INTO public.students (
  id,
  full_name,
  mobile,
  qualification,
  is_minor,
  guardian_consent,
  guardian_consent_recorded_at,
  service_terms_accepted,
  service_terms_accepted_at,
  marketing_consent,
  marketing_consent_recorded_at,
  marketing_consent_withdrawn_at,
  created_at,
  updated_at
)
SELECT
  u.id,
  CASE
    WHEN char_length(trim(COALESCE(u.raw_user_meta_data->>'full_name', ''))) >= 2
         AND char_length(trim(COALESCE(u.raw_user_meta_data->>'full_name', ''))) <= 100
    THEN trim(u.raw_user_meta_data->>'full_name')
    WHEN char_length(trim(COALESCE(split_part(u.email, '@', 1), ''))) >= 2
    THEN SUBSTRING(trim(split_part(u.email, '@', 1)) FROM 1 FOR 100)
    ELSE 'Student User'
  END,
  NULL,
  'o-level',
  true,
  false,
  NULL,
  false,
  NULL,
  false,
  NULL,
  NULL,
  COALESCE(u.created_at, NOW()),
  NOW()
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 4. ROW LEVEL SECURITY (RLS) & EXPLICIT TABLE ACCESS PRIVILEGES
-- =====================================================================

-- 4.1 Enable RLS on all 5 application tables
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_guest_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_question_reservations ENABLE ROW LEVEL SECURITY;

-- 4.2 Restrict default grants explicitly per table (Zero client trust)
REVOKE ALL ON TABLE public.students FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_daily_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_guest_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subject_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_question_reservations FROM PUBLIC, anon, authenticated;

-- Service role maintains full administrative backend access on all 5 tables
GRANT ALL ON TABLE public.students TO service_role;
GRANT ALL ON TABLE public.ai_daily_usage TO service_role;
GRANT ALL ON TABLE public.ai_guest_usage TO service_role;
GRANT ALL ON TABLE public.subject_subscriptions TO service_role;
GRANT ALL ON TABLE public.ai_question_reservations TO service_role;

-- 4.3 Table: public.students
-- Authenticated students may view and update only non-privileged profile columns
GRANT SELECT ON TABLE public.students TO authenticated;
GRANT UPDATE(full_name, mobile, qualification, marketing_consent) ON TABLE public.students TO authenticated;

DROP POLICY IF EXISTS students_read_own ON public.students;
CREATE POLICY students_read_own 
  ON public.students 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS students_update_own ON public.students;
CREATE POLICY students_update_own 
  ON public.students 
  FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4.4 Table: public.ai_daily_usage
-- Authenticated students may view only their own usage counts (read-only for client)
GRANT SELECT ON TABLE public.ai_daily_usage TO authenticated;

DROP POLICY IF EXISTS daily_usage_read_own ON public.ai_daily_usage;
CREATE POLICY daily_usage_read_own 
  ON public.ai_daily_usage 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = student_id);

-- 4.5 Table: public.subject_subscriptions
-- Authenticated students may view only their own active entitlements (read-only for client)
GRANT SELECT ON TABLE public.subject_subscriptions TO authenticated;

DROP POLICY IF EXISTS subscriptions_read_own ON public.subject_subscriptions;
CREATE POLICY subscriptions_read_own 
  ON public.subject_subscriptions 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = student_id);

-- 4.6 Tables: public.ai_guest_usage & public.ai_question_reservations
-- Direct client access strictly denied. Operations permitted exclusively through service_role backend.

-- =====================================================================
-- 5. FUNCTION EXECUTION PERMISSIONS
-- =====================================================================

-- Utility trigger functions: internal execution only
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.handle_student_consent_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_student_consent_update() TO service_role;

-- accept_service_terms: Executable by authenticated student (via auth.uid()) and service_role
REVOKE ALL ON FUNCTION public.accept_service_terms(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_service_terms(UUID) TO authenticated, service_role;

-- Business logic functions: Strictly service_role backend access
REVOKE ALL ON FUNCTION public.reserve_student_ai_question(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_student_ai_question(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_guest_ai_question(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_guest_ai_question(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_ai_question_reservation(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_question_reservation(UUID, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.extend_ai_question_reservation(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_ai_question_reservation(UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.recover_expired_ai_reservations(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_expired_ai_reservations(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.smarttutors_handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smarttutors_handle_new_user() TO service_role;

-- =====================================================================
-- 6. TRANSACTION COMMIT
-- =====================================================================
COMMIT;
