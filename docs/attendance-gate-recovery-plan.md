# Attendance & Gate Recovery Plan

This codebase keeps the current multi-cabang model as the source of truth. Old SIAGA attendance features should be ported into the new model, not copied file-for-file.

## Core Loop

1. Guru opens Absensi for a date and assigned rombel scope.
2. Guru checks in students by tapping cards or student NFC.
3. Gate scans valid penjemput QR.
4. Student becomes `Menunggu` and assigned gurus receive notification.
5. Guru confirms handoff with Pulang button, batch Pulang, or student NFC.

## Phase 1 Scope

- Restore guru attendance UI with card/list style, status filters, tap check-in, keterangan, waiting handoff, batch pulang, and NFC student scan.
- Restore gate UI with fullscreen scan experience, USB/manual QR input, browser camera QR fallback when supported, activity log, and clear duplicate/invalid states.
- Harden backend attendance transitions:
  - `Belum/Absen -> Hadir/Terlambat/Izin/Sakit/Absen`
  - `Hadir/Terlambat -> Menunggu`
  - `Menunggu -> Pulang`
  - prevent overwriting active/final statuses through normal guru actions.
- Keep early release admin/kepsek shortcut that already exists in current backend.

## New Model Mapping

- Old `kelas` -> current `rombel`.
- Old `guru` -> current `pengguna` with role `guru`.
- Old `guru_kelas` -> current `guru_rombel`.
- Old school config -> current `operasional_config` per cabang/jenjang/paket.
- Old libur logic -> current `kalender_event` + `isSchoolDay`.

## Deferred

- Tutup Hari workflow.
- Admin operational duplicate NIS/NFC dashboard.
- Full import/export parity.
- Real-time WebSocket notifications.
