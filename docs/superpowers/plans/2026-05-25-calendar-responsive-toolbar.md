# Calendar Responsive Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Kalender tab desktop layout while keeping the mobile-first compact toolbar.

**Architecture:** Keep Kalender tab behavior in `frontend/src/views/AdminView.jsx`, but move responsive sizing decisions into explicit calendar CSS classes in `frontend/src/index.css`. Avoid mixing mobile grid utilities and desktop flex utilities directly in JSX where child widths can conflict.

**Tech Stack:** React, Tailwind utility classes, local CSS, Vite build.

---

### Task 1: Isolate Calendar Toolbar Responsiveness

**Files:**
- Modify: `frontend/src/views/AdminView.jsx`
- Modify: `frontend/src/index.css`

- [x] **Step 1: Identify regression source**

Current toolbar mixed `grid w-full` mobile layout with `sm:flex sm:w-auto` desktop layout while the branch select child still used full-width behavior. This made desktop sizing unstable.

- [x] **Step 2: Replace inline responsive utilities with explicit classes**

Use:

```jsx
<div className="calendar-toolbar">
  <Input className="calendar-year-input" />
  <CustomSelect className="input calendar-branch-select" />
  <IconButton className="calendar-add-icon" />
  <ActionButton className="calendar-add-button" />
</div>
```

- [x] **Step 3: Define desktop CSS first-class behavior**

Desktop behavior:

```css
.calendar-toolbar { display: flex; align-items: center; gap: 0.5rem; }
.calendar-year-input { width: 6rem; }
.calendar-branch-select { width: 13rem; }
.calendar-add-icon { display: none; }
```

- [x] **Step 4: Define mobile override**

Mobile behavior:

```css
@media (max-width: 640px) {
  .calendar-toolbar {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr) 2.25rem;
    width: 100%;
  }
  .calendar-add-button { display: none; }
  .calendar-add-icon { display: inline-flex; }
}
```

### Task 2: Align Calendar Stats With SIAGA Design System

**Files:**
- Modify: `frontend/src/views/AdminView.jsx`
- Modify: `frontend/src/index.css`

- [x] **Step 1: Replace colored chips with segmented border strip**

Use neutral white/slate, border-only, 8px radius, compact 4px-grid spacing.

- [x] **Step 2: Keep stats independent from header**

Stats remain below toolbar and never affect the desktop header layout.

### Task 3: Verification

**Files:**
- Verify: frontend build

- [x] **Step 1: Run build**

Run:

```powershell
npm run build --prefix frontend
```

Expected: Vite build exits `0`.

- [x] **Step 2: Walkthrough**

Report desktop and mobile behavior separately, including the retained month retract behavior.
