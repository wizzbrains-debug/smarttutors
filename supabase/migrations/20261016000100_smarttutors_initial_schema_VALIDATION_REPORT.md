# SmartTutors — PostgreSQL Staging Validation & Security Verification Report

**Date:** 2026-10-18T20:15:00+05:00  
**Environment:** Windows 10/11 Enterprise x64, WSL 2 (Ubuntu 24.04 LTS), Docker 29.1.3, PostgreSQL 15.19 (`postgres:15-alpine`), Python 3.12.3  
**Target Repository:** `C:\Users\user\smarttutors`  
**Git Baseline Commit:** `8af5339d32390bb9bdc4f898a4b745ab7e3da579` on branch `master`  
**Target Production Database (STRICTLY UNTOUCHED):** `https://gfzffxvpmotjuydcvfav.supabase.co`  
**Status Vocabulary:** `PASS` | `FAIL` | `NOT RUN` | `BLOCKED`

---

## 1. Executive Summary

This report delivers the comprehensive, evidence-based staging validation and security verification of the SmartTutors initial database schema migration proposal (`20261016000100_smarttutors_initial_schema.sql`) under the user's explicit authorization for **Option B (Local Disposable PostgreSQL Staging Only)**.

Per mandatory safety boundaries:
- **Zero connections** were made to the remote production Supabase instance (`gfzffxvpmotjuydcvfav.supabase.co`).
- **No production credentials or secrets** were used, requested, or accessed.
- **Zero application source code, frontend files, or production configs** were modified.
- **No packages were installed or updated.**
- Testing was executed inside a strictly isolated, disposable local container (`smarttutors-staging-pg` running `postgres:15-alpine` bound exclusively to `127.0.0.1:54330` via WSL 2 Docker).
- Following test completion, the non-CASCADE rollback was executed, verified, and the container was cleanly decommissioned and removed.

### Verification Matrix Overview

| Category | Static Audit | Node Simulation | Live Staging PG 15 Runtime | Staging Status |
| :--- | :---: | :---: | :---: | :---: |
| **Migration DDL Execution & Syntax** | `PASS` | N/A | Exit Code `0`, 0 DDL errors | `PASS` |
| **Object Catalog & Grants Inventory** | `PASS` | N/A | 5 Tables, 5 Idxs, 9 Fns, 3 Trgs, 4 RLS | `PASS` |
| **Identity Safety & Role Spoofing** | `PASS` | `PASS` | `auth.uid()` overrides caller student ID | `PASS` |
| **Mobile & Signup Input Sanitization** | `PASS` | `PASS` | Fallbacks & regex sanitization verified | `PASS` |
| **NULL & Invalid Subject Guards** | `PASS` | `PASS` | Explicit subject whitelist enforced | `PASS` |
| **`p_success = NULL` / Failure Releases** | `PASS` | `PASS` | Released cleanly, 0 quota consumed | `PASS` |
| **Repeated Terms Acceptance Timestamp** | `PASS` | `PASS` | Original timestamp preserved across updates | `PASS` |
| **Missing/Deleted Reservation Handling** | `PASS` | `PASS` | Returns `not_found`, zero unhandled errors | `PASS` |
| **Standard & Guest Quota Enforcement** | `PASS` | `PASS` | 5/day student limit, 1 guest limit | `PASS` |
| **Premium Subscription Bypass** | `PASS` | `PASS` | Subscribed subject grants premium ticket | `PASS` |
| **Multi-Session Physical Concurrency** | `PASS` (Proof) | `BLOCKED` | Sessions A & B raced 5th slot: 1 win, 1 limit | `PASS` |
| **Concurrent Duplicate Finalization** | `PASS` (Proof) | `BLOCKED` | Fin A & Fin B race: 1 consumed, 1 duplicate | `PASS` |
| **RLS Isolation & Privilege Revocations** | `PASS` | `BLOCKED` | `anon` denied, `authenticated` RLS isolated | `PASS` |
| **Live Remote Supabase Auth / GoTrue** | `PASS` (Review) | `BLOCKED` | Staged via PG JWT claims; remote GoTrue | `NOT RUN` |
| **Section 7.2 Non-CASCADE Rollback** | `PASS` | N/A | Clean teardown, 0 orphans, forward re-apply | `PASS` |

---

## 2. Baseline Inventory & Staging Environment

### 2.1 File Hashes and Metrics
- **Migration SQL Proposal:**
  - File Path: `supabase/migrations/20261016000100_smarttutors_initial_schema.sql`
  - SHA-256 Digest: `212820061bde606215aa4fe3e174d6ee8ff0e06f6ed0bbb85c7c8632c070b30c`
  - Total Lines: `984` | Total Bytes: `36,175`
- **Security Review Document:**
  - File Path: `supabase/migrations/20261016000100_smarttutors_initial_schema_REVIEW.md`
  - SHA-256 Digest: `8d4e08964874735b653a9bf5cfd66a44d36f3a3e9c601e05d448c4f9a8b733b1`
  - Total Lines: `444` | Total Bytes: `29,945`

### 2.2 Staging Container Specification
- **Engine:** Docker `29.1.3` running inside WSL 2 (Ubuntu 24.04 LTS).
- **Image:** `postgres:15-alpine` (Image ID: `f7d23353e1b1`).
- **Container Name:** `smarttutors-staging-pg` (disposable).
- **Network Interface:** Bound exclusively to `127.0.0.1:54330` on the loopback interface.
- **Prerequisite Supabase Platform Schema Mocking:**
  To evaluate Supabase-specific DDL against standard PostgreSQL without cloud dependencies, standard local Supabase stubs were pre-applied:
  - Schema `auth`, table `auth.users(id UUID, email TEXT, raw_user_meta_data JSONB, email_confirmed_at TIMESTAMPTZ)`.
  - Roles: `anon`, `authenticated`, `service_role`.
  - Functions: `auth.uid()` and `auth.role()`.

---

## 3. Migration Application & Catalog Verification

### 3.1 Migration Execution Log
The unmodified migration file `/tmp/migration.sql` (SHA-256: `212820061bde606215aa4fe3e174d6ee8ff0e06f6ed0bbb85c7c8632c070b30c`) was applied via `psql -v ON_ERROR_STOP=1`:

```
CREATE EXTENSION
CREATE FUNCTION
CREATE FUNCTION
CREATE TABLE
CREATE TRIGGER
CREATE TRIGGER
CREATE TABLE
CREATE INDEX
CREATE TABLE
CREATE TABLE
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
DROP TRIGGER
NOTICE:  trigger "trg_smarttutors_auth_user_created" for relation "auth.users" does not exist, skipping
CREATE TRIGGER
ALTER TABLE (5 tables ENABLE ROW LEVEL SECURITY)
REVOKE / GRANT (8 table grants, 9 function grants, 14 privilege revocations)
CREATE POLICY (4 RLS policies)
```
- **Exit Code:** `0` (Zero DDL errors, zero syntax errors).

### 3.2 Live Catalog Object Inventory

PostgreSQL catalog tables (`pg_class`, `pg_proc`, `pg_trigger`, `pg_policies`, `pg_indexes`) verified 100% presence of all planned objects:

1. **Tables (5 of 5) — All with `relrowsecurity = true`:**
   - `public.students`
   - `public.ai_daily_usage`
   - `public.ai_guest_usage`
   - `public.subject_subscriptions`
   - `public.ai_question_reservations`

2. **Indexes (5 secondary + 5 primary keys):**
   - `idx_ai_daily_usage_date` ON `ai_daily_usage(usage_date)`
   - `idx_sub_lookup` ON `subject_subscriptions(student_id, subject, status, starts_at, expires_at)`
   - `idx_res_student_active` ON `ai_question_reservations(student_id, quota_date, status, expires_at) WHERE status = 'pending'`
   - `idx_res_guest_active` ON `ai_question_reservations(guest_id_hash, status, expires_at) WHERE status = 'pending'`
   - `idx_res_pending_expiry` ON `ai_question_reservations(expires_at) WHERE status = 'pending'`

3. **Functions (9 of 9):**
   - `public.set_updated_at` (invoker rights)
   - `public.handle_student_consent_update` (`SECURITY DEFINER`, search_path hardened)
   - `public.accept_service_terms` (`SECURITY DEFINER`, search_path hardened)
   - `public.reserve_student_ai_question` (`SECURITY DEFINER`, search_path hardened)
   - `public.reserve_guest_ai_question` (`SECURITY DEFINER`, search_path hardened)
   - `public.finalize_ai_question_reservation` (`SECURITY DEFINER`, search_path hardened)
   - `public.extend_ai_question_reservation` (`SECURITY DEFINER`, search_path hardened)
   - `public.recover_expired_ai_reservations` (`SECURITY DEFINER`, search_path hardened)
   - `public.smarttutors_handle_new_user` (`SECURITY DEFINER`, search_path hardened)

4. **Triggers (3 of 3):**
   - `trg_students_updated_at` ON `public.students`
   - `trg_students_marketing_consent` ON `public.students`
   - `trg_smarttutors_auth_user_created` ON `auth.users`

5. **RLS Policies (4 of 4):**
   - `students_read_own` ON `students` FOR SELECT TO `authenticated`
   - `students_update_own` ON `students` FOR UPDATE TO `authenticated`
   - `daily_usage_read_own` ON `ai_daily_usage` FOR SELECT TO `authenticated`
   - `subscriptions_read_own` ON `subject_subscriptions` FOR SELECT TO `authenticated`

---

## 4. Live Staging Test Suite Results (30 / 30 PASS)

The test suite was executed against the staging database using separate, concurrent backend processes.

```
=== SmartTutors PostgreSQL Staging Test Suite ===

--- 1. Trigger & Signup Validation ---
[✓ PASS] T1.1: Valid signup trigger
  - Student profile created for Alice Smith; service_terms_accepted = false, is_minor = true.
[✓ PASS] T1.2: Signup with empty metadata
  - Profile fallback full_name ('student2'), mobile = NULL, qualification default 'o-level'.
[✓ PASS] T1.3: Signup with malformed metadata types
  - Gracefully sanitized mobile (NULL) and qualification ('o-level') without crashing signup.
[✓ PASS] T1.4: Profile creation before email confirmation
  - Profile row created; email_confirmed_at remains NULL until verified.

--- 2. Terms Acceptance & Consent ---
[✓ PASS] T2.1: First-time terms acceptance
  - Terms accepted via authenticated session; service_terms_accepted = true.
[✓ PASS] T2.2: Repeated terms acceptance idempotent
  - Original timestamp preserved (2026-10-18 15:07:19.950251+00); no timestamp churn.
[✓ PASS] T2.3: Identity spoofing prevented in accept_service_terms
  - Authenticated caller auth.uid() overrides target student ID; other student remains false.
[✓ PASS] T2.4: Terms acceptance requires email confirmation
  - Unconfirmed email user rejected with reason: "email_not_confirmed".
[✓ PASS] T2.5: Marketing consent trigger records and preserves history
  - Opt-in set recorded_at; opt-out preserved recorded_at and set withdrawn_at.

--- 3. Input Validation on Reservations ---
[✓ PASS] T3.1: reserve_student_ai_question with NULL subject
  - Rejected: {"allowed": false, "reason": "invalid_subject"}.
[✓ PASS] T3.2: reserve_guest_ai_question with NULL subject
  - Rejected: {"allowed": false, "reason": "invalid_subject"}.
[✓ PASS] T3.3: reserve_guest_ai_question with invalid hash
  - Non-64 hex string rejected: {"allowed": false, "reason": "invalid_guest_hash"}.
[✓ PASS] T3.4: Unconfirmed/terms-pending student rejected
  - Student without terms acceptance rejected: {"allowed": false, "reason": "service_terms_not_accepted"}.

--- 4. Quota Enforcement ---
[✓ PASS] T4.1: Consume 4 daily quota slots for student
  - Successfully reserved and finalized 4 question allowance slots.
[✓ PASS] T4.1b: Daily usage count matches finalized reservations
  - Verified ai_daily_usage.questions_used = 4 for Asia/Karachi current date.
[✓ PASS] T4.2: Guest quota enforced at exactly 1 question
  - 1st reservation allowed & committed; 2nd rejected with "guest_limit_reached".
[✓ PASS] T4.3: Active subscription grants premium reservation
  - Active subscription in subject_subscriptions grants is_premium = true; bypasses daily usage counter.

--- 5. Physical Concurrency Tests ---
[✓ PASS] T5.1: Concurrent competition for 5th free slot
  - Winner: Session_A (allowed=True), Loser: Session_B (reason: "daily_limit_reached"). Zero deadlocks.
[✓ PASS] T5.2a: finalize with p_success = NULL releases hold
  - Status transitioned to 'released'; consumed = false; daily usage count unchanged.
[✓ PASS] T5.2b: finalize with p_success = false does not consume quota
  - Status transitioned to 'released'; consumed = false; daily usage counter = 0.
[✓ PASS] T5.3: Concurrent duplicate finalization race
  - Winner: Fin_B (consumed=True), Duplicate: Fin_A (already_finalized=True). Zero double-counting.
[✓ PASS] T5.4: Finalize missing reservation ID
  - Non-existent UUID returns {"finalized": false, "reason": "not_found"}. Zero exceptions.
[✓ PASS] T5.5: extend_ai_question_reservation extends active lease
  - Pending reservation extended by 45s; new expires_at returned.
[✓ PASS] T5.6: recover_expired_ai_reservations cleans expired lease
  - Stale pending reservations swept to 'expired'; batch updated count = 2.

--- 6. Permissions & RLS Behavior ---
[✓ PASS] T6.1: anon direct table SELECT denied
  - Error 42501 (permission denied) on public.students.
[✓ PASS] T6.2: authenticated direct reservations table access denied
  - Error 42501 (permission denied) on public.ai_question_reservations.
[✓ PASS] T6.3: authenticated reads own student row via RLS
  - Returns exactly 1 row matching caller auth.uid().
[✓ PASS] T6.4: authenticated cannot read other student row (RLS filtered)
  - Returns 0 rows when querying another student's ID.
[✓ PASS] T6.5: authenticated direct execution of reserve_student_ai_question denied
  - Error 42501 (permission denied) for authenticated role on internal RPC.
[✓ PASS] T6.6: authenticated execution of accept_service_terms allowed
  - Direct execution allowed for authenticated student role.

=== Test Suite Summary ===
Total Tests: 30 | Passed: 30 | Failed: 0 (100% Pass Rate)
```

---

## 5. Physical Concurrency & Serialization Proof

### 5.1 Test A: 5th-Slot Competition (Simultaneous Session A & Session B)
- **Setup:** A confirmed student had 4 finalized questions for the current date (`Asia/Karachi`). Exactly 1 quota slot remained before hitting `v_max_daily := 5`.
- **Execution:** Two separate physical database sessions (`Session_A` on PID 121, `Session_B` on PID 122) concurrently called `reserve_student_ai_question(student_id, 'physics')`.
- **Observed Behavior:**
  - `Session_A` acquired the exclusive lock on `ai_daily_usage` first. It counted `used = 4, pending = 0`, inserted a pending reservation ticket, and committed (`allowed: true`, remaining: `0`).
  - `Session_B` was queued on the row lock. Upon acquiring the lock, it re-evaluated `used = 4, pending = 1` (total 5), and immediately returned `{"allowed": false, "reason": "daily_limit_reached"}`.
  - **Verdict:** Serialization was strict and deterministic. Zero over-allocation occurred. Zero deadlocks detected.

### 5.2 Test B: Concurrent Duplicate Finalization
- **Setup:** A single pending reservation ticket was created.
- **Execution:** Two separate background worker sessions (`Fin_A` and `Fin_B`) simultaneously executed `finalize_ai_question_reservation(reservation_id, true)`.
- **Observed Behavior:**
  - One session locked Table A and Table B, transitioned status from `pending` to `committed`, incremented `questions_used`, and returned `{"finalized": true, "consumed": true}`.
  - The second session acquired the lock, detected `status = 'committed'`, and returned `{"finalized": true, "status": "committed", "already_finalized": true}`.
  - **Verdict:** Strict idempotency verified. Total daily usage incremented by exactly 1. Double-counting is completely prevented.

### 5.3 Test C: `p_success` Failure & Lease Expiry Safety
- `finalize_ai_question_reservation(res_id, NULL)`: Cleanly marked reservation `'released'` with `consumed: false`.
- `finalize_ai_question_reservation(res_id, false)`: Cleanly marked reservation `'released'` with `consumed: false`.
- Both operations bypassed Table A mutation, guaranteeing that upstream AI inference timeouts or failed responses never consume a student's daily allowance.

---

## 6. Rollback & Forward Migration Verification

### 6.1 Section 7.2 Non-CASCADE Rollback Execution
The exact rollback script from Section 7.2 of the review document was executed against the staging database:

```sql
DROP TRIGGER IF EXISTS trg_smarttutors_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_students_marketing_consent ON public.students;
DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
DROP TABLE IF EXISTS public.ai_question_reservations;
DROP TABLE IF EXISTS public.subject_subscriptions;
DROP TABLE IF EXISTS public.ai_guest_usage;
DROP TABLE IF EXISTS public.ai_daily_usage;
DROP TABLE IF EXISTS public.students;
DROP FUNCTION IF EXISTS public.accept_service_terms(UUID);
DROP FUNCTION IF EXISTS public.recover_expired_ai_reservations(INTEGER);
DROP FUNCTION IF EXISTS public.extend_ai_question_reservation(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.finalize_ai_question_reservation(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.reserve_guest_ai_question(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.reserve_student_ai_question(UUID, TEXT);
DROP FUNCTION IF EXISTS public.smarttutors_handle_new_user();
DROP FUNCTION IF EXISTS public.handle_student_consent_update();
DROP FUNCTION IF EXISTS public.set_updated_at();
```

- **Exit Code:** `0`
- **Output:** Every trigger, table, and function dropped cleanly in reverse dependency order without `CASCADE`.
- **Catalog Audit Post-Rollback:**
  ```sql
  SELECT 'TABLE' as type, tablename FROM pg_tables WHERE schemaname = 'public' ...
  ```
  Result: `(0 rows)`. Zero residual SmartTutors tables, triggers, indexes, or functions remained. Third-party schemas and the `auth` schema remained completely intact.

### 6.2 Forward Re-Application Idempotence
Immediately following the rollback, the full migration proposal was re-applied forward from scratch:
- **Exit Code:** `0`
- **Result:** Re-application succeeded with zero errors, confirming that the rollback script leaves no orphan constraints, types, or naming collisions that would impede re-deployment.

---

## 7. Limitations & Staged-vs-Cloud Distinctions

| Feature | Staged Test Result | Remote Cloud Consideration |
| :--- | :---: | :--- |
| **PostgreSQL 15 Core & PL/pgSQL** | `PASS` (Live) | Identical to Supabase's PostgreSQL 15 engine. |
| **Concurrency & Lock Serialization** | `PASS` (Live) | Identical transaction isolation and lock manager semantics. |
| **RLS Policies & Permissions** | `PASS` (Live) | Staged using `SET ROLE` and `SET request.jwt.claim.*`. |
| **Hosted Supabase Auth (GoTrue)** | `NOT RUN` | Actual cryptographic JWT signing, refresh tokens, and email delivery hooks belong to Supabase GoTrue; marked `NOT RUN` rather than claimed. |

---

## 8. Final Safety Boundary Confirmation

- **Target Production Project (`https://gfzffxvpmotjuydcvfav.supabase.co`):** Untouched. Zero connections, zero queries, zero modifications.
- **Application Source Code:** Untouched. No edits to frontend, API routes, or configuration.
- **Git Repository:** Working tree remains clean on `master` at commit `8af5339`. No commits or pushes have been made.
- **Disposable Infrastructure:** Container `smarttutors-staging-pg` stopped and deleted. Background keep-alive process terminated. No lingering background processes or container instances remain.
