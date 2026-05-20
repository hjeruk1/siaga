# Cabang Card Admin Design

Date: 2026-05-20
Status: Approved
Scope: Admin dashboard Cabang tab

## Decision

The Cabang tab should stop showing the create form inline. Cabang create/edit should use modal dialogs, following the existing Wali edit popup pattern.

Each cabang card should become a compact branch status card, not only an identity card.

## Card Content

Show:

- Cabang name and code.
- Active/nonactive status.
- Address.
- Contact.
- Kepsek name.
- Active student count.
- Active student breakdown:
  - KB
  - TK
  - Baby & Child Care
- Active staff count.
- Active staff breakdown:
  - Admin
  - Kepsek
  - Guru
  - Gerbang

`admin_cabang` counts as Admin. `gerbang` counts as staff.

If no active kepsek exists, show `Belum diatur`. If there is more than one active kepsek, show the first name plus `+N lainnya`.

## Behavior

- Header button `Tambah Cabang` opens a create modal.
- Card action `Edit` opens an edit modal.
- Existing activate/deactivate action remains on each card for `admin`.
- Backend supplies branch stats through `GET /api/master/cabang`.

## Non-Goals

Do not add billing, daily record, staff list details, or wali counts to the card yet. The card should stay scan-friendly.
