import{useEffect,useMemo,useRef,useState}from'react';
import jsQR from'jsqr';
import{api}from'../api';
import{ActionButton,IconButton}from'../components/Shared';
import{AlertCircle,Check,RefreshCw,ScanLine,Video,VideoOff}from'lucide-react';

export default function GerbangView({toast}){
  const[qr,setQr]=useState('');const[result,setResult]=useState(null);const[error,setError]=useState(null);
  const[rows,setRows]=useState([]);const[loading,setLoading]=useState(false);const[camera,setCamera]=useState(false);
  const[cameraError,setCameraError]=useState(null);
  const[log,setLog]=useState([]);const videoRef=useRef(null);const streamRef=useRef(null);const canvasRef=useRef(null);const scanLoopRef=useRef(null);
  async function load(){try{const data=await api.absensiToday({});setRows(data.rows||data);}catch{}}
  useEffect(()=>{
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
    return ()=>{
      eventSource.close();
      stopCamera();
    };
  },[]);
  const waiting=useMemo(()=>rows.filter(r=>r.status==='Menunggu'),[rows]);
  const stats=useMemo(()=>({
    hadir:rows.filter(r=>['Hadir','Terlambat'].includes(r.status)).length,
    menunggu:waiting.length,
    pulang:rows.filter(r=>r.status==='Pulang').length
  }),[rows,waiting.length]);
  function pushLog(type,text){setLog(v=>[{type,text,time:new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})},...v].slice(0,8));}
  async function doScan(value){
    const code=String(value||'').trim();
    if(!code)return;
    setLoading(true);setError(null);setResult(null);
    try{
      const r=await api.scanPenjemput(code);
      setResult(r);setQr('');pushLog('ok',`${r.siswa.nama} menunggu ${r.penjemput.nama}`);toast('ok',r.siswa.nama+' menunggu jemput');load();
    }catch(e){
      const detail=e.code==='ALREADY_WAITING'?`Sudah menunggu sejak ${e.jam_tunggu||'-'} oleh ${e.penjemput?.nama||'penjemput'}`:e.code==='ALREADY_LEFT'?`Siswa sudah pulang ${e.jam_pulang||''}`:e.message;
      setError({title:e.code||'SCAN_FAILED',detail});pushLog('err',detail);toast('err',detail);
    }finally{setLoading(false);}
  }
  async function scan(e){e.preventDefault();doScan(qr);}
  async function pulangkan(siswaId){try{await api.pulangkan([siswaId]);toast('ok','Siswa dipulangkan');pushLog('ok','Serah terima selesai');load();}catch(e){toast('err',e.message);pushLog('err',e.message);}}
  function cameraMessage(e){
    if(!window.isSecureContext)return'Kamera hanya bisa dibuka dari HTTPS atau localhost. Pastikan URL deploy memakai https://.';
    if(e?.name==='NotAllowedError')return'Izin kamera ditolak. Buka pengaturan browser lalu izinkan akses kamera untuk situs ini.';
    if(e?.name==='NotFoundError'||e?.name==='DevicesNotFoundError')return'Kamera tidak ditemukan di perangkat ini.';
    if(e?.name==='NotReadableError'||e?.name==='TrackStartError')return'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera/meeting lalu coba lagi.';
    if(e?.name==='OverconstrainedError'||e?.name==='ConstraintNotSatisfiedError')return'Kamera belakang tidak tersedia. Coba lagi, sistem akan memakai kamera yang tersedia.';
    return e?.message||'Kamera gagal dibuka.';
  }
  function stopScanLoop(){
    if(scanLoopRef.current?.raf)cancelAnimationFrame(scanLoopRef.current.raf);
    scanLoopRef.current=null;
  }
  function detectQrWithCanvas(video){
    const width=video.videoWidth;const height=video.videoHeight;
    if(!width||!height)return null;
    const canvas=canvasRef.current||(canvasRef.current=document.createElement('canvas'));
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,0,0,width,height);
    const imageData=ctx.getImageData(0,0,width,height);
    return jsQR(imageData.data,width,height,{inversionAttempts:'dontInvert'})?.data||null;
  }
  function startScanLoop(detector){
    const loopState={raf:null,lastCanvasScan:0};
    scanLoopRef.current=loopState;
    const loop=async(ts=0)=>{
      if(scanLoopRef.current!==loopState||!streamRef.current)return;
      const video=videoRef.current;
      try{
        if(video?.readyState>=2){
          let detected=null;
          if(detector){
            const codes=await detector.detect(video);
            detected=codes[0]?.rawValue||null;
          }else if(ts-loopState.lastCanvasScan>160){
            loopState.lastCanvasScan=ts;
            detected=detectQrWithCanvas(video);
          }
          if(detected){
            stopCamera();
            doScan(detected);
            return;
          }
        }
      }catch{}
      loopState.raf=requestAnimationFrame(loop);
    };
    loopState.raf=requestAnimationFrame(loop);
  }
  async function startCamera(){
    if(!navigator.mediaDevices?.getUserMedia){const msg='Browser ini belum mendukung akses kamera. Pakai Chrome/Safari terbaru atau input manual.';setCameraError(msg);toast('err',msg);return;}
    try{
      setCameraError(null);stopCamera();
      let stream;
      try{
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      }catch(e){
        if(e?.name!=='OverconstrainedError'&&e?.name!=='ConstraintNotSatisfiedError')throw e;
        stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      }
      streamRef.current=stream;setCamera(true);
      const detector='BarcodeDetector'in window?new window.BarcodeDetector({formats:['qr_code']}):null;
      requestAnimationFrame(async()=>{
        const video=videoRef.current;
        if(!video||streamRef.current!==stream)return;
        video.srcObject=stream;
        try{await video.play();}catch{}
        startScanLoop(detector);
      });
    }catch(e){const msg=cameraMessage(e);setCameraError(msg);toast('err',msg);}
  }
  function stopCamera(){stopScanLoop();streamRef.current?.getTracks?.().forEach(t=>t.stop());streamRef.current=null;if(videoRef.current)videoRef.current.srcObject=null;setCamera(false);}
  return <div className="min-h-[calc(100dvh-73px)] bg-slate-950 text-white p-3 sm:p-4 lg:p-6 2xl:p-8">
    <div className="w-full grid xl:grid-cols-[1.1fr_minmax(360px,.9fr)] 2xl:grid-cols-[1.2fr_minmax(420px,.8fr)] gap-4">
      <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:p-6 space-y-4 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">Mode serah terima</div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-[-0.03em]">Pos Gerbang</h1>
            <p className="mt-1 text-sm text-slate-300">Validasi QR penjemput sebelum guru menyerahkan siswa.</p>
          </div>
          <ActionButton icon={camera?VideoOff:Video} onClick={camera?stopCamera:startCamera} variant="ghost">{camera?'Tutup Kamera':'Kamera QR'}</ActionButton>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">{[{l:'Siap dijemput',v:stats.hadir},{l:'Menunggu',v:stats.menunggu},{l:'Pulang',v:stats.pulang}].map(s=><div key={s.l} className="rounded-xl border border-white/10 bg-slate-900/80 p-2 sm:p-3"><div className="text-[10px] sm:text-xs font-black text-slate-400 truncate" title={s.l}>{s.l}</div><div className="mt-1 text-2xl sm:text-3xl font-black tabular-nums">{s.v}</div></div>)}</div>
        <form onSubmit={scan} className="flex flex-col sm:flex-row gap-2">
          <input value={qr} onChange={e=>setQr(e.target.value)} autoComplete="off" spellCheck={false} className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-lg text-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 placeholder:text-slate-600" placeholder="Scan QR penjemput..." autoFocus disabled={loading}/>
          <ActionButton icon={ScanLine} type="submit" disabled={loading}>{loading?'Scanning...':'Scan'}</ActionButton>
        </form>
        {camera&&<div className="overflow-hidden rounded-2xl border border-primary bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[3/4] max-h-[70dvh] object-cover sm:aspect-video"/>
          <div className="border-t border-white/10 bg-slate-950/90 px-3 py-2 text-xs font-bold text-slate-300">Arahkan kamera ke QR penjemput. Scanner akan membaca otomatis.</div>
        </div>}
        {cameraError&&<div className="flex gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100"><AlertCircle className="mt-0.5 size-5 shrink-0"/><div><div className="font-black">Kamera belum bisa dibuka</div><div className="mt-1 text-amber-50/80">{cameraError}</div></div></div>}
        {result&&<div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-5 animate-slide-up"><div className="text-sm font-black text-emerald-200">PENJEMPUT VALID</div><div className="text-3xl font-black mt-1">{result.siswa.nama}</div><div className="text-emerald-100 mt-1">Dijemput oleh {result.penjemput.nama} ({result.penjemput.relasi||'-'}) pukul {result.jam_tunggu}</div></div>}
        {error&&<div className="rounded-2xl border border-red-400/40 bg-red-400/10 p-5 animate-slide-up"><div className="text-sm font-black text-red-200">{error.title}</div><div className="text-xl font-black mt-1">{error.detail}</div></div>}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <div className="font-black mb-3">Aktivitas Scan</div>
          <div className="space-y-2">{log.length?log.map((l,i)=><div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm"><span className={l.type==='ok'?'text-emerald-300':'text-red-300'}>{l.text}</span><span className="font-bold text-slate-500">{l.time}</span></div>):<div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center text-sm font-bold text-slate-500">Belum ada aktivitas.</div>}</div>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200/60 bg-white text-text-main p-4 sm:p-6 shadow-xl shadow-slate-950/10">
        <div className="flex items-center justify-between gap-3 mb-4"><div><h2 className="text-xl font-black">Menunggu Serah Terima</h2><p className="text-sm text-slate-500">Finalkan serah terima setelah guru atau petugas memastikan siswa bertemu penjemput yang valid.</p></div><IconButton icon={RefreshCw} label="Refresh" onClick={load} variant="secondary"/></div>
        <div className="space-y-3 max-h-[70dvh] overflow-y-auto pr-1 custom-scrollbar">{waiting.length?waiting.map(w=><div key={w.siswa_id} className="rounded-2xl border border-primary/20 bg-primary-container p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><div className="font-black text-lg">{w.nama}</div><div className="text-sm text-slate-500">{w.rombel_nama} - {w.penjemput_nama||'Penjemput'} - {w.jam_tunggu||'-'}</div></div>
          <ActionButton icon={Check} onClick={()=>pulangkan(w.siswa_id)}>Pulang</ActionButton>
        </div>):<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">Belum ada siswa menunggu.</div>}</div>
      </section>
    </div>
  </div>;
}
