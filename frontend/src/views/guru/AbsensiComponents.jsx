// Komponen tampilan absensi GuruView.
// Dipisahkan dari GuruView.jsx: keempatnya tidak menyentuh state milik view induk,
// hanya menerima props, sehingga aman berdiri sendiri.

export function CompleteBadge({ pct }) {
  if (pct === 0)
    return (
      <span className="text-[10px] xs:text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 whitespace-nowrap flex-shrink-0">
        Belum diisi
      </span>
    );
  if (pct < 100)
    return (
      <span className="text-[10px] xs:text-xs px-2 py-0.5 rounded-full bg-primary-container text-primary-active font-bold border border-primary/20 whitespace-nowrap flex-shrink-0">
        Sebagian {pct}%
      </span>
    );
  return (
    <span className="text-[10px] xs:text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap flex-shrink-0">
      ✓ Lengkap
    </span>
  );
}

export function StatusBadge({ status }) {
  const cls =
    status === 'Hadir'
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : status === 'Terlambat'
        ? 'bg-orange-100 text-orange-700 border-orange-200'
        : status === 'Menunggu'
          ? 'bg-primary-container text-primary-active border-primary/20'
          : status === 'Pulang'
            ? 'bg-slate-100 text-slate-600 border-slate-200'
            : ['Izin', 'Sakit', 'Absen'].includes(status)
              ? 'bg-blue-100 text-blue-700 border-blue-200'
              : 'bg-slate-50 text-slate-400 border-slate-200';
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-black ${cls}`}>{status || 'Belum'}</span>
  );
}

export function AbsensiActions({ row, onCheckin, onKet, onPulang, compact, disabled, tone = 'light' }) {
  // Hari libur: tidak ada aksi absensi yang boleh dijalankan dari kartu.
  if (disabled) {
    return tone === 'dark' ? (
      <div className="rounded-lg border border-dashed border-white/30 bg-white/10 py-2 text-center text-[11px] font-bold text-white/85">
        Hari libur, absensi tidak diaktifkan
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-2 text-center text-[11px] font-bold text-slate-400">
        Hari libur, absensi tidak diaktifkan
      </div>
    );
  }
  const canEnter = ['Belum', 'Absen'].includes(row.status);
  const canKet = ['Belum', 'Absen', 'Izin', 'Sakit'].includes(row.status);
  const gelap = tone === 'dark';

  if (compact) {
    if (!canEnter && !canKet && row.status !== 'Menunggu') {
      return gelap ? (
        <div className="rounded-lg border border-dashed border-white/25 bg-white/10 py-2 text-center text-[10px] font-bold text-white/80">
          Tidak ada aksi
        </div>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-slate-50 py-2 text-center text-[10px] font-bold text-slate-400">
          Tidak ada aksi
        </div>
      );
    }
    if (gelap) {
      return (
        <div className="flex w-full flex-col gap-2">
          {canEnter && (
            <button
              onClick={onCheckin}
              className="w-full rounded-lg bg-primary py-2 text-center text-[11px] font-bold text-white transition-all duration-200 active:scale-95"
            >
              Check-in
            </button>
          )}
          {canKet && (
            <div className="flex w-full gap-1.5 xs:gap-2">
              {['Izin', 'Sakit'].map((k) => (
                <button
                  key={k}
                  onClick={() => onKet(row.siswa_id, k)}
                  className="min-w-0 flex-1 truncate rounded-lg border border-white/25 bg-white/15 py-2 text-[10px] font-bold text-white text-center transition-all duration-200 active:scale-95"
                >
                  {k}
                </button>
              ))}
              <button
                onClick={() => onKet(row.siswa_id, 'Absen')}
                className="min-w-0 flex-1 truncate rounded-lg border border-red-500/40 bg-red-600/85 py-2 text-[10px] font-bold text-white text-center transition-all duration-200 active:scale-95"
              >
                Absen
              </button>
            </div>
          )}
          {row.status === 'Menunggu' && (
            <button
              onClick={onPulang}
              className="w-full rounded-lg border border-emerald-500/40 bg-emerald-600/85 py-2 text-center text-[11px] font-bold text-white transition-all duration-200 active:scale-95"
            >
              Pulang
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2 w-full pt-2 border-t border-slate-100">
        {canEnter && (
          <button
            onClick={onCheckin}
            className="w-full py-2 rounded-lg bg-primary text-white text-[11px] font-medium text-center transition-all duration-200 active:scale-95"
          >
            Check-in
          </button>
        )}
        {canKet && (
          <div className="flex gap-1.5 xs:gap-2 w-full">
            <button
              onClick={() => onKet(row.siswa_id, 'Izin')}
              className="flex-1 min-w-0 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-[10px] xs:text-[11px] font-medium text-center transition-all duration-200 active:scale-95 truncate"
            >
              Izin
            </button>
            <button
              onClick={() => onKet(row.siswa_id, 'Sakit')}
              className="flex-1 min-w-0 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-[10px] xs:text-[11px] font-medium text-center transition-all duration-200 active:scale-95 truncate"
            >
              Sakit
            </button>
            <button
              onClick={() => onKet(row.siswa_id, 'Absen')}
              className="flex-1 min-w-0 py-2 rounded-lg bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 text-[10px] xs:text-[11px] font-medium text-center transition-all duration-200 active:scale-95 truncate"
            >
              Absen
            </button>
          </div>
        )}
        {row.status === 'Menunggu' && (
          <button
            onClick={onPulang}
            className="w-full py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-medium text-center transition-all duration-200 active:scale-95"
          >
            Pulang
          </button>
        )}
      </div>
    );
  }

  if (gelap) {
    return (
      <div className="flex flex-wrap gap-2">
        {canEnter && (
          <button
            onClick={onCheckin}
            className="rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-white transition-all duration-200 active:scale-95"
          >
            Check-in
          </button>
        )}
        {canKet && (
          <>
            {['Izin', 'Sakit'].map((k) => (
              <button
                key={k}
                onClick={() => onKet(row.siswa_id, k)}
                className="rounded-lg border border-white/25 bg-white/15 px-3 py-2 text-[11px] font-bold text-white transition-all duration-200 active:scale-95"
              >
                {k}
              </button>
            ))}
            <button
              onClick={() => onKet(row.siswa_id, 'Absen')}
              className="rounded-lg border border-red-500/40 bg-red-600/85 px-3 py-2 text-[11px] font-bold text-white transition-all duration-200 active:scale-95"
            >
              Absen
            </button>
          </>
        )}
        {row.status === 'Menunggu' && (
          <button
            onClick={onPulang}
            className="rounded-lg border border-emerald-500/40 bg-emerald-600/85 px-3 py-2 text-[11px] font-bold text-white transition-all duration-200 active:scale-95"
          >
            Pulang
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canEnter && (
        <button onClick={onCheckin} className="link">
          Check-in
        </button>
      )}
      {canKet && (
        <>
          <button onClick={() => onKet(row.siswa_id, 'Izin')} className="link">
            Izin
          </button>
          <button onClick={() => onKet(row.siswa_id, 'Sakit')} className="link">
            Sakit
          </button>
          <button onClick={() => onKet(row.siswa_id, 'Absen')} className="link text-red-600">
            Absen
          </button>
        </>
      )}
      {row.status === 'Menunggu' && (
        <button onClick={onPulang} className="link text-emerald-700">
          Pulang
        </button>
      )}
    </div>
  );
}

const GRAD_TANPA_FOTO = {
  Hadir: 'from-emerald-200 via-emerald-400 to-teal-700',
  Terlambat: 'from-orange-200 via-orange-400 to-rose-600',
  Pulang: 'from-slate-300 via-slate-400 to-slate-600',
  Izin: 'from-sky-200 via-sky-400 to-blue-700',
  Sakit: 'from-sky-200 via-sky-400 to-blue-700',
  Menunggu: 'from-amber-200 via-primary to-orange-600'
};

function inisial(nama) {
  return (nama || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function AbsensiCard({ row, selected, onSelect, onCheckin, onKet, onPulang, disabled }) {
  return (
    <article
      className={`relative min-h-[380px] overflow-hidden rounded-3xl bg-slate-950 shadow-lg shadow-slate-950/10 transition-all duration-200 sm:min-h-[420px] ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      {/* Latar: foto memenuhi seluruh kartu; tanpa foto pakai gradient + inisial */}
      {row.foto ? (
        <img
          src={row.foto}
          alt={row.nama}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
        />
      ) : (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${
            GRAD_TANPA_FOTO[row.status] || 'from-slate-300 via-slate-500 to-slate-700'
          }`}
        >
          <span className="select-none text-6xl font-black text-white/85">{inisial(row.nama)}</span>
        </div>
      )}

      {/* Selubung: gradient menutup separuh bawah, tepi atas memudar ke foto */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end gap-2 bg-gradient-to-t from-slate-950/95 via-slate-950/80 to-slate-950/0 px-3 pb-3 pt-16 sm:gap-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)] sm:text-lg">
            {row.nama}
          </h3>
          <p className="truncate text-xs text-white/85">
            {row.rombel_nama} · {row.paket}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ['Masuk', row.jam_masuk, 'Jam check-in pagi'],
            ['Tunggu', row.jam_tunggu, 'Jam mulai menunggu penjemputan'],
            ['Pulang', row.jam_pulang, 'Jam pulang']
          ].map(([label, nilai, petunjuk]) => (
            <div
              key={label}
              title={petunjuk}
              className="rounded-xl border border-white/20 bg-white/15 py-1.5 text-center backdrop-blur-sm"
            >
              <div className="text-[9px] font-black uppercase text-white/75">{label}</div>
              <div className="text-xs font-black tabular-nums text-white">{nilai || '-'}</div>
            </div>
          ))}
        </div>
        {row.penjemput_nama && (
          <div className="truncate rounded-xl border border-primary/40 bg-primary/25 px-2.5 py-1.5 text-[11px] text-white/95">
            🚗 <span className="font-black text-white">{row.penjemput_nama}</span>
          </div>
        )}
        <div>
          <div className="w-full sm:hidden">
            <AbsensiActions
              row={row}
              onCheckin={onCheckin}
              onKet={onKet}
              onPulang={onPulang}
              compact={true}
              disabled={disabled}
              tone="dark"
            />
          </div>
          <div className="hidden sm:block">
            <AbsensiActions
              row={row}
              onCheckin={onCheckin}
              onKet={onKet}
              onPulang={onPulang}
              disabled={disabled}
              tone="dark"
            />
          </div>
        </div>
      </div>

      {/* Badge status + pilih siswa, melayang di foto */}
      <div className="absolute left-3 top-3 z-10">
        <StatusBadge status={row.status} />
      </div>
      {row.status === 'Menunggu' && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={`Pilih ${row.nama}`}
          className="absolute right-3 top-3 z-10 h-5 w-5 rounded-md border-2 border-white/80 bg-white/90 accent-primary backdrop-blur-sm"
        />
      )}
    </article>
  );
}
