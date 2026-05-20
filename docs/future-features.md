# Future Features

## Pos Gerbang Dedicated Device / Kiosk

SIAGA currently supports two operational pickup-scanning modes:

- USB 2D QR scanner, which behaves like keyboard input and submits the QR code from the Pos Gerbang screen.
- Browser camera scanning for tablet or phone-based backup operation.

A future hardware deployment can add a dedicated gate device:

- Mini PC, Raspberry Pi, or fixed Windows device at the gate.
- USB 2D QR scanner as the primary input.
- Browser kiosk mode that opens SIAGA Pos Gerbang automatically.
- Saved `gerbang` session with clear logout/recovery procedure.
- Optional UPS, wired LAN, speaker feedback, and local health indicator.

Implementation note:

- Keep validation in the backend. The device should only submit QR codes to the existing `/api/penjemputan/scan` endpoint.
- Add a kiosk-specific route or launch parameter only for UI simplification, not for bypassing role or pickup rules.
- Add an online/offline indicator before depending on unattended kiosk operation.

## Izin Pulang Dini

Future workflow for students who must leave before the configured `jam_pulang` because of family urgency, sickness, or another exceptional school-approved reason.

Recommended product rule:

- Only `admin` and `kepsek` can create early-release permission.
- Permission is per student and per day, not a global bypass.
- Reason is required.
- Penjemput must still scan a valid active QR at the gate.
- Guru still confirms final handoff with the existing Pulang button or student NFC tap.
- The system must log who created the permission, reason, time, penjemput, QR scan time, and guru handoff time.

Recommended implementation:

- Add an `early_release` table instead of adding a new absensi status in phase 1.
- In `/api/penjemputan/scan`, if scan happens before `jam_pulang`, allow it only when an active early-release permission exists for that student today.
- In `/api/absensi/nfc-scan` action `pulang`, allow early handoff only after the student is already `Menunggu`.
- Keep normal pickup restrictions unchanged for every other student.
