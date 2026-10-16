import{useEffect,useMemo,useState}from'react';
import{api}from'../../api';
import{ActionButton,Modal,EmptyState}from'../../components/Shared';
import{Banknote,Check,ChevronDown,Clock,CreditCard,FileText,Loader2,Pencil,Save,Settings,Users,Wallet,X}from'lucide-react';
import{useMaster,CabangFilter,Panel,Input}from'./shared';

export default function ConfigTab({user,toast}){
  const m=useMaster(user,{autoDefaultCabang:true});const[cfg,setCfg]=useState([]);const[org,setOrg]=useState(null);const[orgOpen,setOrgOpen]=useState(false);const[savingJenjang,setSavingJenjang]=useState(null);const[openJenjang,setOpenJenjang]=useState({});
  useEffect(()=>{if(m.cabangId||user.role!=='admin')api.operasionalConfig(m.cabangId).then(setCfg).catch(e=>toast('err',e.message));},[m.cabangId]);
  useEffect(()=>{if(user.role==='admin')api.organisasi().then(setOrg).catch(()=>{});},[]);
  const cfgGroups=useMemo(()=>{
    const map=new Map();
    cfg.forEach(row=>{
      const key=String(row.jenjang_id);
      if(!map.has(key))map.set(key,{key,jenjang_id:row.jenjang_id,jenjang_nama:row.jenjang_nama,jenjang_tipe:row.jenjang_tipe,rows:[]});
      map.get(key).rows.push(row);
    });
    return [...map.values()];
  },[cfg]);
  const selectedCabang=m.cabang.find(c=>String(c.id)===String(m.cabangId));
  const dueTime=cfg[0]?.daily_record_due_time||'-';
  function rowFor(group,paket){return group.rows.find(r=>r.paket===paket);}
  function toggleJenjang(key){setOpenJenjang(state=>({...state,[key]:!state[key]}));}
  function updateJenjang(jenjangId,field,value){
    setCfg(rows=>rows.map(row=>{
      if(String(row.jenjang_id)!==String(jenjangId))return row;
      if(field==='jam_masuk')return{...row,jam_masuk:value};
      if(field==='jam_pulang_reguler')return row.paket==='reguler'?{...row,jam_pulang:value}:row;
      if(field==='jam_pulang_full_day')return row.paket==='full_day'?{...row,jam_pulang:value}:row;
      if(field==='jam_pulang_care')return row.paket==='care'?{...row,jam_pulang:value}:row;
      return{...row,[field]:value};
    }));
  }
  async function saveGroup(group){
    const rows=cfg.filter(row=>String(row.jenjang_id)===String(group.jenjang_id));
    if(rows.length===0)return;
    try{
      setSavingJenjang(group.key);
      await Promise.all(rows.map(row=>api.updateOperasionalConfig(row.id,row)));
      toast('ok',`Konfigurasi ${group.jenjang_nama} disimpan`);
    }catch(e){toast('err',e.message);}
    finally{setSavingJenjang(null);}
  }
  async function saveOrg(){try{await api.updateOrganisasi(org);toast('ok','Data Taruna Prima disimpan');setOrgOpen(false);}catch(e){toast('err',e.message);}}
  return <div className="space-y-6">
    <Panel title="Konfigurasi Operasional" right={<CabangFilter user={user} {...m}/>}>
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ConfigStat icon={Settings} label="Cabang" value={selectedCabang?.kode||selectedCabang?.nama||'-'}/>
        <ConfigStat icon={Users} label="Jenjang" value={cfgGroups.length}/>
        <ConfigStat icon={CreditCard} label="Paket" value={cfg.length}/>
        <ConfigStat icon={Clock} label="Batas laporan" value={dueTime}/>
      </div>
      {cfgGroups.length===0?<EmptyState icon="settings" title="Pilih cabang untuk melihat konfigurasi" description="Konfigurasi operasional akan muncul sebagai kartu jenjang."/>:
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{cfgGroups.map(group=>{
        const regular=rowFor(group,'reguler'),fullDay=rowFor(group,'full_day'),care=rowFor(group,'care'),base=regular||fullDay||care||group.rows[0];
        const isOpen=!!openJenjang[group.key];
        return <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-sm sm:p-4">
        <button type="button" onClick={()=>toggleJenjang(group.key)} className="block w-full p-4 text-left sm:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-lg font-black text-text-main">{group.jenjang_nama}</div>
                <span className="rounded-full border border-primary/15 bg-primary-container px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary-active">Jenjang</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">{group.rows.map(row=><span key={row.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">{CONFIG_PACKAGE_LABELS[row.paket]||row.paket}</span>)}</div>
            </div>
            <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${isOpen?'rotate-180':''}`}/>
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ConfigTimeSummary label="Masuk" value={base?.jam_masuk||'-'}/>
            <ConfigTimeSummary label="Reguler" value={regular?.jam_pulang||'-'}/>
            <ConfigTimeSummary label="Fullday" value={fullDay?.jam_pulang||care?.jam_pulang||'-'}/>
          </div>
        </button>
        <div className="hidden flex-col gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-lg font-black text-text-main">{group.jenjang_nama}</div>
              <span className="rounded-full border border-primary/15 bg-primary-container px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary-active">Jenjang</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">{group.rows.map(row=><span key={row.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">{CONFIG_PACKAGE_LABELS[row.paket]||row.paket}</span>)}</div>
          </div>
        </div>
        <div className={`${isOpen?'block':'hidden'} border-t border-slate-100 p-4 pt-3 sm:block sm:border-t-0 sm:p-0`}>
          <div className="grid gap-3 sm:mt-4 sm:grid-cols-3">
            <ConfigTimeField label="Waktu masuk" value={base?.jam_masuk||''} onChange={v=>updateJenjang(group.jenjang_id,'jam_masuk',v)}/>
            {regular&&<ConfigTimeField label="Pulang reguler" value={regular.jam_pulang||''} onChange={v=>updateJenjang(group.jenjang_id,'jam_pulang_reguler',v)}/>}
            {fullDay&&<ConfigTimeField label="Pulang fullday" value={fullDay.jam_pulang||''} onChange={v=>updateJenjang(group.jenjang_id,'jam_pulang_full_day',v)}/>}
            {!regular&&!fullDay&&care&&<ConfigTimeField label="Pulang care" value={care.jam_pulang||''} onChange={v=>updateJenjang(group.jenjang_id,'jam_pulang_care',v)}/>}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3">
              <ConfigTimeField label="Batas publish" value={base?.daily_record_due_time||''} onChange={v=>updateJenjang(group.jenjang_id,'daily_record_due_time',v)}/>
              <div className="grid gap-2 sm:grid-cols-2">
                <ConfigSwitch label="Hitung terlambat" hint="Absensi lewat waktu masuk ditandai terlambat." checked={!!base?.hitung_terlambat} onChange={v=>updateJenjang(group.jenjang_id,'hitung_terlambat',v?1:0)}/>
                <ConfigSwitch label="Pakai kalender" hint="Libur dan masuk khusus mengikuti kalender." checked={!!base?.pakai_kalender} onChange={v=>updateJenjang(group.jenjang_id,'pakai_kalender',v?1:0)}/>
                <ConfigSwitch label="Daily record wajib" hint="Laporan harian masuk checklist kelengkapan." checked={!!base?.daily_record_wajib} onChange={v=>updateJenjang(group.jenjang_id,'daily_record_wajib',v?1:0)}/>
                <ConfigSwitch label="Pickup fleksibel" hint="Penjemputan boleh sebelum jam pulang." checked={!!base?.pickup_fleksibel} onChange={v=>updateJenjang(group.jenjang_id,'pickup_fleksibel',v?1:0)}/>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <ActionButton icon={savingJenjang===group.key?Loader2:Save} onClick={()=>saveGroup(group)} disabled={savingJenjang===group.key} className="w-full sm:w-auto">{savingJenjang===group.key?'Menyimpan':'Simpan'}</ActionButton>
          </div>
        </div>
      </div>;
      })}</div>}
    </Panel>
    {user.role==='admin'&&org&&<Panel title="Data Taruna Prima & Rekening">
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container text-primary-active"><FileText className="h-5 w-5"/></div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Identitas Taruna Prima</div>
              <div className="truncate text-base font-black text-text-main">{org.nama||'Belum diisi'}</div>
              <div className="mt-1 line-clamp-2 text-sm font-medium text-slate-500">{org.alamat||'Alamat Taruna Prima belum diatur'}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container text-primary-active"><Wallet className="h-5 w-5"/></div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rekening pembayaran</div>
              <div className="truncate text-base font-black text-text-main">{org.rekening_bank||'Bank belum diisi'}</div>
              <div className="mt-1 truncate text-sm font-medium text-slate-500">{org.rekening_nomor||'-'} {org.rekening_nama?`a.n. ${org.rekening_nama}`:''}</div>
            </div>
          </div>
        </div>
        <ActionButton icon={Pencil} onClick={()=>setOrgOpen(true)} className="w-full lg:w-auto">Edit Data</ActionButton>
      </div>
    </Panel>}
    {orgOpen&&org&&<Modal title="Data Taruna Prima & Rekening" onClose={()=>setOrgOpen(false)} maxWidth="max-w-3xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-black text-text-main"><FileText className="h-4 w-4 text-primary"/>Identitas Taruna Prima</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ConfigTextField label="Nama lembaga" value={org.nama||''} onChange={v=>setOrg(o=>({...o,nama:v}))}/>
              <ConfigTextField label="Kontak" value={org.kontak||''} onChange={v=>setOrg(o=>({...o,kontak:v}))}/>
              <ConfigTextField label="Alamat" value={org.alamat||''} onChange={v=>setOrg(o=>({...o,alamat:v}))} className="sm:col-span-2"/>
            </div>
          </div>
          <div className="space-y-3 border-t border-slate-100 pt-5">
            <div className="flex items-center gap-2 text-sm font-black text-text-main"><Banknote className="h-4 w-4 text-primary"/>Rekening pembayaran</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ConfigTextField label="Nama bank" value={org.rekening_bank||''} onChange={v=>setOrg(o=>({...o,rekening_bank:v}))}/>
              <ConfigTextField label="Nomor rekening" value={org.rekening_nomor||''} onChange={v=>setOrg(o=>({...o,rekening_nomor:v}))}/>
              <ConfigTextField label="Nama pemilik rekening" value={org.rekening_nama||''} onChange={v=>setOrg(o=>({...o,rekening_nama:v}))} className="sm:col-span-2"/>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Preview invoice</div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-base font-black text-text-main">{org.nama||'Taruna Prima'}</div>
            <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{org.alamat||'Alamat Taruna Prima'}</div>
            <div className="mt-4 border-t border-dashed border-slate-200 pt-4">
              <div className="text-xs font-black text-slate-400 uppercase">Transfer ke</div>
              <div className="mt-1 text-sm font-black text-text-main">{org.rekening_bank||'Bank'}</div>
              <div className="text-lg font-black text-primary-active">{org.rekening_nomor||'0000000000'}</div>
              <div className="text-xs font-semibold text-slate-500">{org.rekening_nama||'Nama pemilik rekening'}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:col-span-2">
          <ActionButton icon={X} variant="ghost" onClick={()=>setOrgOpen(false)} className="w-full sm:w-auto">Batal</ActionButton>
          <ActionButton icon={Save} onClick={saveOrg} className="w-full sm:w-auto">Simpan Data</ActionButton>
        </div>
      </div>
    </Modal>}
  </div>;
}

const CONFIG_PACKAGE_LABELS={reguler:'Reguler',full_day:'Fullday',care:'Care'};

export function ConfigStat({icon:Icon,label,value}){
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{Icon&&<Icon className="h-3.5 w-3.5"/>}{label}</div>
    <div className="mt-1 truncate text-lg font-black text-text-main">{value}</div>
  </div>;
}

export function ConfigTimeSummary({label,value}){
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
    <div className="truncate text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div>
    <div className="mt-0.5 truncate text-sm font-black text-text-main">{value}</div>
  </div>;
}

export function ConfigTimeField({label,value,onChange,disabled=false}){
  return <label className="block min-w-0">
    <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
    <div className="relative">
      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
      <Input type="time" value={value||''} onChange={onChange} disabled={disabled} className="h-10 pl-9 font-black text-text-main disabled:bg-slate-100 disabled:text-slate-400"/>
    </div>
  </label>;
}

export function ConfigTextField({label,value,onChange,className=''}) {
  return <label className={`block min-w-0 ${className}`}>
    <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
    <Input value={value} onChange={onChange} className="h-10 font-semibold text-text-main"/>
  </label>;
}

export function ConfigSwitch({label,hint,checked,onChange}){
  return <button type="button" onClick={()=>onChange(!checked)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.99] ${checked?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-white hover:border-primary/30'}`}>
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked?'border-emerald-500 bg-emerald-500 text-white':'border-slate-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5"/></span>
    <span className="min-w-0">
      <span className={`block text-sm font-black ${checked?'text-emerald-800':'text-text-main'}`}>{label}</span>
      <span className="mt-0.5 block text-xs font-medium leading-snug text-slate-500">{hint}</span>
    </span>
  </button>;
}

