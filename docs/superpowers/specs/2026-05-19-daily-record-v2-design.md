# Daily Record V2 Design

Date: 2026-05-19
Status: Draft for user review
Scope: Guru daily record, Modul Ajar, Focus Theme, parent-facing daily report

## Context

The current SIAGA daily record already supports the operational shell: draft/published status, parent visibility, attachments, comments, read receipt, notifications, and history. The current form is fast, but it is generic: mood, makan, tidur, aktivitas chips, catatan guru, and photos.

The old paper daily record template includes more academic and developmental structure: tema inti, pencapaian, IQRA, akhlak, aktif & mandiri, disiplin & tertib, peristiwa/perilaku siswa, komentar guru, and parent information from home. The paper template is old and should not be copied directly, but it reveals the real workflow the digital form must accommodate.

The desired direction is a hybrid model:

- Keep the fast daily care update that teachers can complete for every child.
- Add academic context from the weekly Modul Ajar and daily Focus Theme.
- Require a short child-specific observation for each child.
- Keep communication with parents through published daily records and comment threads.

## Product Principle

Daily record should answer two separate questions:

1. What did the class focus on today?
2. How did this child respond or develop today?

`Focus Theme` answers the first question. The child daily record answers the second question.

## Source Workflow

### Modul Ajar

Akademik creates a weekly Modul Ajar and gives it to teachers. It is the reference for the week's learning direction.

Expected content:

- Week or date range.
- Jenjang/level and optional rombel/paket scope.
- Learning goals or focus areas.
- Suggested activities.
- Suggested observation domains or indicators.
- Optional attachment or original document reference.

### Focus Theme

Guru creates a daily Focus Theme using the Modul Ajar as reference.

Expected content:

- Date.
- Rombel/class.
- Linked Modul Ajar.
- Tema inti/focus theme for the day.
- Main activity or activity summary.
- Suggested observation domains for the day.
- Optional teacher prompt to guide child observations.

The Focus Theme is created once per rombel per date and is reused by all child daily records for that rombel/date.

### Daily Record

Guru creates a daily record for each child. The record inherits the class Focus Theme as context, then captures child-specific care and observation data.

Required per child:

- Mood.
- Makan.
- Tidur.
- Domain tag.
- Short objective observation note, 1-2 sentences.

Optional per child:

- Photos or work samples.
- Additional note to wali.
- Structured anecdote details for important incidents or concerns.

## Form Design

### Teacher Daily Record Screen

The teacher screen should keep the existing list/editor pattern:

- Left side or top list: students with completion status.
- Detail panel: selected student's daily record.
- Filters: all, belum, sebagian, lengkap, terlambat where relevant.

Before or above the student list, show the day's Focus Theme status:

- If Focus Theme exists: show the theme and linked Modul Ajar.
- If Focus Theme is missing: show a warning and a CTA to create it.

Daily record should remain fillable while Focus Theme is missing, but publish should require Focus Theme. This avoids blocking care updates during the day while preserving the academic context before sending to parents.

### Focus Theme Setup

Teachers need a lightweight setup flow:

1. Pick date and rombel.
2. Select the weekly Modul Ajar.
3. Enter or select the daily Focus Theme.
4. Choose suggested domains for observation.
5. Save.

The saved Focus Theme should prefill the daily record context for every child in that rombel/date.

### Child Record Editor

The child editor should be organized in this order:

1. Child identity and completion badge.
2. Care update: mood, makan, tidur.
3. Focus Theme context, read-only by default with a link to edit the class Focus Theme.
4. Domain tag, required.
5. Short objective observation note, required.
6. Optional teacher note to parent.
7. Optional photos/work samples.
8. Parent comments after publish.

### Required Observation Model

Use the selected model: domain tag + one short note.

Domain tag is required because it makes observations searchable and useful for later reflection. The short note is required because parents need a human, child-specific description.

Recommended initial domains:

- Akhlak / agama.
- Mandiri / jati diri.
- Sosial-emosional.
- Bahasa / literasi.
- Kognitif / STEAM.
- Motorik.
- Seni / kreativitas.

The final labels can be adjusted to match Taruna Prima's academic language.

### Observation Quality Guardrails

The note should be objective and specific. It should describe visible behavior, not judge the child.

Good:

- "Hari ini A mau menunggu giliran saat bermain balok dan mengikuti arahan guru setelah diingatkan satu kali."
- "Saat kegiatan meronce, A mencoba memilih warna sendiri dan menyelesaikan pola sederhana sampai akhir."

Avoid:

- "A baik."
- "A nakal."
- "A tidak disiplin."
- "A pintar sekali."

The UI should help teachers with sentence starters or micro-templates, but the saved note should still be editable text.

## Parent-Facing Output

The parent view should show:

- Date and child name.
- Care update summary.
- Focus Theme / tema inti hari ini.
- Child-specific domain and observation note.
- Photos/work samples if attached.
- Additional teacher note if filled.
- Comment thread for parent feedback or home information.

Parent comments replace the old paper column for "kegiatan yang dilakukan di rumah / komentar & informasi orang tua." The UI can prompt parents with a placeholder such as: "Bagikan info dari rumah atau respons anak setelah kegiatan hari ini."

## Status and Completion

Daily record completion should require:

- Mood filled.
- Makan filled.
- Tidur filled.
- Domain tag selected.
- Short observation note filled.

Publishing should require:

- Daily record completion.
- Focus Theme exists for the child's rombel/date.

Draft saving should not require completion.

If a teacher edits a published record, existing behavior remains:

- Audit log records the edit.
- Parent sees the latest version.
- The record becomes unread again for parent if text or attachment changes.

## Data Model Draft

This is a design-level model, not final migration code.

### modul_ajar

- id
- cabang_id
- jenjang_id nullable
- rombel_id nullable
- paket nullable
- title
- week_start
- week_end
- goals text/json
- suggested_activities text/json
- suggested_domains text/json
- attachment_url nullable
- created_by
- created_at
- updated_at

### focus_theme

- id
- modul_ajar_id nullable
- cabang_id
- rombel_id
- tanggal
- title
- activity_summary
- suggested_domains text/json
- teacher_prompt nullable
- created_by
- created_at
- updated_at
- unique rombel_id + tanggal

### laporan_harian additions

- focus_theme_id nullable
- observation_domain nullable
- observation_note nullable
- parent_note nullable
- structured_observation_json nullable

Existing fields remain:

- mood
- makan
- tidur
- aktivitas
- catatan
- attachments
- comments
- status
- published_at
- last_published_change_at

`catatan` remains for backward compatibility as the legacy/general teacher note. New V2 UI should write child observation into `observation_note` and parent-facing optional message into `parent_note`. Existing old records can continue rendering `catatan` as the teacher note.

## Permissions

Akademik role is not fully modeled in the current app. Until that role exists, Modul Ajar can be managed by admin/admin_cabang/kepsek or a designated academic user role if added.

Proposed permissions:

- Akademik/admin/kepsek can create and edit Modul Ajar.
- Guru can view Modul Ajar in assigned scope.
- Guru can create and edit Focus Theme for assigned rombel.
- Guru can create and publish daily records for assigned students.
- Wali can view only published records for linked children and comment where allowed.

## Non-Goals

This design does not require:

- Copying the old paper book layout directly.
- Long structured anecdotal notes for every child every day.
- Automated assessment scoring.
- Video attachment.
- Parent editing of daily record content.
- Full curriculum management beyond what is needed to support Modul Ajar and Focus Theme.

## Open Decisions

1. Final domain label set should be reviewed against Taruna Prima's academic vocabulary.
2. Whether "akademik" becomes a new role or is handled by existing admin/kepsek roles.
3. Whether existing `aktivitas` chips remain as child activities, are replaced by Focus Theme activity summary, or both.
4. Whether old `catatan` is renamed in the UI to parent note, observation note, or kept as additional note.

## Research Notes

The design aligns with common early-childhood reporting and assessment practices:

- Parent communication should include child-specific milestones, activities, or caregiving updates.
- PAUD assessment should be observation-based and authentic, using notes, checklists, documentation, and portfolios rather than heavy testing.
- Behavior descriptions should be objective and concrete, avoiding judgmental labels.
- Daily documentation must stay sustainable for teacher workload.

References used during brainstorming:

- NAEYC accreditation resource guide: https://www.naeyc.org/sites/default/files/globally-shared/accreditation_application_resource_guide.pdf
- NAEYC observation and documentation guidance: https://www.naeyc.org/node/4868
- Head Start family communication guidance: https://headstart.gov/family-engagement/building-partnerships-guide-developing-relationships-families/observe-describe-childs-behavior-open-communication-family
- Panduan Pembelajaran dan Asesmen PAUD 2024: https://drive.paud.id/wp-content/uploads/kurikulum-merdeka/panduan-guru-2024/2024_Panduan_Pembelajaran_Asesmen_PAUD.pdf
