# Admin Modul Ajar Design

Date: 2026-05-20
Status: Approved direction, pending implementation
Scope: Admin dashboard UI for creating and managing Modul Ajar

## Decision

SIAGA should not add a new `akademik` role for now. Modul Ajar is managed from the existing Admin dashboard by existing internal roles.

Allowed roles:

- `admin`
- `admin_cabang`
- `kepsek`

Guru can view Modul Ajar indirectly while creating Focus Theme, but guru does not create weekly Modul Ajar.

## Product Rationale

The school workflow can still describe Modul Ajar as academic planning, but the system does not need a separate academic user yet. Keeping Modul Ajar inside Admin dashboard avoids extra account management, role scoping, navigation, and permission complexity.

If Taruna Prima later has a dedicated academic department workflow, the data model already supports adding a role without changing Focus Theme or Daily Record V2.

## Navigation

Add a new Admin dashboard tab:

- `Modul Ajar`

Recommended placement: near `Laporan` or before `Konfigurasi`, because it is planning content used by teachers, not master data like cabang or rombel.

## Screen Behavior

The screen has two areas:

1. A filter and list of existing Modul Ajar.
2. A compact create/edit form.

Filters:

- Cabang
- Jenjang
- Rombel optional
- Date/week

List columns:

- Week range
- Title
- Jenjang
- Rombel or all rombel
- Suggested domains
- Created by
- Actions: edit

## Form Fields

Required:

- Title
- Week start
- Week end
- Cabang

Optional:

- Jenjang
- Rombel
- Paket
- Learning goals
- Suggested activities
- Suggested observation domains
- Attachment URL or document reference

Array-like fields can be entered as comma-separated text in the first implementation and stored through the existing JSON array backend fields.

## Data Flow

Create/update:

`AdminView -> api.createModulAjar -> POST /api/modul-ajar`

List:

`AdminView -> api.modulAjar({ cabang_id, tanggal }) -> GET /api/modul-ajar`

Guru Focus Theme:

The existing Guru Daily Record editor continues to load Modul Ajar options for the selected date/cabang. No additional changes are needed to the guru flow except ensuring newly created modules appear in the dropdown.

## Permissions

The existing backend already allows `admin`, `admin_cabang`, and `kepsek` to create Modul Ajar, and allows guru to read Modul Ajar in scope.

The Admin UI should only show the `Modul Ajar` tab to:

- `admin`
- `admin_cabang`
- `kepsek`

## Validation

Frontend should prevent empty title/week fields before submit.

Backend remains the source of truth for:

- Required title/week fields.
- Cabang scope.
- Rombel/cabang compatibility.
- Jenjang existence.

## Testing

Implementation should verify:

- Admin dashboard build passes.
- Admin can create a Modul Ajar from the new tab.
- The created Modul Ajar appears in the list.
- The created Modul Ajar appears in Guru Focus Theme module dropdown for a matching date/cabang.
- Existing Daily Record V2 tests still pass.

## Non-Goals

This implementation does not add:

- A new `akademik` role.
- Rich document upload/parsing.
- Weekly curriculum approval workflow.
- Versioning of Modul Ajar.
- Full curriculum management beyond what Focus Theme needs.
