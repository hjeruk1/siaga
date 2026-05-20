import{useEffect,useMemo,useState,useCallback}from'react';
import{api}from'../api';

const AKTIVITAS=['Mewarnai','Bernyanyi & Menari','Bermain Bebas','Membaca & Menulis',
  'Motorik Halus','Motorik Kasar','Ibadah / Doa','Seni & Kerajinan','Bercerita','Bermain Peran'];
const MOOD_OPT=[{v:'ceria',l:'😊 Ceria',c:'bg-emerald-500'},{v:'biasa',l:'😐 Biasa',c:'bg-amber-500'},{v:'rewel',l:'😢 Rewel',c:'bg-red-500'}];
const MAKAN_OPT=[{v:'habis',l:'🍽️ Habis',c:'bg-emerald-500'},{v:'setengah',l:'🍱 Setengah',c:'bg-amber-500'},{v:'tidak',l:'❌ Tidak Dimakan',c:'bg-red-500'}];
const TIDUR_OPT=[{v:1,l:'💤 Ya',c:'bg-blue-500'},{v:0,l:'🙅 Tidak',c:'bg-slate-500'}];

const OBSERVATION_DOMAINS=['Agama & Budi Pekerti','Jati Diri','Literasi','Numerasi','Sains & Teknologi','Motorik','Sosial Emosional','Seni'];

function noteOk(v){return String(v||'').trim().length>=12;}
function themeDomains(v){
  if(Array.isArray(v))return v;
  if(!v)return[];
  return String(v).split(',').map(x=>x.trim()).filter(Boolean);
}
function domainOptions(detail){
  return Array.from(new Set([...(detail?.focus_theme_domains||[]),...OBSERVATION_DOMAINS].filter(Boolean)));
}

function formalText(l,nama){
  if(!l||(!l.mood&&!l.makan&&(l.tidur===null||l.tidur===undefined)&&!(l.aktivitas?.length)&&!l.catatan&&!l.observation_note))return null;
  const moodMap={ceria:'terlihat ceria dan bersemangat',biasa:'terlihat biasa saja',rewel:'terlihat sedikit rewel'};
  const makanMap={habis:'Makan siang habis dengan porsi penuh.',setengah:'Makan siang hanya setengah porsi.',tidak:'Anak tidak mau makan siang.'};
  const tidurText=l.tidur===1?'Anak tidur siang dengan baik.':'Anak tidak tidur siang hari ini.';
  const aktList=(l.aktivitas||[]).length>0?'Aktivitas yang dilakukan: '+(l.aktivitas||[]).join(', ')+'.':'';
  const catatan=l.catatan?'Catatan: '+l.catatan:'';
  const focus=l.focus_theme_title?'Tema hari ini: '+l.focus_theme_title+'.':'';
  const observasi=l.observation_note?'Observasi '+(l.observation_domain?l.observation_domain.toLowerCase():'anak')+': '+l.observation_note:'';
  return[focus,l.mood?nama+' hari ini '+moodMap[l.mood]+'.':'',l.makan?makanMap[l.makan]:'',l.tidur!==null&&l.tidur!==undefined?tidurText:'',aktList,observasi,catatan].filter(Boolean).join(' ');
}
function completeness(l){
  if(!l)return 0;let s=0;
  if(l.mood)s++;if(l.makan)s++;if(l.tidur!==null&&l.tidur!==undefined)s++;
  if(l.focus_theme_id)s++;if(l.observation_domain)s++;if(noteOk(l.observation_note))s++;
  return Math.round(s/6*100);
}
function CompleteBadge({pct}){
  if(pct===0)return<span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Belum diisi</span>;
  if(pct<100)return<span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Sebagian {pct}%</span>;
  return<span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Lengkap</span>;
}

export default function GuruView({user,toast}){
  const[tab,setTab]=useState('daily');
  const[tanggal,setTanggal]=useState(new Date().toISOString().slice(0,10));
  const[list,setList]=useState([]);const[isSchoolDay,setIsSchoolDay]=useState(null);
  const[absensi,setAbsensi]=useState([]);
  const[absenMode,setAbsenMode]=useState('masuk');const[absenView,setAbsenView]=useState('card');
  const[absenSearch,setAbsenSearch]=useState('');const[absenStatus,setAbsenStatus]=useState('all');
  const[dailySearch,setDailySearch]=useState('');const[dailyFilter,setDailyFilter]=useState('all');
  const[selectedAbsensi,setSelectedAbsensi]=useState([]);const[nfcToken,setNfcToken]=useState('');
  const[nfcBusy,setNfcBusy]=useState(false);const[nfcMsg,setNfcMsg]=useState(null);
  const[selected,setSelected]=useState(null);const[detail,setDetail]=useState(null);
  const[historyFor,setHistoryFor]=useState(null);
  const[reminder,setReminder]=useState(null);
  const[dayClosed,setDayClosed]=useState(false);const[tutupHariLoading,setTutupHariLoading]=useState(false);
  async function load(){const data=await api.dailyToday({tanggal});const rows=data.rows||data;setList(rows);setIsSchoolDay(data.is_school_day);}
  async function loadAbsensi(){const data=await api.absensiToday({tanggal});setAbsensi(data.rows||data);if(data.is_school_day!==undefined)setIsSchoolDay(data.is_school_day);}
  async function loadReminder(){try{const cfg=await api.operasionalConfig(user.cabang_id);if(cfg[0])setReminder({aktif:!!cfg[0].daily_record_wajib,jam:cfg[0].daily_record_due_time||'18:00'});}catch{}}
  async function loadTutupHari(){try{const s=await api.tutupHariStatus({cabang_id:user.cabang_id,tanggal});setDayClosed(s.closed);}catch{}}
  useEffect(()=>{load().catch(e=>toast('err',e.message));loadReminder();},[tanggal]);
  useEffect(()=>{if(tab==='absensi'){loadAbsensi().catch(e=>toast('err',e.message));loadTutupHari();}},[tanggal,tab]);
  async function open(row){
    setSelected(row);
    const seed={siswa_id:row.siswa_id,tanggal,mood:null,makan:null,tidur:null,aktivitas:[],catatan:'',observation_domain:row.observation_domain||'',observation_note:row.observation_note||'',parent_note:row.parent_note||'',focus_theme_id:row.focus_theme_id||null,focus_theme_title:row.focus_theme_title||'',focus_theme_activity_summary:row.focus_theme_activity_summary||'',focus_theme_domains:row.focus_theme_domains||[],attachments:[],comments:[],id:null};
    if(row.laporan_id){
      const d=await api.dailyDetail(row.laporan_id);
      setDetail({...seed,...d,focus_theme_id:d.focus_theme_id||row.focus_theme_id||null,focus_theme_title:d.focus_theme_title||row.focus_theme_title||'',focus_theme_activity_summary:d.focus_theme_activity_summary||row.focus_theme_activity_summary||'',focus_theme_domains:d.focus_theme_domains?.length?d.focus_theme_domains:(row.focus_theme_domains||[])});
    }else setDetail(seed);
  }
  async function checkin(siswaId){try{await api.checkin({siswa_id:siswaId,tanggal});toast('ok','Check-in berhasil');loadAbsensi();}catch(e){toast('err',e.message);}}
  async function setKeterangan(siswaId,status){const catatan=prompt('Catatan (opsional)');try{await api.setKeterangan({siswa_id:siswaId,tanggal,status,catatan:catatan||''});toast('ok','Status: '+status);loadAbsensi();}catch(e){toast('err',e.message);}}
  async function pulangkan(ids){try{await api.pulangkan(ids);toast('ok',ids.length>1?`${ids.length} siswa dipulangkan`:'Siswa dipulangkan');setSelectedAbsensi([]);loadAbsensi();}catch(e){toast('err',e.message);}}
  async function doTutupHari(){if(!confirm('Tutup hari ini? Siswa dengan status Belum akan otomatis menjadi Absen. Tindakan ini tidak bisa dibatalkan.'))return;setTutupHariLoading(true);try{const r=await api.tutupHari({cabang_id:user.cabang_id,tanggal});toast('ok',`Hari ditutup. ${r.remaining_count} siswa tersisa (${r.details?.filter(d=>d.status==='Belum').length||0} jadi Absen).`);setDayClosed(true);loadAbsensi();}catch(e){toast('err',e.message);}finally{setTutupHariLoading(false);}}
  function toggleAbsensi(id){setSelectedAbsensi(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);}
  async function processNfc(raw){
    const token=String(raw||'').trim();
    if(!token)return;
    if(!/^SIAGA-STU-[A-F0-9]{10}$/i.test(token)){setNfcMsg({type:'err',text:'Format token tidak valid. Format: SIAGA-STU-XXXXXXXXXX'});return;}
    setNfcBusy(true);setNfcMsg(null);
    try{
      const action=absenMode==='pulang'?'pulang':'checkin';
      const r=await api.nfcScan({token,tanggal,action,tab:absenMode});
      setNfcMsg({type:'ok',text:`${r.siswa?.nama||'Siswa'}: ${action==='pulang'?'Pulang':'Check-in'} berhasil`});
      setNfcToken('');loadAbsensi();
    }catch(e){setNfcMsg({type:'err',text:e.message});toast('err',e.message);}
    finally{setNfcBusy(false);}
  }
  async function startWebNfc(){
    if(!('NDEFReader'in window)){toast('err','Web NFC belum didukung browser ini. Pakai input scanner/manual.');return;}
    try{
      const reader=new window.NDEFReader();
      await reader.scan();
      toast('ok','NFC aktif. Tempel kartu siswa.');
      reader.onreading=e=>{
        let value='';
        for(const record of e.message.records){
          if(record.recordType==='text'){value=new TextDecoder(record.encoding||'utf-8').decode(record.data);break;}
          if(record.recordType==='url'||record.recordType==='mime'){value=new TextDecoder().decode(record.data);break;}
        }
        processNfc(value);
      };
    }catch(e){toast('err',e.message||'Gagal mengaktifkan NFC');}
  }
  const filteredAbsensi=useMemo(()=>absensi.filter(a=>{
    const q=absenSearch.trim().toLowerCase();
    const matchText=!q||[a.nama,a.rombel_nama,a.nis].filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
    const matchStatus=absenStatus==='all'||a.status===absenStatus;
    return matchText&&matchStatus;
  }),[absensi,absenSearch,absenStatus]);
  const absenStats=useMemo(()=>['Belum','Hadir','Terlambat','Menunggu','Pulang','Izin','Sakit','Absen'].map(s=>({s,n:absensi.filter(a=>a.status===s).length})),[absensi]);
  const done=list.filter(r=>completeness(r)===100).length;
  const dailyCounts=useMemo(()=>list.reduce((acc,r)=>{
    const pct=completeness(r);
    acc.all++;
    if(pct===100)acc.lengkap++;
    else if(pct>0)acc.sebagian++;
    else acc.belum++;
    return acc;
  },{all:0,belum:0,sebagian:0,lengkap:0}),[list]);
  const filteredDaily=useMemo(()=>list.filter(r=>{
    const q=dailySearch.trim().toLowerCase();
    const pct=completeness(r);
    const status=pct===100?'lengkap':pct>0?'sebagian':'belum';
    const matchText=!q||[r.nama,r.rombel_nama,r.paket].filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
    const matchStatus=dailyFilter==='all'||dailyFilter===status;
    return matchText&&matchStatus;
  }),[list,dailySearch,dailyFilter]);
  const showReminder=reminder?.aktif&&isSchoolDay!==false&&tanggal===new Date().toISOString().slice(0,10)&&(()=>{const now=new Date();const[h,m]=reminder.jam.split(':').map(Number);const t=new Date();t.setHours(h,m,0,0);return now>=t&&done<list.length;})();
  return <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
    <div className="flex gap-2">
      {[{id:'daily',label:'Daily Record'},{id:'absensi',label:'Absensi'}].map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2 rounded-xl text-sm font-bold ${tab===t.id?'bg-slate-900 text-white':'bg-white text-slate-600 border border-slate-200'}`}>{t.label}</button>)}
    </div>
    {tab==='daily'&&<div className="w-full space-y-4 lg:h-[calc(100vh-132px)] lg:min-h-0 lg:flex lg:flex-col">
      {showReminder&&<div className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-4 py-3 flex items-center gap-3"><span className="text-2xl">⏰</span><div className="flex-1"><p className="font-black text-amber-800 text-sm">Pengingat Laporan Harian</p><p className="text-amber-700 text-xs">{list.length-done} siswa belum dilaporkan — selesaikan sebelum akhir hari.</p></div></div>}
      <section className="grid lg:grid-cols-[390px_minmax(0,1fr)] 2xl:grid-cols-[430px_minmax(0,1fr)] gap-4 lg:flex-1 lg:min-h-0">
        <aside className={`${selected?'hidden lg:flex':'flex'} bg-white border border-slate-200 rounded-2xl p-4 flex-col min-h-[560px] lg:min-h-0 lg:h-full`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div><h1 className="text-xl font-black text-slate-900">Daily Record</h1><p className="text-sm text-slate-500">{isSchoolDay===false&&<span className="text-red-500 font-black">Hari Libur</span>}{isSchoolDay===true&&<span className="text-emerald-500 font-black">Hari Masuk</span>}{isSchoolDay===null&&'Draft, publish, dan feedback wali.'}</p></div>
          <input type="date" value={tanggal} onChange={e=>{setTanggal(e.target.value);setSelected(null);setDetail(null);}} className="input max-w-xs"/>
        </div>
        <div className="space-y-3 mb-4">
          <input value={dailySearch} onChange={e=>setDailySearch(e.target.value)} className="input w-full" placeholder="Cari siswa atau rombel"/>
          <div className="grid grid-cols-4 gap-2">{[{id:'all',label:'Semua',count:dailyCounts.all},{id:'belum',label:'Belum',count:dailyCounts.belum},{id:'sebagian',label:'Sebagian',count:dailyCounts.sebagian},{id:'lengkap',label:'Lengkap',count:dailyCounts.lengkap}].map(f=><button key={f.id} onClick={()=>setDailyFilter(f.id)} className={`px-2 py-2 rounded-xl text-xs font-black ${dailyFilter===f.id?'bg-slate-900 text-white':'bg-slate-100 text-slate-600'}`}><span className="block">{f.label}</span><span className={`block text-base leading-tight ${dailyFilter===f.id?'text-white':'text-slate-900'}`}>{f.count}</span></button>)}</div>
        </div>
        <div className="space-y-2 overflow-y-auto pr-1 lg:flex-1 lg:min-h-0">
          {filteredDaily.map(r=>{const pct=completeness(r);const active=selected?.siswa_id===r.siswa_id;return(
            <div key={r.siswa_id} onClick={()=>open(r)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')open(r);}} className={`text-left border rounded-2xl p-3 cursor-pointer flex gap-3 items-center transition-colors ${active?'bg-amber-50 border-amber-300':'bg-white border-slate-200 hover:border-amber-300'}`}>
              {r.foto
                ?<img src={r.foto} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" alt={r.nama}/>
                :<div className="w-14 h-14 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 text-2xl flex-shrink-0">👤</div>}
              <div className="flex-1 min-w-0">
                <div className="font-black text-slate-900 text-sm truncate">{r.nama}{r.is_late&&<span className="ml-1.5 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-black align-middle">Terlambat</span>}</div>
                <div className="text-xs text-slate-500">{r.rombel_nama} · {r.paket}</div>
                <div className="flex items-center gap-2 mt-1"><CompleteBadge pct={pct}/><button onClick={e=>{e.stopPropagation();setHistoryFor(r);}} className="text-xs px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200" title="Riwayat">📖</button></div>
              </div>
            </div>
          )})}
          {filteredDaily.length===0&&<div className="text-center py-10 text-sm text-slate-400">Tidak ada siswa sesuai filter.</div>}
        </div>
        </aside>
        <div className={`${selected&&detail?'fixed inset-0 z-50 overflow-y-auto bg-slate-100 p-3 lg:static lg:z-auto lg:bg-transparent lg:p-0 lg:overflow-y-auto lg:h-full':'hidden lg:flex'} min-w-0 lg:min-h-0`}>
          {selected&&detail?<Editor row={selected} detail={detail} setDetail={setDetail} onClose={()=>{setSelected(null);setDetail(null);load();}} user={user} toast={toast}/>:
          <div className="hidden lg:grid w-full place-items-center bg-white border border-slate-200 rounded-2xl text-center p-10 text-slate-400"><div><div className="text-lg font-black text-slate-500">Pilih siswa</div><div className="text-sm mt-1">Editor laporan harian akan muncul di sini.</div></div></div>}
        </div>
      </section>
    </div>}
    {tab==='absensi'&&<section className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div><h1 className="text-xl font-black text-slate-900">Absensi Kelas</h1><p className="text-sm text-slate-500">Check-in pagi, keterangan, NFC, dan pulang setelah gerbang validasi penjemput. {isSchoolDay===false&&<span className="font-black text-red-500">Hari Libur</span>}{isSchoolDay===true&&<span className="font-black text-emerald-600">Hari Masuk</span>}</p></div>
          <div className="flex flex-wrap gap-2"><input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} className="input"/><button onClick={loadAbsensi} className="btn-secondary">Refresh</button></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mt-4">{absenStats.map(x=><button key={x.s} onClick={()=>setAbsenStatus(x.s)} className={`text-left rounded-xl border px-3 py-2 ${absenStatus===x.s?'border-amber-400 bg-amber-50':'border-slate-200 bg-slate-50'}`}><div className="text-xs font-black text-slate-500">{x.s}</div><div className="text-2xl font-black text-slate-900">{x.n}</div></button>)}</div>
      </div>
      <div className="grid xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
        <aside className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
          <div><div className="label">Mode NFC</div><div className="grid grid-cols-2 gap-2">{[{id:'masuk',label:'Masuk'},{id:'pulang',label:'Pulang'}].map(m=><button key={m.id} onClick={()=>setAbsenMode(m.id)} className={`py-2.5 rounded-xl text-sm font-black border ${absenMode===m.id?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-600 border-slate-200'}`}>{m.label}</button>)}</div></div>
          <form onSubmit={e=>{e.preventDefault();processNfc(nfcToken);}} className="space-y-2">
            <label className="label">Tap / input token NFC</label>
            <input value={nfcToken} onChange={e=>setNfcToken(e.target.value.toUpperCase())} className="input w-full font-mono" placeholder="SIAGA-STU-XXXXXXXXXX" disabled={nfcBusy}/>
            <div className="grid grid-cols-2 gap-2"><button className="btn" disabled={nfcBusy}>{nfcBusy?'Proses...':'Proses'}</button><button type="button" onClick={startWebNfc} className="btn-secondary">Web NFC</button></div>
          </form>
          {nfcMsg&&<div className={`rounded-xl p-3 text-sm font-bold ${nfcMsg.type==='ok'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-50 text-red-700 border border-red-200'}`}>{nfcMsg.text}</div>}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="label">Bulk pulang</div>
            <p className="text-xs text-slate-500">Pilih siswa berstatus Menunggu, lalu konfirmasi pulang.</p>
            <button onClick={()=>pulangkan(selectedAbsensi)} disabled={!selectedAbsensi.length} className="btn w-full">Pulangkan ({selectedAbsensi.length})</button>
          </div>
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="label">Tutup Hari</div>
            <p className="text-xs text-slate-500">{dayClosed?'Hari sudah ditutup. Tidak ada perubahan absensi yang bisa dilakukan.':'Kunci absensi hari ini. Siswa Belum → Absen.'}</p>
            <button onClick={doTutupHari} disabled={dayClosed||tutupHariLoading} className={`w-full py-2.5 rounded-xl text-sm font-black border ${dayClosed?'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed':'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}>{dayClosed?'✓ Hari Ditutup':tutupHariLoading?'Menutup...':'Tutup Hari'}</button>
          </div>
        </aside>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between mb-4">
            <div className="flex flex-1 gap-2"><input value={absenSearch} onChange={e=>setAbsenSearch(e.target.value)} className="input flex-1" placeholder="Cari siswa atau rombel"/><select value={absenStatus} onChange={e=>setAbsenStatus(e.target.value)} className="input w-40"><option value="all">Semua</option>{absenStats.map(x=><option key={x.s} value={x.s}>{x.s}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2"><button onClick={()=>setAbsenView('card')} className={`px-3 py-2 rounded-xl text-sm font-black ${absenView==='card'?'bg-slate-900 text-white':'bg-slate-100 text-slate-600'}`}>Kartu</button><button onClick={()=>setAbsenView('list')} className={`px-3 py-2 rounded-xl text-sm font-black ${absenView==='list'?'bg-slate-900 text-white':'bg-slate-100 text-slate-600'}`}>List</button></div>
          </div>
          {absenView==='card'?<div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">{filteredAbsensi.map(a=><AbsensiCard key={a.siswa_id} row={a} selected={selectedAbsensi.includes(a.siswa_id)} onSelect={()=>toggleAbsensi(a.siswa_id)} onCheckin={()=>checkin(a.siswa_id)} onKet={setKeterangan} onPulang={()=>pulangkan([a.siswa_id])}/>)}</div>:
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['','Siswa','Rombel','Status','Masuk','Tunggu','Pulang','Aksi'].map(h=><th key={h} className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filteredAbsensi.map(a=><tr key={a.siswa_id}><td className="py-2.5 px-3"><input type="checkbox" checked={selectedAbsensi.includes(a.siswa_id)} onChange={()=>toggleAbsensi(a.siswa_id)} disabled={a.status!=='Menunggu'}/></td><td className="py-2.5 px-3 font-black text-slate-800">{a.nama}</td><td className="py-2.5 px-3 text-slate-600">{a.rombel_nama}</td><td className="py-2.5 px-3"><StatusBadge status={a.status}/></td><td className="py-2.5 px-3">{a.jam_masuk||'-'}</td><td className="py-2.5 px-3">{a.jam_tunggu||'-'}</td><td className="py-2.5 px-3">{a.jam_pulang||'-'}</td><td className="py-2.5 px-3"><AbsensiActions row={a} onCheckin={()=>checkin(a.siswa_id)} onKet={setKeterangan} onPulang={()=>pulangkan([a.siswa_id])}/></td></tr>)}</tbody></table></div>}
        </div>
      </div>
    </section>}
    {historyFor&&<HistoryModal siswa={historyFor} onClose={()=>setHistoryFor(null)}/>}
  </div>;
}

function StatusBadge({status}){
  const cls=status==='Hadir'?'bg-emerald-100 text-emerald-700 border-emerald-200':status==='Terlambat'?'bg-orange-100 text-orange-700 border-orange-200':status==='Menunggu'?'bg-amber-100 text-amber-700 border-amber-200':status==='Pulang'?'bg-slate-100 text-slate-600 border-slate-200':['Izin','Sakit','Absen'].includes(status)?'bg-blue-100 text-blue-700 border-blue-200':'bg-slate-50 text-slate-400 border-slate-200';
  return <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-black ${cls}`}>{status||'Belum'}</span>;
}

function AbsensiActions({row,onCheckin,onKet,onPulang}){
  const canEnter=['Belum','Absen'].includes(row.status);
  const canKet=['Belum','Absen','Izin','Sakit'].includes(row.status);
  return <div className="flex flex-wrap gap-2">
    {canEnter&&<button onClick={onCheckin} className="link">Check-in</button>}
    {canKet&&<><button onClick={()=>onKet(row.siswa_id,'Izin')} className="link">Izin</button><button onClick={()=>onKet(row.siswa_id,'Sakit')} className="link">Sakit</button><button onClick={()=>onKet(row.siswa_id,'Absen')} className="link text-red-600">Absen</button></>}
    {row.status==='Menunggu'&&<button onClick={onPulang} className="link text-emerald-700">Pulang</button>}
  </div>;
}

function AbsensiCard({row,selected,onSelect,onCheckin,onKet,onPulang}){
  return <article className={`rounded-2xl border overflow-hidden ${selected?'border-amber-400 bg-amber-50':'border-slate-200 bg-white'}`}>
    <div className="relative">
      {row.foto
        ?<img src={row.foto} className="w-full aspect-[4/3] object-cover" alt={row.nama}/>
        :<div className="w-full aspect-[4/3] bg-slate-200 flex items-center justify-center text-slate-400 text-5xl">👤</div>}
      <div className="absolute top-2 left-2"><StatusBadge status={row.status}/></div>
      {row.status==='Menunggu'&&<input type="checkbox" checked={selected} onChange={onSelect} className="absolute top-2 right-2 w-5 h-5 accent-amber-500"/>}
    </div>
    <div className="p-3 space-y-2">
      <h3 className="font-black text-slate-900 text-sm leading-tight">{row.nama}</h3>
      <p className="text-xs text-slate-500">{row.rombel_nama} · {row.paket}</p>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="bg-slate-50 rounded-lg py-1.5"><div className="text-[10px] font-black text-slate-400">Masuk</div><div className="font-black text-slate-700 text-xs">{row.jam_masuk||'-'}</div></div>
        <div className="bg-slate-50 rounded-lg py-1.5"><div className="text-[10px] font-black text-slate-400">Tunggu</div><div className="font-black text-slate-700 text-xs">{row.jam_tunggu||'-'}</div></div>
        <div className="bg-slate-50 rounded-lg py-1.5"><div className="text-[10px] font-black text-slate-400">Pulang</div><div className="font-black text-slate-700 text-xs">{row.jam_pulang||'-'}</div></div>
      </div>
      {row.penjemput_nama&&<div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">🚗 <span className="font-black text-slate-700">{row.penjemput_nama}</span></div>}
      <AbsensiActions row={row} onCheckin={onCheckin} onKet={onKet} onPulang={onPulang}/>
    </div>
  </article>;
}

function HistoryModal({siswa,onClose}){
  const[rows,setRows]=useState([]);const[loading,setLoading]=useState(true);
  const MOOD={ceria:'😊',biasa:'😐',rewel:'😢'};const MAKAN={habis:'Habis',setengah:'Setengah',tidak:'Tidak'};
  useEffect(()=>{api.dailyHistory(siswa.siswa_id,60).then(d=>{setRows(d);setLoading(false);});},[siswa.siswa_id]);
  return<div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
    <div className="bg-white rounded-t-3xl w-full max-h-[80vh] flex flex-col" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"><div><div className="font-black text-slate-800">Riwayat Laporan</div><div className="text-xs text-slate-400">{siswa.nama} · {siswa.rombel_nama}</div></div><button onClick={onClose} className="text-slate-400 text-xl">✕</button></div>
      <div className="overflow-y-auto flex-1 p-4">
        {loading?<div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/></div>:
        rows.length===0?<div className="text-center py-10 text-slate-400">Belum ada laporan tersimpan.</div>:
        <div className="space-y-3">{rows.map((l,i)=>(<div key={i} className="bg-slate-50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2"><div className="font-bold text-slate-700">{l.tanggal}</div><div className="text-xs text-slate-400">{l.updated_at?.slice(0,16).replace('T',' ')}</div></div>
          <div className="flex gap-3 flex-wrap text-sm">
            {l.mood&&<span className="px-2 py-1 bg-white rounded-lg border border-slate-200">{MOOD[l.mood]} {l.mood}</span>}
            {l.makan&&<span className="px-2 py-1 bg-white rounded-lg border border-slate-200">{MAKAN[l.makan]}</span>}
            {l.tidur===1&&<span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">💤 Tidur</span>}
            {l.tidur===0&&<span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg border border-slate-200">🙅 Tdk tidur</span>}
          </div>
          {l.aktivitas?.length>0&&<div className="text-xs text-slate-500 mt-2">{Array.isArray(l.aktivitas)?l.aktivitas.join(' · '):l.aktivitas}</div>}
          {l.catatan&&<div className="text-xs text-slate-600 mt-2 italic">"{l.catatan}"</div>}
        </div>))}</div>}
      </div>
    </div>
  </div>;
}

function Editor({row,detail,setDetail,onClose,user,toast}){
  const[comment,setComment]=useState('');const[busy,setBusy]=useState(false);const[preview,setPreview]=useState(false);
  const[edits,setEdits]=useState(null);
  const[modules,setModules]=useState([]);const[themeForm,setThemeForm]=useState({title:'',modul_ajar_id:'',activity_summary:'',suggested_domains:''});
  const[themeBusy,setThemeBusy]=useState(false);
  const activities=useMemo(()=>Array.isArray(detail.aktivitas)?detail.aktivitas:[],[detail.aktivitas]);
  const tanggal=detail.tanggal||row.tanggal;
  const cabangId=user?.cabang_id||row.cabang_id;
  useEffect(()=>{if(detail.id)api.dailyEdits(detail.id).then(setEdits).catch(()=>setEdits([]));else setEdits(null);},[detail.id]);
  useEffect(()=>{
    let alive=true;
    async function loadFocusTheme(){
      setThemeBusy(true);
      try{
        const [mods,theme]=await Promise.all([
          cabangId?api.modulAjar({cabang_id:cabangId,tanggal}).catch(()=>[]):Promise.resolve([]),
          row.rombel_id?api.focusTheme({rombel_id:row.rombel_id,tanggal}).catch(()=>null):Promise.resolve(null)
        ]);
        if(!alive)return;
        setModules(Array.isArray(mods)?mods:[]);
        const source=theme||detail;
        setThemeForm({
          title:source?.title||source?.focus_theme_title||'',
          modul_ajar_id:source?.modul_ajar_id||'',
          activity_summary:source?.activity_summary||source?.focus_theme_activity_summary||'',
          suggested_domains:themeDomains(source?.suggested_domains||source?.focus_theme_domains).join(', ')
        });
        if(theme?.id)setDetail(d=>({...d,focus_theme_id:theme.id,focus_theme_title:theme.title,focus_theme_activity_summary:theme.activity_summary||'',focus_theme_domains:theme.suggested_domains||[]}));
      }catch(e){toast('err',e.message);}
      finally{if(alive)setThemeBusy(false);}
    }
    loadFocusTheme();
    return()=>{alive=false;};
  },[row.rombel_id,tanggal,cabangId]);
  function update(k,v){setDetail(d=>({...d,[k]:v}));}
  function updateTheme(k,v){setThemeForm(f=>({...f,[k]:v}));}
  function buildDailyPayload(extra={}){
    return {...detail,siswa_id:row.siswa_id,tanggal,focus_theme_id:detail.focus_theme_id||row.focus_theme_id||null,structured_observation:detail.structured_observation||{},...extra};
  }
  async function tap(field,value){setBusy(true);try{const payload=buildDailyPayload({[field]:value});const r=await api.saveDaily(payload);if(!detail.id&&r.id){const d=await api.dailyDetail(r.id).catch(()=>null);if(d)setDetail(prev=>({...prev,...d,focus_theme_id:d.focus_theme_id||prev.focus_theme_id,focus_theme_title:d.focus_theme_title||prev.focus_theme_title,focus_theme_domains:d.focus_theme_domains?.length?d.focus_theme_domains:prev.focus_theme_domains}));}else{setDetail(prev=>({...prev,[field]:value}));}if(detail.id)api.dailyEdits(detail.id).then(setEdits).catch(()=>{});}catch(e){toast('err',e.message);}finally{setBusy(false);}}
  async function saveTheme(){
    const title=themeForm.title.trim();
    if(!title){toast('err','Judul Focus Theme wajib diisi');return;}
    if(!row.rombel_id||!cabangId){toast('err','Rombel atau cabang tidak ditemukan');return;}
    setThemeBusy(true);
    try{
      const payload={cabang_id:cabangId,rombel_id:row.rombel_id,tanggal,modul_ajar_id:themeForm.modul_ajar_id||null,title,activity_summary:themeForm.activity_summary.trim(),suggested_domains:themeDomains(themeForm.suggested_domains)};
      const r=await api.saveFocusTheme(payload);
      const fresh=await api.focusTheme({rombel_id:row.rombel_id,tanggal}).catch(()=>({...payload,id:r.id}));
      setDetail(d=>({...d,focus_theme_id:fresh.id,focus_theme_title:fresh.title,focus_theme_activity_summary:fresh.activity_summary||'',focus_theme_domains:fresh.suggested_domains||[]}));
      const saved=await api.saveDaily(buildDailyPayload({focus_theme_id:fresh.id})).catch(()=>null);
      if(saved?.id&&!detail.id){const d=await api.dailyDetail(saved.id).catch(()=>null);if(d)setDetail(prev=>({...prev,...d,focus_theme_id:fresh.id,focus_theme_title:fresh.title,focus_theme_activity_summary:fresh.activity_summary||'',focus_theme_domains:fresh.suggested_domains||[]}));}
      toast('ok','Focus Theme tersimpan');
    }catch(e){toast('err',e.message);}
    finally{setThemeBusy(false);}
  }
  async function publish(){try{const id=detail.id;if(!id){toast('err','Simpan dulu sebelum kirim');return;}await api.publishDaily(id);toast('ok','Daily record dikirim ke wali');const d=await api.dailyDetail(id);setDetail(d);}catch(e){toast('err',e.message);}}
  async function sendComment(){try{await api.commentDaily(detail.id,comment);setComment('');setDetail(await api.dailyDetail(detail.id));}catch(e){toast('err',e.message);}}
  async function upload(file){try{if(!detail.id){toast('err','Simpan dulu sebelum upload foto');return;}await api.uploadDailyPhoto(detail.id,file);setDetail(await api.dailyDetail(detail.id));toast('ok','Foto ditambahkan');}catch(e){toast('err',e.message);}}
  async function deletePhoto(attId){try{await api.deleteDailyPhoto(detail.id,attId);setDetail(await api.dailyDetail(detail.id));toast('ok','Foto dihapus');}catch(e){toast('err',e.message);}}
  async function copyFormal(){const t=formalText(detail,row.nama);if(!t)return;try{await navigator.clipboard.writeText(t);toast('ok','Laporan disalin');}catch{toast('err','Gagal menyalin');}}
  const pct=completeness(detail);
  const formal=formalText(detail,row.nama);
  const required=[
    {label:'Focus Theme',ok:!!detail.focus_theme_id},
    {label:'Mood',ok:!!detail.mood},
    {label:'Makan',ok:!!detail.makan},
    {label:'Tidur',ok:detail.tidur!==null&&detail.tidur!==undefined},
    {label:'Domain',ok:!!detail.observation_domain},
    {label:'Observasi',ok:noteOk(detail.observation_note)}
  ];
  if(preview)return <section className="bg-white border border-slate-200 rounded-2xl p-4">
    <div className="flex justify-between gap-3 mb-4"><h2 className="text-lg font-black text-slate-900">Preview Tampilan Wali</h2><div className="flex gap-2"><button onClick={()=>setPreview(false)} className="btn-secondary">Kembali Edit</button><button onClick={onClose} className="link">Tutup</button></div></div>
    <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 max-w-lg mx-auto space-y-4">
      <div><div className="font-black text-slate-900 text-lg">{row.nama}</div><div className="text-sm text-slate-500">{detail.tanggal||row.tanggal}</div></div>
      {detail.focus_theme_title&&<div><div className="text-xs text-slate-500 mb-1">Focus Theme</div><div className="bg-white rounded-xl p-3 text-sm text-slate-700"><div className="font-black text-slate-900">{detail.focus_theme_title}</div>{detail.focus_theme_activity_summary&&<div className="mt-1 text-slate-600">{detail.focus_theme_activity_summary}</div>}</div></div>}
      <div className="grid grid-cols-3 gap-3"><div className="bg-white rounded-xl p-3 text-center"><div className="text-xs text-slate-500">Mood</div><div className="font-black text-slate-800">{detail.mood||'-'}</div></div><div className="bg-white rounded-xl p-3 text-center"><div className="text-xs text-slate-500">Makan</div><div className="font-black text-slate-800">{detail.makan||'-'}</div></div><div className="bg-white rounded-xl p-3 text-center"><div className="text-xs text-slate-500">Tidur</div><div className="font-black text-slate-800">{detail.tidur?'Ya':'Tidak'}</div></div></div>
      {detail.observation_note&&<div><div className="text-xs text-slate-500 mb-1">Observasi Anak</div><div className="bg-white rounded-xl p-3 text-sm text-slate-700"><span className="font-black text-slate-900">{detail.observation_domain||'Observasi'}: </span>{detail.observation_note}</div></div>}
      {detail.parent_note&&<div><div className="text-xs text-slate-500 mb-1">Catatan untuk wali</div><div className="bg-white rounded-xl p-3 text-sm text-slate-700">{detail.parent_note}</div></div>}
      {activities.length>0&&<div><div className="text-xs text-slate-500 mb-1">Aktivitas</div><div className="flex flex-wrap gap-1">{activities.map((a,i)=><span key={i} className="bg-white px-2 py-1 rounded-lg text-sm text-slate-700">{a}</span>)}</div></div>}
      {detail.catatan&&<div><div className="text-xs text-slate-500 mb-1">Catatan</div><div className="bg-white rounded-xl p-3 text-sm text-slate-700">{detail.catatan}</div></div>}
      {(detail.attachments||[]).length>0&&<div><div className="text-xs text-slate-500 mb-2">Foto</div><div className="grid grid-cols-3 gap-2">{(detail.attachments||[]).map(a=><img key={a.id} src={a.url} className="aspect-square object-cover rounded-xl border border-slate-200 w-full" alt="foto"/>)}</div></div>}
    </div>
  </section>;
  return <section className="bg-white border border-slate-200 rounded-2xl p-4 grid lg:grid-cols-[1.2fr_.8fr] gap-4">
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-black text-slate-900">{row.nama}</h2><CompleteBadge pct={pct}/></div><p className="text-sm text-slate-500">{row.rombel_nama} - {detail.tanggal||row.tanggal}</p></div><div className="flex gap-2">{busy&&<div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/>}<button onClick={onClose} className="link">Tutup</button></div></div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-500">FOCUS THEME</p><h3 className="font-black text-slate-900 text-sm">{detail.focus_theme_title||'Belum ada tema hari ini'}</h3>{detail.focus_theme_activity_summary&&<p className="text-xs text-slate-600 mt-1">{detail.focus_theme_activity_summary}</p>}</div>{themeBusy&&<div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0"/>}</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div><label className="label">Modul ajar</label><select value={themeForm.modul_ajar_id||''} onChange={e=>{const id=e.target.value;const m=modules.find(x=>String(x.id)===String(id));setThemeForm(f=>({...f,modul_ajar_id:id,title:f.title||m?.title||'',suggested_domains:f.suggested_domains||themeDomains(m?.suggested_domains).join(', ')}));}} className="input w-full"><option value="">Tanpa modul</option>{modules.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></div>
          <div><label className="label">Judul tema</label><input value={themeForm.title} onChange={e=>updateTheme('title',e.target.value)} className="input w-full" placeholder="Contoh: Membuat konten baik"/></div>
        </div>
        <div><label className="label">Ringkasan aktivitas</label><textarea value={themeForm.activity_summary} onChange={e=>updateTheme('activity_summary',e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" placeholder="Aktivitas inti yang menjadi rujukan observasi hari ini"/></div>
        <div><label className="label">Domain yang disarankan</label><input value={themeForm.suggested_domains} onChange={e=>updateTheme('suggested_domains',e.target.value)} className="input w-full" placeholder="Pisahkan dengan koma"/></div>
        <button onClick={saveTheme} disabled={themeBusy} className="btn-secondary w-full">{detail.focus_theme_id?'Update Focus Theme':'Simpan Focus Theme'}</button>
      </div>
      <div className="flex flex-wrap gap-1.5">{required.map(x=><span key={x.label} className={`text-[11px] px-2 py-1 rounded-full font-black ${x.ok?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{x.ok?'OK ':'Isi '}{x.label}</span>)}</div>
      <div><p className="text-xs font-black text-slate-500 mb-2">😊 MOOD HARI INI</p><div className="flex gap-2">{MOOD_OPT.map(o=><button key={o.v} onClick={()=>tap('mood',o.v)} className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${detail.mood===o.v?o.c+' text-white border-transparent':'border-slate-200 text-slate-600 hover:border-amber-300'}`}>{o.l}</button>)}</div></div>
      <div><p className="text-xs font-black text-slate-500 mb-2">🍽️ MAKAN SIANG</p><div className="flex gap-2">{MAKAN_OPT.map(o=><button key={o.v} onClick={()=>tap('makan',o.v)} className={`flex-1 py-2.5 rounded-xl font-bold text-xs border-2 transition-all ${detail.makan===o.v?o.c+' text-white border-transparent':'border-slate-200 text-slate-600 hover:border-amber-300'}`}>{o.l}</button>)}</div></div>
      <div><p className="text-xs font-black text-slate-500 mb-2">💤 TIDUR SIANG</p><div className="flex gap-2">{TIDUR_OPT.map(o=><button key={o.v} onClick={()=>tap('tidur',o.v)} className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${detail.tidur===o.v?o.c+' text-white border-transparent':'border-slate-200 text-slate-600 hover:border-amber-300'}`}>{o.l}</button>)}</div></div>
      <div><p className="text-xs font-black text-slate-500 mb-2">OBSERVASI ANAK</p><div className="flex flex-wrap gap-2">{domainOptions(detail).map(d=><button key={d} onClick={()=>tap('observation_domain',d)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${detail.observation_domain===d?'bg-slate-900 text-white border-slate-900':'border-slate-200 text-slate-600 hover:border-amber-300'}`}>{d}</button>)}</div><textarea value={detail.observation_note||''} onChange={e=>update('observation_note',e.target.value)} rows={3} placeholder="Tulis observasi objektif. Contoh: Rafi menunggu giliran saat memakai krayon dan meminta bantuan ketika tutupnya sulit dibuka." className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"/><button onClick={()=>tap('observation_note',detail.observation_note||'')} className="mt-2 w-full py-2.5 bg-slate-900 text-white font-black rounded-xl text-sm hover:bg-slate-800">Simpan Observasi</button>{detail.observation_note&&!noteOk(detail.observation_note)&&<p className="text-xs text-amber-700 mt-1">Minimal 12 karakter agar bisa dikirim.</p>}</div>
      <div><p className="text-xs font-black text-slate-500 mb-2">🎨 AKTIVITAS</p><div className="flex flex-wrap gap-2">{AKTIVITAS.map(a=>{const on=activities.includes(a);return<button key={a} onClick={()=>tap('aktivitas',on?activities.filter(x=>x!==a):[...activities,a])} className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${on?'bg-amber-500 text-white border-amber-500':'border-slate-200 text-slate-600 hover:border-amber-300'}`}>{a}</button>;})}</div></div>
      <div><p className="text-xs font-black text-slate-500 mb-2">📝 CATATAN GURU</p><textarea value={detail.catatan||''} onChange={e=>update('catatan',e.target.value)} rows={3} placeholder="Tambahkan catatan khusus untuk hari ini..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"/><button onClick={()=>tap('catatan',detail.catatan||'')} className="mt-2 w-full py-2.5 bg-amber-500 text-white font-black rounded-xl text-sm hover:bg-amber-600">Simpan Catatan</button></div>
      <div><p className="text-xs font-black text-slate-500 mb-2">CATATAN UNTUK WALI</p><textarea value={detail.parent_note||''} onChange={e=>update('parent_note',e.target.value)} rows={2} placeholder="Opsional. Info singkat yang perlu diketahui wali." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"/><button onClick={()=>tap('parent_note',detail.parent_note||'')} className="mt-2 w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-black rounded-xl text-sm hover:bg-slate-50">Simpan Catatan Wali</button></div>
      {formal&&<div className="bg-blue-50 border border-blue-200 rounded-xl p-4"><p className="text-xs font-black text-blue-600 mb-2">📄 PREVIEW LAPORAN FORMAL</p><p className="text-sm text-blue-800 leading-relaxed">{formal}</p><button onClick={copyFormal} className="mt-3 w-full py-2.5 bg-blue-600 text-white font-black rounded-xl text-sm">Copy Laporan</button></div>}
      {edits&&edits.length>0&&<div className="border-t border-slate-100 pt-3"><p className="text-xs font-bold text-slate-400 mb-2">RIWAYAT PERUBAHAN</p><div className="space-y-1 max-h-32 overflow-y-auto">{edits.map((l,i)=><div key={i} className="flex items-center gap-2 text-xs text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0"/><span>{l.created_at?.slice(0,16).replace('T',' ')} — {l.guru_nama||'Sistem'}</span></div>)}</div></div>}
      <div className="flex flex-wrap gap-2">
        <button onClick={publish} className="btn">Kirim ke Wali</button>
        <button onClick={()=>setPreview(true)} className="btn-secondary">Preview Wali</button>
        <label className="btn-secondary cursor-pointer">Tambah Foto<input type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{(detail.attachments||[]).map(a=><div key={a.id} className="relative group"><img src={a.url} className="aspect-square object-cover rounded-xl border border-slate-200 w-full" alt="foto"/><button onClick={()=>deletePhoto(a.id)} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Hapus foto">&times;</button></div>)}</div>
    </div>
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
      <h3 className="font-black text-slate-900 mb-3">Feedback</h3>
      <div className="space-y-2 max-h-80 overflow-y-auto mb-3">{(detail.comments||[]).map(c=><div key={c.id} className="bg-white rounded-xl p-3 border border-slate-200"><div className="text-xs font-black text-slate-500">{c.author_name} - {c.author_role}</div><div className="text-sm text-slate-800 mt-1">{c.body}</div></div>)}{(!detail.comments||detail.comments.length===0)&&<div className="text-sm text-slate-400">Belum ada komentar.</div>}</div>
      {detail.status==='published'&&<div className="flex gap-2"><input value={comment} onChange={e=>setComment(e.target.value)} className="input flex-1" placeholder="Balas wali"/><button onClick={sendComment} className="btn">Kirim</button></div>}
    </div>
  </section>;
}
