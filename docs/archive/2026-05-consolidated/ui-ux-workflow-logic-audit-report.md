# UI/UX, Workflow, and Logic Audit Report

Date: 2026-05-17

Scope: SIAGA frontend and backend flows for login, role navigation, admin operations, daily record, attendance, gate pickup, parent portal, billing, notifications, and development verification.

## Executive Summary

The application is functional and has broad feature coverage, but several repair areas should be treated as release blockers before operational use across branches. The most important issues are not visual polish; they are workflow/logic mismatches where the UI promises an action that the backend rejects, or where backend scope rules can expose or mutate data outside the intended branch boundary.

The repair work should happen in four waves:

1. Fix security and workflow correctness gaps.
2. Add regression tests around the state machines and schema-backed statuses.
3. Improve high-risk UI confirmations and mobile workflow ergonomics.
4. Stabilize development/test scripts so automated verification is reliable.

## Audit Method

- Reviewed source files in `frontend/src`, `backend/routes`, `backend/utils`, `scripts`, and `docs`.
- Started the dev stack and inspected the live UI at `http://127.0.0.1:5173`.
- Walked Admin, Kepsek, Guru, and Gerbang surfaces from the browser.
- Checked mobile viewport behavior at 390px width.
- Ran `npm test` and `npm run build`.
- Compared behavior against `docs/multi-cabang-dan-portal-wali.md` and `docs/implementation-tracker.md`.

## Verification Results

- `npm run build`: passed.
- First `npm test`: failed because backend was not running.
- Second `npm test` under `npm run dev`: first 12 assertions passed, then backend restarted mid-suite and remaining API requests failed with `ECONNRESET` / `ECONNREFUSED`.
- Browser console: repeated React warning for duplicate child keys in table headers.
- Delegated read-only validation confirmed the P1 workflow gaps and added two schema/scope issues: siswa status mismatch and payment creation without student-cabang ownership validation.

## Priority Findings

### P1: Gerbang handoff UI is not allowed by backend

Impact: Gate staff see and can press a `Pulang` action, but the backend rejects it for role `gerbang`. This creates an operational dead end at pickup time.

Evidence:

- `frontend/src/views/GerbangView.jsx` renders `Pulang` for waiting students.
- `backend/routes/penjemputan.js` only authorizes `guru`, `admin`, and `admin_cabang` for `/pulang`.

Recommendation:

- Either authorize `gerbang` for `pulang`, or remove/disable the `Pulang` action for true gerbang users and rewrite the copy.
- Given the UI copy says gerbang can help, the simplest repair is to allow `gerbang` and rely on `canAccessSiswa` + cabang scope.

### P1: Tutup Hari does not close implicit Belum students

Impact: The UI says closing the day turns `Belum` students into `Absen`, but backend only updates existing `absensi` rows. Students who appear as `Belum` through a left join may not have rows yet, so they remain unresolved.

Evidence:

- `frontend/src/views/GuruView.jsx` confirmation says `Belum` will become `Absen`.
- `backend/routes/absensi.js` queries only `absensi` rows for closing logic.

Recommendation:

- During `tutup-hari`, enumerate all active students in cabang on that date.
- Ensure an `absensi` row exists for each.
- Mark only unresolved `Belum` rows as `Absen`.
- Preserve existing `Hadir`, `Terlambat`, `Menunggu`, `Pulang`, `Izin`, and `Sakit`.

### P1: Billing query can bypass branch scope by siswa_id

Impact: `admin_cabang` or `kepsek` can query bills for a student outside their branch if they know the student ID. This violates branch data isolation.

Evidence:

- `backend/routes/billing.js` sets `const cabangId = req.query.siswa_id ? null : cabangParam(req);`.
- When `siswa_id` is present, no cabang filter is applied and no `canAccessSiswa` check is used.

Recommendation:

- For non-admin users, require either active access to the student or explicit historical access rules.
- Return old-branch history read-only only where product rules allow it.
- Keep mutation endpoints constrained to the owning bill/payment cabang.

### P1: Payment status transitions are under-constrained

Impact: Rejected and non-pending payments can still be rejected or edited in ways that create confusing accounting states.

Evidence:

- `backend/routes/billing.js` reject endpoint does not require `pending_verification`.
- Allocation editing only blocks `void`, not `rejected`.
- UI shows `Alokasi` for every non-void payment.

Recommendation:

- Allow `verify` / `reject` only from `pending_verification`.
- Allow allocation edit only for `confirmed` or explicitly allow pending before verification, but never for rejected/void.
- Require payment creation and allocation edits to prove the student and selected bills belong to the payment cabang.
- Update UI action availability to match backend state rules.

### P1: Student and enrollment statuses disagree with the schema

Impact: The UI can submit unsupported student status values, and the kenaikan workflow writes an unsupported enrollment status. These paths can fail at runtime or leave operators unsure which status vocabulary is canonical.

Evidence:

- `frontend/src/views/AdminView.jsx` uses `nonaktif` as a siswa status option.
- `backend/db.js` allows siswa status only as `aktif`, `keluar`, or `lulus`.
- `backend/routes/siswa.js` writes `status='nonaktif'` to `siswa_enrollment` during kenaikan/lulus paths.
- `backend/db.js` allows enrollment status only as `aktif` or `selesai`.

Recommendation:

- Change siswa UI options to `Aktif`, `Keluar`, and `Lulus`.
- Validate siswa status server-side before update/create.
- Replace kenaikan enrollment writes from `nonaktif` to `selesai`.
- Add regression tests for student update and kenaikan so schema constraints become visible before release.

### P1: Parent history after inactive/no active enrollment is likely blocked

Impact: The PRD says wali can keep seeing published history after a student moves, leaves, or graduates. Current access helpers use active/current enrollment in places that can hide students without active enrollment.

Evidence:

- `siswaScopeSql` for wali joins `siswa_enrollment` with `status='aktif'`.
- `canAccessSiswa` returns null when no active/latest active enrollment is found.
- `WaliView` loads children from `/api/siswa?status=semua`, which still depends on the wali scope helper.

Recommendation:

- Create a dedicated wali child/history access path based on `wali_siswa`, not active enrollment.
- Keep comment/write rules based on current matching active enrollment.
- Keep historical published daily record read-only after exit/lulus/move.

### P2: Development watcher restarts backend during tests

Impact: Automated API verification is unreliable while the dev stack is running. This slows repair work and can hide real failures behind watcher restarts.

Evidence:

- `backend/package.json` uses `node --watch server.js`.
- Tests caused the backend to restart mid-suite when running under `npm run dev`.

Recommendation:

- Add a non-watch backend script for test/dev verification.
- Exclude SQLite WAL/log files from watch if continuing to use watch mode.
- Document test workflow as: start backend without watch, then run tests.

### P2: High-risk admin actions lack impact-focused confirmation

Impact: Actions that affect operations, access, billing, or audit history are too easy to trigger. Some use no confirmation, some use generic modals, and some only show a text field.

Examples:

- Cabang activation/deactivation.
- Staff/wali deactivation.
- Password reset.
- NFC reissue.
- Student enrollment move.
- Billing correction/void.
- Payment verification/reject/void/allocation.
- Kenaikan tahun ajaran.

Recommendation:

- Add a reusable `ConfirmActionModal` for destructive/irreversible actions.
- Show entity name, affected branch, consequence, required reason where needed, and final action label.

### P2: Mobile UX is operationally usable but dense

Impact: Admin and billing tables technically fit through horizontal scroll, but classroom/gate users need faster card-first flows. On phones, primary actions are buried in wide tables and horizontal nav strips.

Recommendation:

- Keep tables for desktop.
- Add card list layouts for mobile-heavy workflows: attendance, pickup, daily records, student list, billing action queues.
- Prioritize "needs action now" states above master-data forms.

### P2: Duplicate table header keys trigger React warnings

Impact: React warns about duplicate keys where table headers contain repeated empty strings. Unsupported duplicate keys can cause unstable rendering.

Evidence:

- `AdminView.jsx` `Table` uses header text as key.
- Several tables pass `''` more than once.

Recommendation:

- Key headers by index plus label, or pass explicit header IDs.

### P3: Navigation has no URL state or deep links

Impact: Refresh loses selected role/tab context. Support, training, and QA cannot link directly to Admin > Billing, Admin > Laporan, etc.

Recommendation:

- Introduce lightweight URL query state such as `?view=admin&tab=billing`.
- Later consider React Router if the app grows.

### P3: Some emoji/icon text is mojibaked

Impact: Some source strings contain encoding artifacts, which can appear in UI depending on build/runtime path.

Recommendation:

- Replace corrupted icon text with ASCII labels or valid Unicode in UTF-8 files.
- Add a lint/script check for replacement-character or mojibake patterns.

### P3: Dev-only helper and status labels need clearer product language

Impact: The dev admin helper is correctly gated by Vite dev mode, but it can still confuse anyone using a shared development server. Daily-record statuses also leak backend terms like `published` instead of parent/operator language.

Recommendation:

- Add an explicit dev badge or environment flag for the admin helper, and verify production preview hides it.
- Centralize display labels such as `Draf`, `Terkirim ke Wali`, and `Sudah Dibaca`.

## Repair Strategy

### Wave 1: Correctness and Security

- Fix gerbang handoff authorization/UI mismatch.
- Fix `tutup-hari` to materialize implicit `Belum` rows.
- Fix billing `siswa_id` scope bypass.
- Lock payment transitions and allocation rules.
- Fix siswa/enrollment status vocabulary and schema violations.
- Repair wali history access separately from comment/write access.

### Wave 2: Regression Tests

- Add API tests for the repaired role and state transitions.
- Add tests for branch isolation and wali history.
- Add tests for payment state machine transitions.
- Add a stable test server workflow.

### Wave 3: UX Safety

- Add reusable confirmation modal.
- Replace browser `confirm` / `prompt` for operational actions.
- Disable or explain actions that backend state will reject.
- Add impact summaries for branch, user, billing, and attendance actions.

### Wave 4: Mobile and Navigation

- Add mobile card views for operational tables.
- Add URL state for main role view and admin tab.
- Fix duplicate table header keys.
- Clean mojibake.

## Suggested Owners

- Backend workflow/access: one worker.
- Billing state machine: one worker.
- Wali history and daily record access: one worker.
- UI safety and mobile ergonomics: one worker.
- Test/dev workflow stabilization: one worker.

## Acceptance Criteria

- `npm run build` passes.
- API tests pass against a non-watch backend.
- Browser smoke covers admin, guru, gerbang, wali core flows.
- Gerbang user can only see actions they are authorized to perform.
- `tutup-hari` leaves no implicit `Belum` students unresolved for the closed branch/date.
- Branch users cannot fetch or mutate unrelated branch billing data.
- Payment statuses follow an explicit transition table.
- Wali can read published history after move/exit/lulus while write/comment remains correctly locked.
- No React duplicate key warnings in audited flows.
