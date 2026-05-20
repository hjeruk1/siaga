import{useEffect,useMemo,useState}from'react';
import{api}from'../api';
import{Chip,LiveClock,Spinner,meniTunggu}from'../components/Shared';

const TABS=[
  {id:'monitoring',label:'Monitoring'},
  {id:'laporan',label:'Laporan'},
  {id:'keuangan',label:'Keuangan'},
  {id:'notifikasi',label:'Notifikasi'}
];

export default function KepsekView({user,toast}){
  const[tab,setTab]=useState('monitoring');
  const[tanggal,setTanggal]=useState(new Date().toISOString().slice(0,10));
  const[cabang,setCabang]=useState([]);
  const[cabangId,setCabangId]=useState(user.role==='admin'?'':user.cabang_id);
  const[rows,setRows]=useState([]);
  const[notif,setNotif]=useState([]);
  const[laporan,setLaporan]=useState(null);
  const[monitoring,setMonitoring]=useState(null);
  const[loadingMonitoring,setLoadingMonitoring]=useState(true);

  useEffect(()=>{api.cabang().then(setCabang).catch(()=>{});},[]);

  async function loadSummary(){
    const data=await api.dailyToday({tanggal,cabang_id:cabangId});
    setRows(data.rows||data);
    setNotif(await api.notifikasi());
    if(cabangId)api.laporan({cabang_id:cabangId}).then(setLaporan).catch(()=>setLaporan(null));
    else setLaporan(null);
  }
  async function loadMonitoring(){
    setLoadingMonitoring(true);
    try{setMonitoring(await api.dashboard({cabang_id:cabangId}));}
    finally{setLoadingMonitoring(false);}
  }

  useEffect(()=>{loadSummary().catch(e=>toast('err',e.message));},[tanggal,cabangId]);
  useEffect(()=>{
    if(tab!=='monitoring')return;
    loadMonitoring().catch(e=>toast('err',e.message));
    const timer=setInterval(()=>loadMonitoring().catch(()=>{}),30000);
    return()=>clearInterval(timer);
  },[tab,cabangId]);

  const stat=useMemo(()=>({
    total:rows.length,
    published:rows.filter(r=>r.laporan_status==='published').length,
    draft:rows.filter(r=>r.laporan_status==='draft').length
  }),[rows]);

  return <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t=><button key={t.id} aria-label={`Tab ${t.label} Kepsek`} onClick={()=>setTab(t.id)} className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap ${tab===t.id?'bg-slate-900 text-white':'bg-white text-slate-600 border border-slate-200'}`}>{t.label}</button>)}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        {user.role==='admin'&&<select value={cabangId} onChange={e=>setCabangId(e.target.value)} className="input">
          <option value="">Semua cabang</option>{cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
        </select>}
        {tab==='laporan'&&<input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} className="input"/>}
      </div>
    </div>

    {tab==='monitoring'&&<MonitoringPanel data={monitoring} loading={loadingMonitoring}/>}
    {tab==='laporan'&&<LaporanPanel rows={rows} stat={stat}/>}
    {tab==='keuangan'&&<KeuanganPanel laporan={laporan} cabangId={cabangId}/>}
    {tab==='notifikasi'&&<NotifikasiPanel notif={notif}/>}
  </div>;
}

function MonitoringPanel({data,loading}){
  if(loading&&!data)return <section className="bg-white border border-slate-200 rounded-2xl p-4"><Spinner/></section>;
  const byKelas=data?.byKelas||[];
  const siswaAktif=data?.siswaAktif||[];
  const totalSiswa=byKelas.reduce((s,k)=>s+Number(k.total||0),0);
  const totalHadir=byKelas.reduce((s,k)=>s+Number(k.hadir||0)+Number(k.menunggu||0),0);
  const totalMenunggu=byKelas.reduce((s,k)=>s+Number(k.menunggu||0),0);
  const redFlags=siswaAktif.filter(s=>s.status==='Menunggu'&&meniTunggu(s.jam_tunggu)>15);
  const stats=[
    {label:'Total Hadir',value:totalHadir,sub:`dari ${totalSiswa} siswa`,tone:'emerald'},
    {label:'Masih di Sekolah',value:siswaAktif.length,sub:'belum pulang',tone:'sky'},
    {label:'Menunggu Jemput',value:totalMenunggu,sub:'di kelas/gerbang',tone:'amber'},
    {label:'Red Flag',value:redFlags.length,sub:'> 15 menit',tone:'red'}
  ];

  return <div className="space-y-4">
    <section className="bg-slate-950 text-white border border-slate-800 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-black">Monitoring Hari Ini</h2>
          <p className="text-sm text-slate-400">{data?.hari_status?.nama||'Status hari'} - refresh otomatis 30 detik</p>
        </div>
        <div className="md:text-right">
          <LiveClock className="text-3xl font-black tabular-nums text-amber-400"/>
          <div className="text-xs text-slate-500">{new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
      </div>
      {data?.libur&&<div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-100 px-4 py-3 mb-4 font-bold">Hari ini libur. Aktivitas siswa aktif tidak ditampilkan.</div>}
      {redFlags.length>0&&<div className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 mb-4">
        <div className="font-black text-red-200">{redFlags.length} anak menunggu lebih dari 15 menit</div>
        <div className="text-xs text-red-100 mt-1">{redFlags.map(s=>`${s.nama} (${s.kelas}) ${meniTunggu(s.jam_tunggu)} menit`).join(' | ')}</div>
      </div>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map(s=><StatCard key={s.label} {...s}/>)}
      </div>
    </section>

    <section className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
      {byKelas.map(k=><RombelCard key={k.id} item={k} siswa={siswaAktif.filter(s=>Number(s.rombel_id)===Number(k.id))}/>)}
      {byKelas.length===0&&<div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 sm:col-span-2 xl:col-span-3 2xl:col-span-4">Belum ada rombel aktif untuk ditampilkan.</div>}
    </section>
  </div>;
}

function StatCard({label,value,sub,tone}){
  const toneMap={
    emerald:'border-emerald-500/30 text-emerald-300',
    sky:'border-sky-500/30 text-sky-300',
    amber:'border-amber-500/30 text-amber-300',
    red:'border-red-500/30 text-red-300'
  };
  return <div className={`bg-white/5 border ${toneMap[tone]} rounded-2xl p-4`}>
    <div className="text-4xl font-black">{value}</div>
    <div className="text-white font-bold mt-1">{label}</div>
    <div className="text-slate-500 text-xs">{sub}</div>
  </div>;
}

function RombelCard({item,siswa}){
  const total=Number(item.total||0);
  const hadir=Number(item.hadir||0),menunggu=Number(item.menunggu||0),pulang=Number(item.pulang||0);
  return <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col min-h-[360px]">
    <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-black text-slate-900 truncate">{item.kelas}</div>
        <div className="text-xs text-slate-500 truncate">{item.cabang} - {item.guru||'-'}</div>
      </div>
      <div className="text-right flex-shrink-0"><div className="text-2xl font-black text-amber-500">{hadir+menunggu}</div><div className="text-xs text-slate-400">/ {total}</div></div>
    </div>
    <div className="flex h-1.5 mx-4 mt-3 rounded-full overflow-hidden bg-slate-100">
      <div className="bg-emerald-500" style={{width:total?(hadir/total*100)+'%':'0%'}}/>
      <div className="bg-amber-400" style={{width:total?(menunggu/total*100)+'%':'0%'}}/>
      <div className="bg-slate-400" style={{width:total?(pulang/total*100)+'%':'0%'}}/>
    </div>
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 max-h-72">
      {siswa.length?siswa.map(s=>{
        const menit=meniTunggu(s.jam_tunggu);
        const red=s.status==='Menunggu'&&menit>15;
        return <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${red?'bg-red-50 border-red-200':'bg-slate-50 border-slate-100'}`}>
          {s.foto?<img src={s.foto} alt={s.nama} className="w-9 h-9 rounded-full object-cover flex-shrink-0"/>:<div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 grid place-items-center font-black flex-shrink-0">{s.nama?.[0]||'S'}</div>}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-slate-800 truncate">{s.nama}</div>
            {s.nama_penjemput&&<div className="text-xs text-slate-500 truncate">{s.nama_penjemput}</div>}
          </div>
          {red?<span className="text-xs font-black text-red-600">{menit}m</span>:<Chip status={s.status} manual={s.manual}/>}
        </div>;
      }):<div className="text-center py-8 text-sm text-slate-400">Semua sudah pulang atau belum ada aktivitas.</div>}
    </div>
    <div className="grid grid-cols-3 border-t border-slate-100 text-center">
      <MiniStat label="Hadir" value={hadir} tone="text-emerald-600"/>
      <MiniStat label="Tunggu" value={menunggu} tone="text-amber-600"/>
      <MiniStat label="Pulang" value={pulang} tone="text-slate-500"/>
    </div>
  </div>;
}

function MiniStat({label,value,tone}){return <div className="py-2"><div className={`text-lg font-black ${tone}`}>{value}</div><div className="text-xs text-slate-400">{label}</div></div>;}

function LaporanPanel({rows,stat}){
  return <section className="bg-white border border-slate-200 rounded-2xl p-4">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
      <div><h2 className="font-black text-slate-900 text-lg">Laporan Daily Record</h2><p className="text-sm text-slate-500">Progress publish laporan harian per siswa.</p></div>
      <div className="text-sm font-black text-slate-500">{stat.published}/{stat.total} published</div>
    </div>
    <div className="grid sm:grid-cols-3 gap-3 mb-4"><Card label="Siswa" value={stat.total}/><Card label="Published" value={stat.published}/><Card label="Draft/Belum" value={stat.total-stat.published}/></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Siswa','Cabang','Rombel','Paket','Status'].map(h=><th key={h} className="text-left bg-slate-50 px-3 py-2 text-slate-500 font-black">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.siswa_id} className="border-t border-slate-100"><td className="td">{r.nama}</td><td className="td">{r.cabang_nama}</td><td className="td">{r.rombel_nama}</td><td className="td">{r.paket}</td><td className="td">{r.laporan_status||'belum ada'}</td></tr>)}</tbody></table></div>
  </section>;
}

function KeuanganPanel({laporan,cabangId}){
  if(!cabangId)return <section className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">Pilih cabang untuk melihat laporan keuangan.</section>;
  if(!laporan)return <section className="bg-white border border-slate-200 rounded-2xl p-4"><Spinner/></section>;
  return <section className="bg-white border border-slate-200 rounded-2xl p-4">
    <h2 className="font-black text-slate-900 mb-3">Laporan Keuangan</h2>
    <div className="grid sm:grid-cols-4 gap-3 mb-4">
      <Card label="Total Tagihan" value={money(laporan.summary.total_nominal)}/>
      <Card label="Sudah Dibayar" value={money(laporan.summary.total_paid)}/>
      <Card label="Lunas" value={laporan.summary.count_lunas}/>
      <Card label="Tunggakan" value={`${laporan.summary.count_outstanding} (${money(laporan.summary.total_outstanding)})`}/>
    </div>
    <div className="grid xl:grid-cols-2 gap-4">
      <FinanceTable title="Per Jenis" rows={laporan.by_jenis} first="jenis"/>
      <FinanceTable title="Per Periode" rows={laporan.by_periode} first="periode"/>
    </div>
  </section>;
}

function FinanceTable({title,rows,first}){
  return <div>
    <h3 className="font-black text-slate-800 mb-2">{title}</h3>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{[first==='jenis'?'Jenis':'Periode','Jumlah','Total','Lunas','Tunggakan'].map(h=><th key={h} className="text-left bg-slate-50 px-3 py-2 text-slate-500 font-black">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r[first]} className="border-t border-slate-100"><td className="td">{r[first]}</td><td className="td">{r.count}</td><td className="td">{money(r.total)}</td><td className="td">{money(r.lunas)}</td><td className="td">{money(r.outstanding)}</td></tr>)}</tbody></table></div>
  </div>;
}

function NotifikasiPanel({notif}){
  return <section className="bg-white border border-slate-200 rounded-2xl p-4">
    <h2 className="font-black text-slate-900 mb-3">Notifikasi Saya</h2>
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{notif.slice(0,12).map(n=><div key={n.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3"><div className="font-bold text-slate-800">{n.title}</div><div className="text-sm text-slate-500 mt-1">{n.body||n.tipe}</div></div>)}{notif.length===0&&<div className="text-sm text-slate-400">Belum ada notifikasi.</div>}</div>
  </section>;
}

function Card({label,value}){return <div className="bg-slate-50 border border-slate-200 rounded-xl p-4"><div className="text-xs font-black text-slate-500">{label}</div><div className="text-3xl font-black text-slate-900">{value}</div></div>;}
function money(v){return 'Rp '+Number(v||0).toLocaleString('id-ID');}
