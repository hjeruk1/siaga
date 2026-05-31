# Siswa Tab Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rearrange Admin > Siswa so the page is clearer, mobile-first, and consistent with SIAGA's compact border-only dashboard language.

**Architecture:** Keep behavior in `frontend/src/views/AdminView.jsx` and avoid backend changes. Reuse existing `Panel`, `ActionButton`, `CustomSelect`, `SiswaCard`, and drawer detail flow; only change layout and table/card presentation.

**Tech Stack:** React, Tailwind utility classes, SIAGA local design tokens, Vite build.

---

### Task 1: Group Student Metrics

**Files:**
- Modify: `frontend/src/views/AdminView.jsx`

- [x] **Step 1: Replace flat metric cards with grouped summary**

Create three visual groups:

```jsx
<StudentMetricGroup title="Master" items={[...]} />
<StudentMetricGroup title="Jenjang" items={[...]} />
<StudentMetricGroup title="Program" items={[...]} />
```

- [x] **Step 2: Preserve mobile density**

Use `grid grid-cols-1 md:grid-cols-3 gap-3` so mobile stacks and desktop reads as three categories.

### Task 2: Consolidate Filters

**Files:**
- Modify: `frontend/src/views/AdminView.jsx`

- [x] **Step 1: Move cabang filter into the filter row**

Header actions keep only `Kenaikan Tahun Ajaran` and `Tambah Siswa`.

- [x] **Step 2: Keep filter row responsive**

Desktop uses one row with search flexing. Mobile uses search full-width and two-column filters without horizontal scroll.

### Task 3: Reclaim Table Space

**Files:**
- Modify: `frontend/src/views/AdminView.jsx`

- [x] **Step 1: Move student status into identity column**

Render avatar, name, NIS, and status together in the first student identity column.

- [x] **Step 2: Remove standalone status column**

The table no longer has a dedicated `Status` header/cell.

### Task 4: Verification

**Files:**
- Verify: frontend build

- [x] **Step 1: Run build**

Run:

```powershell
npm run build --prefix frontend
```

Expected: Vite build exits `0`.
