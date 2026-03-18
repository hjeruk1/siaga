import{useState,useRef,useEffect}from'react';import{api}from'../api';import{LiveClock}from'../components/Shared';
export default function GerbangView({addToast}){
  const[input,setInput]=useState('');
  const[result,setResult]=useState(null);
  const[log,setLog]=useState([]);
  const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();},[]);

  async function scan(code){
    const qr=code.trim().toUpperCase();
    if(!qr)return;
    try{
      const d=await api.scanQR(qr);
      setResult({ok:true,d});
      setLog(l=>[{ok:true,siswa:d.siswa.nama,kelas:d.siswa.kelas,pj:d.penjemput.nama,relasi:d.penjemput.relasi,jam:d.jam_tunggu},...l.slice(0,19)]);
      addToast('ok',d.siswa.nama+' — notif guru terkirim ✓');
    }catch(e){
      setResult({ok:false,code:qr,msg:e.message});
      setLog(l=>[{ok:false,kode:qr,jam:new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})},...l.slice(0,19)]);
      addToast('err',e.message);
    }finally{
      setTimeout(()=>setResult(null),6000);
      setInput('');
      ref.current?.focus();
    }
  }

  return(
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
        <div>
          <div className="text-xl font-black">Pos Gerbang</div>
          <div className="text-slate-400 text-sm">KBTK Taruna Prima · <LiveClock/></div>
        </div>
        <div className="flex items-center gap-2 bg-emerald-900/50 border border-emerald-700 rounded-full px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
          <span className="text-emerald-400 text-xs font-bold">Aktif</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-5 gap-4 max-w-lg mx-auto w-full">
        {/* Result Panel */}
        <div className={`rounded-3xl border-2 p-10 text-center transition-all duration-300 ${
          !result
            ?'border-dashed border-slate-600 bg-slate-800/40'
            :result.ok
              ?'border-emerald-500 bg-emerald-900/30'
              :'border-red-500 bg-red-900/30'
        }`}>
          {!result&&(
            <div>
              <div className="text-6xl mb-4">📱</div>
              <div className="text-slate-300 font-bold text-lg">Scan QR Penjemput</div>
              <div className="text-slate-500 text-sm mt-2">Arahkan scanner ke QR code<br/>atau ketik kode di bawah</div>
            </div>
          )}
          {result?.ok&&(
            <div className="animate-bounce-in">
              <div className="text-6xl mb-4">✅</div>
              <div className="text-3xl font-black text-emerald-300">{result.d.siswa.nama}</div>
              <div className="text-emerald-400 font-semibold mt-1">{result.d.siswa.kelas}</div>
              <div className="mt-4 bg-emerald-900/50 rounded-2xl px-4 py-3 text-emerald-300">
                <div className="text-sm">Dijemput oleh</div>
                <div className="text-xl font-black">{result.d.penjemput.nama}</div>
                <div className="text-sm opacity-70">{result.d.penjemput.relasi}</div>
              </div>
              <div className="text-emerald-600 text-xs mt-3">✓ Notifikasi terkirim ke guru kelas · {result.d.jam_tunggu}</div>
            </div>
          )}
          {result&&!result.ok&&(
            <div className="animate-bounce-in">
              <div className="text-6xl mb-4">🚫</div>
              <div className="text-2xl font-black text-red-300">TIDAK TERDAFTAR</div>
              <div className="text-red-400 mt-2 text-sm">Penjemput tidak ada dalam sistem</div>
              <div className="font-mono text-xs text-red-600 mt-3 bg-red-950/50 px-3 py-2 rounded-xl">{result.code}</div>
              <div className="text-red-700 text-xs mt-3">🚨 Kejadian ini dicatat dalam log sistem</div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            ref={ref}
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&scan(input)}
            placeholder="Scan atau ketik kode QR..."
            className="flex-1 bg-slate-800 border-2 border-slate-600 rounded-2xl px-4 py-4 font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm tracking-wider"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <button
            onClick={()=>scan(input)}
            className="px-6 py-4 bg-amber-500 text-slate-900 font-black rounded-2xl hover:bg-amber-400 active:scale-95 transition-all shadow-lg shadow-amber-500/20 text-sm"
          >
            SCAN
          </button>
        </div>
        <p className="text-center text-slate-600 text-xs">
          Jika menggunakan barcode scanner USB — langsung scan, otomatis terproses
        </p>

        {/* Activity Log */}
        {log.length>0&&(
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <p className="text-xs font-black text-slate-400 tracking-widest">LOG AKTIVITAS HARI INI</p>
            </div>
            <div className="divide-y divide-slate-700/50 max-h-64 overflow-y-auto">
              {log.map((l,i)=>(
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${l.ok?'bg-emerald-500':'bg-red-500'}`}/>
                  <div className="flex-1 min-w-0">
                    {l.ok
                      ?<><span className="text-sm font-semibold text-white">{l.siswa}</span><span className="text-xs text-slate-500"> · {l.kelas} · {l.pj} ({l.relasi})</span></>
                      :<span className="text-sm text-red-400">⚠️ QR tidak dikenal: <span className="font-mono">{l.kode}</span></span>
                    }
                  </div>
                  <span className="text-xs font-mono text-slate-600 flex-shrink-0">{l.jam}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
