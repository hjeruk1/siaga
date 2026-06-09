import{useEffect,useMemo,useState}from'react';
import{api}from'../api';
import{ActionButton,Chip,CustomSelect,CustomDatePicker,LiveClock,Modal,Spinner,meniTunggu}from'../components/Shared';
import{todayWIB}from'../utils/date';
import{DoorClosed,Plus,Save,X}from'lucide-react';
const TABS=[
  {id:'monitoring',label:'Monitoring'},
  {id:'laporan',label:'Laporan'},
  {id:'keuangan',label:'Keuangan'},
  {id:'notifikasi',label:'Notifikasi'}
];

export default function KepsekView({user,toast,tab}){
  const activeTab = TABS.some(t => t.id === tab) ? tab : 'monitoring';
  const[tanggal,setTanggal]=useState(todayWIB());
  const[cabang,setCabang]=useState([]);
  const[cabangId,setCabangId]=useState(user.role==='admin'?'':user.cabang_id);
  const[rows,setRows]=useState([]);
  const[notif,setNotif]=useState([]);
  const[laporan,setLaporan]=useState(null);
  const[monitoring,setMonitoring]=useState(null);
  const[loadingMonitoring,setLoadingMonitoring]=useState(true);
  const[earlyReleases,setEarlyReleases]=useState([]);
  const[dayClose,setDayClose]=useState(null);
  const[earlyOpen,setEarlyOpen]=useState(false);
  const[closeOpen,setCloseOpen]=useState(false);
  const[earlyForm,setEarlyForm]=useState({siswa_id:'',alasan:''});
  const[actionBusy,setActionBusy]=useState(false);

  useEffect(()=>{api.cabang().then(setCabang).catch(()=>{});},[]);

  async function loadSummary(){
    const [data, notifData, laporanData] = await Promise.all([
      api.dailyToday({tanggal,cabang_id:cabangId}),
      api.notifikasi(),
      (user.role === 'admin' || cabangId) ? api.laporan({cabang_id:cabangId}).catch(() => null) : Promise.resolve(null)
    ]);
    setRows(data.rows||data);
    setNotif(notifData);
    setLaporan(laporanData);
  }
  async function loadMonitoring(){
    setLoadingMonitoring(true);
    try{
      const params={cabang_id:cabangId};
      const [monData,erData,closeData]=await Promise.all([
        api.dashboard(params),
        api.earlyRelease(params).catch(()=>null),
        api.tutupHariStatus(params).catch(()=>null)
      ]);
      setMonitoring(monData);
      setEarlyReleases(monData.earlyReleases || (Array.isArray(erData) ? erData : (erData?.rows || [])));
      setDayClose(monData.dayCloseStatus||closeData||null);
    }
    finally{setLoadingMonitoring(false);}
  }
  async function createEarlyRelease(){
    if(!earlyForm.siswa_id||!earlyForm.alasan.trim()){toast('err','Siswa dan alasan wajib diisi');return;}
    setActionBusy(true);
    try{
      await api.createEarlyRelease({siswa_id:earlyForm.siswa_id,tanggal:todayWIB(),alasan:earlyForm.alasan.trim()});
      toast('ok','Izin pulang dini dibuat');
      setEarlyOpen(false);
      setEarlyForm({siswa_id:'',alasan:''});
      await loadMonitoring();
    }catch(e){toast('err',e.message);}
    finally{setActionBusy(false);}
  }
  async function closeDay(){
    if(user.role==='admin'&&!cabangId){toast('err','Pilih cabang sebelum tutup hari');return;}
    setActionBusy(true);
    try{
      await api.tutupHari({tanggal:todayWIB(),cabang_id:cabangId});
      toast('ok','Hari operasional ditutup');
      setCloseOpen(false);
      await Promise.all([loadMonitoring(),loadSummary()]);
    }catch(e){toast('err',e.message);}
    finally{setActionBusy(false);}
  }

  useEffect(()=>{loadSummary().catch(e=>toast('err',e.message));},[tanggal,cabangId]);
  useEffect(()=>{
    if(activeTab!=='monitoring')return;
    loadMonitoring().catch(e=>toast('err',e.message));
    const eventSource = new EventSource('/api/absensi/stream');
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'absensi_changed') {
          loadMonitoring().catch(()=>{});
        }
      } catch {}
    };
    return ()=>eventSource.close();
  },[activeTab,cabangId]);

  const stat=useMemo(()=>({
    total:rows.length,
    published:rows.filter(r=>r.laporan_status==='published').length,
    draft:rows.filter(r=>r.laporan_status==='draft').length
  }),[rows]);

  const showTopControls=activeTab!=='monitoring'&&(user.role==='admin'||activeTab==='laporan');

  return <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
    {showTopControls&&<div className="flex justify-end">
      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
        {user.role==='admin'&&<CustomSelect value={cabangId} onChange={e=>setCabangId(e.target.value)} className="input h-10 min-w-0">
          <option value="">Semua cabang</option>{cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
        </CustomSelect>}
        {activeTab==='laporan'&&<CustomDatePicker value={tanggal} onChange={setTanggal} className="input h-10 min-w-0"/>}
      </div>
    </div>}

    {activeTab==='monitoring'&&<MonitoringPanel data={monitoring} loading={loadingMonitoring} earlyReleases={earlyReleases} dayClose={dayClose} canCloseDay={user.role!=='admin'||!!cabangId} cabang={cabang} cabangId={cabangId} isAdmin={user.role==='admin'} onCabangChange={setCabangId} onOpenEarly={()=>setEarlyOpen(true)} onOpenClose={()=>setCloseOpen(true)} onDeleteER={async(id)=>{try{await api.deleteEarlyRelease(id);toast('ok','Izin pulang dini dihapus');loadMonitoring();}catch(e){toast('err',e.message);}}} toast={toast}/>}
    {activeTab==='laporan'&&<LaporanPanel rows={rows} stat={stat}/>}
    {activeTab==='keuangan'&&<KeuanganPanel laporan={laporan} cabangId={cabangId}/>}
    {activeTab==='notifikasi'&&<NotifikasiPanel notif={notif}/>}
    {earlyOpen&&<Modal title="Buat Izin Pulang Dini" onClose={()=>setEarlyOpen(false)} maxWidth="max-w-lg">
      <div className="space-y-3">
        <div>
          <div className="label">Siswa</div>
          <CustomSelect value={earlyForm.siswa_id} onChange={e=>setEarlyForm(f=>({...f,siswa_id:e.target.value}))} className="input w-full">
            <option value="">Pilih siswa</option>
            {rows.map(r=><option key={r.siswa_id} value={r.siswa_id}>{r.nama} - {r.rombel_nama} - {r.cabang_nama}</option>)}
          </CustomSelect>
        </div>
        <div><div className="label">Tanggal</div><input value={todayWIB()} readOnly className="input w-full bg-slate-50 text-slate-500"/></div>
        <div><div className="label">Alasan</div><textarea value={earlyForm.alasan} onChange={e=>setEarlyForm(f=>({...f,alasan:e.target.value}))} className="input w-full min-h-24 resize-none" placeholder="Contoh: kontrol dokter, acara keluarga, dijemput lebih awal"/></div>
        <div className="flex flex-col sm:flex-row gap-2">
          <ActionButton icon={Save} onClick={createEarlyRelease} disabled={actionBusy} className="w-full sm:w-auto">{actionBusy?'Menyimpan…':'Simpan Izin'}</ActionButton>
          <ActionButton icon={X} onClick={()=>setEarlyOpen(false)} variant="ghost" className="w-full sm:w-auto">Batal</ActionButton>
        </div>
      </div>
    </Modal>}
    {closeOpen&&<Modal title="Tutup Hari Operasional" onClose={()=>setCloseOpen(false)} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          Siswa yang masih berstatus Belum akan otomatis menjadi Absen. Setelah ditutup, check-in dan perubahan keterangan untuk hari ini tidak bisa dilakukan.
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-black text-slate-400">Tanggal</div><div className="font-black text-text-main">{todayWIB()}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-black text-slate-400">Status</div><div className="font-black text-text-main">{dayClose?.closed?'Sudah ditutup':'Belum ditutup'}</div></div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <ActionButton icon={DoorClosed} onClick={closeDay} disabled={actionBusy||dayClose?.closed} variant="danger" className="w-full sm:w-auto">{actionBusy?'Menutup…':'Tutup Hari'}</ActionButton>
          <ActionButton icon={X} onClick={()=>setCloseOpen(false)} variant="ghost" className="w-full sm:w-auto">Batal</ActionButton>
        </div>
      </div>
    </Modal>}
  </div>;
}

function MonitoringPanel({data,loading,earlyReleases=[],dayClose,cabang=[],cabangId='',isAdmin=false,onCabangChange,onOpenEarly,onOpenClose,canCloseDay,onDeleteER,toast}){
  if(loading&&!data)return <section className="bg-white border border-slate-200 rounded-2xl p-4"><Spinner/></section>;
  const byKelas=data?.byKelas||[];
  const siswaAktif=data?.siswaAktif||[];
  const statusRows=data?.statusRows?.length?data.statusRows:siswaAktif;
  const totalSiswa=byKelas.reduce((s,k)=>s+Number(k.total||0),0);
  const checkedIn=statusRows.filter(s=>['Hadir','Terlambat','Menunggu','Pulang'].includes(s.status));
  const atSchool=statusRows.filter(s=>['Hadir','Terlambat','Menunggu'].includes(s.status));
  const redFlags=statusRows.filter(s=>s.status==='Menunggu'&&meniTunggu(s.jam_tunggu)>15);
  const waiting=statusRows.filter(s=>s.status==='Menunggu'&&meniTunggu(s.jam_tunggu)<=15);
  const sc=data?.statusCounts||{};
  const statusItems=[
    {label:'Hadir',value:sc.hadir||0,tone:'text-emerald-600 bg-emerald-50 border-emerald-200'},
    {label:'Terlambat',value:sc.terlambat||0,tone:'text-amber-600 bg-amber-50 border-amber-200'},
    {label:'Menunggu',value:sc.menunggu||0,tone:'text-sky-600 bg-sky-50 border-sky-200'},
    {label:'Pulang',value:sc.pulang||0,tone:'text-slate-600 bg-slate-100 border-slate-200'},
    {label:'Izin',value:sc.izin||0,tone:'text-violet-600 bg-violet-50 border-violet-200'},
    {label:'Sakit',value:sc.sakit||0,tone:'text-rose-600 bg-rose-50 border-rose-200'},
    {label:'Absen',value:sc.absen||0,tone:'text-red-600 bg-red-50 border-red-200'},
    {label:'Belum',value:sc.belum||0,tone:'text-slate-500 bg-slate-50 border-slate-200'},
  ];
  const activeStatusItems=statusItems.filter(i=>i.value>0);
  const displayStatusItems=activeStatusItems.length>0?activeStatusItems:statusItems;
  const stats=[
    {label:'Sudah Check-in',value:checkedIn.length,sub:`dari ${totalSiswa} siswa`,tone:'emerald'},
    {label:'Masih di Sekolah',value:atSchool.length,sub:'aktif di sekolah',tone:'sky'},
    {label:'Menunggu Jemput',value:waiting.length+redFlags.length,sub:'di kelas/gerbang',tone:'amber'},
    {label:'Red Flag',value:redFlags.length,sub:'> 15 menit',tone:'red'}
  ];
  const operationalActionsClass=isAdmin
    ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 w-full'
    : 'grid grid-cols-1 sm:grid-cols-2 gap-2 w-full';

  return <div className="space-y-4">
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
      <section className="bg-slate-950 text-white border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-2xl shadow-slate-950/10">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black">Monitoring Hari Ini</h2>
            <p className="text-xs sm:text-sm text-slate-400">{data?.hari_status?.nama||'Status hari'} - refresh otomatis 30 detik</p>
          </div>
          <div className="sm:text-right flex-shrink-0">
            <LiveClock className="text-2xl sm:text-3xl font-black tabular-nums text-primary"/>
            <div className="text-xs text-slate-500">{new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
          </div>
        </div>
        {data?.libur&&<div className="rounded-xl border border-red-500/40 bg-red-900/20 text-red-100 px-3 py-2.5 mb-3 text-sm font-bold">Hari ini libur. Aktivitas siswa aktif tidak ditampilkan.</div>}
        {redFlags.length>0&&<div className="rounded-xl border border-red-500/50 bg-red-900/20 px-3 py-2.5 mb-3">
          <div className="font-black text-red-200">{redFlags.length} anak menunggu lebih dari 15 menit</div>
          <div className="text-xs text-red-100 mt-1">{redFlags.map(s=>`${s.nama} (${s.kelas}) ${meniTunggu(s.jam_tunggu)} menit`).join(' | ')}</div>
        </div>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map(s=><StatCard key={s.label} {...s}/>)}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(250px,1.1fr)] gap-3 items-start">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Operasional Hari Ini</div>
            <div className="mt-1 text-sm font-bold text-text-main">{dayClose?.closed?'Hari sudah ditutup':'Hari masih berjalan'}</div>
            {!canCloseDay&&<div className="text-xs text-slate-500 mt-0.5">Pilih cabang dulu untuk menutup hari.</div>}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Ringkasan Status Hari Ini</div>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {displayStatusItems.map(s=>(
                  <span key={s.label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${s.tone}`}>
                    <span className="font-black tabular-nums">{s.value}</span>
                    <span className="opacity-70">{s.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className={operationalActionsClass}>
            {isAdmin&&<CustomSelect value={cabangId} onChange={e=>onCabangChange?.(e.target.value)} className="input w-full sm:col-span-2">
              <option value="">Semua cabang</option>{cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
            </CustomSelect>}
            <ActionButton icon={Plus} onClick={onOpenEarly} className="w-full">Izin Pulang Dini</ActionButton>
            <ActionButton icon={DoorClosed} onClick={onOpenClose} disabled={!canCloseDay||dayClose?.closed} variant={dayClose?.closed?'ghost':'secondary'} className="w-full">{dayClose?.closed?'Sudah Ditutup':'Tutup Hari'}</ActionButton>
          </div>
        </div>
      </section>
    </div>

    {(redFlags.length>0||waiting.length>0)&&<section className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-3 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
      <div>
        <div className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Perlu Perhatian</div>
        <div className="text-sm font-bold text-text-main mt-0.5">Siswa yang menunggu penjemput atau melewati batas waktu.</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {redFlags.length>0&&<div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
            <span className="text-xs font-black text-red-600">Red Flag ({redFlags.length})</span>
          </div>
          {redFlags.map(s=>{
            const menit=meniTunggu(s.jam_tunggu);
            return <div key={s.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
              {s.foto?<img src={s.foto} alt={s.nama} className="w-9 h-9 rounded-full object-cover flex-shrink-0"/>:<div className="w-9 h-9 rounded-full bg-red-100 text-red-600 grid place-items-center font-black flex-shrink-0 text-sm">{s.nama?.[0]||'S'}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-text-main truncate">{s.nama}</div>
                <div className="text-xs text-slate-500 truncate">{s.kelas}{s.nama_penjemput?` - ${s.nama_penjemput}`:''}</div>
              </div>
              <span className="text-xs font-black text-red-600 tabular-nums flex-shrink-0">{menit}m</span>
            </div>;
          })}
        </div>}
        {waiting.length>0&&<div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"/>
            <span className="text-xs font-black text-amber-600">Menunggu Jemput ({waiting.length})</span>
          </div>
          {waiting.map(s=>{
            const menit=meniTunggu(s.jam_tunggu);
            return <div key={s.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
              {s.foto?<img src={s.foto} alt={s.nama} className="w-9 h-9 rounded-full object-cover flex-shrink-0"/>:<div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 grid place-items-center font-black flex-shrink-0 text-sm">{s.nama?.[0]||'S'}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-text-main truncate">{s.nama}</div>
                <div className="text-xs text-slate-500 truncate">{s.kelas}{s.nama_penjemput?` - ${s.nama_penjemput}`:''}</div>
              </div>
              <span className="text-xs font-black text-amber-600 tabular-nums flex-shrink-0">{menit}m</span>
            </div>;
          })}
        </div>}
      </div>
    </section>}

    <StatusBoard rows={statusRows}/>

    {earlyReleases.length>0&&<section className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Pulang Dini ({earlyReleases.length})</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {earlyReleases.map(er=>(
          <div key={er.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-text-main truncate">{er.siswa_nama||er.nama||`Siswa #${er.siswa_id}`}</div>
              <div className="text-xs text-slate-500 truncate">{er.cabang_nama?`${er.cabang_nama} - `:''}{er.kelas_nama||er.rombel_nama||''}{er.alasan?` - ${er.alasan}`:''}</div>
            </div>
            {onDeleteER&&<button onClick={()=>onDeleteER(er.id)} className="text-xs text-red-500 hover:text-red-700 font-bold flex-shrink-0 px-2 py-1 rounded hover:bg-red-50" title="Hapus izin">Hapus</button>}
          </div>
        ))}
      </div>
    </section>}

    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {byKelas.map(k=><RombelCard key={k.id} item={k} siswa={siswaAktif.filter(s=>Number(s.rombel_id)===Number(k.id))}/>)}
      {byKelas.length===0&&<div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center text-sm font-bold text-slate-400 sm:col-span-2 lg:col-span-3 xl:col-span-5">Belum ada rombel aktif untuk ditampilkan.</div>}
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
  return <div className={`bg-white/5 border ${toneMap[tone]} rounded-xl p-2.5`}>
    <div className="text-2xl font-black leading-none">{value}</div>
    <div className="text-white text-[13px] font-bold mt-1 leading-tight">{label}</div>
    <div className="text-slate-500 text-[11px] leading-tight mt-0.5">{sub}</div>
  </div>;
}

function RombelCard({item,siswa}){
  const total=Number(item.total||0);
  const hadir=Number(item.hadir||0),menunggu=Number(item.menunggu||0),pulang=Number(item.pulang||0);
  const isEmpty=siswa.length===0;
  return <div className={`bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col shadow-[0_18px_60px_rgba(15,23,42,.05)] ${isEmpty?'':'min-h-[360px]'}`}>
    <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-black text-text-main truncate">{item.kelas}</div>
        <div className="text-xs text-slate-500 truncate">{item.cabang} - {item.guru||'-'}</div>
      </div>
      <div className="text-right flex-shrink-0"><div className="text-2xl font-black text-primary">{hadir+menunggu+pulang}</div><div className="text-xs text-slate-400">/ {total}</div></div>
    </div>
    <div className="flex h-1.5 mx-4 mt-3 rounded-full overflow-hidden bg-slate-100">
      <div className="bg-emerald-500" style={{width:total?(hadir/total*100)+'%':'0%'}}/>
      <div className="bg-primary" style={{width:total?(menunggu/total*100)+'%':'0%'}}/>
      <div className="bg-slate-400" style={{width:total?(pulang/total*100)+'%':'0%'}}/>
    </div>
    {isEmpty
      ? <div className="px-4 py-2.5 text-xs text-slate-400 text-center">Tidak ada siswa aktif</div>
      : <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 max-h-72 custom-scrollbar">
          {siswa.map(s=>{
            const menit=meniTunggu(s.jam_tunggu);
            const red=s.status==='Menunggu'&&menit>15;
            const meta=[s.nama_penjemput,s.jam_masuk?`Masuk ${s.jam_masuk}`:null,s.jam_tunggu?`Tunggu ${s.jam_tunggu}`:null].filter(Boolean).join(' - ');
            return <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${red?'bg-red-50 border-red-200':'bg-slate-50 border-slate-100'}`}>
              {s.foto?<img src={s.foto} alt={s.nama} className="w-9 h-9 rounded-full object-cover flex-shrink-0"/>:<div className="w-9 h-9 rounded-full bg-primary-container text-primary-active grid place-items-center font-black flex-shrink-0">{s.nama?.[0]||'S'}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-text-main truncate">{s.nama}</div>
                {meta&&<div className="text-xs text-slate-500 truncate">{meta}</div>}
              </div>
              {red?<span className="text-xs font-black text-red-600">{menit}m</span>:<Chip status={s.status} manual={s.manual}/>}
            </div>;
          })}
        </div>
    }
    <div className="grid grid-cols-3 border-t border-slate-100 text-center">
      <MiniStat label="Hadir" value={hadir} tone="text-emerald-600"/>
      <MiniStat label="Tunggu" value={menunggu} tone="text-primary-active"/>
      <MiniStat label="Pulang" value={pulang} tone="text-slate-500"/>
    </div>
  </div>;
}

function MiniStat({label,value,tone}){return <div className="py-2"><div className={`text-lg font-black ${tone}`}>{value}</div><div className="text-xs text-slate-400">{label}</div></div>;}

function StatusBoard({rows=[],compact=false}){
  const groups=[
    {title:'Di Sekolah',tone:'border-emerald-200 bg-emerald-50',statuses:['Hadir','Terlambat']},
    {title:'Menunggu',tone:'border-amber-200 bg-amber-50',statuses:['Menunggu']},
    {title:'Belum Check-in',tone:'border-slate-200 bg-slate-50',statuses:['Belum']},
    {title:'Tidak Masuk',tone:'border-red-200 bg-red-50',statuses:['Izin','Sakit','Absen']},
    {title:'Sudah Pulang',tone:'border-slate-200 bg-white',statuses:['Pulang']}
  ].map(g=>({...g,items:rows.filter(r=>g.statuses.includes(r.status))}));
  const groupGridClass=compact
    ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 xl:max-h-[300px] xl:overflow-y-auto xl:overscroll-contain xl:pr-1 custom-scrollbar'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2';
  const itemListClass=compact
    ? 'space-y-1.5 max-h-40 overflow-y-auto overscroll-contain pr-1 custom-scrollbar'
    : 'space-y-1.5 max-h-72 overflow-y-auto overscroll-contain pr-1 custom-scrollbar';
  return <section className={`bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)] ${compact?'h-full':''}`}>
    <div className="flex items-center justify-between gap-2 mb-3">
      <div>
        <div className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Status Board</div>
        <div className="text-xs sm:text-sm font-bold text-text-main mt-0.5">Detail siswa per status dan jam aktivitas.</div>
      </div>
    </div>
    <div className={groupGridClass}>
      {groups.map(g=><div key={g.title} className={`rounded-xl border ${g.tone} p-2.5 min-w-0 flex flex-col`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-black text-text-main truncate">{g.title}</div>
          <div className="text-xs font-black text-slate-500 tabular-nums">{g.items.length}</div>
        </div>
        <div className={itemListClass}>
          {g.items.map(s=><StudentStatusRow key={`${g.title}-${s.id}`} item={s}/>)}
          {g.items.length===0&&<div className="rounded-lg border border-dashed border-white/70 bg-white/50 px-2 py-3 text-center text-[11px] font-bold text-slate-400">Kosong</div>}
        </div>
      </div>)}
    </div>
  </section>;
}

function StudentStatusRow({item}){
  const time=item.status==='Menunggu'?item.jam_tunggu:item.status==='Pulang'?item.jam_pulang:item.jam_masuk;
  const note=time?`${item.status} ${time}`:(item.catatan||item.status||'Belum');
  return <div className="rounded-lg bg-white/80 border border-white/70 px-2 py-1.5 min-w-0">
    <div className="text-xs font-black text-text-main truncate">{item.nama}</div>
    <div className="text-[11px] text-slate-500 truncate">{item.kelas||item.rombel_nama||'-'} - {note}</div>
  </div>;
}

function LaporanPanel({rows,stat}){
  const getStatusLabel = (status) => {
    if (status === 'published') return 'Published';
    if (status === 'draft') return 'Draft';
    return 'Belum';
  };
  const getStatusTone = (status) => {
    if (status === 'published') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'draft') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-400 border-slate-200';
  };

  return <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div><h2 className="font-black text-text-main text-lg">Laporan Daily Record</h2><p className="text-sm text-slate-500">Progress publish laporan harian per siswa.</p></div>
      <div className="text-sm font-black text-slate-500 bg-slate-50 px-3 py-1 border border-slate-200 rounded-full w-fit">{stat.published}/{stat.total} published</div>
    </div>
    <div className="grid grid-cols-3 gap-2 mb-4">
      <CompactStat label="Siswa" value={stat.total}/>
      <CompactStat label="Published" value={stat.published}/>
      <CompactStat label="Draft/Belum" value={stat.total-stat.published}/>
    </div>
    
    {/* Desktop view table */}
    <div className="hidden sm:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {['Siswa','Cabang','Rombel','Paket','Status'].map(h=><th key={h} className="text-left bg-slate-50 px-3 py-2 text-slate-500 font-black">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.siswa_id} className="border-t border-slate-100">
              <td className="td font-bold text-text-main">{r.nama}</td>
              <td className="td">{r.cabang_nama}</td>
              <td className="td">{r.rombel_nama}</td>
              <td className="td capitalize">{r.paket}</td>
              <td className="td">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusTone(r.laporan_status)}`}>
                  {getStatusLabel(r.laporan_status)}
                </span>
              </td>
            </tr>
          ))}
          {rows.length===0&&<tr><td colSpan={5} className="td text-center py-8 text-slate-400 font-bold">Belum ada data laporan.</td></tr>}
        </tbody>
      </table>
    </div>

    {/* Mobile view cards */}
    <div className="sm:hidden space-y-3">
      {rows.map(r=>(
        <div key={r.siswa_id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-text-main truncate">{r.nama}</div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusTone(r.laporan_status)}`}>
              {getStatusLabel(r.laporan_status)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-500 border-t border-slate-200/60 pt-2">
            <div><span className="font-semibold text-slate-400">Cabang:</span> {r.cabang_nama}</div>
            <div><span className="font-semibold text-slate-400">Rombel:</span> {r.rombel_nama}</div>
            <div className="col-span-2"><span className="font-semibold text-slate-400">Paket:</span> <span className="capitalize">{r.paket}</span></div>
          </div>
        </div>
      ))}
      {rows.length===0&&<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">Belum ada data laporan.</div>}
    </div>
  </section>;
}

function KeuanganPanel({laporan,cabangId}){
  if(!laporan)return <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]"><Spinner/></section>;
  return <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
    <div className="mb-3">
      <div className="inline-flex rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">Keuangan</div>
      <h2 className="mt-2 font-black text-text-main text-lg">Laporan Keuangan {!cabangId && '(Semua Cabang)'}</h2>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <Card label="Total Tagihan" value={money(laporan.summary.total_nominal)}/>
      <Card label="Sudah Dibayar" value={money(laporan.summary.total_paid)}/>
      <Card label="Lunas" value={laporan.summary.count_lunas}/>
      <Card label="Tunggakan" value={`${laporan.summary.count_outstanding} (${money(laporan.summary.total_outstanding)})`}/>
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <FinanceTable title="Per Jenis" rows={laporan.by_jenis} first="jenis"/>
      <FinanceTable title="Per Periode" rows={laporan.by_periode} first="periode"/>
    </div>
  </section>;
}

function FinanceTable({title,rows,first}){
  return <div>
    <h3 className="font-black text-text-main mb-2">{title}</h3>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left bg-slate-50 px-3 py-2 text-slate-500 font-black">{first==='jenis'?'Jenis':'Periode'}</th>
            <th className="text-right bg-slate-50 px-3 py-2 text-slate-500 font-black">Jumlah</th>
            <th className="text-right bg-slate-50 px-3 py-2 text-slate-500 font-black">Total</th>
            <th className="text-right bg-slate-50 px-3 py-2 text-slate-500 font-black">Lunas</th>
            <th className="text-right bg-slate-50 px-3 py-2 text-slate-500 font-black">Tunggakan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r[first]} className="border-t border-slate-100">
              <td className="td text-left">{r[first]}</td>
              <td className="td text-right tabular-nums">{r.count}</td>
              <td className="td text-right tabular-nums">{money(r.total)}</td>
              <td className="td text-right tabular-nums">{money(r.lunas)}</td>
              <td className="td text-right tabular-nums">{money(r.outstanding)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}

function NotifikasiPanel({notif}){
  const [limit, setLimit] = useState(12);
  return <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
    <div className="mb-3">
      <div className="inline-flex rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">Inbox</div>
      <h2 className="mt-2 font-black text-text-main text-lg">Notifikasi Saya</h2>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{notif.slice(0,limit).map(n=><div key={n.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3"><div className="font-bold text-text-main">{n.title}</div><div className="text-sm text-slate-500 mt-1 leading-relaxed">{n.body||n.tipe}</div></div>)}{notif.length===0&&<div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">Belum ada notifikasi.</div>}</div>
    {notif.length > limit && (
      <div className="mt-4 text-center">
        <button
          onClick={() => setLimit(prev => prev + 12)}
          className="px-4 py-2 text-sm font-bold text-primary hover:text-primary-active bg-primary-container hover:bg-primary-container-active rounded-xl transition"
        >
          Lihat Lebih Banyak ({notif.length - limit} tersisa)
        </button>
      </div>
    )}
  </section>;
}

function Card({label,value}){return <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4"><div className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wider">{label}</div><div className="text-2xl sm:text-3xl font-black text-text-main mt-0.5 tabular-nums">{value}</div></div>;}
function CompactStat({label,value}){return <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 sm:px-3"><div className="truncate text-[9px] font-black uppercase tracking-wider text-slate-500 sm:text-[10px]">{label}</div><div className="mt-0.5 truncate text-xl font-black tabular-nums text-text-main sm:text-2xl">{value}</div></div>;}
function money(v){return 'Rp '+Number(v||0).toLocaleString('id-ID');}
