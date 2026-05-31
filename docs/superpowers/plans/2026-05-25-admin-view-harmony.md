# Admin View Harmony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harmonize the user interface (UI) and user experience (UX) across different tabs in `AdminView.jsx`, specifically aligning `WaliTab`, `RombelTab`, and `AuditTab` with the responsive, mobile-first standard established in `SiswaTab` and `StaffTab`.

**Architecture:** Maintain all state and rendering within `frontend/src/views/AdminView.jsx`. Reuse existing components (`Panel`, `CustomSelect`, `StudentAvatar`, `StatusBadge`, `IconButton`, `ActionButton`) and apply responsive patterns defined in `docs/siaga-interface-harmony-guidelines.md`. Avoid backend modifications.

**Tech Stack:** React, Tailwind CSS, SIAGA Design System tokens.

---

### Task 1: Harmonize Wali Tab

**Files:**
- Modify: `frontend/src/views/AdminView.jsx`

- [ ] **Step 1: Relocate Cabang Filter in WaliTab**
  Remove `<CabangFilter>` from the header's `Panel right` button block. Place the filter row inside the body of the Panel.
  Header `Panel right` button block should now contain only the "Tambah Wali" action button.

- [ ] **Step 2: Reconstruct Search & Filter Row in WaliTab**
  Replace the hardcoded `grid-cols-[minmax(0,1fr)_8.5rem]` filter block on mobile with a full-width search input and a collapsible "Filter" toggle button (using a `filterOpen` state), identical to `SiswaTab`.
  The filter row should collapse its dropdowns (Cabang, Status) on mobile unless the filter menu is toggled open, but display them inline on desktop (`md:block`).

- [ ] **Step 3: Align WaliCard Styling**
  Modify `WaliCard` to use padding `p-3` (instead of `p-3.5`), subtle border `border-slate-200/80`, and add the touch-friendly transition class `active:scale-[0.98]` to match `SiswaCard`.

---

### Task 2: Harmonize Rombel Tab

**Files:**
- Modify: `frontend/src/views/AdminView.jsx`

- [ ] **Step 1: Add Search & Jenjang Filter to RombelTab**
  Introduce standard search state (`searchQuery`) and filter state (`filterJenjang`) into `RombelTab`.
  Render the *Unified Filter Row* at the top of the Rombel tab, including a search input ("Cari rombel atau guru...") and a jenjang selection dropdown.

- [ ] **Step 2: Filter Rombel List on Client-Side**
  Apply client-side filtering on `m.rombel` using `useMemo` based on `searchQuery` and `filterJenjang`.
  Include searches for both the Rombel name (`r.nama`) and assigned teachers' names (`r.gurus[].nama`).

- [ ] **Step 3: Harmonize Rombel Cards**
  Unify card layout to match the SIAGA Design System tokens: padding `p-3`, border `border-slate-200/80`, and consistent spacing ratios.

---

### Task 3: Harmonize Audit Tab

**Files:**
- Modify: `frontend/src/views/AdminView.jsx`

- [ ] **Step 1: Move Cabang Filter Inline in AuditTab**
  Move `<CabangFilter>` from the Panel header's `right` block into an inline filter container.

- [ ] **Step 2: Add Keyword Search to AuditTab**
  Add a state for keyword search (`searchQuery`) in `AuditTab`.
  Implement client-side search filtering on the audit logs list (`rows`) targeting actor name (`a.actor_name`), action type (`a.action`), and entity type (`a.entity_type`).
  Render this search bar inline next to the Cabang select.

---

### Task 4: Verification

**Files:**
- Verify: frontend build

- [ ] **Step 1: Build Frontend**
  Run:
  ```bash
  npm run build --prefix frontend
  ```
  Expected: Vite build exits with status code `0` (no linter or compilation errors).

- [ ] **Step 2: Verify Responsive Layouts**
  Verify on both mobile views and desktop views that:
  - All headers match and do not jump size when switching tabs.
  - Search and filter rows look identical across `Siswa`, `Staff`, `Wali`, `Rombel`, and `Audit` tabs.
  - Mobile cards use consistent padding (`p-3`) and micro-interactions.
