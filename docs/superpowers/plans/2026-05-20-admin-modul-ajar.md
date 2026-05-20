# Admin Modul Ajar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Admin dashboard tab where existing admin roles can create, list, and edit weekly Modul Ajar for Guru Focus Theme selection.

**Architecture:** Reuse the existing `modul_ajar` data model and `/api/modul-ajar` API. Add a small update endpoint for existing records, expose it in `frontend/src/api.js`, then add a focused `ModulAjarTab` inside `AdminView.jsx` following the current large-file Admin dashboard pattern.

**Tech Stack:** Node.js, Express, better-sqlite3, React/Vite, Tailwind utility classes, `node:test`.

---

## File Structure

- Modify `backend/routes/modulAjar.js`: add `PUT /api/modul-ajar/:id` for admin/admin_cabang/kepsek edits using the same validation rules as create.
- Modify `frontend/src/api.js`: add `updateModulAjar(id, data)`.
- Modify `frontend/src/views/AdminView.jsx`: add `modulAjar` tab entry and a new `ModulAjarTab` component.
- Modify `scripts/daily-record-v2.test.js`: cover update behavior so the UI edit path has backend regression coverage.

## Task 1: Backend Update API

- [ ] Add a test in `scripts/daily-record-v2.test.js` after the Modul Ajar create/list assertions: call `PUT /api/modul-ajar/:id`, change title/domains, then list and assert updated values.
- [ ] Run the test against a local backend and verify it fails with 404 before implementation.
- [ ] Add `router.put('/:id', auth(['admin','admin_cabang','kepsek']), ...)` in `backend/routes/modulAjar.js`.
- [ ] Reuse `scopeCabang`, `canUseRombel`, `jsonArray`, and `audit`.
- [ ] Validate required `title`, `week_start`, `week_end`, and cabang scope.
- [ ] Run `npm test` against a clean test port and verify all tests pass.

## Task 2: Frontend API Wrapper

- [ ] Add `updateModulAjar:(id,d)=>req('PUT','/api/modul-ajar/'+id,d)` beside `createModulAjar`.
- [ ] Run `npm run build --prefix frontend` and verify it still passes.

## Task 3: Admin Dashboard Tab

- [ ] Add `modulAjar` to the Admin tab array and label map.
- [ ] Render `<ModulAjarTab user={user} toast={toast}/>` when selected.
- [ ] Implement `ModulAjarTab` with `useMaster(user)`, list state, edit state, and form state.
- [ ] Use filters for cabang, date/week, jenjang, and rombel.
- [ ] Parse comma-separated textarea/input values into arrays for `goals`, `suggested_activities`, and `suggested_domains`.
- [ ] On create/edit, call `api.createModulAjar` or `api.updateModulAjar`, reset form, reload list, and show toast.
- [ ] Display list rows with week range, title, jenjang, rombel/all rombel, domains, creator, and edit action.
- [ ] Run frontend build.

## Task 4: End-to-End Verification

- [ ] Run `npm test` with backend on a clean test port.
- [ ] Run `npm run test:workflow` with backend on a clean test port.
- [ ] Run `npm run build --prefix frontend`.
- [ ] Use the in-app browser to open the Admin dashboard, confirm the `Modul Ajar` tab renders, and confirm there are no console errors.

## Self-Review

Spec coverage:

- No new role: covered by using existing roles only.
- Admin dashboard tab: Task 3.
- Create/list/edit Modul Ajar: Tasks 1 and 3.
- Guru dropdown integration: covered by using the existing `/api/modul-ajar` data source.
- Testing: Tasks 1 and 4.

Placeholder scan: no TBD/TODO placeholders.

Type consistency:

- API methods: `createModulAjar`, `updateModulAjar`, `modulAjar`.
- Backend fields: `goals`, `suggested_activities`, `suggested_domains`.
