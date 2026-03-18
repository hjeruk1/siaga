import { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../api';
import { LiveClock } from '../components/Shared';

export default function GerbangView({ addToast }) {
  const [input, setInput]       = useState('');
  const [result, setResult]     = useState(null);
  const [log, setLog]           = useState([]);
  const [scanning, setScanning] = useState(false);
  const [kameraErr, setKameraErr] = useState('');

  const inputRef    = useRef(null);
  const scannerRef  = useRef(null);
  const html5QrRef  = useRef(null);

  // Fokus input saat tidak scanning
  useEffect(() => {
    if (!scanning) inputRef.current?.focus();
  }, [scanning]);

  // Cleanup scanner saat komponen unmount
  useEffect(() => {
    return () => {
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {});
      }
    };
  }, []);

  async function handleScan(code) {
    const qr = code.trim().toUpperCase();
    if (!qr) return;
    try {
      const d = await api.scanQR(qr);
      setResult({ ok: true, d });
      setLog(l => [{
        ok: true,
        siswa: d.siswa.nama,
        kelas: d.siswa.kelas,
        pj: d.penjemput.nama,
        relasi: d.penjemput.relasi,
        jam: d.jam_tunggu
      }, ...l.slice(0, 19)]);
      addToast('ok', d.siswa.nama + ' — notif guru terkirim ✓');
    } catch (e) {
      setResult({ ok: false, code: qr, msg: e.message });
      setLog(l => [{
        ok: false,
        kode: qr,
        jam: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      }, ...l.slice(0, 19)]);
      addToast('err', e.message);
    } finally {
      setTimeout(() => setResult(null), 6000);
      setInput('');
      if (!scanning) inputRef.current?.focus();
    }
  }

  async function mulaiScan() {
    setKameraErr('');
    setScanning(true);

    // Tunggu DOM render dulu
    await new Promise(r => setTimeout(r, 100));

    try {
      const qr = new Html5Qrcode('qr-reader');
      html5QrRef.current = qr;

      await qr.start(
        { facingMode: 'environment' }, // kamera belakang
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Berhasil scan
          qr.stop().then(() => {
            html5QrRef.current = null;
            setScanning(false);
            handleScan(decodedText);
          });
        },
        () => {} // error per-frame, abaikan
      );
    } catch (err) {
      setScanning(false);
      html5QrRef.current = null;
      if (err.toString().includes('Permission')) {
        setKameraErr('Izin kamera ditolak. Izinkan akses kamera di browser lalu coba lagi.');
      } else {
        setKameraErr('Kamera tidak bisa dibuka: ' + err.toString());
      }
    }
  }

  function stopScan() {
    if (html5QrRef.current) {
      html5QrRef.current.stop().catch(() => {});
      html5QrRef.current = null;
    }
    setScanning(false);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">

      {/* Header */}
      <div className="px-5 pt-6 pb-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
        <div>
          <div className="text-xl font-black">Pos Gerbang</div>
          <div className="text-slate-400 text-sm">KBTK Taruna Prima · <LiveClock /></div>
        </div>
        <div className="flex items-center gap-2 bg-emerald-900/50 border border-emerald-700 rounded-full px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-bold">Aktif</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-4 max-w-lg mx-auto w-full">

        {/* Result panel */}
        <div className={`rounded-3xl border-2 p-8 text-center transition-all duration-300 ${
          !result
            ? 'border-dashed border-slate-600 bg-slate-800/40'
            : result.ok
              ? 'border-emerald-500 bg-emerald-900/30'
              : 'border-red-500 bg-red-900/30'
        }`}>
          {!result && (
            <div>
              <div className="text-5xl mb-3">📱</div>
              <div className="text-slate-300 font-bold">Scan QR Penjemput</div>
              <div className="text-slate-500 text-sm mt-1">Tekan tombol kamera atau ketik kode QR</div>
            </div>
          )}
          {result?.ok && (
            <div className="animate-bounce-in">
              <div className="text-5xl mb-3">✅</div>
              <div className="text-2xl font-black text-emerald-300">{result.d.siswa.nama}</div>
              <div className="text-emerald-400 mt-1">{result.d.siswa.kelas}</div>
              <div className="mt-3 bg-emerald-900/50 rounded-2xl px-4 py-3">
                <div className="text-sm text-emerald-400">Dijemput oleh</div>
                <div className="text-xl font-black text-emerald-200">{result.d.penjemput.nama}</div>
                <div className="text-sm text-emerald-500">{result.d.penjemput.relasi}</div>
              </div>
              <div className="text-emerald-700 text-xs mt-3">✓ Notifikasi terkirim ke guru kelas</div>
            </div>
          )}
          {result && !result.ok && (
            <div className="animate-bounce-in">
              <div className="text-5xl mb-3">🚫</div>
              <div className="text-xl font-black text-red-300">TIDAK TERDAFTAR</div>
              <div className="font-mono text-xs text-red-500 mt-2 bg-red-950/50 px-3 py-2 rounded-xl">{result.code}</div>
              <div className="text-red-700 text-xs mt-2">🚨 Kejadian dicatat dalam log</div>
            </div>
          )}
        </div>

        {/* Kamera scanner */}
        {scanning ? (
          <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-600">
            <div id="qr-reader" ref={scannerRef} className="w-full" />
            <button
              onClick={stopScan}
              className="w-full py-3 bg-red-700 text-white font-black hover:bg-red-600 text-sm"
            >
              ✕ Tutup Kamera
            </button>
          </div>
        ) : (
          <button
            onClick={mulaiScan}
            className="w-full py-5 bg-amber-500 text-slate-900 font-black rounded-2xl hover:bg-amber-400 active:scale-95 transition-all text-lg shadow-lg shadow-amber-500/20"
          >
            📷 Buka Kamera untuk Scan QR
          </button>
        )}

        {/* Error kamera */}
        {kameraErr && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
            ⚠️ {kameraErr}
          </div>
        )}

        {/* Input manual */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleScan(input)}
            placeholder="Atau ketik / scan manual..."
            className="flex-1 bg-slate-800 border border-slate-600 rounded-2xl px-4 py-3 font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm"
            autoComplete="off"
            spellCheck="false"
          />
          <button
            onClick={() => handleScan(input)}
            className="px-5 py-3 bg-slate-700 text-white font-black rounded-2xl hover:bg-slate-600 text-sm border border-slate-600"
          >
            OK
          </button>
        </div>

        {/* Log aktivitas */}
        {log.length > 0 && (
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <p className="text-xs font-black text-slate-400 tracking-widest">LOG AKTIVITAS</p>
            </div>
            <div className="divide-y divide-slate-700/50 max-h-52 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${l.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0 text-sm">
                    {l.ok
                      ? <><span className="font-semibold text-white">{l.siswa}</span><span className="text-slate-500"> · {l.kelas} · {l.pj}</span></>
                      : <span className="text-red-400">⚠️ QR tidak dikenal: <span className="font-mono">{l.kode}</span></span>
                    }
                  </div>
                  <span className="text-xs font-mono text-slate-600">{l.jam}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
