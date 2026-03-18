import{useState,useEffect}from'react';import{api}from'../api';import{Chip,LiveClock,Spinner,meniTunggu}from'../components/Shared';
export default function KepsekView(){
  const[data,setData]=useState(null);
  async function load(){try{setData(await api.getDashboard());}catch(e){console.error(e);}}
  useEffect(()=>{load();const i=setInterval(load,30000);return()=>clearInterval(i);},[]);
  if(!data)return<div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center"><Spinner/></div>;
  const{byKelas,siswaAktif}=data;
  const totalSiswa=byKelas.reduce((s,k)=>s+k.total,0);
  const totalHadir=byKelas.reduce((s,k)=>s+k.hadir+k.menunggu+k.terlambat,0);
  const totalMenunggu=byKelas.reduce((s,k)=>s+k.menunggu,0);
  const redFlags=siswaAktif.filter(s=>{const m=meniTunggu(s.jam_tunggu);return s.status==='Menunggu'&&m&&m>15;});
  return(<div className="min-h-screen bg-[#0a0f1e] text-white p-5 flex flex-col gap-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-2xl">🌟</div>
        <div><div className="text-2xl font-black">KBTK Taruna Prima</div><div className="text-slate-400 text-sm">Monitoring Kehadiran & Penjemputan</div></div>
      </div>
      <div className="text-right"><LiveClock className="text-4xl font-black tabular-nums text-amber-400"/>
        <div className="text-slate-400 text-xs mt-1">{new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
    </div>
    {redFlags.length>0&&<div className="bg-red-900/50 border-2 border-red-500 rounded-2xl px-5 py-3 flex items-center gap-3 animate-blink">
      <span className="text-2xl">🔴</span>
      <div><div className="font-black text-red-300">{redFlags.length} ANAK MENUNGGU LEBIH DARI 15 MENIT</div>
        <div className="text-red-400 text-sm">{redFlags.map(s=>s.nama+' ('+s.kelas+') — '+meniTunggu(s.jam_tunggu)+' menit').join(' · ')}</div>
      </div>
    </div>}
    <div className="grid grid-cols-4 gap-3">
      {[{l:'Total Hadir',v:totalHadir,s:'dari '+totalSiswa+' siswa',b:'border-emerald-500/30',t:'text-emerald-400'},
        {l:'Masih di Sekolah',v:siswaAktif.length,s:'belum pulang',b:'border-blue-500/30',t:'text-blue-400'},
        {l:'Menunggu Jemput',v:totalMenunggu,s:'di kelas',b:'border-amber-500/30',t:'text-amber-400'},
        {l:'Red Flag',v:redFlags.length,s:'> 15 menit',b:'border-red-500/30',t:'text-red-400'},
      ].map(s=><div key={s.l} className={`bg-white/5 border ${s.b} rounded-2xl p-5`}>
        <div className={`text-5xl font-black ${s.t}`}>{s.v}</div>
        <div className="text-white font-bold mt-2">{s.l}</div>
        <div className="text-slate-500 text-xs mt-0.5">{s.s}</div>
      </div>)}
    </div>
    <div className="grid grid-cols-4 gap-3 flex-1">
      {byKelas.map(k=>{
        const list=siswaAktif.filter(s=>s.kelas===k.kelas);
        return(<div key={k.id} className="bg-white/5 border border-white/10 rounded-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
            <div><div className="font-black text-xl">{k.kelas}</div><div className="text-slate-400 text-xs">{k.guru||'—'}</div></div>
            <div className="text-right"><div className="text-2xl font-black text-amber-400">{k.hadir+k.menunggu}</div><div className="text-slate-500 text-xs">/ {k.total}</div></div>
          </div>
          <div className="flex h-1.5 mx-4 mt-3 rounded-full overflow-hidden gap-px">
            <div className="bg-emerald-500" style={{width:k.total?(k.hadir/k.total*100)+'%':'0%'}}/>
            <div className="bg-amber-400"   style={{width:k.total?(k.menunggu/k.total*100)+'%':'0%'}}/>
            <div className="bg-slate-600"   style={{width:k.total?(k.pulang/k.total*100)+'%':'0%'}}/>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 max-h-64">
            {list.length===0?<div className="text-center py-6 text-slate-600 text-sm">Semua sudah pulang 🎉</div>:list.map(s=>{
              const mnt=meniTunggu(s.jam_tunggu),red=s.status==='Menunggu'&&mnt&&mnt>15;
              return(<div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${red?'bg-red-900/40 border border-red-600/40':'bg-white/5'}`}>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0">{s.nama[0]}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{s.nama}</div>{s.nama_penjemput&&<div className="text-xs text-slate-500 truncate">← {s.nama_penjemput}</div>}</div>
                {red?<span className="text-xs font-black text-red-400">⏰{mnt}m</span>:<Chip status={s.status} manual={s.manual}/>}
              </div>);
            })}
          </div>
          <div className="grid grid-cols-3 border-t border-white/10 text-center">
            {[{l:'Hadir',v:k.hadir,c:'text-emerald-400'},{l:'Tunggu',v:k.menunggu,c:'text-amber-400'},{l:'Pulang',v:k.pulang,c:'text-slate-500'}].map(x=>(
              <div key={x.l} className="py-2"><div className={`text-lg font-black ${x.c}`}>{x.v}</div><div className="text-slate-500 text-xs">{x.l}</div></div>
            ))}
          </div>
        </div>);
      })}
    </div>
    <div className="flex items-center gap-2 text-xs text-slate-700"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>Live · refresh 30 detik · SIAGA v1.1</div>
  </div>);
}