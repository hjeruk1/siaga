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

export function AbsensiActions({ row, onCheckin, onKet, onPulang, compact }) {
  const canEnter = ['Belum', 'Absen'].includes(row.status);
  const canKet = ['Belum', 'Absen', 'Izin', 'Sakit'].includes(row.status);

  if (compact) {
    if (!canEnter && !canKet && row.status !== 'Menunggu') {
      return (
        <div className="text-[10px] font-bold text-slate-400 text-center py-2 bg-slate-50 rounded-lg border border-slate-100">
          Tidak ada aksi
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

export function AbsensiCard({ row, selected, onSelect, onCheckin, onKet, onPulang }) {
  return (
    <article
      className={`rounded-2xl border overflow-hidden transition-all duration-200 ${selected ? 'border-primary bg-primary-container' : 'border-slate-200 bg-white hover:border-primary/40'}`}
    >
      <div className="relative">
        {row.foto ? (
          <img
            src={row.foto}
            className="w-full aspect-[4/3] object-cover"
            alt={row.nama}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full aspect-[4/3] bg-slate-200 flex items-center justify-center text-slate-400 text-5xl">
            👤
          </div>
        )}
        <div className="absolute top-2 left-2">
          <StatusBadge status={row.status} />
        </div>
        {row.status === 'Menunggu' && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            className="absolute top-2 right-2 w-5 h-5 accent-primary"
          />
        )}
      </div>
      <div className="p-3 space-y-2">
        <h3 className="font-black text-text-main text-sm leading-tight truncate">{row.nama}</h3>
        <p className="text-xs text-slate-500 truncate">
          {row.rombel_nama} · {row.paket}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 rounded-lg py-2">
            <div className="text-[8px] xs:text-[10px] font-black text-slate-400">Masuk</div>
            <div className="font-black text-slate-700 text-[10px] xs:text-xs">{row.jam_masuk || '-'}</div>
          </div>
          <div className="bg-slate-50 rounded-lg py-2">
            <div className="text-[8px] xs:text-[10px] font-black text-slate-400">Tunggu</div>
            <div className="font-black text-slate-700 text-[10px] xs:text-xs">{row.jam_tunggu || '-'}</div>
          </div>
          <div className="bg-slate-50 rounded-lg py-2">
            <div className="text-[8px] xs:text-[10px] font-black text-slate-400">Pulang</div>
            <div className="font-black text-slate-700 text-[10px] xs:text-xs">{row.jam_pulang || '-'}</div>
          </div>
        </div>
        {row.penjemput_nama && (
          <div className="text-[10px] sm:text-[11px] text-slate-500 bg-primary-container border border-primary/20 rounded-lg px-3 py-2 truncate">
            🚗 <span className="font-black text-slate-700">{row.penjemput_nama}</span>
          </div>
        )}
        <div className="block sm:hidden w-full">
          <AbsensiActions row={row} onCheckin={onCheckin} onKet={onKet} onPulang={onPulang} compact={true} />
        </div>
        <div className="hidden sm:block">
          <AbsensiActions row={row} onCheckin={onCheckin} onKet={onKet} onPulang={onPulang} />
        </div>
      </div>
    </article>
  );
}
