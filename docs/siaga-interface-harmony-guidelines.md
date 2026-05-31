# SIAGA Interface Harmony Guidelines
Tanggal Penyusunan: 25 Mei 2026

Dokumen ini adalah panduan referensi (Documentation Guidance) untuk menjaga konsistensi antarmuka (UI) dan pengalaman pengguna (UX) lintas tab di dalam dashboard SIAGA, khususnya pada halaman `AdminView.jsx`. 

Gunakan panduan ini sebagai standar acuan bagi pengembang (human engineer) maupun agen pengkodean AI (AI coding agents) saat memodifikasi, menambah, atau merefaktor komponen antarmuka.

---

## 1. Filosofi & Karakter Visual (Quiet Craft)

SIAGA mengadopsi prinsip **"Quiet Craft"** yang berorientasi pada **Precision & Density** (Kerapatan & Presisi):
* **Borders-Only Depth:** Tidak menggunakan bayangan (*drop shadows*) yang tebal atau dramatis. Gunakan garis batas tipis (`border-slate-200/80` atau `border-slate-100` untuk pembatas dalam) untuk memisahkan struktur grid.
* **Neutral Slate & Amber Highlights:** Warna dasar didominasi oleh warna netral slate (`Slate-900` untuk teks utama, `Slate-50` untuk latar sekunder/form, `Slate-100` untuk garis tipis) dengan aksen operasional berwarna Amber/Oranye (`#f59e0b`).
* **Symmetry & 4px Grid:** Seluruh padding, margin, dan jarak antar elemen harus kelipatan **4px** (misalnya: `p-3` = 12px, `gap-2` = 8px, `space-y-4` = 16px).

---

## 2. Struktur Standar Bar Pencarian & Filter (Unified Filter Row)

Semua halaman yang menyajikan daftar data (tabel atau tumpukan kartu) wajib mengikuti tata letak *Unified Filter Row* berikut agar seragam di semua tab:

### 2.1 Tata Letak Desktop (`md` ke atas)
Pencarian berada di sisi kiri (mengembang penuh), dan dropdown filter berada di sisi kanan secara horizontal.

```jsx
<div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
  <div className="md:grid md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start md:gap-2">
    {/* Kolom Kiri: Search Input */}
    <div className="flex gap-2">
      <div className="relative flex-1">
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          placeholder="Cari data..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input pl-10 w-full font-bold"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* Tombol Toggle Laci Filter (Hanya tampil di Mobile) */}
      <button
        onClick={() => setFilterOpen(o => !o)}
        className={`md:hidden relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${
          filterOpen || hasActiveFilters
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-slate-200 bg-white text-slate-500'
        }`}
      >
        <Settings className="w-3.5 h-3.5" />
        Filter
        {activeFilterCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-white">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>

    {/* Kolom Kanan: Dropdown Filter */}
    <div className={`mt-2 md:mt-0 ${filterOpen ? 'block' : 'hidden md:block'}`}>
      <div className="grid grid-cols-2 md:flex md:flex-nowrap gap-2">
        {/* Sisipkan dropdown filter di sini (misal: Cabang, Jenjang, Status) */}
      </div>
    </div>
  </div>
</div>
```

---

## 3. Desain Kartu Mobile Standar (Unified Card System)

Di bawah lebar layar desktop (`md:hidden`), semua daftar harus dirender menggunakan tumpukan kartu vertikal (`space-y-3`). Setiap kartu wajib memenuhi spesifikasi berikut:

* **Symmetry:** Gunakan padding seragam `p-3` (12px) untuk menjaga keseimbangan kepadatan data.
* **Micro-interactions:** Tambahkan class transisi `transition active:scale-[0.98] cursor-pointer` pada kartu yang dapat diklik untuk detailnya.
* **Garis Batas:** Gunakan `border-slate-200/80` (untuk keadaan default) dan `border-primary ring-1 ring-primary` (untuk keadaan aktif/terpilih).

### Contoh Struktur JSX Kartu:
```jsx
function DataCard({ data, active, onOpen }) {
  return (
    <div 
      onClick={() => onOpen(data)}
      className={`bg-white border rounded-xl p-3 flex gap-3 items-start transition cursor-pointer active:scale-[0.98] ${
        active ? 'border-primary ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <StudentAvatar name={data.nama} url={data.foto} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-text-main text-sm truncate leading-tight">
            {data.nama}
          </div>
          <StatusBadge status={data.status} />
        </div>
        
        <div className="text-xs text-slate-500 mt-2 space-y-1">
          {/* Baris data metadata */}
          <div><span className="text-slate-400">Label:</span> <span className="font-bold text-slate-700">{data.value}</span></div>
        </div>
      </div>
    </div>
  );
}
```

---

## 4. Struktur Form & Drawer Modalnya

Agar dialog entri data terasa harmonis saat bergantian dibuka:
1. **Lebar Modal:** Gunakan ukuran lebar proporsional yang konsisten:
   - Form sederhana (1-3 input): `maxWidth="max-w-xl"` (misal: Rombel, Cabang).
   - Form kompleks: `maxWidth="max-w-3xl"` (misal: Siswa, Staff, Wali).
2. **Unggah Foto:** Jika form memiliki fitur unggah foto profil (seperti Siswa dan Staff), gunakan struktur **Dua Kolom** pada layar desktop (`md:flex-row gap-5`):
   - Kolom kiri: Container foto profil abu-abu (`w-full md:w-48 shrink-0 flex flex-col items-center bg-slate-50 border border-slate-200/60 rounded-2xl p-5`).
   - Kolom kanan: Input isian form (`flex-1 space-y-4`).
3. **Pemberitahuan/Catatan Tambahan:** Gunakan kartu netral berlatar abu-abu tipis (`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2`) untuk menampilkan teks panduan atau catatan informatif dalam modal.

---

## 5. Lembar Penilaian Mandiri (The Mandate Checks)

Sebelum melakukan commit atau menyerahkan pekerjaan UI, lakukan 3 uji cepat ini:
1. **The Swap Test:** Jika Anda menukar komponen pencarian & filter dari halaman A ke halaman B, apakah tampilannya tetap simetris dan tidak merusak layout?
2. **The Squint Test:** Sipitkan mata Anda saat melihat halaman. Apakah barisan pembatas section terlihat rapi dan tidak ada teks penting yang saling tumpang tindih?
3. **The Budget Test:** Apakah komponen input atau dropdown di mobile melebihi lebar layar HP terkecil (lebar 320px)? Semua dropdown filter wajib diletakkan dalam baris laci collapsible di bawah input pencarian utama untuk layar mobile.
