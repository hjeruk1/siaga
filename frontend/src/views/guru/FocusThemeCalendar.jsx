import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Modal } from '../../components/Shared';
import { todayWIB } from '../../utils/date';

function monthKey(dateStr) {
  return (dateStr || '').slice(0, 7);
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function firstWeekday(ym) {
  const [y, m] = ym.split('-').map(Number);
  return (new Date(y, m - 1, 1).getDay() + 6) % 7;
}

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export default function FocusThemeCalendar({ open, onClose, rombelId, tanggal, onSelectDay }) {
  const [bulan, setBulan] = useState(monthKey(tanggal) || monthKey(todayWIB()));
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setBulan(monthKey(tanggal) || monthKey(todayWIB()));
  }, [open, tanggal]);

  useEffect(() => {
    if (!open || !rombelId || !bulan) return;
    let alive = true;
    setLoading(true);
    api
      .focusTheme({ rombel_id: rombelId, bulan })
      .then((data) => {
        if (!alive) return;
        setThemes(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setThemes([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, rombelId, bulan]);

  const themeByDate = useMemo(() => {
    const map = {};
    themes.forEach((t) => {
      map[t.tanggal] = t;
    });
    return map;
  }, [themes]);

  const changeMonth = (delta) => {
    const [y, m] = bulan.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setBulan(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  if (!open) return null;

  const total = daysInMonth(bulan);
  const offset = firstWeekday(bulan);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push(`${bulan}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const today = todayWIB();
  const themedCount = themes.length;

  return (
    <Modal title="" onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-primary">Kalender</div>
            <div className="text-xl font-black text-text-main leading-tight">Focus Theme</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {themedCount} hari bertema · klik tanggal untuk atur
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeMonth(-1)}
              className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-primary transition-all active:scale-95 flex items-center justify-center font-black"
              aria-label="Bulan sebelumnya"
            >
              ‹
            </button>
            <div className="min-w-[110px] text-center">
              <div className="text-sm font-black text-text-main">{bulan}</div>
            </div>
            <button
              onClick={() => changeMonth(1)}
              className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-primary transition-all active:scale-95 flex items-center justify-center font-black"
              aria-label="Bulan berikutnya"
            >
              ›
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-xs text-slate-400 text-center py-2">Memuat tema...</div>
        )}

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="text-center text-[10px] font-black uppercase tracking-wider text-slate-400 py-1"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((ds, i) => {
            if (!ds) return <div key={`e-${i}`} className="aspect-square" />;
            const theme = themeByDate[ds];
            const isToday = ds === today;
            const dayNum = ds.slice(8);
            return (
              <button
                key={ds}
                onClick={() => {
                  onSelectDay(ds);
                  onClose();
                }}
                className={`group relative aspect-square rounded-xl border p-1.5 text-left transition-all duration-150 active:scale-[0.97] hover:-translate-y-0.5 ${
                  theme
                    ? 'bg-gradient-to-br from-primary-container to-white border-primary/40 shadow-sm hover:shadow-md'
                    : 'bg-white border-slate-200 hover:border-primary/40 hover:shadow-sm'
                } ${isToday ? 'ring-2 ring-primary/60 ring-offset-1' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-black leading-none ${
                      isToday ? 'text-primary' : 'text-text-main'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {theme && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </div>
                {theme ? (
                  <div className="mt-1 text-[9px] font-bold text-primary leading-tight line-clamp-2">
                    {theme.title}
                  </div>
                ) : (
                  <div className="mt-1 text-[9px] text-slate-300 group-hover:text-primary/60 transition-colors">
                    +
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-md bg-gradient-to-br from-primary-container to-white border border-primary/40" />
            Ada tema
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-md bg-white border border-slate-200" />
            Belum ada
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-md bg-white border-2 border-primary/60" />
            Hari ini
          </div>
        </div>
      </div>
    </Modal>
  );
}
