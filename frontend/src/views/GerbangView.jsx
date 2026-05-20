import{useEffect,useMemo,useRef,useState}from'react';
import{api}from'../api';

export default function GerbangView({toast}){
  const[qr,setQr]=useState('');const[result,setResult]=useState(null);const[error,setError]=useState(null);
  const[rows,setRows]=useState([]);const[loading,setLoading]=useState(false);const[camera,setCamera]=useState(false);
  const[log,setLog]=useState([]);const videoRef=useRef(null);const streamRef=useRef(null);
  async function load(){try{const data=await api.absensiToday({});setRows(data.rows||data);}catch{}}
  useEffect(()=>{load();const i=setInterval(load,10000);return()=>{clearInterval(i);stopCamera();};},[]);
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
  async function startCamera(){
    if(!('BarcodeDetector'in window)){toast('err','BarcodeDetector belum didukung browser ini. Pakai scanner USB atau input manual.');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      streamRef.current=stream;setCamera(true);
      setTimeout(()=>{if(videoRef.current)videoRef.current.srcObject=stream;},0);
      const detector=new window.BarcodeDetector({formats:['qr_code']});
      let active=true;
      const loop=async()=>{
        if(!active||!streamRef.current)return;
        try{
          if(videoRef.current?.readyState>=2){
            const codes=await detector.detect(videoRef.current);
            if(codes[0]?.rawValue){active=false;stopCamera();doScan(codes[0].rawValue);return;}
          }
        }catch{}
        requestAnimationFrame(loop);
      };
      loop();
    }catch(e){toast('err',e.message||'Kamera gagal dibuka');}
  }
  function stopCamera(){streamRef.current?.getTracks?.().forEach(t=>t.stop());streamRef.current=null;setCamera(false);}
  return <div className="min-h-[calc(100vh-92px)] bg-slate-950 text-white p-3 sm:p-4 lg:p-6 2xl:p-8">
    <div className="w-full grid xl:grid-cols-[1.1fr_minmax(360px,.9fr)] 2xl:grid-cols-[1.2fr_minmax(420px,.8fr)] gap-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><h1 className="text-2xl font-black">Pos Gerbang</h1><p className="text-sm text-slate-300">Validasi QR penjemput sebelum guru menyerahkan siswa.</p></div>
          <button onClick={camera?stopCamera:startCamera} className="px-4 py-2.5 rounded-xl bg-white text-slate-950 text-sm font-black">{camera?'Tutup Kamera':'Kamera QR'}</button>
        </div>
        <div className="grid grid-cols-3 gap-2">{[{l:'Siap dijemput',v:stats.hadir},{l:'Menunggu',v:stats.menunggu},{l:'Pulang',v:stats.pulang}].map(s=><div key={s.l} className="rounded-xl border border-white/10 bg-slate-900 p-3"><div className="text-xs font-black text-slate-400">{s.l}</div><div className="text-3xl font-black">{s.v}</div></div>)}</div>
        <form onSubmit={scan} className="flex flex-col sm:flex-row gap-2">
          <input value={qr} onChange={e=>setQr(e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-lg text-white outline-none focus:ring-2 focus:ring-amber-400" placeholder="Scan QR penjemput..." autoFocus disabled={loading}/>
          <button className="px-5 py-3 rounded-xl bg-amber-500 text-slate-950 font-black disabled:opacity-50" disabled={loading}>{loading?'Scanning...':'Scan'}</button>
        </form>
        {camera&&<div className="rounded-2xl overflow-hidden border border-amber-400 bg-black"><video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover"/></div>}
        {result&&<div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-5 animate-slide-up"><div className="text-sm font-black text-emerald-200">PENJEMPUT VALID</div><div className="text-3xl font-black mt-1">{result.siswa.nama}</div><div className="text-emerald-100 mt-1">Dijemput oleh {result.penjemput.nama} ({result.penjemput.relasi||'-'}) pukul {result.jam_tunggu}</div></div>}
        {error&&<div className="rounded-2xl border border-red-400/40 bg-red-400/10 p-5 animate-slide-up"><div className="text-sm font-black text-red-200">{error.title}</div><div className="text-xl font-black mt-1">{error.detail}</div></div>}
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
          <div className="font-black mb-3">Aktivitas Scan</div>
          <div className="space-y-2">{log.length?log.map((l,i)=><div key={i} className="flex items-center justify-between gap-3 text-sm"><span className={l.type==='ok'?'text-emerald-300':'text-red-300'}>{l.text}</span><span className="text-slate-500">{l.time}</span></div>):<div className="text-sm text-slate-500">Belum ada aktivitas.</div>}</div>
        </div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-white text-slate-900 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4"><div><h2 className="text-xl font-black">Menunggu Serah Terima</h2><p className="text-sm text-slate-500">Finalkan serah terima setelah guru atau petugas memastikan siswa bertemu penjemput yang valid.</p></div><button onClick={load} className="btn-secondary">Refresh</button></div>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">{waiting.length?waiting.map(w=><div key={w.siswa_id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><div className="font-black text-lg">{w.nama}</div><div className="text-sm text-slate-500">{w.rombel_nama} - {w.penjemput_nama||'Penjemput'} - {w.jam_tunggu||'-'}</div></div>
          <button onClick={()=>pulangkan(w.siswa_id)} className="btn">Pulang</button>
        </div>):<div className="text-center py-12 text-slate-400">Belum ada siswa menunggu.</div>}</div>
      </section>
    </div>
  </div>;
}
