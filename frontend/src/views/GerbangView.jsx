import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api } from '../api';
import { ActionButton, IconButton, Modal } from '../components/Shared';
import { AlertCircle, Check, Clock, RefreshCw, ScanLine, UserPlus, Video, VideoOff } from 'lucide-react';

export default function GerbangView({ toast }) {
  const [qr, setQr] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [log, setLog] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [pulangConfirm, setPulangConfirm] = useState(null);
  const [manual, setManual] = useState({
    open: false,
    siswaId: '',
    alasan: '',
    penjemputId: '',
    newName: '',
    newRelasi: '',
    options: [],
    loading: false,
    saving: false
  });
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const scanLoopRef = useRef(null);
  async function load() {
    try {
      const data = await api.absensiToday({});
      setRows(data.rows || data);
    } catch {}
  }
  useEffect(() => {
    load();
    const eventSource = new EventSource('/api/absensi/stream');
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'absensi_changed') {
          load();
        }
      } catch {}
    };
    return () => {
      eventSource.close();
      stopCamera();
    };
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  function toMinutes(hhmm) {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    if ([h, m].some(Number.isNaN)) return null;
    return h * 60 + m;
  }
  function minutesSince(hhmm, at = now) {
    const start = toMinutes(hhmm);
    if (start === null) return null;
    const d = new Date(at);
    return Math.max(0, d.getHours() * 60 + d.getMinutes() - start);
  }
  const waiting = useMemo(() => rows.filter((r) => r.status === 'Menunggu'), [rows]);
  const waitAvg = useMemo(() => {
    const values = rows
      .filter((r) => r.status === 'Pulang' && r.jam_tunggu && r.jam_pulang)
      .map((r) => {
        const a = toMinutes(r.jam_tunggu),
          b = toMinutes(r.jam_pulang);
        return a === null || b === null ? null : Math.max(0, b - a);
      })
      .filter((v) => v !== null);
    if (!values.length) return null;
    return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  }, [rows]);
  const stats = useMemo(
    () => ({
      hadir: rows.filter((r) => ['Hadir', 'Terlambat'].includes(r.status)).length,
      menunggu: waiting.length,
      pulang: rows.filter((r) => r.status === 'Pulang').length
    }),
    [rows, waiting.length]
  );
  function pushLog(type, text) {
    setLog((v) =>
      [
        { type, text, time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) },
        ...v
      ].slice(0, 8)
    );
  }
  async function doScan(value) {
    const code = String(value || '').trim();
    if (!code) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.scanPenjemput(code);
      setResult(r);
      setQr('');
      pushLog('ok', `${r.siswa.nama} menunggu ${r.penjemput.nama}`);
      toast('ok', r.siswa.nama + ' menunggu jemput');
      load();
    } catch (e) {
      const detail =
        e.code === 'ALREADY_WAITING'
          ? `Sudah menunggu sejak ${e.jam_tunggu || '-'} oleh ${e.penjemput?.nama || 'penjemput'}`
          : e.code === 'ALREADY_LEFT'
            ? `Siswa sudah pulang ${e.jam_pulang || ''}`
            : e.message;
      setError({ title: e.code || 'SCAN_FAILED', detail });
      pushLog('err', detail);
      toast('err', detail);
    } finally {
      setLoading(false);
    }
  }
  async function scan(e) {
    e.preventDefault();
    doScan(qr);
  }
  function pulangkan(siswa) {
    setPulangConfirm(siswa);
  }
  async function pulangNow() {
    const target = pulangConfirm;
    if (!target) return;
    try {
      await api.pulangkan([target.siswa_id]);
      toast('ok', `${target.nama} dipulangkan`);
      pushLog('ok', 'Serah terima selesai');
      load();
    } catch (e) {
      toast('err', e.message);
      pushLog('err', e.message);
    } finally {
      setPulangConfirm(null);
    }
  }

  // Serah terima manual: jalur ketika QR tidak terbaca atau kartu hilang.
  function openManual(siswaId = '') {
    setManual({
      open: true,
      siswaId: String(siswaId || ''),
      alasan: '',
      penjemputId: '',
      newName: '',
      newRelasi: '',
      options: [],
      loading: false,
      saving: false
    });
    if (siswaId) loadPenjemput(siswaId);
  }
  async function loadPenjemput(siswaId) {
    setManual((m) => ({ ...m, loading: true }));
    try {
      const list = await api.siswaPenjemput(siswaId);
      setManual((m) => ({ ...m, options: list || [], loading: false, penjemputId: '' }));
    } catch (e) {
      setManual((m) => ({ ...m, options: [], loading: false }));
      toast('err', e.message);
    }
  }
  async function submitManual() {
    const m = manual;
    const siswa = rows.find((r) => Number(r.siswa_id) === Number(m.siswaId));
    if (!siswa) return toast('err', 'Pilih siswa dulu');
    if (!m.penjemputId && !m.newName.trim()) return toast('err', 'Pilih penjemput atau isi nama penjemput baru');
    if (m.alasan.trim().length < 5) return toast('err', 'Alasan minimal 5 karakter');
    setManual((x) => ({ ...x, saving: true }));
    try {
      let penjemputId = m.penjemputId;
      if (!penjemputId) {
        const created = await api.createPenjemput(siswa.siswa_id, {
          nama: m.newName.trim(),
          relasi: m.newRelasi.trim() || undefined
        });
        penjemputId = created.id;
      }
      const r = await api.scanPenjemputManual({
        siswa_id: siswa.siswa_id,
        penjemput_id: penjemputId,
        alasan: m.alasan.trim()
      });
      setResult(r);
      pushLog('ok', `${r.siswa.nama} menunggu (manual)`);
      toast('ok', `${r.siswa.nama} menunggu jemput (manual)`);
      setManual((x) => ({ ...x, open: false, saving: false }));
      load();
    } catch (e) {
      toast('err', e.message);
      pushLog('err', e.message);
      setManual((x) => ({ ...x, saving: false }));
    }
  }
  function cameraMessage(e) {
    if (!window.isSecureContext)
      return 'Kamera hanya bisa dibuka dari HTTPS atau localhost. Pastikan URL deploy memakai https://.';
    if (e?.name === 'NotAllowedError')
      return 'Izin kamera ditolak. Buka pengaturan browser lalu izinkan akses kamera untuk situs ini.';
    if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError')
      return 'Kamera tidak ditemukan di perangkat ini.';
    if (e?.name === 'NotReadableError' || e?.name === 'TrackStartError')
      return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera/meeting lalu coba lagi.';
    if (e?.name === 'OverconstrainedError' || e?.name === 'ConstraintNotSatisfiedError')
      return 'Kamera belakang tidak tersedia. Coba lagi, sistem akan memakai kamera yang tersedia.';
    return e?.message || 'Kamera gagal dibuka.';
  }
  function stopScanLoop() {
    if (scanLoopRef.current?.raf) cancelAnimationFrame(scanLoopRef.current.raf);
    scanLoopRef.current = null;
  }
  function detectQrWithCanvas(video) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' })?.data || null;
  }
  function startScanLoop(detector) {
    const loopState = { raf: null, lastCanvasScan: 0 };
    scanLoopRef.current = loopState;
    const loop = async (ts = 0) => {
      if (scanLoopRef.current !== loopState || !streamRef.current) return;
      const video = videoRef.current;
      try {
        if (video?.readyState >= 2) {
          let detected = null;
          if (detector) {
            const codes = await detector.detect(video);
            detected = codes[0]?.rawValue || null;
          } else if (ts - loopState.lastCanvasScan > 160) {
            loopState.lastCanvasScan = ts;
            detected = detectQrWithCanvas(video);
          }
          if (detected) {
            stopCamera();
            doScan(detected);
            return;
          }
        }
      } catch {}
      loopState.raf = requestAnimationFrame(loop);
    };
    loopState.raf = requestAnimationFrame(loop);
  }
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Browser ini belum mendukung akses kamera. Pakai Chrome/Safari terbaru atau input manual.';
      setCameraError(msg);
      toast('err', msg);
      return;
    }
    try {
      setCameraError(null);
      stopCamera();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (e) {
        if (e?.name !== 'OverconstrainedError' && e?.name !== 'ConstraintNotSatisfiedError') throw e;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setCamera(true);
      const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      requestAnimationFrame(async () => {
        const video = videoRef.current;
        if (!video || streamRef.current !== stream) return;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {}
        startScanLoop(detector);
      });
    } catch (e) {
      const msg = cameraMessage(e);
      setCameraError(msg);
      toast('err', msg);
    }
  }
  function stopCamera() {
    stopScanLoop();
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera(false);
  }
  return (
    <div className="flex flex-col bg-slate-950 p-2.5 text-white sm:p-3 lg:p-4 xl:min-h-[calc(100dvh-53px)]">
      {/* Satu permukaan dua kolom, dipisah seam hairline — bukan kartu bertumpuk */}
      <div className="grid w-full grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.10] xl:grid-cols-[1.15fr_minmax(340px,.85fr)] xl:flex-1">
        {/* ===================== KOLOM KIRI: POS GERBANG ===================== */}
        <section className="flex min-w-0 flex-col bg-slate-950">
          {/* Judul */}
          <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3">
            <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
              <span className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
                Mode serah terima
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-black leading-none tracking-[-0.03em] sm:text-xl">Pos Gerbang</h1>
                <p className="mt-1 hidden text-[12px] leading-snug text-slate-400 sm:block">
                  Validasi QR penjemput sebelum guru menyerahkan siswa.
                </p>
              </div>
            </div>
            <ActionButton
              icon={camera ? VideoOff : Video}
              onClick={camera ? stopCamera : startCamera}
              variant="ghost"
              className="shrink-0"
            >
              {camera ? 'Tutup' : 'Kamera'}
            </ActionButton>
          </div>

          {/* Rail metrik: satu baris dipisah hairline, tanpa kotak */}
          <div className="grid grid-cols-4 gap-px border-y border-white/[0.07] bg-white/[0.07]">
            {[
              { l: 'Siap dijemput', ls: 'Siap dijemput', v: stats.hadir, c: 'text-white' },
              { l: 'Menunggu', ls: 'Menunggu', v: stats.menunggu, c: 'text-amber-300' },
              { l: 'Pulang', ls: 'Pulang', v: stats.pulang, c: 'text-emerald-300' },
              { l: 'Rata-rata tunggu', ls: 'Rata-rata', v: waitAvg === null ? '–' : `${waitAvg}m`, c: 'text-white' }
            ].map((s) => (
              <div key={s.l} className="bg-slate-950 px-2 py-1.5 sm:px-4 sm:py-2.5">
                <div className="truncate text-[9px] font-black uppercase leading-[1.25] tracking-[0.04em] text-slate-500" title={s.l}>
                  <span className="sm:hidden">{s.ls}</span>
                  <span className="hidden sm:inline">{s.l}</span>
                </div>
                <div className={`mt-0.5 text-[17px] font-black leading-none tabular-nums sm:mt-1 sm:text-2xl ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Baris perintah scan: melebar penuh ke tepi panel */}
          <form
            onSubmit={scan}
            className="flex items-stretch gap-2 border-b border-white/[0.07] bg-white/[0.03] px-3 py-2 sm:px-4 sm:py-2.5"
          >
            <input
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-[15px] text-white outline-none placeholder:text-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/30"
              placeholder="Scan QR penjemput..."
              autoFocus
              disabled={loading}
            />
            <ActionButton icon={ScanLine} type="submit" disabled={loading} className="shrink-0 sm:self-auto">
              {loading ? 'Scanning…' : 'Scan'}
            </ActionButton>
          </form>

          {/* Aksi manual: baris teks, bukan kotak putus-putus */}
          <div className="border-b border-white/[0.07] px-3 py-2 sm:px-4">
            <button
              type="button"
              onClick={() => openManual()}
              className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left text-[12px] font-bold text-slate-400 transition-colors hover:text-slate-200"
            >
              <UserPlus className="size-3.5" />
              QR tidak terbaca / kartu hilang?{' '}
              <span className="text-amber-300 underline decoration-amber-300/40 underline-offset-2 hover:text-amber-200">
                Serah terima manual
              </span>
            </button>
          </div>

          {camera && (
            <div className="overflow-hidden border-b border-white/[0.07] bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-[60dvh] w-full object-cover sm:aspect-video"
              />
              <div className="border-t border-white/10 bg-slate-950/90 px-3 py-1.5 text-[11px] font-bold text-slate-400">
                Arahkan kamera ke QR penjemput. Scanner membaca otomatis.
              </div>
            </div>
          )}

          {cameraError && (
            <div className="flex gap-2.5 border-b border-amber-300/20 bg-amber-300/[0.07] px-3 py-2.5 text-[13px] text-amber-100 sm:px-4">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <div className="font-black">Kamera belum bisa dibuka</div>
                <div className="text-amber-50/80">{cameraError}</div>
              </div>
            </div>
          )}

          {result && (
            <div className="animate-slide-up border-b border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-3 sm:px-4">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">Penjemput valid</div>
              <div className="mt-1 text-lg font-black leading-tight">{result.siswa.nama}</div>
              <div className="text-[13px] text-emerald-100">
                Dijemput oleh {result.penjemput.nama} ({result.penjemput.relasi || '-'}) pukul {result.jam_tunggu}
                {result.manual ? ' · konfirmasi manual' : ''}
              </div>
            </div>
          )}

          {error && (
            <div className="animate-slide-up border-b border-red-400/20 bg-red-400/[0.08] px-3 py-3 sm:px-4">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-red-300">{error.title}</div>
              <div className="mt-1 text-[15px] font-black leading-snug">{error.detail}</div>
              {!['ALREADY_WAITING', 'ALREADY_LEFT'].includes(error.title) && (
                <button
                  type="button"
                  onClick={() => openManual()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-[11px] font-black text-amber-200 transition-colors hover:bg-amber-300/20"
                >
                  <UserPlus className="size-3" />
                  Lanjutkan dengan serah terima manual
                </button>
              )}
            </div>
          )}

          {/* Aktivitas: daftar hairline langsung di permukaan, tanpa kartu dalam kartu */}
          <div className="hidden px-3 py-3 sm:block sm:px-4 xl:flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Aktivitas scan</span>
              <span className="text-[10px] font-bold tabular-nums text-slate-600">{log.length}/8</span>
            </div>
            <ul className="mt-1.5 divide-y divide-white/[0.06]">
              {log.length ? (
                log.map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                    <span className={`truncate ${l.type === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{l.text}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{l.time}</span>
                  </li>
                ))
              ) : (
                <li className="py-2 text-[13px] text-slate-600">Belum ada aktivitas.</li>
              )}
            </ul>
          </div>
        </section>

        {/* ===================== KOLOM KANAN: MENUNGGU ===================== */}
        <section className="flex min-w-0 flex-col bg-white text-text-main">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <h2 className="text-[15px] font-black tracking-[-0.01em]">Menunggu Serah Terima</h2>
              <p className="hidden truncate text-[12px] text-slate-500 sm:block">
                Finalkan setelah siswa bertemu penjemput yang valid.
              </p>
            </div>
            <IconButton icon={RefreshCw} label="Refresh" onClick={load} variant="secondary" className="shrink-0" />
          </div>

          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-white/[0.06] custom-scrollbar xl:max-h-[70dvh]">
            {waiting.length ? (
              waiting.map((w) => {
                const elapsed = minutesSince(w.jam_tunggu);
                const level =
                  elapsed !== null && elapsed > 30 ? 'red' : elapsed !== null && elapsed > 15 ? 'amber' : 'normal';
                const stripe =
                  level === 'red'
                    ? 'border-l-red-500 bg-red-50/60 dark:bg-red-950/50'
                    : level === 'amber'
                      ? 'border-l-amber-400 bg-amber-50/60 dark:bg-amber-950/50'
                      : 'border-l-slate-300';
                return (
                  <div
                    key={w.siswa_id}
                    className={`flex items-start gap-2.5 border-l-[3px] px-3 py-2.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.04] sm:px-4 ${stripe}`}
                  >
                    <div className="min-w-0 flex-1">
                      {/* Nama dapat lebar penuh; badge pindah ke baris meta supaya tidak rebutan tempat */}
                      <div className="font-black leading-tight text-text-main line-clamp-2 sm:truncate sm:text-[14px]">
                        {w.nama}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug text-slate-500 sm:truncate">
                        <span className="min-w-0">
                          {w.rombel_nama} · {w.penjemput_nama || 'Penjemput'} · sejak {w.jam_tunggu || '-'}
                        </span>
                        {elapsed !== null && level !== 'normal' ? (
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[10px] font-black tabular-nums ${
                              level === 'red' ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950'
                            }`}
                          >
                            <Clock className="size-3" />
                            {elapsed}m
                          </span>
                        ) : null}
                      </div>
                      {w.catatan && (
                        <div className="mt-1 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300">
                          {w.catatan}
                        </div>
                      )}
                    </div>
                    <ActionButton icon={Check} onClick={() => pulangkan(w)} className="shrink-0">
                      Pulang
                    </ActionButton>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-10 text-center text-[13px] font-bold text-slate-400">
                Belum ada siswa menunggu.
              </div>
            )}
          </div>
        </section>
      </div>

      {pulangConfirm && (
        <Modal title="Konfirmasi Serah Terima" onClose={() => setPulangConfirm(null)}>
          <div className="space-y-3">
            <div>
              <span className="block text-xs font-black uppercase text-slate-400">Siswa</span>
              <span className="block font-bold text-text-main">{pulangConfirm.nama}</span>
              <div className="text-[13px] text-slate-500">{pulangConfirm.rombel_nama}</div>
            </div>
            <div>
              <span className="block text-xs font-black uppercase text-slate-400">Penjemput</span>
              <span className="font-bold text-text-main">{pulangConfirm.penjemput_nama || 'Penjemput'}</span>
            </div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[13px] font-bold text-amber-800">
              Pastikan anak sudah bertemu penjemput yang valid sebelum menekan Pulang.
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2.5">
              <button onClick={() => setPulangConfirm(null)} className="btn-secondary">
                Batal
              </button>
              <button onClick={pulangNow} className="btn">
                Pulang
              </button>
            </div>
          </div>
        </Modal>
      )}

      {manual.open && (
        <Modal title="Serah terima manual" onClose={() => setManual((m) => ({ ...m, open: false }))}>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[12px] font-bold text-amber-800">
              Jalur ini dipakai ketika QR penjemput tidak terbaca. Alasan wajib diisi dan tercatat di audit.
            </div>
            <div>
              <span className="label">Siswa</span>
              <select
                value={manual.siswaId}
                onChange={(e) => {
                  const id = e.target.value;
                  setManual((m) => ({ ...m, siswaId: id, penjemputId: '', newName: '', newRelasi: '' }));
                  if (id) loadPenjemput(id);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-bold text-text-main outline-none focus:border-primary"
              >
                <option value="">Pilih siswa...</option>
                {rows
                  .filter((r) => ['Hadir', 'Terlambat'].includes(r.status))
                  .map((r) => (
                    <option key={r.siswa_id} value={r.siswa_id}>
                      {r.nama} ({r.rombel_nama})
                    </option>
                  ))}
              </select>
            </div>
            {manual.siswaId && (
              <div>
                <span className="label">Penjemput</span>
                {manual.loading ? (
                  <div className="text-[12px] font-bold text-slate-400">Memuat penjemput...</div>
                ) : (
                  <div className="space-y-1.5">
                    {(manual.options || []).map((o) => (
                      <label
                        key={o.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-1.5 transition-colors hover:border-primary/40 hover:bg-primary-container/50"
                      >
                        <input
                          type="radio"
                          name="penjemput"
                          checked={Number(manual.penjemputId) === Number(o.id)}
                          onChange={() => setManual((m) => ({ ...m, penjemputId: o.id }))}
                        />
                        <span className="text-[13px] font-bold">
                          {o.nama} <span className="font-normal text-slate-400">({o.relasi || '-'})</span>
                        </span>
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-1.5 transition-colors hover:border-primary/40 hover:bg-primary-container/50">
                      <input
                        type="radio"
                        name="penjemput"
                        checked={!manual.penjemputId}
                        onChange={() => setManual((m) => ({ ...m, penjemputId: '' }))}
                      />
                      <span className="text-[13px] font-bold">Penjemput belum terdaftar (isi di bawah)</span>
                    </label>
                    {!manual.penjemputId && (
                      <div className="grid grid-cols-1 gap-2 pl-7 sm:grid-cols-2">
                        <input
                          value={manual.newName}
                          onChange={(e) => setManual((m) => ({ ...m, newName: e.target.value }))}
                          placeholder="Nama penjemput"
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
                        />
                        <input
                          value={manual.newRelasi}
                          onChange={(e) => setManual((m) => ({ ...m, newRelasi: e.target.value }))}
                          placeholder="Relasi (Ayah/Bunda/...)"
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div>
              <span className="label">Alasan (wajib)</span>
              <textarea
                value={manual.alasan}
                onChange={(e) => setManual((m) => ({ ...m, alasan: e.target.value }))}
                rows={2}
                placeholder="Contoh: QR kartu rusak, verifikasi KTP langsung"
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2.5">
              <button onClick={() => setManual((m) => ({ ...m, open: false }))} className="btn-secondary">
                Batal
              </button>
              <button onClick={submitManual} disabled={manual.saving} className="btn">
                {manual.saving ? 'Memproses...' : 'Mulai Menunggu'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
