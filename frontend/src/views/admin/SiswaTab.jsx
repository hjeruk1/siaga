import{useEffect,useMemo,useState}from'react';
import QRCode from'react-qr-code';
import{api}from'../../api';
import{ActionButton,IconButton,LogoMark,Modal,CustomSelect,CustomDatePicker}from'../../components/Shared';
import{todayWIB}from'../../utils/date';
import{CheckCircle2,Copy,Download,Eye,EyeOff,FileText,KeyRound,Pencil,Power,QrCode,RefreshCw,Save,Search,Settings,Trash2,Upload,UserCheck,UserPlus,Users,X}from'lucide-react';
import{useMaster,StudentMetricGroup,SiswaCard,SiswaTable,SiswaDrawer,Panel,FotoUpload,money}from'./shared';

export default function SiswaTab({user,toast}){
  const m=useMaster(user);const[list,setList]=useState([]);const today=todayWIB();
  const nextYearStart=new Date().getMonth()>=6?new Date().getFullYear()+1:new Date().getFullYear();
  const empty={cabang_id:m.cabangId||'',nama:'',nis:'',nama_panggilan:'',gender:'',tanggal_lahir:'',status:'aktif',jenjang_id:'',rombel_id:'',paket:'reguler',tanggal_mulai:today,alasan:'Enrollment awal',alamat:'',catatan_khusus:'',catatan_sekolah_luar:''};
  const[form,setForm]=useState(empty);const[openForm,setOpenForm]=useState(false);
  const[selected,setSelected]=useState(null);const[detail,setDetail]=useState(null);
  const[kenaikanForm,setKenaikanForm]=useState({tanggal_efektif:`${nextYearStart}-07-01`,tahun_ajaran:`${nextYearStart}/${nextYearStart+1}`});
  const[kenaikanPreview,setKenaikanPreview]=useState(null);

  const [selectedFotoFile, setSelectedFotoFile] = useState(null);
  const [selectedFotoUrl, setSelectedFotoUrl] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJenjang, setFilterJenjang] = useState('');
  const [filterRombel, setFilterRombel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  function closeForm() {
    setOpenForm(false);
    setForm(empty);
    if (selectedFotoUrl) {
      URL.revokeObjectURL(selectedFotoUrl);
    }
    setSelectedFotoFile(null);
    setSelectedFotoUrl('');
  }

  async function load(){setList(await api.siswa({cabang_id:m.cabangId,status:'semua'}));}
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[m.cabangId]);

  // Client-side filtering logic
  const filteredList = useMemo(() => {
    return list.filter(siswa => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = siswa.nama?.toLowerCase().includes(query);
        const matchesNis = siswa.nis?.toLowerCase().includes(query);
        if (!matchesName && !matchesNis) return false;
      }
      if (filterJenjang) {
        if (String(siswa.jenjang_id) !== String(filterJenjang)) return false;
      }
      if (filterRombel) {
        if (String(siswa.rombel_id) !== String(filterRombel)) return false;
      }
      if (filterStatus) {
        if (siswa.status?.toLowerCase() !== filterStatus.toLowerCase()) return false;
      }
      return true;
    });
  }, [list, searchQuery, filterJenjang, filterRombel, filterStatus]);

  // Dynamically calculated stats
  const stats = useMemo(() => {
    const total = list.length;
    const activeStudents = list.filter(s => s.status?.toLowerCase() === 'aktif');
    const active = activeStudents.length;
    const kb = activeStudents.filter(s => s.jenjang_nama?.toLowerCase().includes('kb')).length;
    const tk = activeStudents.filter(s => s.jenjang_nama?.toLowerCase().includes('tk')).length;
    const dayCare = activeStudents.filter(s => {
      const jenjang = s.jenjang_nama?.toLowerCase() || '';
      return jenjang.includes('care') || jenjang.includes('baby');
    }).length;
    const reguler = activeStudents.filter(s => s.paket?.toLowerCase() === 'reguler').length;
    const fullDay = activeStudents.filter(s => s.paket?.toLowerCase() === 'full_day').length;
    const care = activeStudents.filter(s => s.paket?.toLowerCase() === 'care').length;
    return { total, active, kb, tk, dayCare, reguler, fullDay, care };
  }, [list]);

  const activeCabangId = form.cabang_id || m.cabangId;
  const rombelFiltered = m.rombel.filter(r => 
    (!activeCabangId || String(r.cabang_id) === String(activeCabangId)) &&
    (!form.jenjang_id || String(r.jenjang_id) === String(form.jenjang_id))
  );
  async function add(){
    const finalCabangId = form.cabang_id || m.cabangId;
    if(!finalCabangId){toast('err','Pilih cabang dulu');return;}
    if(!form.nama.trim()||!form.jenjang_id||!form.rombel_id){toast('err','Nama, jenjang, dan rombel wajib diisi');return;}
    try{
      const res = await api.createSiswa({...form,nama:form.nama.trim(),nis:form.nis.trim(),cabang_id:finalCabangId,jenjang_id:Number(form.jenjang_id),rombel_id:Number(form.rombel_id)});
      if (selectedFotoFile) {
        try {
          await api.uploadSiswaFoto(res.id, selectedFotoFile);
        } catch (photoErr) {
          toast('err', 'Siswa disimpan, tapi gagal mengunggah foto: ' + photoErr.message);
        }
      }
      toast('ok','Siswa tersimpan');
      closeForm();
      load();
    }catch(e){toast('err',e.message);}
  }
  async function open(s){try{setSelected(s);setDetail(await api.siswaDetail(s.id));}catch(e){toast('err',e.message);}}
  async function refreshDetail(id=selected?.id){if(!id)return;setDetail(await api.siswaDetail(id));load();}
  function itemFromPreview(p){return{siswa_id:p.id,action:p.action==='error'?'skip':p.action,target_jenjang_id:p.target_jenjang_id||p.jenjang_id||'',target_rombel_id:p.target_rombel_id||p.rombel_id||'',paket:p.paket||'reguler'};}
  async function previewKenaikan(){
    if(!m.cabangId){toast('err','Pilih cabang dulu');return;}
    try{
      const r=await api.kenaikanPreview({cabang_id:m.cabangId,...kenaikanForm});
      setKenaikanPreview({...r,items:r.preview.map(itemFromPreview)});
    }catch(e){toast('err',e.message);}
  }
  function setKenaikanItem(index,patch){setKenaikanPreview(p=>({...p,items:p.items.map((item,i)=>i===index?{...item,...patch}:item)}));}
  function changeKenaikanAction(index,action){
    const row=kenaikanPreview.preview[index];
    if(action==='tinggal'){setKenaikanItem(index,{action,target_jenjang_id:row.jenjang_id,target_rombel_id:row.rombel_id,paket:row.paket||'reguler'});return;}
    if(action==='naik'){setKenaikanItem(index,{action,target_jenjang_id:row.target_jenjang_id||'',target_rombel_id:row.target_rombel_id||'',paket:row.paket||'reguler'});return;}
    setKenaikanItem(index,{action,target_jenjang_id:'',target_rombel_id:'',paket:row.paket||'reguler'});
  }
  function kenaikanInvalid(){
    if(!kenaikanPreview)return false;
    return kenaikanPreview.items.some(item=>['naik','tinggal'].includes(item.action)&&(!item.target_jenjang_id||!item.target_rombel_id));
  }
  function kenaikanSummary(){
    if(!kenaikanPreview)return{};
    const summary={naik:0,tinggal:0,lulus:0,tetap:0,skip:0,error:0};
    kenaikanPreview.items.forEach(item=>{summary[item.action]=(summary[item.action]||0)+1;});
    kenaikanPreview.preview.forEach(row=>{if(row.action==='error')summary.error+=1;});
    return summary;
  }
  async function doKenaikan(){
    if(kenaikanInvalid()){toast('err','Lengkapi rombel tujuan untuk siswa yang naik atau tinggal kelas');return;}
    try{
      const r=await api.kenaikan({cabang_id:m.cabangId,...kenaikanForm,items:kenaikanPreview.items});
      const s=r.summary||{};
      toast('ok',`${r.results.length} siswa diproses: ${s.naik||0} naik, ${s.tinggal||0} tinggal, ${s.lulus||0} lulus`);
      setKenaikanPreview(null);load();
    }catch(e){toast('err',e.message);}
  }
  const right=<div className="grid grid-cols-2 gap-2 sm:flex sm:items-center"><ActionButton icon={RefreshCw} onClick={previewKenaikan} variant="secondary" className="px-2 sm:px-4 text-xs sm:text-sm">Kenaikan Tahun Ajaran</ActionButton><ActionButton icon={UserPlus} onClick={()=>{setForm(empty);setOpenForm(true);}} className="px-2 sm:px-4 text-xs sm:text-sm">Tambah Siswa</ActionButton></div>;
  
  return <Panel title="Data Siswa" right={right} className="overflow-visible md:overflow-hidden">
    <div className="space-y-4">
      {/* 1. Grouped Stats */}
      {/* Mobile: compact single-row chip bar */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none md:hidden">
        {[
          {label:'Total',value:stats.total},
          {label:'Aktif',value:stats.active},
          {label:'KB',value:stats.kb},
          {label:'TK',value:stats.tk},
          {label:'Day Care',value:stats.dayCare},
          {label:'Full Day',value:stats.fullDay},
          {label:'Care',value:stats.care},
          {label:'Reguler',value:stats.reguler},
        ].map(s=><div key={s.label} className="flex-none flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{s.label}</span>
          <span className="text-sm font-black text-text-main">{s.value}</span>
        </div>)}
      </div>
      {/* Desktop: original 3-column card layout */}
      <div className="hidden md:grid md:grid-cols-3 gap-3">
        <StudentMetricGroup title="Master" items={[{label:'Total',value:stats.total},{label:'Aktif',value:stats.active}]}/>
        <StudentMetricGroup title="Jenjang" items={[{label:'KB',value:stats.kb},{label:'TK',value:stats.tk},{label:'Day Care',value:stats.dayCare}]}/>
        <StudentMetricGroup title="Program" items={[{label:'Full Day',value:stats.fullDay},{label:'Care',value:stats.care},{label:'Reguler',value:stats.reguler}]}/>
      </div>

      {/* 2. Search & Filters Panel */}
      <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
        <div className="md:grid md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start md:gap-2">
        {/* Search row — always visible */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Cari nama atau NIS siswa…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-10 w-full font-bold"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Hapus pencarian siswa"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Filter toggle — mobile only */}
          <button
            type="button"
            aria-label="Buka filter siswa"
            onClick={() => setFilterOpen(o => !o)}
            className={`md:hidden relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${
              filterOpen || filterJenjang || filterRombel || (filterStatus && filterStatus !== 'aktif') || (user.role==='admin' && m.cabangId)
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Filter
            {(() => {
              const count = [filterJenjang, filterRombel, filterStatus && filterStatus !== 'aktif', user.role==='admin' && m.cabangId].filter(Boolean).length;
              return count > 0 ? <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-white">{count}</span> : null;
            })()}
          </button>
        </div>

        {/* Filter dropdowns — always visible on md+, collapsible on mobile */}
        <div className={`mt-2 md:mt-0 ${
          filterOpen ? 'block' : 'hidden md:block'
        }`}>
          <div className="grid grid-cols-2 md:flex md:flex-nowrap gap-2">
            {user.role==='admin'&&<CustomSelect value={m.cabangId} onChange={e=>m.setCabangId(e.target.value)} className="input w-full md:w-44 text-xs sm:text-sm">
              <option value="">Semua Cabang</option>
              {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
            </CustomSelect>}
            <CustomSelect
              value={filterJenjang}
              onChange={e => {
                setFilterJenjang(e.target.value);
                setFilterRombel('');
              }}
              className="input w-full md:w-40 text-xs sm:text-sm"
            >
              <option value="">Semua Jenjang</option>
              {m.jenjang.map(j => (
                <option key={j.id} value={j.id}>{j.nama}</option>
              ))}
            </CustomSelect>
            <CustomSelect
              value={filterRombel}
              onChange={e => setFilterRombel(e.target.value)}
              className="input w-full md:w-40 text-xs sm:text-sm"
              disabled={!filterJenjang}
            >
              <option value="">Semua Rombel</option>
              {m.rombel
                .filter(r => !filterJenjang || String(r.jenjang_id) === String(filterJenjang))
                .map(r => (
                  <option key={r.id} value={r.id}>{r.nama}</option>
                ))}
            </CustomSelect>
            <CustomSelect
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="input w-full md:w-36 text-xs sm:text-sm"
            >
              <option value="">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="lulus">Lulus</option>
              <option value="keluar">Keluar</option>
            </CustomSelect>
          </div>
        </div>
        </div>
      </div>

      {/* 3. Responsive Layout Switching */}
      {/* Desktop View */}
      <div className="hidden md:block">
        <SiswaTable list={filteredList} selected={selected} open={open} />
        {filteredList.length === 0 && (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
            Tidak ada data siswa yang ditemukan.
          </div>
        )}
      </div>

      {/* Mobile View */}
      <div className="block md:hidden space-y-3">
        {filteredList.map(s => (
          <SiswaCard key={s.id} siswa={s} active={selected?.id === s.id} open={open} />
        ))}
        {filteredList.length === 0 && (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
            Tidak ada data siswa yang ditemukan.
          </div>
        )}
      </div>
    </div>

    {openForm&&<Modal title="Tambah Siswa" onClose={closeForm} maxWidth="max-w-4xl">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Column: Photo Upload Container */}
        <div className="w-full md:w-52 shrink-0 flex flex-col items-center bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-center">
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Foto Profil</div>
          <FotoUpload
            size="xl"
            url={selectedFotoUrl}
            onUpload={(file) => {
              const url = URL.createObjectURL(file);
              if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
              setSelectedFotoFile(file);
              setSelectedFotoUrl(url);
            }}
            onDelete={() => {
              if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
              setSelectedFotoFile(null);
              setSelectedFotoUrl('');
            }}
          />
          <div className="text-[10px] sm:text-[11px] text-slate-400 mt-4 leading-relaxed">
            Pilih foto siswa. Gunakan format JPG/PNG, maks. 2MB.
          </div>
        </div>

        {/* Right Column: Fields split into logical groups */}
        <div className="flex-1 space-y-6">
          {/* Section 1: Profil Dasar */}
          <div className="space-y-3">
            <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Profil Dasar
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <label className="block sm:col-span-4">
                <span className="label">Nama Lengkap <span className="text-rose-500">*</span></span>
                <input type="text" placeholder="Nama lengkap siswa" value={form.nama} onChange={e=>setForm(f=>({...f,nama:e.target.value}))} className="input w-full" />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Nama Panggilan</span>
                <input type="text" placeholder="Panggilan" value={form.nama_panggilan} onChange={e=>setForm(f=>({...f,nama_panggilan:e.target.value}))} className="input w-full" />
              </label>
              <label className="block sm:col-span-3">
                <span className="label">NIS (Nomor Induk Siswa)</span>
                <input type="text" placeholder="NIS" value={form.nis} onChange={e=>setForm(f=>({...f,nis:e.target.value}))} className="input w-full" />
              </label>
              <label className="block sm:col-span-3">
                <span className="label">Gender <span className="text-rose-500">*</span></span>
                <CustomSelect value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))} className="input w-full">
                  <option value="">Pilih gender</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </CustomSelect>
              </label>
              <label className="block sm:col-span-3">
                <span className="label">Tanggal Lahir <span className="text-rose-500">*</span></span>
                <CustomDatePicker value={form.tanggal_lahir} onChange={v=>setForm(f=>({...f,tanggal_lahir:v}))} className="input w-full" />
              </label>
              <label className="block sm:col-span-3">
                <span className="label">Status Siswa <span className="text-rose-500">*</span></span>
                <CustomSelect value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="input w-full">
                  <option value="aktif">Aktif</option>
                  <option value="keluar">Keluar</option>
                  <option value="lulus">Lulus</option>
                </CustomSelect>
              </label>
            </div>
          </div>

          {/* Section 2: Enrollment Awal */}
          <div className="space-y-3">
            <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Enrollment Awal
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              {user.role === 'admin' && (
                <label className="block sm:col-span-3">
                  <span className="label">Cabang Sekolah <span className="text-rose-500">*</span></span>
                  <CustomSelect value={form.cabang_id} onChange={e=>setForm(f=>({...f,cabang_id:e.target.value,jenjang_id:'',rombel_id:''}))} className="input w-full">
                    <option value="">Pilih cabang</option>
                    {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
                  </CustomSelect>
                </label>
              )}
              <label className={`block ${user.role === 'admin' ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
                <span className="label">Jenjang <span className="text-rose-500">*</span></span>
                <CustomSelect value={form.jenjang_id} onChange={e=>setForm(f=>({...f,jenjang_id:e.target.value,rombel_id:''}))} className="input w-full">
                  <option value="">Pilih jenjang</option>
                  {m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}
                </CustomSelect>
              </label>
              <label className={`block ${user.role === 'admin' ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
                <span className="label">Rombel <span className="text-rose-500">*</span></span>
                <CustomSelect value={form.rombel_id} onChange={e=>setForm(f=>({...f,rombel_id:e.target.value}))} className="input w-full">
                  <option value="">Pilih rombel</option>
                  {rombelFiltered.map(r=><option key={r.id} value={r.id}>{r.nama}</option>)}
                </CustomSelect>
              </label>
              <label className={`block ${user.role === 'admin' ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
                <span className="label">Paket Kelas <span className="text-rose-500">*</span></span>
                <CustomSelect value={form.paket} onChange={e=>setForm(f=>({...f,paket:e.target.value}))} className="input w-full">
                  <option value="reguler">Reguler</option>
                  <option value="full_day">Full day</option>
                  <option value="care">Care</option>
                </CustomSelect>
              </label>
              <label className="block sm:col-span-3">
                <span className="label">Tanggal Mulai <span className="text-rose-500">*</span></span>
                <CustomDatePicker value={form.tanggal_mulai} onChange={v=>setForm(f=>({...f,tanggal_mulai:v}))} className="input w-full" />
              </label>
              <label className="block sm:col-span-3">
                <span className="label">Alasan Enrollment</span>
                <input type="text" placeholder="Enrollment awal" value={form.alasan} onChange={e=>setForm(f=>({...f,alasan:e.target.value}))} className="input w-full" />
              </label>
            </div>
          </div>

          {/* Section 3: Alamat & Catatan */}
          <div className="space-y-3">
            <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Alamat & Catatan
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="label">Alamat Rumah</span>
                <textarea value={form.alamat} onChange={e=>setForm(f=>({...f,alamat:e.target.value}))} className="input w-full min-h-[50px] max-h-[100px]" placeholder="Masukkan alamat lengkap rumah siswa" />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Catatan Medis / Khusus</span>
                  <textarea value={form.catatan_khusus} onChange={e=>setForm(f=>({...f,catatan_khusus:e.target.value}))} className="input w-full min-h-[50px] max-h-[100px]" placeholder="Alergi makanan, asma, obat rutin, dll. (jika ada)" />
                </label>
                <label className="block">
                  <span className="label">Catatan Sekolah Asal / Luar</span>
                  <textarea value={form.catatan_sekolah_luar} onChange={e=>setForm(f=>({...f,catatan_sekolah_luar:e.target.value}))} className="input w-full min-h-[50px] max-h-[100px]" placeholder="Pindahan dari sekolah mana, raport awal, dll. (jika ada)" />
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-6">
            <ActionButton icon={X} onClick={closeForm} variant="secondary">Batal</ActionButton>
            <ActionButton icon={UserPlus} onClick={add}>Tambah Siswa</ActionButton>
          </div>
        </div>
      </div>
    </Modal>}
    {detail&&<SiswaDrawer onClose={()=>{setSelected(null);setDetail(null);}}>
      <SiswaDetailPanel user={user} m={m} detail={detail} setDetail={setDetail} toast={toast} refresh={()=>refreshDetail(detail.id)} close={()=>{setSelected(null);setDetail(null);}}/>
    </SiswaDrawer>}
    {kenaikanPreview&&<Modal title="Preview Kenaikan Tahun Ajaran" onClose={()=>setKenaikanPreview(null)} maxWidth="max-w-6xl">
      <div className="space-y-3 min-w-0">
        {/* Header: meta info + refresh */}
        <div className="grid gap-2 lg:grid-cols-[minmax(12rem,1fr)_13rem_13rem_auto] lg:items-end">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-[10px] font-black text-slate-400 uppercase">Cabang</div>
            <div className="font-black text-text-main text-sm truncate">{m.cabang.find(c=>String(c.id)===String(kenaikanPreview.cabang_id))?.nama||kenaikanPreview.cabang_id}</div>
          </div>
          <label className="block"><div className="label">Tanggal efektif</div><CustomDatePicker value={kenaikanForm.tanggal_efektif} onChange={v=>setKenaikanForm(f=>({...f,tanggal_efektif:v}))} className="input w-full text-sm"/></label>
          <label className="block"><div className="label">Tahun ajaran</div><input value={kenaikanForm.tahun_ajaran} onChange={e=>setKenaikanForm(f=>({...f,tahun_ajaran:e.target.value}))} className="input w-full text-sm"/></label>
          <ActionButton icon={RefreshCw} onClick={previewKenaikan} variant="secondary" className="w-full lg:w-auto whitespace-nowrap">Refresh Preview</ActionButton>
        </div>

        {/* Summary chips: always 5 in one row */}
        <div className="grid grid-cols-5 gap-1.5">
          {['naik','tinggal','lulus','skip','error'].map(k=>(
            <div key={k} className="flex flex-col items-center rounded-lg bg-slate-50 border border-slate-100 px-1.5 py-1 text-center">
              <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wide text-slate-400 truncate w-full text-center">{k}</div>
              <div className="text-base font-black text-text-main leading-tight">{kenaikanSummary()[k]||0}</div>
            </div>
          ))}
        </div>

        {/* Desktop: table view */}
        <div className="hidden md:block max-h-[50vh] overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[32%]"/>
              <col className="w-[20%]"/>
              <col className="w-[15%]"/>
              <col className="w-[20%]"/>
              <col className="w-[13%]"/>
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Dari</th>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Aksi</th>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Rombel Tujuan</th>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">{kenaikanPreview.preview.map((p,i)=>{
              const item=kenaikanPreview.items[i]||itemFromPreview(p);
              const needsTarget=['naik','tinggal'].includes(item.action);
              const targetRombel=m.rombel.filter(r=>String(r.jenjang_id)===String(item.target_jenjang_id));
              return <tr key={p.id||i} className="hover:bg-slate-50/60">
                <td className="py-2 px-3 font-black text-text-main truncate" title={p.nama}>{p.nama}</td>
                <td className="py-2 px-3 text-slate-500 text-xs truncate" title={`${p.jenjang_nama} - ${p.rombel_nama}`}>{p.jenjang_nama} · {p.rombel_nama}</td>
                <td className="py-2 px-3">
                  <CustomSelect value={item.action} onChange={e=>changeKenaikanAction(i,e.target.value)} className="input w-full text-xs">
                    <option value="naik">Naik kelas</option>
                    <option value="tinggal">Tinggal kelas</option>
                    <option value="lulus">Lulus</option>
                    <option value="tetap">Tetap</option>
                    <option value="skip">Tidak diproses</option>
                  </CustomSelect>
                </td>
                <td className="py-2 px-3">
                  {needsTarget?<CustomSelect value={item.target_rombel_id||''} onChange={e=>setKenaikanItem(i,{target_rombel_id:e.target.value,target_jenjang_id:targetRombel.find(r=>String(r.id)===e.target.value)?.jenjang_id||item.target_jenjang_id})} className={`input w-full text-xs ${!item.target_rombel_id?'border-red-300':''}`}><option value="">Pilih rombel</option>{targetRombel.map(r=><option key={r.id} value={r.id}>{m.jenjang.find(j=>String(j.id)===String(r.jenjang_id))?.nama} - {r.nama}</option>)}</CustomSelect>:<span className="text-slate-400 text-xs">—</span>}
                </td>
                <td className="py-2 px-3 text-slate-400 text-xs truncate" title={p.error||`${p.target_jenjang||'—'} → ${p.target_rombel||'—'}`}>{p.error||`${p.target_jenjang||'—'} → ${p.target_rombel||'—'}`}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>

        {/* Mobile: card list */}
        <div className="md:hidden space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
          {kenaikanPreview.preview.map((p,i)=>{
            const item=kenaikanPreview.items[i]||itemFromPreview(p);
            const needsTarget=['naik','tinggal'].includes(item.action);
            const targetRombel=m.rombel.filter(r=>String(r.jenjang_id)===String(item.target_jenjang_id));
            return <div key={p.id||i} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
              {/* Student header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-black text-text-main text-sm">{p.nama}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{p.jenjang_nama} · {p.rombel_nama}</div>
                </div>
                {p.error&&<span className="shrink-0 text-[10px] font-black text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">Error</span>}
              </div>
              {/* Controls */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="label mb-1">Aksi</div>
                  <CustomSelect value={item.action} onChange={e=>changeKenaikanAction(i,e.target.value)} className="input w-full text-xs">
                    <option value="naik">Naik kelas</option>
                    <option value="tinggal">Tinggal kelas</option>
                    <option value="lulus">Lulus</option>
                    <option value="tetap">Tetap</option>
                    <option value="skip">Tidak diproses</option>
                  </CustomSelect>
                </div>
                {needsTarget&&<div>
                  <div className="label mb-1">Rombel tujuan</div>
                  <CustomSelect value={item.target_rombel_id||''} onChange={e=>setKenaikanItem(i,{target_rombel_id:e.target.value,target_jenjang_id:targetRombel.find(r=>String(r.id)===e.target.value)?.jenjang_id||item.target_jenjang_id})} className={`input w-full text-xs ${!item.target_rombel_id?'border-red-300':''}`}>
                    <option value="">Pilih rombel</option>
                    {targetRombel.map(r=><option key={r.id} value={r.id}>{m.jenjang.find(j=>String(j.id)===String(r.jenjang_id))?.nama} - {r.nama}</option>)}
                  </CustomSelect>
                </div>}
              </div>
              {/* Recommendation note */}
              {(p.error||p.target_jenjang)&&<div className="text-[10px] text-slate-400 bg-slate-50 rounded px-2 py-1">{p.error||`Rekomendasi: ${p.target_jenjang||'—'} → ${p.target_rombel||'—'}`}</div>}
            </div>;
          })}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <ActionButton icon={CheckCircle2} onClick={doKenaikan} disabled={kenaikanInvalid()} className={kenaikanInvalid()?'opacity-50 cursor-not-allowed':''}>Konfirmasi Kenaikan</ActionButton>
          <ActionButton icon={X} onClick={()=>setKenaikanPreview(null)} variant="secondary">Batal</ActionButton>
        </div>
      </div>
    </Modal>}
  </Panel>;
}

export function SiswaDetailPanel({user,m,detail,setDetail,toast,refresh,close}){
  const emptyPickup={id:null,nama:'',no_wa:'',relasi:'',catatan:'',aktif:1};
  const initialMove=()=>({cabang_id:detail.enrollment?.cabang_id||m.cabangId||'',jenjang_id:detail.enrollment?.jenjang_id||'',rombel_id:detail.enrollment?.rombel_id||'',paket:detail.enrollment?.paket||'reguler',tanggal_mulai:todayWIB(),alasan:'Pindah cabang/rombel'});
  const[move,setMove]=useState(initialMove);
  const[moveOpen,setMoveOpen]=useState(false);
  const[moveConfirmOpen,setMoveConfirmOpen]=useState(false);
  const[targetRombel,setTargetRombel]=useState(m.rombel);
  const[pickupForm,setPickupForm]=useState(emptyPickup);
  const[pickupOpen,setPickupOpen]=useState(false);
  const[qrPreview,setQrPreview]=useState(null);
  const[qrReissueConfirm,setQrReissueConfirm]=useState(null);
  const[nfcConfirmOpen,setNfcConfirmOpen]=useState(false);
  const[tagihanSiswa,setTagihanSiswa]=useState(null);
  const[showNfc,setShowNfc]=useState(false);

  // Photo states for Edit Mode
  const [selectedFotoFile, setSelectedFotoFile] = useState(null);
  const [selectedFotoUrl, setSelectedFotoUrl] = useState('');
  const [fotoDeleted, setFotoDeleted] = useState(false);

  useEffect(() => {
    return () => {
      if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
    };
  }, [selectedFotoUrl]);

  useEffect(()=>{if(move.cabang_id)api.rombel(move.cabang_id).then(setTargetRombel).catch(()=>setTargetRombel(m.rombel));},[move.cabang_id]);
  useEffect(()=>{api.tagihan({siswa_id:detail.id}).then(setTagihanSiswa).catch(()=>setTagihanSiswa([]));},[detail.id]);
  const moveRombel=targetRombel.filter(r=>(!move.jenjang_id||String(r.jenjang_id)===String(move.jenjang_id))&&(!move.cabang_id||String(r.cabang_id)===String(move.cabang_id)));
  function d(k,v){setDetail(x=>({...x,[k]:v}));}
  async function save(){
    try{
      if (fotoDeleted) {
        await api.deleteSiswaFoto(detail.id);
      }
      if (selectedFotoFile) {
        await api.uploadSiswaFoto(detail.id, selectedFotoFile);
      }
      const { foto, ...payload } = detail;
      await api.updateSiswa(detail.id, payload);
      toast('ok','Data siswa diperbarui');
      if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
      setSelectedFotoFile(null);
      setSelectedFotoUrl('');
      setFotoDeleted(false);
      refresh();
    }catch(e){toast('err',e.message);}
  }
  function openMove(){setMove(initialMove());setMoveOpen(true);}
  function cancelMove(){setMove(initialMove());setMoveConfirmOpen(false);setMoveOpen(false);}
  async function pindah(){try{await api.moveSiswa(detail.id,{...move,cabang_id:Number(move.cabang_id),jenjang_id:Number(move.jenjang_id),rombel_id:Number(move.rombel_id)});toast('ok','Enrollment siswa dipindah');setMoveConfirmOpen(false);setMoveOpen(false);refresh();}catch(e){toast('err',e.message);}}
  async function nfc(){try{const r=await api.reissueNfc(detail.id);toast('ok','NFC baru: '+r.nfc_token);setNfcConfirmOpen(false);refresh();}catch(e){toast('err',e.message);}}
  function openPickup(p=null){setPickupForm(p?{id:p.id,nama:p.nama||'',no_wa:p.no_wa||'',relasi:p.relasi||'',catatan:p.catatan||'',aktif:p.aktif===0?0:1}:emptyPickup);setPickupOpen(true);}
  async function savePickup(){
    if(!pickupForm.nama.trim()){toast('err','Nama penjemput wajib diisi');return;}
    try{
      if(pickupForm.id){await api.updatePenjemput(pickupForm.id,{...pickupForm,nama:pickupForm.nama.trim()});toast('ok','Penjemput diperbarui');}
      else{const r=await api.addPenjemput(detail.id,{...pickupForm,nama:pickupForm.nama.trim()});toast('ok','QR penjemput: '+r.qr_code);}
      setPickupOpen(false);setPickupForm(emptyPickup);refresh();
    }catch(e){toast('err',e.message);}
  }
  async function setPickupStatus(p,aktif){try{await api.updatePenjemput(p.id,{...p,aktif});toast('ok',aktif?'Penjemput diaktifkan':'Penjemput dihapus dari daftar aktif');refresh();}catch(e){toast('err',e.message);}}
  async function reissuePickupQr(p){try{const r=await api.reissuePenjemputQr(p.id,'Reissue dari dashboard admin');toast('ok','QR baru: '+r.qr_code);setQrReissueConfirm(null);setQrPreview(q=>q?.id===p.id?{...q,qr_code:r.qr_code}:q);refresh();}catch(e){toast('err',e.message);}}
  async function copyQr(qr){try{await navigator.clipboard.writeText(qr);toast('ok','Kode QR disalin');}catch{toast('err','Gagal menyalin QR');}}
  async function copyNfc(){try{await navigator.clipboard.writeText(detail.nfc_token);toast('ok','NFC token disalin');}catch{toast('err','Gagal menyalin NFC token');}}
  async function downloadPickupCard(p){try{await downloadQrCard({siswa:detail,pickup:p});toast('ok','Kartu QR diunduh');}catch(e){toast('err',e.message||'Gagal mengunduh kartu');}}
  return <div className="space-y-4">
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <FotoUpload
            size="xl"
            url={detail.foto}
            onUpload={file => {
              const url = URL.createObjectURL(file);
              if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
              setSelectedFotoFile(file);
              setSelectedFotoUrl(url);
              setFotoDeleted(false);
              setDetail(d => ({ ...d, foto: url }));
            }}
            onDelete={() => {
              if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
              setSelectedFotoFile(null);
              setSelectedFotoUrl('');
              setFotoDeleted(true);
              setDetail(d => ({ ...d, foto: null }));
            }}
          />
          <div className="min-w-0">
            <div className="font-black text-text-main text-lg truncate">{detail.nama}</div>
            <div className="text-sm text-slate-500 truncate">{detail.enrollment?.cabang_nama} - {detail.enrollment?.rombel_nama}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black"><span className="px-2 py-1 rounded bg-slate-100 text-slate-600">{detail.status||'aktif'}</span>{detail.nis&&<span className="px-2 py-1 rounded bg-slate-100 text-slate-600">NIS {detail.nis}</span>}</div>
          </div>
        </div>
        <IconButton icon={X} label="Tutup" onClick={close} variant="plain"/>
      </div>
    </div>

    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-6 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
        {/* Section 1: Profil Dasar */}
        <div className="space-y-3">
          <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Profil Dasar
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <label className="block sm:col-span-4">
              <span className="label">Nama Lengkap <span className="text-rose-500">*</span></span>
              <input type="text" placeholder="Nama lengkap siswa" value={detail.nama||''} onChange={e=>d('nama',e.target.value)} className="input w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Nama Panggilan</span>
              <input type="text" placeholder="Panggilan" value={detail.nama_panggilan||''} onChange={e=>d('nama_panggilan',e.target.value)} className="input w-full" />
            </label>
            <label className="block sm:col-span-3">
              <span className="label">NIS (Nomor Induk Siswa)</span>
              <input type="text" placeholder="NIS" value={detail.nis||''} onChange={e=>d('nis',e.target.value)} className="input w-full" />
            </label>
            <label className="block sm:col-span-3">
              <span className="label">Gender <span className="text-rose-500">*</span></span>
              <CustomSelect value={detail.gender||''} onChange={e=>d('gender',e.target.value)} className="input w-full">
                <option value="">Pilih gender</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </CustomSelect>
            </label>
            <label className="block sm:col-span-3">
              <span className="label">Tanggal Lahir <span className="text-rose-500">*</span></span>
              <CustomDatePicker value={detail.tanggal_lahir||''} onChange={v=>d('tanggal_lahir',v)} className="input w-full" />
            </label>
            <label className="block sm:col-span-3">
              <span className="label">Status Siswa <span className="text-rose-500">*</span></span>
              <CustomSelect value={detail.status||'aktif'} onChange={e=>d('status',e.target.value)} className="input w-full">
                <option value="aktif">Aktif</option>
                <option value="keluar">Keluar</option>
                <option value="lulus">Lulus</option>
              </CustomSelect>
            </label>
          </div>
        </div>

        {/* Section 2: Alamat & Catatan */}
        <div className="space-y-3">
          <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Alamat & Catatan
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="label">Alamat Rumah</span>
              <textarea value={detail.alamat||''} onChange={e=>d('alamat',e.target.value)} className="input w-full min-h-[50px] max-h-[100px]" placeholder="Masukkan alamat lengkap rumah siswa" />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Catatan Medis / Khusus</span>
                <textarea value={detail.catatan_khusus||''} onChange={e=>d('catatan_khusus',e.target.value)} className="input w-full min-h-[50px] max-h-[100px]" placeholder="Alergi makanan, asma, obat rutin, dll. (jika ada)" />
              </label>
              <label className="block">
                <span className="label">Catatan Sekolah Asal / Luar</span>
                <textarea value={detail.catatan_sekolah_luar||''} onChange={e=>d('catatan_sekolah_luar',e.target.value)} className="input w-full min-h-[50px] max-h-[100px]" placeholder="Pindahan dari sekolah mana, raport awal, dll. (jika ada)" />
              </label>
            </div>
          </div>
        </div>

        {/* Actions & NFC Token Status */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <ActionButton icon={Save} onClick={save}>Simpan Profil</ActionButton>
            <ActionButton icon={UserCheck} onClick={openMove} variant="secondary">Pindah</ActionButton>
            <ActionButton icon={KeyRound} onClick={()=>setNfcConfirmOpen(true)} variant="ghost">Reissue NFC</ActionButton>
          </div>
          {detail.nfc_token&&<div className="text-xs text-slate-500 bg-slate-50 border border-slate-200/60 rounded-lg px-2.5 py-1.5 font-bold self-start sm:self-auto flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-400 font-medium">NFC:</span>
              <span className="font-mono text-slate-700 select-all truncate max-w-[120px] sm:max-w-[150px]">
                {showNfc ? detail.nfc_token : '••••••••••••••••'}
              </span>
            </div>
            <div className="flex items-center gap-1 border-l border-slate-200 pl-1.5 shrink-0">
              <button 
                type="button" 
                aria-label={showNfc ? 'Sembunyikan token NFC' : 'Tampilkan token NFC'}
                onClick={()=>setShowNfc(!showNfc)} 
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition"
                title={showNfc ? "Sembunyikan" : "Tampilkan"}
              >
                {showNfc ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button 
                type="button" 
                aria-label="Salin token NFC"
                onClick={copyNfc} 
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition"
                title="Salin Token"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>}
        </div>
      </div>

      {/* Section 3: Enrollment */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-start gap-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400 shrink-0">
          <UserCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Status Enrollment</div>
          <div className="font-black text-text-main mt-0.5 leading-snug">
            {detail.enrollment?.cabang_nama}
          </div>
          <div className="text-sm text-slate-500 mt-0.5">
            {detail.enrollment?.jenjang_nama} - {detail.enrollment?.rombel_nama}
          </div>
          {detail.enrollment?.paket && (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/60 text-[10px] sm:text-[11px] font-black uppercase text-slate-600">
                Paket: {detail.enrollment?.paket}
              </span>
              {detail.enrollment?.tanggal_mulai && (
                <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/60 text-[10px] sm:text-[11px] font-black uppercase text-slate-600">
                  Mulai: {detail.enrollment?.tanggal_mulai}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
          <div className="flex items-center justify-between gap-3 mb-3"><div><div className="font-black text-text-main">Penjemput</div><div className="text-xs text-slate-400">{(detail.penjemput||[]).filter(p=>p.aktif).length} aktif</div></div><ActionButton icon={UserPlus} onClick={()=>openPickup()} variant="secondary">Tambah</ActionButton></div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">{(detail.penjemput||[]).map(p=><div key={p.id} className={`p-3 text-sm ${p.aktif?'bg-white':'bg-slate-50 opacity-70'}`}>
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><div className="font-black text-text-main truncate">{p.nama}</div><span className={`px-2 py-1 rounded-full text-[11px] font-black ${p.aktif?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{p.aktif?'Aktif':'Nonaktif'}</span></div>
                <div className="text-xs text-slate-500 truncate">{p.relasi||'-'}{p.no_wa?` - ${p.no_wa}`:''}</div>
                {p.catatan&&<div className="mt-1 text-xs text-slate-400 truncate">{p.catatan}</div>}
              </div>
              <div className="flex flex-wrap justify-end gap-2 shrink-0">
                <ActionButton icon={Eye} label={`Show QR ${p.nama}`} onClick={()=>setQrPreview(p)} variant="ghost" className="px-3 py-2 text-xs">Show QR</ActionButton>
                <IconButton icon={Pencil} label={`Edit ${p.nama}`} onClick={()=>openPickup(p)} size="sm"/>
                {p.aktif?<IconButton icon={Trash2} label={`Hapus ${p.nama}`} onClick={()=>setPickupStatus(p,0)} size="sm" variant="danger"/>:<IconButton icon={Power} label={`Aktifkan ${p.nama}`} onClick={()=>setPickupStatus(p,1)} size="sm"/>}
              </div>
            </div>
          </div>)}{(!detail.penjemput||detail.penjemput.length===0)&&<div className="m-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">Belum ada penjemput.</div>}</div>
        </div>
    </div>

      {pickupOpen&&<Modal title={pickupForm.id?'Edit Penjemput':'Tambah Penjemput'} onClose={()=>setPickupOpen(false)} maxWidth="max-w-xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <label className="block sm:col-span-2">
              <span className="label">Nama Penjemput <span className="text-rose-500">*</span></span>
              <input type="text" placeholder="Nama lengkap penjemput" value={pickupForm.nama||''} onChange={e=>setPickupForm(x=>({...x,nama:e.target.value}))} className="input w-full" />
            </label>
            <label className="block">
              <span className="label">No. WhatsApp</span>
              <input type="text" placeholder="Contoh: 08123456789" value={pickupForm.no_wa||''} onChange={e=>setPickupForm(x=>({...x,no_wa:e.target.value}))} className="input w-full" />
            </label>
            <label className="block">
              <span className="label">Relasi Hubungan</span>
              <input type="text" placeholder="Contoh: Ayah, Ibu, Supir, Paman" value={pickupForm.relasi||''} onChange={e=>setPickupForm(x=>({...x,relasi:e.target.value}))} className="input w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Catatan Khusus</span>
              <textarea placeholder="Catatan opsional (misal: hanya jemput hari Jumat, kendaraan yang digunakan, dll.)" value={pickupForm.catatan||''} onChange={e=>setPickupForm(x=>({...x,catatan:e.target.value}))} className="input w-full min-h-[60px] max-h-[120px]" />
            </label>
            {pickupForm.id && (
              <label className="block sm:col-span-2">
                <span className="label">Status Aktif</span>
                <CustomSelect value={pickupForm.aktif?1:0} onChange={e=>setPickupForm(x=>({...x,aktif:Number(e.target.value)}))} className="input w-full">
                  <option value={1}>Aktif</option>
                  <option value={0}>Nonaktif</option>
                </CustomSelect>
              </label>
            )}
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
            <ActionButton icon={X} onClick={()=>setPickupOpen(false)} variant="secondary">Batal</ActionButton>
            <ActionButton icon={Save} onClick={savePickup}>{pickupForm.id?'Simpan Penjemput':'Tambah Penjemput'}</ActionButton>
          </div>
        </div>
      </Modal>}
      {qrPreview&&<Modal title="QR Penjemput" onClose={()=>{setQrPreview(null);setQrReissueConfirm(null);}} maxWidth="max-w-lg">
        <div className="space-y-4">
          <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="bg-text-main px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <LogoMark className="w-40 h-12 rounded-xl"/>
                <div><div className="text-xs font-black uppercase tracking-wide text-primary-container">Taruna Prima</div><div className="text-lg font-black leading-tight">Kartu Penjemput</div></div>
              </div>
            </div>
            <div className="px-6 py-7 text-center">
              <div className="text-xs font-black text-slate-400 uppercase">Siswa</div>
              <div className="text-xl font-black text-text-main">{detail.nama}</div>
              <div className="mt-1 text-sm text-slate-500">{detail.enrollment?.rombel_nama||'-'}</div>
              <div className="my-6 flex justify-center">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <QRCode id={`pickup-qr-${qrPreview.id}`} value={qrPreview.qr_code||'-'} size={192}/>
                </div>
              </div>
              <div className="text-xs font-black text-slate-400 uppercase">Penjemput</div>
              <div className="text-lg font-black text-text-main">{qrPreview.nama}</div>
              <div className="text-sm text-slate-500">{qrPreview.relasi||'-'} {qrPreview.no_wa?`- ${qrPreview.no_wa}`:''}</div>
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 break-all">{qrPreview.qr_code}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <ActionButton icon={QrCode} onClick={()=>setQrReissueConfirm(qrPreview)} variant="secondary">Reissue QR</ActionButton>
            <ActionButton icon={Download} onClick={()=>downloadPickupCard(qrPreview)}>Download Kartu</ActionButton>
            <ActionButton icon={Copy} onClick={()=>copyQr(qrPreview.qr_code)} variant="ghost">Salin Kode</ActionButton>
          </div>
        </div>
      </Modal>}
      {qrReissueConfirm&&<Modal title="Konfirmasi Reissue QR" onClose={()=>setQrReissueConfirm(null)}>
        <div className="space-y-4">
          <div className="text-sm text-slate-600">Buat QR baru untuk penjemput <span className="font-black text-text-main">{qrReissueConfirm.nama}</span>? QR lama tidak dipakai lagi untuk scan berikutnya.</div>
          <div className="flex gap-2"><ActionButton icon={QrCode} onClick={()=>reissuePickupQr(qrReissueConfirm)}>Ya, Reissue QR</ActionButton><ActionButton icon={X} onClick={()=>setQrReissueConfirm(null)} variant="secondary">Batal</ActionButton></div>
        </div>
      </Modal>}
      {nfcConfirmOpen&&<Modal title="Konfirmasi Reissue NFC" onClose={()=>setNfcConfirmOpen(false)}>
        <div className="space-y-4">
          <div className="text-sm text-slate-600">Buat token NFC baru untuk <span className="font-black text-text-main">{detail.nama}</span>? Token lama tidak dipakai lagi untuk scan berikutnya.</div>
          <div className="flex gap-2"><ActionButton icon={KeyRound} onClick={nfc}>Ya, Reissue NFC</ActionButton><ActionButton icon={X} onClick={()=>setNfcConfirmOpen(false)} variant="secondary">Batal</ActionButton></div>
        </div>
      </Modal>}
      {moveOpen&&<Modal title="Pindah Cabang/Rombel" onClose={cancelMove} maxWidth="max-w-xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {user.role==='admin'&&<label className="block">
              <span className="label">Cabang <span className="text-rose-500">*</span></span>
              <CustomSelect value={move.cabang_id} onChange={e=>setMove(x=>({...x,cabang_id:e.target.value,rombel_id:''}))} className="input w-full"><option value="">Pilih Cabang</option>{m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}</CustomSelect>
            </label>}
            <label className="block">
              <span className="label">Jenjang <span className="text-rose-500">*</span></span>
              <CustomSelect value={move.jenjang_id} onChange={e=>setMove(x=>({...x,jenjang_id:e.target.value,rombel_id:''}))} className="input w-full"><option value="">Pilih Jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</CustomSelect>
            </label>
            <label className="block">
              <span className="label">Rombel Tujuan <span className="text-rose-500">*</span></span>
              <CustomSelect value={move.rombel_id} onChange={e=>setMove(x=>({...x,rombel_id:e.target.value}))} className="input w-full"><option value="">Pilih Rombel</option>{moveRombel.map(r=><option key={r.id} value={r.id}>{r.cabang_nama} - {r.nama}</option>)}</CustomSelect>
            </label>
            <label className="block">
              <span className="label">Paket Program <span className="text-rose-500">*</span></span>
              <CustomSelect value={move.paket} onChange={e=>setMove(x=>({...x,paket:e.target.value}))} className="input w-full"><option value="reguler">Reguler</option><option value="full_day">Full day</option><option value="care">Care</option></CustomSelect>
            </label>
            <label className="block">
              <span className="label">Tanggal Mulai <span className="text-rose-500">*</span></span>
              <CustomDatePicker value={move.tanggal_mulai} onChange={v=>setMove(x=>({...x,tanggal_mulai:v}))} className="input w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Alasan Pemindahan <span className="text-rose-500">*</span></span>
              <input type="text" placeholder="Masukkan alasan pemindahan siswa" value={move.alasan||''} onChange={e=>setMove(x=>({...x,alasan:e.target.value}))} className="input w-full" />
            </label>
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
            <ActionButton icon={X} onClick={cancelMove} variant="secondary">Batal</ActionButton>
            <ActionButton icon={UserCheck} onClick={()=>setMoveConfirmOpen(true)}>Pindahkan</ActionButton>
          </div>
        </div>
      </Modal>}
      {moveConfirmOpen&&<Modal title="Konfirmasi Pindah" onClose={()=>setMoveConfirmOpen(false)}>
        <div className="space-y-4">
          <div className="text-sm text-slate-600">Pindahkan enrollment aktif siswa ini ke rombel tujuan yang dipilih?</div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1.5">
            <div><span className="font-black text-slate-400 uppercase text-xs block">Siswa</span><span className="font-bold text-text-main">{detail.nama}</span></div>
            <div><span className="font-black text-slate-400 uppercase text-xs block">Tanggal Mulai</span><span className="font-bold text-text-main">{move.tanggal_mulai}</span></div>
            <div><span className="font-black text-slate-400 uppercase text-xs block">Alasan</span><span className="font-bold text-text-main">{move.alasan||'-'}</span></div>
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
            <ActionButton icon={X} onClick={()=>setMoveConfirmOpen(false)} variant="secondary">Batal</ActionButton>
            <ActionButton icon={CheckCircle2} onClick={pindah}>Ya, Pindahkan</ActionButton>
          </div>
        </div>
      </Modal>}
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
      <div className="font-black text-text-main mb-3">Riwayat Tagihan</div>
      {tagihanSiswa===null?<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">Memuat...</div>:
      tagihanSiswa.length===0?<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">Belum ada tagihan.</div>:
      <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-xl"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Cabang</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenis</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Periode</th><th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Final</th><th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Terbayar</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{tagihanSiswa.map(t=><tr key={t.id}><td className="py-2 px-3 text-slate-700">{t.cabang_nama}</td><td className="py-2 px-3 text-slate-700">{t.nama}</td><td className="py-2 px-3 text-slate-700">{t.periode||'-'}</td><td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-700">{money(t.nominal_final)}</td><td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-700">{money(t.paid_amount)}</td><td className="py-2 px-3 text-slate-700">{t.status}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}

export async function downloadQrCard({siswa,pickup}){
  const qr=document.getElementById(`pickup-qr-${pickup.id}`);
  if(!qr)throw new Error('Buka QR dulu sebelum download');
  const qrInner=qr.innerHTML;
  
  // Calculate scale factor from viewBox to prevent nested SVG scaling bugs when rendering to canvas
  const viewBoxAttr = qr.getAttribute('viewBox') || '0 0 25 25';
  const parts = viewBoxAttr.trim().split(/\s+/);
  const v = parseFloat(parts[3]) || 25;
  const qrScale = (240 / v).toFixed(4);

  // Fetch logo as Data URL to embed directly and prevent canvas tainting
  let logoDataUrl = '';
  try {
    const res = await fetch('/tp_logo.png');
    const blob = await res.blob();
    logoDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Failed to inline school logo:', e);
  }

  const logoHtml = logoDataUrl
    ? `<clipPath id="logo-clip"><rect x="54" y="80" width="180" height="58" rx="10" /></clipPath>
       <g clip-path="url(#logo-clip)">
         <rect x="54" y="80" width="180" height="58" fill="#ffffff"/>
         <image href="${logoDataUrl}" x="54" y="80" width="180" height="58" />
       </g>`
    : `<rect x="54" y="80" width="70" height="58" rx="10" fill="#f59e0b"/>
       <text x="89" y="117" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#ffffff">TP</text>`;

  const textX = logoDataUrl ? 254 : 144;

  const esc=v=>String(v||'-').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const safeName=String(`${siswa.nama||'siswa'}-${pickup.nama||'penjemput'}`).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||'kartu-penjemput';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="920" viewBox="0 0 640 920">
  <rect width="640" height="920" rx="36" fill="#f8fafc"/>
  <rect x="34" y="34" width="572" height="852" rx="30" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <rect x="34" y="34" width="572" height="150" rx="30" fill="#0f172a"/>
  ${logoHtml}
  <text x="${textX}" y="96" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#fde68a" letter-spacing="2">TARUNA PRIMA</text>
  <text x="${textX}" y="132" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff">Kartu Penjemput</text>
  <text x="320" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#94a3b8" letter-spacing="2">SISWA</text>
  <text x="320" y="276" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="900" fill="#0f172a">${esc(siswa.nama)}</text>
  <text x="320" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#64748b">${esc(siswa.enrollment?.rombel_nama)}</text>
  <rect x="170" y="346" width="300" height="300" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="3"/>
  <g transform="translate(200 376) scale(${qrScale})">
    ${qrInner}
  </g>
  <text x="320" y="710" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#94a3b8" letter-spacing="2">PENJEMPUT</text>
  <text x="320" y="746" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#0f172a">${esc(pickup.nama)}</text>
  <text x="320" y="780" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#64748b">${esc(pickup.relasi)}${pickup.no_wa?` - ${esc(pickup.no_wa)}`:''}</text>
  <rect x="94" y="816" width="452" height="42" rx="12" fill="#f1f5f9"/>
  <text x="320" y="843" text-anchor="middle" font-family="Consolas, monospace" font-size="17" fill="#475569">${esc(pickup.qr_code)}</text>
</svg>`;
  const svgBlob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
  const svgUrl=URL.createObjectURL(svgBlob);
  const img=new Image();
  const loaded=new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Gagal membuat PNG kartu QR'));});
  img.src=svgUrl;
  await loaded;
  const scale=2;
  const canvas=document.createElement('canvas');
  canvas.width=640*scale;
  canvas.height=920*scale;
  const ctx=canvas.getContext('2d');
  ctx.scale(scale,scale);
  ctx.drawImage(img,0,0,640,920);
  URL.revokeObjectURL(svgUrl);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Gagal membuat PNG kartu QR');
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`${safeName}-qr.png`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
