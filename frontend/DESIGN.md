---
name: SIAGA Design System
description: The baseline visual identity for the SIAGA application.
colors:
  primary: '#f59e0b'
  primary-hover: '#d97706'
  primary-active: '#b45309'
  primary-container: '#fffbeb'
  text-main: '#0f172a'
  surface-disabled: '#f8fafc'
  border-subtle: '#64748b'
  scrollbar-thumb: '#d1d5db'
typography:
  sans:
    fontFamily: 'DM Sans'
rounded:
  sm: '4px'
  md: '8px'
  lg: '12px'
  xl: '16px'
  2xl: '20px'
---

## Overview

SIAGA is an operational dashboard relying on clear, functional aesthetics.
It uses **DM Sans** for its primary typeface to ensure clarity and a modern feel.

## Colors

The UI is mostly clean white/slate with an **amber** accent (`#f59e0b`) to denote focus, interaction, and alerts.

- **Primary:** Amber `#f59e0b`.
- **Text Main:** Dark slate `#0f172a`.
- **Border Subtle:** Slate `#64748b`.

## Typography

All text is rendered in **DM Sans**.

## Single source of truth

Nilai warna, radius, dan tipografi **hanya** didefinisikan di blok `@theme`
pada `src/index.css` (Tailwind v4). Berkas ini adalah niat desainnya; keduanya
dijaga tetap sama oleh `src/designTokens.test.js`.

Dulu ada perantara `tailwind.theme.json` yang dihasilkan `export-design.js`
saat `predev`/`prebuild`. Tidak ada satu pun kode yang membacanya — Tailwind v4
tidak memakai `tailwind.config.js` — sehingga nilainya bisa basi tanpa ketahuan.
Perantara itu sudah dihapus.

Catatan yang mahal dipelajari: **jangan** mendefinisikan `--spacing-sm`.
Kunci `sm` di namespace spacing membuat `max-w-sm` ter-resolve ke 4px, bukan
24rem, dan semua `EmptyState` runtuh menjadi satu kata per baris.
