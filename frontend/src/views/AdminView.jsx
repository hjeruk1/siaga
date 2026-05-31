import{useEffect,useMemo,useRef,useState}from'react';
import QRCode from'react-qr-code';
import{api}from'../api';
import{ActionButton,ConfirmActionModal,IconButton,LogoMark,Modal,CustomSelect,SearchableSelect,EmptyState}from'../components/Shared';
import{todayWIB}from'../utils/date';
import{AlertCircle,Ban,Banknote,BarChart3,BookOpen,CalendarPlus,Check,CheckCircle2,ChevronDown,Clock,Copy,CreditCard,Download,Eye,EyeOff,FilePenLine,FilePlus,FileText,GraduationCap,ImagePlus,KeyRound,Loader2,Pencil,Plus,Power,PowerOff,QrCode,Receipt,RefreshCw,RotateCcw,Save,Search,Settings,Smartphone,Trash2,TrendingUp,Upload,UserCheck,UserMinus,UserPlus,Users,Wallet,X}from'lucide-react';


export default function AdminView({user,toast,tab}){
  const tabs=['cabang','siswa','staff','wali','rombel','billing','laporan','config','kalender','audit'];
  const activeTab = tabs.includes(tab) ? tab : 'siswa';
  return <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
    {activeTab==='cabang'&&<CabangTab user={user} toast={toast}/>}
    {activeTab==='siswa'&&<SiswaTab user={user} toast={toast}/>}
    {activeTab==='staff'&&<StaffTab user={user} toast={toast}/>}
    {activeTab==='wali'&&<WaliTab user={user} toast={toast}/>}
    {activeTab==='rombel'&&<RombelTab user={user} toast={toast}/>}
    {activeTab==='billing'&&<BillingTab user={user} toast={toast}/>}
    {activeTab==='laporan'&&<LaporanTab user={user} toast={toast}/>}
    {activeTab==='config'&&<ConfigTab user={user} toast={toast}/>}
    {activeTab==='kalender'&&<KalenderTab user={user} toast={toast}/>}
    {activeTab==='audit'&&<AuditTab user={user} toast={toast}/>}
  </div>;
}


function useMaster(user,{autoDefaultCabang=false}={}){
  const[cabang,setCabang]=useState([]),[jenjang,setJenjang]=useState([]),[rombel,setRombel]=useState([]);
  const[cabangId,setCabangId]=useState(user.role==='admin'?'':user.cabang_id);
  async function load(){const [c,j]=await Promise.all([api.cabang(),api.jenjang()]);setCabang(c);setJenjang(j);const preferred=c.find(x=>x.kode==='GDN'&&x.aktif)||c.find(x=>x.aktif)||c[0];const cid=cabangId||(autoDefaultCabang?preferred?.id:'');if(user.role==='admin'&&!cabangId&&cid)setCabangId(cid);setRombel(await api.rombel(cid));}
  useEffect(()=>{load().catch(()=>{});},[cabangId]);
  return{cabang,jenjang,rombel,cabangId,setCabangId,load};
}

function StudentAvatar({ name, url, size = 'md' }) {
  const boxClass = size === 'xl' 
    ? 'w-32 h-32 sm:w-36 sm:h-36 rounded-2xl' 
    : size === 'lg' 
      ? 'w-12 h-12 rounded-xl' 
      : 'w-9 h-9 rounded-lg';
  const textClass = size === 'xl' ? 'text-4xl' : size === 'lg' ? 'text-lg' : 'text-xs';

  if (url) {
    return <img src={url} className={`${boxClass} object-cover border border-slate-200/60 shadow-sm`} alt={name} />;
  }

  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0] ? parts[0][0].toUpperCase() : '?';

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-50 text-blue-600 border-blue-100',
    'bg-emerald-50 text-emerald-600 border-emerald-100',
    'bg-indigo-50 text-indigo-600 border-indigo-100',
    'bg-violet-50 text-violet-600 border-violet-100',
    'bg-amber-50 text-amber-600 border-amber-100',
    'bg-rose-50 text-rose-600 border-rose-100',
    'bg-cyan-50 text-cyan-600 border-cyan-100',
  ];
  const colorClass = colors[Math.abs(hash) % colors.length];

  return (
    <div className={`${boxClass} flex items-center justify-center font-black ${colorClass} border shadow-sm`}>
      <span className={textClass}>{initials}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    aktif: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    lulus: 'bg-blue-50 text-blue-700 border-blue-200/80',
    keluar: 'bg-rose-50 text-rose-700 border-rose-200/80',
    undangan: 'bg-amber-50 text-amber-700 border-amber-200/80',
    nonaktif: 'bg-slate-100 text-slate-600 border-slate-200/80',
  }[status.toLowerCase()] || 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${config}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 shrink-0" />
      <span className="capitalize">{status}</span>
    </span>
  );
}

function StudentMetricGroup({ title, items }) {
  const gridCols = items.length >= 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className="rounded-lg sm:rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
      <div className="mb-1.5 sm:mb-2 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">{title}</div>
      <div className={`grid ${gridCols} gap-1.5 sm:gap-2`}>
        {items.map(item => (
          <div key={item.label} className="rounded-md sm:rounded-lg bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
            <div className="truncate text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">{item.label}</div>
            <div className="mt-0.5 text-base sm:text-xl font-black leading-tight text-text-main">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SiswaCard({ siswa, active, open }) {
  function activate(e){
    if(e.key==='Enter'||e.key===' '){
      e.preventDefault();
      open(siswa);
    }
  }
  return (
    <button
      type="button"
      onClick={() => open(siswa)} 
      onKeyDown={activate}
      className={`w-full bg-white border rounded-xl p-3 flex gap-3 items-start text-left transition cursor-pointer active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
        active ? 'border-primary ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <StudentAvatar name={siswa.nama} url={siswa.foto} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <div className="font-black text-text-main text-sm truncate leading-tight" title={siswa.nama}>
            {siswa.nama}
          </div>
          <div className="mt-1"><StatusBadge status={siswa.status} /></div>
        </div>
        
        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
          <span className="font-medium">NIS:</span>
          <span className="font-mono text-slate-700 font-bold">{siswa.nis || '-'}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-600">
          <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-100">
            {siswa.jenjang_nama}
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-100">
            {siswa.rombel_nama}
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-100 uppercase">
            {siswa.paket}
          </span>
        </div>
      </div>
      <div className="self-center pl-1 text-slate-400" aria-hidden="true">
        <Settings className="w-4 h-4" />
      </div>
    </button>
  );
}

function StaffCard({ staff, onEdit, onReset, onStatusToggle, onDelete, canDelete }) {
  return (
    <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 flex gap-3 items-start transition shadow-sm">
      <StudentAvatar name={staff.display_name} url={staff.foto} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-text-main text-sm truncate leading-tight" title={staff.display_name}>
            {staff.display_name}
          </div>
          <StatusBadge status={staff.status} />
        </div>

        <div className="text-xs text-slate-500 mt-2 space-y-1">
          <div><span className="font-medium text-slate-400">Username:</span> <span className="font-mono text-slate-700 font-bold">{staff.username}</span></div>
          <div><span className="font-medium text-slate-400">Role:</span> <span className="capitalize font-medium text-slate-600">{staff.role.replace('_', ' ')}</span></div>
          <div><span className="font-medium text-slate-400">Cabang:</span> <span className="font-medium text-slate-600">{staff.cabang_nama || 'Pusat'}</span></div>
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2.5">
          <IconButton icon={Pencil} label={`Edit ${staff.display_name}`} onClick={() => onEdit(staff)} size="sm" />
          <IconButton icon={RotateCcw} label="Reset password" onClick={() => onReset(staff)} size="sm" />
          {staff.status === 'nonaktif' ? (
            <IconButton icon={Power} label="Aktifkan" onClick={() => onStatusToggle({ staff, status: 'aktif' })} size="sm" />
          ) : (
            <IconButton icon={PowerOff} label="Nonaktifkan" onClick={() => onStatusToggle({ staff, status: 'nonaktif' })} size="sm" variant="danger" />
          )}
          {canDelete&&<IconButton icon={Trash2} label={`Hapus permanen ${staff.display_name}`} onClick={() => onDelete(staff)} size="sm" variant="danger" />}
        </div>
      </div>
    </div>
  );
}

function SiswaTable({list,selected,open}){
  const headers=[
    {label:'Siswa',className:'min-w-72 w-80'},
    {label:'Cabang',className:'w-36'},
    {label:'Jenjang',className:'w-28'},
    {label:'Rombel',className:'w-32'},
    {label:'Paket',className:'w-28'},
    {label:'',className:'w-28 sticky right-0 z-10 bg-slate-50 border-l border-slate-200/80'}
  ];
  return <div className="overflow-x-auto rounded-xl border border-slate-100">
    <table className="w-full min-w-[820px] table-fixed text-sm">
      <thead><tr>{headers.map((h,i)=><th key={`${i}-${h.label||'empty'}`} className={`text-left py-2 px-3 bg-slate-50 text-slate-500 font-black ${h.className}`}>{h.label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">
        {list.map(s=>{
          const active=selected?.id===s.id;
          const rowBg=active?'bg-primary-container':'bg-white';
          return <tr key={s.id} className={active?'bg-primary-container':''}>
            <td className="py-2 px-3 text-slate-700">
              <div className="flex items-center gap-3 min-w-0">
              <StudentAvatar name={s.nama} url={s.foto} size="md" />
                <div className="min-w-0">
                  <div className="font-black text-text-main truncate" title={s.nama}>{s.nama}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    <span className="font-mono text-xs font-bold text-slate-500 truncate" title={s.nis||'-'}>{s.nis||'-'}</span>
                  </div>
                </div>
              </div>
            </td>
            <td className="py-2 px-3 text-slate-600 truncate" title={s.cabang_nama}>{s.cabang_nama}</td>
            <td className="py-2 px-3 text-slate-600 truncate" title={s.jenjang_nama}>{s.jenjang_nama}</td>
            <td className="py-2 px-3 text-slate-600 truncate" title={s.rombel_nama}>{s.rombel_nama}</td>
            <td className="py-2 px-3 text-slate-600 truncate" title={s.paket}>{s.paket}</td>
            <td className={`py-2 px-3 sticky right-0 z-10 ${rowBg} border-l border-slate-200/80`}>
              <IconButton icon={Settings} label={`Kelola ${s.nama}`} onClick={()=>open(s)} size="sm"/>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}


function CabangTab({user,toast}){
  const empty={nama:'',kode:'',alamat:'',kontak:'',aktif:1};
  const[list,setList]=useState([]);const[form,setForm]=useState(empty);const[editing,setEditing]=useState(null);const[openForm,setOpenForm]=useState(false);
  const[cabangConfirm,setCabangConfirm]=useState(null);
  async function load(){setList(await api.cabang());}
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[]);
  async function add(){try{await api.createCabang(form);toast('ok','Cabang dibuat');setForm(empty);setOpenForm(false);load();}catch(e){toast('err',e.message);}}
  async function saveEdit(){try{await api.updateCabang(editing.id,editing);toast('ok','Cabang diperbarui');setEditing(null);load();}catch(e){toast('err',e.message);}}
  async function toggle(c){
    setCabangConfirm({
      cabang: c,
      onSubmit: async () => {
        try{
          await api.updateCabang(c.id,{...c,aktif:c.aktif?0:1});
          toast('ok',c.aktif?'Cabang dinonaktifkan':'Cabang diaktifkan');
          load();
        }catch(e){
          toast('err',e.message);
        }
        setCabangConfirm(null);
      }
    });
  }
  const right=user.role==='admin'?<ActionButton icon={Plus} onClick={()=>{setForm(empty);setOpenForm(true);}}>Tambah Cabang</ActionButton>:null;
  return <Panel title="Cabang Taruna Prima" right={right}>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{list.map(c=><div key={c.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0"><div className="font-black text-text-main truncate">{c.nama}</div><span className="px-2 py-1 rounded bg-slate-100 text-[11px] font-black text-slate-500">{c.kode}</span></div>
          <div className="mt-1 text-xs text-slate-500 truncate" title={c.alamat||''}>{c.alamat||'Alamat belum diisi'}</div>
        </div>
        <span className={`px-2 py-1 rounded-full text-[11px] font-black ${c.aktif?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{c.aktif?'Aktif':'Nonaktif'}</span>
      </div>
      <div className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
        <div className="font-black text-slate-400 uppercase">Kepsek</div><div className="font-bold text-slate-700 truncate">{c.kepsek_nama||'Belum diatur'}</div>
        <div className="font-black text-slate-400 uppercase">Kontak</div><div className="font-bold text-slate-700 truncate">{c.kontak||'-'}</div>
      </div>
      <div className="pt-2 border-t border-slate-100 space-y-1.5">
        <BranchMetricRow title="Siswa" total={c.siswa_aktif_count||0} items={[['KB',c.kb_count||0],['TK',c.tk_count||0],['Care',c.care_count||0]]}/>
        <BranchMetricRow title="Staff" total={c.staff_aktif_count||0} items={[['Admin',c.admin_count||0],['Kepsek',c.kepsek_count||0],['Guru',c.guru_count||0],['Gerbang',c.gerbang_count||0]]}/>
      </div>
      {user.role==='admin'&&<div className="flex justify-end gap-2 pt-1 border-t border-slate-100"><IconButton icon={Pencil} label={`Edit ${c.nama}`} onClick={()=>setEditing(c)} size="sm"/><IconButton icon={c.aktif?PowerOff:Power} label={c.aktif?'Nonaktifkan':'Aktifkan'} onClick={()=>toggle(c)} size="sm" variant={c.aktif?'danger':'ghost'}/></div>}
    </div>)}</div>
    {openForm&&<CabangModal title="Tambah Cabang" form={form} setForm={setForm} onClose={()=>setOpenForm(false)} onSubmit={add} submitLabel="Tambah Cabang"/>}
    {editing&&<CabangModal title="Edit Cabang" form={editing} setForm={setEditing} onClose={()=>setEditing(null)} onSubmit={saveEdit} submitLabel="Simpan Perubahan" showStatus/>}
    {cabangConfirm&&<ConfirmActionModal
      title={cabangConfirm.cabang.aktif?'Nonaktifkan Cabang':'Aktifkan Cabang'}
      entityName={cabangConfirm.cabang.nama}
      affectedBranch={cabangConfirm.cabang.nama}
      consequence={cabangConfirm.cabang.aktif?'Menonaktifkan cabang akan memblokir semua transaksi operasional baru untuk cabang ini.':null}
      actionLabel={cabangConfirm.cabang.aktif?'Ya, Nonaktifkan':'Ya, Aktifkan'}
      actionVariant={cabangConfirm.cabang.aktif?'danger':'primary'}
      icon={Power}
      onClose={()=>setCabangConfirm(null)}
      onSubmit={cabangConfirm.onSubmit}
    />}
  </Panel>;
}

function CabangModal({title,form,setForm,onClose,onSubmit,submitLabel,showStatus=false}){
  const canSubmit=String(form.nama||'').trim()&&String(form.kode||'').trim();
  return <Modal title={title} onClose={onClose} maxWidth="max-w-xl">
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">Identitas Cabang</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-3">
          <label className="block">
            <span className="label">Nama Cabang <span className="text-rose-500">*</span></span>
            <Input placeholder="Contoh: Godean" value={form.nama||''} onChange={v=>setForm(f=>({...f,nama:v}))}/>
          </label>
          <label className="block">
            <span className="label">Kode <span className="text-rose-500">*</span></span>
            <Input placeholder="GDN" value={form.kode||''} onChange={v=>setForm(f=>({...f,kode:v.toUpperCase().replace(/\s+/g,'')}))}/>
          </label>
        </div>
        <div className="mt-2 text-xs text-slate-500">Kode dipakai sebagai penanda cepat di dashboard dan laporan.</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">Operasional</div>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="label">Alamat</span>
            <textarea
              value={form.alamat||''}
              onChange={e=>setForm(f=>({...f,alamat:e.target.value}))}
              placeholder="Alamat lengkap cabang"
              rows={3}
              className="input w-full min-h-20 resize-none"
            />
          </label>
          <label className="block">
            <span className="label">Kontak</span>
            <Input placeholder="Nomor telepon atau WhatsApp cabang" value={form.kontak||''} onChange={v=>setForm(f=>({...f,kontak:v}))}/>
          </label>
          {showStatus&&<label className="block">
            <span className="label">Status Cabang</span>
            <CustomSelect value={form.aktif?1:0} onChange={e=>setForm(f=>({...f,aktif:Number(e.target.value)}))} className="input w-full"><option value={1}>Aktif</option><option value={0}>Nonaktif</option></CustomSelect>
          </label>}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100 pt-4">
        <ActionButton icon={X} onClick={onClose} variant="ghost" className="w-full sm:w-auto">Batal</ActionButton>
        <ActionButton icon={Save} onClick={onSubmit} disabled={!canSubmit} className="w-full sm:w-auto">{submitLabel}</ActionButton>
      </div>
    </div>
  </Modal>;
}

function BranchMetricRow({title,total,items}){return <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
  <div className="font-black text-text-main whitespace-nowrap">{title} <span className={total? 'text-slate-600':'text-slate-400'}>({total})</span></div>
  <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-bold">
    {items.map(([label,value])=><span key={label} className={value?'text-slate-700':'text-slate-400'}><span className="text-slate-400">{label}:</span> {value}</span>)}
  </div>
</div>;}

function CabangFilter({user,cabang,cabangId,setCabangId,className='',plain=false}){
  if(user.role!=='admin')return null;
  const classes=plain?className:`px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm ${className}`;
  return <CustomSelect value={cabangId} onChange={e=>setCabangId(e.target.value)} className={classes}><option value="">Semua Cabang</option>{cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}</CustomSelect>;
}

function SiswaTab({user,toast}){
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
          <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl p-8 text-center text-slate-400 text-sm font-bold">
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
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm font-bold">
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
                <input type="date" value={form.tanggal_lahir} onChange={e=>setForm(f=>({...f,tanggal_lahir:e.target.value}))} className="input w-full" />
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
                <input type="date" value={form.tanggal_mulai} onChange={e=>setForm(f=>({...f,tanggal_mulai:e.target.value}))} className="input w-full" />
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
          <label className="block"><div className="label">Tanggal efektif</div><input type="date" value={kenaikanForm.tanggal_efektif} onChange={e=>setKenaikanForm(f=>({...f,tanggal_efektif:e.target.value}))} className="input w-full text-sm"/></label>
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

function SiswaDrawer({children,onClose}){
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onClick={onClose}>
    <div className="w-full sm:max-w-2xl xl:max-w-3xl h-full bg-slate-100 border-l border-slate-300 overflow-y-auto p-3 sm:p-4 animate-slide-left" onClick={e=>e.stopPropagation()}>
      {children}
    </div>
  </div>;
}

function SiswaDetailPanel({user,m,detail,setDetail,toast,refresh,close}){
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
    <div className="bg-white border border-slate-200 rounded-xl p-4">
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
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-6">
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
              <input type="date" value={detail.tanggal_lahir||''} onChange={e=>d('tanggal_lahir',e.target.value)} className="input w-full" />
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
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex items-start gap-4">
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

        <div className="bg-white border border-slate-200 rounded-xl p-4">
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
          </div>)}{(!detail.penjemput||detail.penjemput.length===0)&&<div className="text-sm text-slate-400 p-3">Belum ada penjemput.</div>}</div>
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
              <input type="date" value={move.tanggal_mulai} onChange={e=>setMove(x=>({...x,tanggal_mulai:e.target.value}))} className="input w-full" />
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
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="font-black text-text-main mb-3">Riwayat Tagihan</div>
      {tagihanSiswa===null?<div className="text-sm text-slate-400">Memuat…</div>:
      tagihanSiswa.length===0?<div className="text-sm text-slate-400">Belum ada tagihan.</div>:
      <div className="overflow-x-auto border border-slate-100 rounded-xl"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Cabang</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenis</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Periode</th><th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Final</th><th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Terbayar</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{tagihanSiswa.map(t=><tr key={t.id}><td className="py-2 px-3 text-slate-700">{t.cabang_nama}</td><td className="py-2 px-3 text-slate-700">{t.nama}</td><td className="py-2 px-3 text-slate-700">{t.periode||'-'}</td><td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-700">{money(t.nominal_final)}</td><td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-700">{money(t.paid_amount)}</td><td className="py-2 px-3 text-slate-700">{t.status}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}

function StaffTab({user,toast}){
  const m=useMaster(user);
  const [list,setList]=useState([]);
  const [form,setForm]=useState({display_name:'',username:'',role:'guru',cabang_id:''});
  const [edit,setEdit]=useState(null);
  const [tempPw,setTempPw]=useState(null);
  const [openForm,setOpenForm]=useState(false);
  const [statusConfirm,setStatusConfirm]=useState(null);
  const [resetConfirm,setResetConfirm]=useState(null);
  const [deleteConfirm,setDeleteConfirm]=useState(null);
  const [deleteConfirmText,setDeleteConfirmText]=useState('');

  // Photo upload states
  const [selectedFotoFile, setSelectedFotoFile] = useState(null);
  const [selectedFotoUrl, setSelectedFotoUrl] = useState('');

  // Photo upload states for Edit modal
  const [editFotoFile, setEditFotoFile] = useState(null);
  const [editFotoUrl, setEditFotoUrl] = useState('');
  const [editFotoDeleted, setEditFotoDeleted] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  function closeAddForm() {
    setOpenForm(false);
    setForm({display_name:'',username:'',role:'guru',cabang_id:''});
    if (selectedFotoUrl) {
      URL.revokeObjectURL(selectedFotoUrl);
    }
    setSelectedFotoFile(null);
    setSelectedFotoUrl('');
  }

  function closeEditForm() {
    if (editFotoUrl) {
      URL.revokeObjectURL(editFotoUrl);
    }
    setEditFotoFile(null);
    setEditFotoUrl('');
    setEditFotoDeleted(false);
    setEdit(null);
  }

  useEffect(() => {
    return () => {
      if (editFotoUrl) URL.revokeObjectURL(editFotoUrl);
    };
  }, [editFotoUrl]);

  async function load(){setList(await api.staff(m.cabangId));}
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[m.cabangId]);

  // Client-side filtering logic
  const filteredList = useMemo(() => {
    return list.filter(s => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = s.display_name?.toLowerCase().includes(query);
        const matchesUsername = s.username?.toLowerCase().includes(query);
        if (!matchesName && !matchesUsername) return false;
      }
      if (filterRole) {
        if (s.role !== filterRole) return false;
      }
      if (filterStatus) {
        if (s.status?.toLowerCase() !== filterStatus.toLowerCase()) return false;
      }
      return true;
    });
  }, [list, searchQuery, filterRole, filterStatus]);

  async function add(){
    if(!form.display_name.trim()||!form.username.trim()){toast('err','Nama dan username wajib diisi');return;}
    const targetCabang = form.role === 'admin' ? '' : (user.role === 'admin' ? form.cabang_id : m.cabangId);
    if(form.role!=='admin'&&!targetCabang){toast('err','Pilih cabang dulu');return;}
    try{
      const r=await api.createStaff({...form,display_name:form.display_name.trim(),username:form.username.trim(),cabang_id:targetCabang});
      if (selectedFotoFile) {
        try {
          await api.uploadStaffFoto(r.id, selectedFotoFile);
        } catch (photoErr) {
          toast('err', 'Staff disimpan, tapi gagal mengunggah foto: ' + photoErr.message);
        }
      }
      setTempPw(r.temporary_password);
      closeAddForm();
      load();
    }catch(e){toast('err',e.message);}
  }

  async function reset(id){try{const r=await api.resetPassword(id);setTempPw(r.temporary_password);}catch(e){toast('err',e.message);}}
  async function setStatus(s,status){try{await api.updateStaff(s.id,{display_name:s.display_name,role:s.role,cabang_id:s.cabang_id,status});toast('ok',status==='nonaktif'?'Staff dinonaktifkan':'Staff diaktifkan');load();}catch(e){toast('err',e.message);}}
  async function saveEdit(){
    try{
      if (editFotoDeleted) {
        await api.deleteStaffFoto(edit.id);
      }
      if (editFotoFile) {
        await api.uploadStaffFoto(edit.id, editFotoFile);
      }
      const { foto, ...payload } = edit;
      await api.updateStaff(edit.id, payload);
      toast('ok','Staff diperbarui');
      closeEditForm();
      load();
    }catch(e){toast('err',e.message);}
  }
  function openDeleteStaff(s){setDeleteConfirm(s);setDeleteConfirmText('');}
  async function deleteStaffPermanently(){
    if(!deleteConfirm)return;
    if(deleteConfirmText!==deleteConfirm.username){toast('err','Username konfirmasi belum cocok');return;}
    try{
      await api.deleteStaff(deleteConfirm.id);
      toast('ok','Staff dihapus permanen');
      setDeleteConfirm(null);
      setDeleteConfirmText('');
      load();
    }catch(e){
      toast('err',e.message);
    }
  }
  
  const roles=user.role==='admin'?['admin','admin_cabang','kepsek','guru','gerbang']:['guru','gerbang'];
  const canDeleteStaff=s=>['admin','admin_cabang'].includes(user.role)&&Number(s.id)!==Number(user.id)&&(user.role==='admin'||['guru','gerbang'].includes(s.role));
  const right = (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <ActionButton
        icon={UserPlus}
        onClick={() => {
          setForm({ display_name: '', username: '', role: 'guru', cabang_id: m.cabangId || '' });
          setOpenForm(true);
        }}
        className="w-full sm:hidden"
      >
        Tambah Staff
      </ActionButton>
      <ActionButton
        icon={UserPlus}
        onClick={() => {
          setForm({ display_name: '', username: '', role: 'guru', cabang_id: m.cabangId || '' });
          setOpenForm(true);
        }}
        className="hidden sm:inline-flex"
      >
        Tambah Staff
      </ActionButton>
    </div>
  );

  return <Panel title="Staff" right={right} className="overflow-visible md:overflow-hidden">
    <div className="space-y-4">
      {/* Search & Filters Panel */}
      <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
        <div className="md:grid md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start md:gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Cari nama atau username staff…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input pl-10 w-full font-bold"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Hapus pencarian staff"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Buka filter staff"
              onClick={() => setFilterOpen(v => !v)}
              className={`md:hidden relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-black transition ${
                filterOpen || filterRole || filterStatus || (user.role === 'admin' && m.cabangId)
                  ? 'border-primary bg-primary-container text-primary'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Filter</span>
              {(() => {
                const count = [filterRole, filterStatus, user.role === 'admin' && m.cabangId].filter(Boolean).length;
                return count > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
                    {count}
                  </span>
                ) : null;
              })()}
            </button>
          </div>

          <div className={`mt-2 md:mt-0 ${filterOpen ? 'block' : 'hidden md:block'}`}>
            <div className="grid grid-cols-2 md:flex md:flex-nowrap gap-2">
              {user.role === 'admin' && (
                <CustomSelect
                  value={m.cabangId}
                  onChange={e => m.setCabangId(e.target.value)}
                  className="input w-full md:w-44 text-xs sm:text-sm"
                >
                  <option value="">Semua Cabang</option>
                  {m.cabang.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nama}
                    </option>
                  ))}
                </CustomSelect>
              )}
              <CustomSelect
                value={filterRole}
                onChange={e => setFilterRole(e.target.value)}
                className="input w-full md:w-40 text-xs sm:text-sm"
              >
                <option value="">Semua Role</option>
                {roles.map(r => (
                  <option key={r} value={r}>{r.replace('_', ' ')}</option>
                ))}
              </CustomSelect>

              <CustomSelect
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="input w-full md:w-36 text-xs sm:text-sm"
              >
                <option value="">Semua Status</option>
                <option value="undangan">Undangan</option>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </CustomSelect>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop view table */}
      <div className="hidden md:block">
        <Table headers={['','Nama','Username','Role','Cabang','Status','Aksi']}>
          {filteredList.map(s => (
            <tr key={s.id}>
              <Td><StudentAvatar name={s.display_name} url={s.foto} size="md" /></Td>
              <Td><span className="font-bold text-slate-800">{s.display_name}</span></Td>
              <Td>{s.username}</Td>
              <Td><span className="capitalize font-medium text-slate-600">{s.role.replace('_', ' ')}</span></Td>
              <Td>{s.cabang_nama||'Pusat'}</Td>
              <Td><StatusBadge status={s.status} /></Td>
              <Td>
                <div className="flex gap-2">
                  <IconButton icon={Pencil} label={`Edit ${s.display_name}`} onClick={()=>setEdit(s)} size="sm"/>
                  <IconButton icon={RotateCcw} label="Reset password" onClick={()=>setResetConfirm(s)} size="sm"/>
                  {s.status==='nonaktif'? (
                    <IconButton icon={Power} label="Aktifkan" onClick={()=>setStatusConfirm({staff:s,status:'aktif'})} size="sm"/>
                  ) : (
                    <IconButton icon={PowerOff} label="Nonaktifkan" onClick={()=>setStatusConfirm({staff:s,status:'nonaktif'})} size="sm" variant="danger"/>
                  )}
                  {canDeleteStaff(s)&&<IconButton icon={Trash2} label={`Hapus permanen ${s.display_name}`} onClick={()=>openDeleteStaff(s)} size="sm" variant="danger"/>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
        {filteredList.length === 0 && (
          <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl p-8 text-center text-slate-400 text-sm font-bold">
            Tidak ada data staff yang ditemukan.
          </div>
        )}
      </div>

      {/* Mobile view card stack */}
      <div className="block md:hidden space-y-3">
        {filteredList.map(s => (
          <StaffCard 
            key={s.id} 
            staff={s} 
            onEdit={setEdit} 
            onReset={setResetConfirm} 
            onStatusToggle={setStatusConfirm} 
            onDelete={openDeleteStaff}
            canDelete={canDeleteStaff(s)}
          />
        ))}
        {filteredList.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm font-bold">
            Tidak ada data staff yang ditemukan.
          </div>
        )}
      </div>
    </div>

    {openForm&&<Modal title="Tambah Staff" onClose={closeAddForm} maxWidth="max-w-3xl">
      <div className="flex flex-col md:flex-row gap-5">
        {/* Left Column: Photo Upload Container */}
        <div className="w-full md:w-48 shrink-0 flex flex-col items-center bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-center">
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
            Pilih foto staff. Gunakan format JPG/PNG, maks. 2MB.
          </div>
        </div>

        {/* Right Column: compact staff account form */}
        <div className="flex-1 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Data Akun Staff
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Nama Lengkap <span className="text-rose-500">*</span></span>
                <input type="text" placeholder="Nama lengkap staff" value={form.display_name} onChange={e=>setForm(f=>({...f,display_name:e.target.value}))} autoComplete="off" className="input w-full" />
              </label>
              <label className="block">
                <span className="label">Username <span className="text-rose-500">*</span></span>
                <input type="text" placeholder="Username login" value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} autoComplete="username" spellCheck={false} className="input w-full" />
              </label>
              <label className="block">
                <span className="label">Role / Jabatan <span className="text-rose-500">*</span></span>
                <CustomSelect value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="input w-full">
                  {roles.map(r=><option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </CustomSelect>
              </label>
              {user.role==='admin'&&form.role!=='admin'&&<label className="block">
                <span className="label">Cabang <span className="text-rose-500">*</span></span>
                <CustomSelect value={form.cabang_id||''} onChange={e=>setForm(f=>({...f,cabang_id:e.target.value}))} className="input w-full">
                  <option value="">Pilih cabang</option>
                  {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
                </CustomSelect>
              </label>}
              {form.role==='admin'&&<div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Admin pusat tidak terikat ke satu cabang.
              </div>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-start gap-2.5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <div className="text-xs font-black text-slate-700">Password sementara otomatis</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-500">Ditampilkan sekali setelah akun staff dibuat.</div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <ActionButton icon={X} onClick={closeAddForm} variant="secondary">Batal</ActionButton>
            <ActionButton icon={UserPlus} onClick={add}>Tambah Staff</ActionButton>
          </div>
        </div>
      </div>
    </Modal>}

    {edit&&<Modal title="Edit Staff" onClose={closeEditForm} maxWidth="max-w-3xl">
      <div className="flex flex-col md:flex-row gap-5">
        {/* Left Column: Photo Upload Container */}
        <div className="w-full md:w-48 shrink-0 flex flex-col items-center bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-center">
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Foto Profil</div>
          <FotoUpload
            size="xl"
            url={edit.foto}
            onUpload={file => {
              const url = URL.createObjectURL(file);
              if (editFotoUrl) URL.revokeObjectURL(editFotoUrl);
              setEditFotoFile(file);
              setEditFotoUrl(url);
              setEditFotoDeleted(false);
              setEdit(e => ({ ...e, foto: url }));
            }}
            onDelete={() => {
              if (editFotoUrl) URL.revokeObjectURL(editFotoUrl);
              setEditFotoFile(null);
              setEditFotoUrl('');
              setEditFotoDeleted(true);
              setEdit(e => ({ ...e, foto: null }));
            }}
          />
          <div className="text-[10px] sm:text-[11px] text-slate-400 mt-4 leading-relaxed">
            Ubah foto staff. Gunakan format JPG/PNG, maks. 2MB.
          </div>
        </div>

        {/* Right Column: compact staff account form */}
        <div className="flex-1 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Data Akun Staff
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Username</div>
              <div className="mt-0.5 font-mono text-sm font-black text-slate-700">{edit.username||'-'}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Nama Lengkap <span className="text-rose-500">*</span></span>
                <input type="text" placeholder="Nama lengkap staff" value={edit.display_name||''} onChange={e=>setEdit(x=>({...x,display_name:e.target.value}))} className="input w-full"/>
              </label>
              <label className="block">
                <span className="label">Role / Jabatan <span className="text-rose-500">*</span></span>
                <CustomSelect value={edit.role} onChange={e=>setEdit(x=>({...x,role:e.target.value,cabang_id:e.target.value==='admin'?'':x.cabang_id}))} className="input w-full">
                  {roles.map(r=><option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </CustomSelect>
              </label>
              {user.role==='admin'&&edit.role!=='admin'&&<label className="block">
                <span className="label">Cabang <span className="text-rose-500">*</span></span>
                <CustomSelect value={edit.cabang_id||''} onChange={e=>setEdit(x=>({...x,cabang_id:e.target.value}))} className="input w-full">
                  <option value="">Pusat</option>
                  {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
                </CustomSelect>
              </label>}
              {edit.role==='admin'&&<div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Admin pusat tidak terikat ke satu cabang.
              </div>}
              <label className="block">
                <span className="label">Status Akun <span className="text-rose-500">*</span></span>
                <CustomSelect value={edit.status} onChange={e=>setEdit(x=>({...x,status:e.target.value}))} className="input w-full">
                  <option value="undangan">Undangan</option>
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </CustomSelect>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <div className="text-xs font-black text-slate-700">Perubahan role dapat memengaruhi akses</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-500">Jika guru dipindah cabang, assignment rombel lama akan dibersihkan oleh sistem.</div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <ActionButton icon={X} onClick={closeEditForm} variant="secondary">Batal</ActionButton>
            <ActionButton icon={Save} onClick={saveEdit}>Simpan Perubahan</ActionButton>
          </div>
        </div>
      </div>
    </Modal>}

    {tempPw&&<Modal title="Password Sementara" onClose={()=>setTempPw(null)}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">Password sementara telah dibuat. Salin dan bagikan kepada pengguna:</div>
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
          <span className="text-2xl font-black text-text-main tracking-widest select-all">{tempPw}</span>
        </div>
        <ActionButton icon={Copy} onClick={()=>{navigator.clipboard.writeText(tempPw);toast('ok','Password disalin ke clipboard');}} className="w-full">Salin Password</ActionButton>
        <div className="text-xs text-slate-400">Password ini hanya ditampilkan sekali. Tutup dialog untuk menghapusnya.</div>
      </div>
    </Modal>}

    {statusConfirm&&<ConfirmActionModal
      title={statusConfirm.status==='nonaktif'?'Nonaktifkan Staff':'Aktifkan Staff'}
      entityName={statusConfirm.staff.display_name}
      affectedBranch={statusConfirm.staff.cabang_nama||'Pusat'}
      consequence={statusConfirm.status==='nonaktif'?'Menonaktifkan staff akan memblokir semua akses masuk sistem untuk staff ini.':null}
      actionLabel={statusConfirm.status==='nonaktif'?'Ya, Nonaktifkan':'Ya, Aktifkan'}
      actionVariant={statusConfirm.status==='nonaktif'?'danger':'primary'}
      icon={Power}
      onClose={()=>setStatusConfirm(null)}
      onSubmit={async()=>{await setStatus(statusConfirm.staff,statusConfirm.status);setStatusConfirm(null);}}
    />}

    {resetConfirm&&<ConfirmActionModal
      title="Reset Password Staff"
      entityName={resetConfirm.display_name}
      affectedBranch={resetConfirm.cabang_nama||'Pusat'}
      consequence="Tindakan ini akan mengatur ulang password akun staff ini ke password sementara acak. Password sebelumnya tidak akan bisa digunakan lagi."
      actionLabel="Ya, Reset Password"
      actionVariant="danger"
      icon={RotateCcw}
      onClose={()=>setResetConfirm(null)}
      onSubmit={async()=>{await reset(resetConfirm.id);setResetConfirm(null);}}
    />}

    {deleteConfirm&&<Modal title="Hapus Permanen Staff" onClose={()=>{setDeleteConfirm(null);setDeleteConfirmText('');}} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-red-100 p-2 text-red-700"><Trash2 className="h-5 w-5"/></div>
            <div>
              <div className="font-black text-red-900">Aksi ini hanya untuk data staff yang salah dibuat.</div>
              <div className="mt-1 text-sm leading-relaxed text-red-700">
                Sistem akan menolak penghapusan jika staff sudah punya riwayat operasional seperti daily record, absensi, modul ajar, billing, atau audit tindakan.
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Staff</div>
          <div className="mt-1 font-black text-text-main">{deleteConfirm.display_name}</div>
          <div className="text-xs text-slate-500">{deleteConfirm.username} · {deleteConfirm.role.replace('_',' ')} · {deleteConfirm.cabang_nama||'Pusat'}</div>
        </div>
        <label className="block">
          <span className="label">Ketik username untuk konfirmasi <span className="font-mono text-rose-600">{deleteConfirm.username}</span></span>
          <input value={deleteConfirmText} onChange={e=>setDeleteConfirmText(e.target.value)} autoComplete="off" spellCheck={false} className="input w-full font-mono" placeholder={deleteConfirm.username}/>
        </label>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <ActionButton icon={X} onClick={()=>{setDeleteConfirm(null);setDeleteConfirmText('');}} variant="secondary">Batal</ActionButton>
          <ActionButton icon={Trash2} onClick={deleteStaffPermanently} variant="danger" disabled={deleteConfirmText!==deleteConfirm.username}>Hapus Permanen</ActionButton>
        </div>
      </div>
    </Modal>}
  </Panel>;
}

function WaliStatusBadge({ status }) {
  const t = {
    aktif: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    lulus: "bg-blue-50 text-blue-700 border-blue-200/80",
    keluar: "bg-rose-50 text-rose-700 border-rose-200/80",
    undangan: "bg-amber-50 text-amber-700 border-amber-200/80",
    nonaktif: "bg-slate-100 text-slate-600 border-slate-200/80"
  }[(status || '').toLowerCase()] || "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${t}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 shrink-0" />
      <span className="capitalize">{status}</span>
    </span>
  );
}

function WaliCard({ wali, onEdit, onReset, onStatusToggle }) {
  return (
    <div className="bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl p-3 flex gap-3 items-start transition cursor-pointer active:scale-[0.98]">
      <StudentAvatar name={wali.display_name} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-text-main text-sm truncate leading-tight" title={wali.display_name}>
            {wali.display_name}
          </div>
          <WaliStatusBadge status={wali.status} />
        </div>
        <div className="text-xs text-slate-500 mt-2 space-y-1">
          <div>
            <span className="font-medium text-slate-400">WA:</span>{" "}
            <span className="font-mono text-slate-700 font-bold">{wali.no_wa}</span>
          </div>
          <div>
            <span className="font-medium text-slate-400">Siswa:</span>{" "}
            <span className="font-medium text-slate-600">{wali.siswa_nama || "-"}</span>
          </div>
          <div>
            <span className="font-medium text-slate-400">Cabang:</span>{" "}
            <span className="font-medium text-slate-600">{wali.cabang_nama || "Pusat"}</span>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2.5">
          <IconButton
            icon={Pencil}
            label={`Edit ${wali.display_name}`}
            onClick={() => onEdit(wali)}
            size="sm"
          />
          <IconButton
            icon={RotateCcw}
            label="Reset password"
            onClick={() => onReset(wali)}
            size="sm"
          />
          {wali.status === "nonaktif" ? (
            <IconButton
              icon={Check}
              label="Aktifkan"
              onClick={() => onStatusToggle({ wali, status: "aktif" })}
              size="sm"
            />
          ) : (
            <IconButton
              icon={Power}
              label="Nonaktifkan"
              onClick={() => onStatusToggle({ wali, status: "nonaktif" })}
              size="sm"
              variant="danger"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WaliTab({user,toast}){
  const m=useMaster(user);const[siswa,setSiswa]=useState([]);const[wali,setWali]=useState([]);const[form,setForm]=useState({display_name:'',no_wa:'',siswa_id:'',relasi:''});
  const[tempPw,setTempPw]=useState(null);const[editing,setEditing]=useState(null);const[openForm,setOpenForm]=useState(false);
  const[statusConfirm,setStatusConfirm]=useState(null);
  const[resetConfirm,setResetConfirm]=useState(null);
  const[searchQuery,setSearchQuery]=useState('');
  const[filterStatus,setFilterStatus]=useState('');
  const[filterOpen,setFilterOpen]=useState(false);

  async function load(){
    const [siswaData, waliData] = await Promise.all([
      api.siswa({cabang_id:m.cabangId,status:'semua'}),
      api.wali(m.cabangId)
    ]);
    setSiswa(siswaData);
    setWali(waliData);
  }
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[m.cabangId]);
  async function add(){
    if(!form.display_name.trim()||!form.no_wa.trim()||!form.siswa_id){toast('err','Nama wali, nomor WA, dan siswa wajib diisi');return;}
    try{const r=await api.createWali({...form,display_name:form.display_name.trim(),no_wa:form.no_wa.trim()});if(r.temporary_password){setTempPw(r.temporary_password);}else{toast('ok','Akun wali yang sudah ada dikaitkan ke siswa');}setForm({display_name:'',no_wa:'',siswa_id:'',relasi:''});setOpenForm(false);load();}catch(e){toast('err',e.message);}
  }
  async function reset(id){try{const r=await api.resetPassword(id);setTempPw(r.temporary_password);}catch(e){toast('err',e.message);}}
  async function setStatus(w,status){try{await api.updateWali(w.id,{display_name:w.display_name,no_wa:w.no_wa,status});toast('ok',status==='nonaktif'?'Akun wali dinonaktifkan':'Akun wali diaktifkan');load();}catch(e){toast('err',e.message);}}
  async function saveEdit(){try{await api.updateWali(editing.id,{display_name:editing.display_name,no_wa:editing.no_wa,status:editing.status});toast('ok','Akun wali diperbarui');setEditing(null);load();}catch(e){toast('err',e.message);}}
  const filteredWali = useMemo(() => {
    return wali.filter(w => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (![w.display_name, w.no_wa, w.siswa_nama, w.cabang_nama].some(val => String(val || '').toLowerCase().includes(q))) return false;
      }
      return !(filterStatus && w.status !== filterStatus);
    });
  }, [wali, searchQuery, filterStatus]);
  const selectedSiswa = siswa.find(s => String(s.id) === String(form.siswa_id));
  const right = (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <ActionButton icon={Plus} onClick={() => { setForm({ display_name: '', no_wa: '', siswa_id: '', relasi: '' }); setOpenForm(true); }} className="w-full sm:hidden">Tambah Wali</ActionButton>
      <ActionButton icon={Plus} onClick={() => { setForm({ display_name: '', no_wa: '', siswa_id: '', relasi: '' }); setOpenForm(true); }} className="hidden sm:inline-flex">Tambah Wali</ActionButton>
    </div>
  );
  return (
    <Panel title="Akun Wali" right={right} className="overflow-visible md:overflow-hidden">
      <div className="space-y-4">
        <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
          <div className="md:grid md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start md:gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input type="text" placeholder="Cari wali, nomor WA, siswa, atau cabang…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoComplete="off" className="input pl-10 w-full font-bold" />
                {searchQuery && (
                  <button type="button" aria-label="Hapus pencarian wali" onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button type="button" aria-label="Buka filter wali" onClick={() => setFilterOpen(v => !v)} className={`md:hidden relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${filterOpen || filterStatus || (user.role === 'admin' && m.cabangId) ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-500'}`}>
                <Settings className="w-3.5 h-3.5" />
                Filter
                {(() => {
                  const count = [filterStatus, user.role === 'admin' && m.cabangId].filter(Boolean).length;
                  return count > 0 ? <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-white">{count}</span> : null;
                })()}
              </button>
            </div>
            <div className={`mt-2 md:mt-0 ${filterOpen ? 'block' : 'hidden md:block'}`}>
              <div className="grid grid-cols-2 md:flex md:flex-nowrap gap-2">
                {user.role === 'admin' && (
                  <CustomSelect value={m.cabangId} onChange={e => m.setCabangId(e.target.value)} className="input w-full md:w-44 text-xs sm:text-sm">
                    <option value="">Semua Cabang</option>
                    {m.cabang.map(v => <option key={v.id} value={v.id}>{v.nama}</option>)}
                  </CustomSelect>
                )}
                <CustomSelect value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input w-full md:w-40 text-xs sm:text-sm">
                  <option value="">Semua Status</option>
                  <option value="undangan">Undangan</option>
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </CustomSelect>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden md:block">
          <Table headers={["Nama", "WA", "Siswa", "Cabang", "Status", "Aksi"]}>
            {filteredWali.map(v => (
              <tr key={v.id}>
                <Td><span className="font-bold text-slate-800">{v.display_name}</span></Td>
                <Td><span className="font-mono text-slate-700 font-bold">{v.no_wa}</span></Td>
                <Td>{v.siswa_nama || "-"}</Td>
                <Td>{v.cabang_nama || "Pusat"}</Td>
                <Td><WaliStatusBadge status={v.status} /></Td>
                <Td>
                  <div className="flex gap-2">
                    <IconButton icon={Pencil} label={`Edit ${v.display_name}`} onClick={() => setEditing(v)} size="sm" />
                    <IconButton icon={RotateCcw} label="Reset password" onClick={() => setResetConfirm(v)} size="sm" />
                    {v.status === "nonaktif" ? (
                      <IconButton icon={Check} label="Aktifkan" onClick={() => setStatusConfirm({ wali: v, status: "aktif" })} size="sm" />
                    ) : (
                      <IconButton icon={Power} label="Nonaktifkan" onClick={() => setStatusConfirm({ wali: v, status: "nonaktif" })} size="sm" variant="danger" />
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          {filteredWali.length === 0 && (
            <div className="bg-white border border-t-0 border-slate-200 rounded-b-xl p-8 text-center text-slate-400 text-sm font-bold">Tidak ada akun wali yang ditemukan.</div>
          )}
        </div>
        <div className="block md:hidden space-y-3">
          {filteredWali.map(v => (
            <WaliCard key={v.id} wali={v} onEdit={setEditing} onReset={setResetConfirm} onStatusToggle={setStatusConfirm} />
          ))}
          {filteredWali.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm font-bold">Tidak ada akun wali yang ditemukan.</div>
          )}
        </div>
      </div>
      {openForm && (
        <Modal title="Tambah Wali" onClose={() => setOpenForm(false)} maxWidth="max-w-3xl">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Data Akun Wali
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Nama Wali <span className="text-rose-500">*</span></span>
                  <Input placeholder="Nama lengkap wali" value={form.display_name} onChange={v => setForm(f => ({ ...f, display_name: v }))} />
                </label>
                <label className="block">
                  <span className="label">Nomor WhatsApp Login <span className="text-rose-500">*</span></span>
                  <Input placeholder="08xxxxxxxxxx" value={form.no_wa} onChange={v => setForm(f => ({ ...f, no_wa: v }))} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="label">Siswa Terhubung <span className="text-rose-500">*</span></span>
                  <SearchableSelect value={form.siswa_id} onChange={e => setForm(f => ({ ...f, siswa_id: e.target.value }))} className="input w-full" placeholder="Pilih siswa" searchPlaceholder="Cari nama siswa…">
                    <option value="">Pilih siswa</option>
                    {siswa.map(v => <option key={v.id} value={v.id}>{`${v.nama}${v.rombel_nama ? " - " + v.rombel_nama : ""}`}</option>)}
                  </SearchableSelect>
                </label>
                <label className="block">
                  <span className="label">Relasi</span>
                  <Input placeholder="Ayah, Ibu, Wali" value={form.relasi} onChange={v => setForm(f => ({ ...f, relasi: v }))} />
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cabang Siswa</div>
                  <div className="mt-0.5 text-sm font-black text-slate-700">{selectedSiswa?.cabang_nama || m.cabang.find(v => String(v.id) === String(m.cabangId))?.nama || "-"}</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <div className="text-xs font-black text-slate-700">Nomor WA menjadi identitas login</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-500">Jika nomor sudah terdaftar, sistem akan menghubungkan akun wali yang sama ke siswa ini.</div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <ActionButton icon={X} onClick={() => setOpenForm(false)} variant="secondary">Batal</ActionButton>
              <ActionButton icon={Plus} onClick={add}>Tambah Wali</ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Akun Wali" onClose={() => setEditing(null)} maxWidth="max-w-2xl">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Data Akun Wali
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Siswa Terhubung</div>
                <div className="mt-0.5 text-sm font-black text-slate-700">{editing.siswa_nama || "-"}</div>
                <div className="text-xs text-slate-500">{editing.cabang_nama || m.cabang.find(v => String(v.id) === String(m.cabangId))?.nama || "Pusat"}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Nama Wali <span className="text-rose-500">*</span></span>
                  <Input placeholder="Nama wali" value={editing.display_name || ""} onChange={v => setEditing(e => ({ ...e, display_name: v }))} />
                </label>
                <label className="block">
                  <span className="label">Nomor WhatsApp Login <span className="text-rose-500">*</span></span>
                  <Input placeholder="08xxxxxxxxxx" value={editing.no_wa || ""} onChange={v => setEditing(e => ({ ...e, no_wa: v }))} />
                </label>
                <label className="block">
                  <span className="label">Status Akun <span className="text-rose-500">*</span></span>
                  <CustomSelect value={editing.status || "aktif"} onChange={e => setEditing(prev => ({ ...prev, status: e.target.value }))} className="input w-full">
                    <option value="undangan">Undangan</option>
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </CustomSelect>
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <div className="text-xs font-black text-slate-700">Edit ini hanya mengubah akun login wali</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-500">Penggantian siswa/wali aktif tetap lewat form tambah/kaitkan wali agar aturan satu siswa satu wali aktif tetap terjaga.</div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <ActionButton icon={X} onClick={() => setEditing(null)} variant="secondary">Batal</ActionButton>
              <ActionButton icon={Save} onClick={saveEdit}>Simpan Perubahan</ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {tempPw && (
        <Modal title="Password Sementara" onClose={() => setTempPw(null)}>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">Password sementara telah dibuat. Salin dan bagikan kepada pengguna:</div>
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
              <span className="text-2xl font-black text-text-main tracking-widest select-all">{tempPw}</span>
            </div>
            <ActionButton icon={Copy} onClick={() => { navigator.clipboard.writeText(tempPw); toast("ok", "Password disalin ke clipboard"); }} className="w-full">Salin Password</ActionButton>
            <div className="text-xs text-slate-400">Password ini hanya ditampilkan sekali. Tutup dialog untuk menghapusnya.</div>
          </div>
        </Modal>
      )}
      {statusConfirm && (
        <ConfirmActionModal
          title={statusConfirm.status === "nonaktif" ? "Nonaktifkan Wali" : "Aktifkan Wali"}
          entityName={statusConfirm.wali.display_name}
          affectedBranch={statusConfirm.wali.cabang_nama || m.cabang.find(v => v.id === m.cabangId)?.nama || "Pusat"}
          consequence={statusConfirm.status === "nonaktif" ? "Menonaktifkan wali akan memblokir akses ke application wali untuk akun ini." : null}
          actionLabel={statusConfirm.status === "nonaktif" ? "Ya, Nonaktifkan" : "Ya, Aktifkan"}
          actionVariant={statusConfirm.status === "nonaktif" ? "danger" : "primary"}
          icon={statusConfirm.status === "nonaktif" ? PowerOff : Check}
          onClose={() => setStatusConfirm(null)}
          onSubmit={async () => {
            await setStatus(statusConfirm.wali, statusConfirm.status);
            setStatusConfirm(null);
          }}
        />
      )}
      {resetConfirm && (
        <ConfirmActionModal
          title="Reset Password Wali"
          entityName={resetConfirm.display_name}
          affectedBranch={resetConfirm.cabang_nama || m.cabang.find(v => v.id === m.cabangId)?.nama || "Pusat"}
          consequence="Tindakan ini akan mengatur ulang password akun wali ini ke password sementara acak. Password sebelumnya tidak akan bisa digunakan lagi."
          actionLabel="Ya, Reset Password"
          actionVariant="danger"
          icon={RotateCcw}
          onClose={() => setResetConfirm(null)}
          onSubmit={async () => {
            await reset(resetConfirm.id);
            setResetConfirm(null);
          }}
        />
      )}
    </Panel>
  );
}

function RombelTab({user,toast}){
  const m=useMaster(user);const[form,setForm]=useState({nama:'',jenjang_id:'',cabang_id:''});const[staff,setStaff]=useState([]);
  const [openForm, setOpenForm] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({cabang_id:'',rombel_id:'',pengguna_id:'',role:'bantu'});
  const [assignRombel, setAssignRombel] = useState([]);
  const [guruDetailRombel, setGuruDetailRombel] = useState(null);
  const [roleConfirm, setRoleConfirm] = useState(null);
  const [editingRombel, setEditingRombel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJenjang, setFilterJenjang] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(()=>{api.staff(user.role==='admin'?'':m.cabangId).then(setStaff).catch(e=>toast('err',e.message));},[m.cabangId,user.role]);
  useEffect(()=>{
    if(user.role==='admin'){
      api.rombel('').then(setAssignRombel).catch(e=>toast('err',e.message));
    }else{
      setAssignRombel(m.rombel);
    }
  },[user.role,m.rombel]);
  async function refreshRombelData(){
    await m.load();
    if(user.role==='admin')setAssignRombel(await api.rombel(''));
  }
  function openAssignModal(){
    const cabangId=user.role==='admin'?(m.cabangId||''):m.cabangId;
    const source=user.role==='admin'?(assignRombel.length?assignRombel:m.rombel):m.rombel;
    const firstRombel=cabangId?source.find(r=>String(r.cabang_id)===String(cabangId)):null;
    setAssignForm({cabang_id:cabangId,rombel_id:firstRombel?.id||'',pengguna_id:'',role:'bantu'});
    setAssignModalOpen(true);
  }
  async function add(){
    const targetCabangId = user.role === 'admin' ? (form.cabang_id || m.cabangId) : user.cabang_id;
    if(!targetCabangId){toast('err','Pilih cabang sekolah terlebih dahulu');return;}
    try{await api.createRombel({...form,cabang_id:targetCabangId,jenjang_id:Number(form.jenjang_id)});toast('ok','Rombel dibuat');setForm({nama:'',jenjang_id:'',cabang_id:''});setOpenForm(false);await refreshRombelData();}catch(e){toast('err',e.message);}}
  async function saveEdit() {
    if (!editingRombel.nama.trim() || !editingRombel.jenjang_id) {
      toast('err', 'Nama dan jenjang wajib diisi');
      return;
    }
    try {
      await api.updateRombel(editingRombel.id, {
        nama: editingRombel.nama.trim(),
        jenjang_id: Number(editingRombel.jenjang_id),
        aktif: editingRombel.aktif ? 1 : 0
      });
      toast('ok', 'Rombel diperbarui');
      setEditingRombel(null);
      await refreshRombelData();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function removeRombel(id) {
    try {
      await api.deleteRombel(id);
      toast('ok', 'Rombel dihapus');
      await refreshRombelData();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function assignGuruFromModal(){
    if(user.role==='admin'&&!assignForm.cabang_id)return toast('err','Pilih cabang dulu');
    if(!assignForm.rombel_id)return toast('err','Pilih rombel dulu');
    if(!assignForm.pengguna_id)return toast('err','Pilih guru dulu');
    try{
      await api.assignGuruRombel(assignForm.rombel_id,{pengguna_id:Number(assignForm.pengguna_id),role:assignForm.role||'bantu'});
      toast('ok','Guru ditugaskan');
      setAssignForm(f=>({...f,pengguna_id:'',role:'bantu'}));
      await refreshRombelData();
    }catch(e){toast('err',e.message);}
  }
  async function removeGuru(r,g){try{await api.removeGuruRombel(r.id,g.id);toast('ok','Guru dilepas');if(guruDetailRombel?.id===r.id)setGuruDetailRombel(null);await refreshRombelData();}catch(e){toast('err',e.message);}}
  async function toggleGuruRole(r,g){
    const newRole = g.role === 'utama' ? 'bantu' : 'utama';
    try{
      await api.assignGuruRombel(r.id,{pengguna_id:g.id,role:newRole});
      toast('ok',`Peran ${g.display_name} diubah menjadi ${newRole==='utama'?'Utama':'Bantu'}`);
      if(guruDetailRombel?.id===r.id)setGuruDetailRombel(null);
      await refreshRombelData();
    }catch(e){
      toast('err',e.message);
    }
  }
  const gurus=staff.filter(s=>s.role==='guru'&&s.status!=='nonaktif');
  const assignCabangId=user.role==='admin'?assignForm.cabang_id:m.cabangId;
  const assignRombelOptions=assignRombel.filter(r=>!assignCabangId||String(r.cabang_id)===String(assignCabangId));
  const selectedAssignRombel=assignRombelOptions.find(r=>String(r.id)===String(assignForm.rombel_id));
  const selectedAssignedGurus=selectedAssignRombel?.gurus||[];
  const availableAssignGurus=gurus.filter(g=>
    (!assignCabangId || Number(g.cabang_id)===Number(assignCabangId)) &&
    (!selectedAssignRombel || Number(g.cabang_id)===Number(selectedAssignRombel.cabang_id)) &&
    !selectedAssignedGurus.some(x=>x.id===g.id)
  );
  const filteredRombel = useMemo(() => {
    return m.rombel.filter(r => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.nama?.toLowerCase().includes(q);
        const matchesGuru = (r.gurus || []).some(g => g.display_name?.toLowerCase().includes(q));
        if (!matchesName && !matchesGuru) return false;
      }
      if (filterJenjang) {
        if (String(r.jenjang_id) !== String(filterJenjang)) return false;
      }
      return true;
    });
  }, [m.rombel, searchQuery, filterJenjang]);

  const right = (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
      <ActionButton icon={UserPlus} onClick={openAssignModal} variant="ghost" className="sm:hidden px-2 text-xs">Tugaskan Guru</ActionButton>
      <ActionButton icon={UserPlus} onClick={openAssignModal} variant="ghost" className="hidden sm:inline-flex px-2 sm:px-4 text-xs sm:text-sm">Tugaskan Guru</ActionButton>
      <ActionButton icon={Plus} onClick={()=>{setForm({nama:'',jenjang_id:'',cabang_id:m.cabangId||''});setOpenForm(true);}} className="sm:hidden px-2 text-xs">Tambah Rombel</ActionButton>
      <ActionButton icon={Plus} onClick={()=>{setForm({nama:'',jenjang_id:'',cabang_id:m.cabangId||''});setOpenForm(true);}} className="hidden sm:inline-flex px-2 sm:px-4 text-xs sm:text-sm">Tambah Rombel</ActionButton>
    </div>
  );
  return <Panel title="Rombel" right={right} className="overflow-visible md:overflow-hidden">
    <div className="space-y-4">
      {/* Search & Filters Panel */}
      <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
        <div className="md:grid md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start md:gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Cari rombel atau guru pengajar…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input pl-10 w-full font-bold"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Hapus pencarian rombel"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Buka filter rombel"
              onClick={() => setFilterOpen(o => !o)}
              className={`md:hidden relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${
                filterOpen || filterJenjang || (user.role === 'admin' && m.cabangId)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Filter
              {(() => {
                const count = [filterJenjang, user.role === 'admin' && m.cabangId].filter(Boolean).length;
                return count > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-white">
                    {count}
                  </span>
                ) : null;
              })()}
            </button>
          </div>

          <div className={`mt-2 md:mt-0 ${filterOpen ? 'block' : 'hidden md:block'}`}>
            <div className="grid grid-cols-2 md:flex md:flex-nowrap gap-2">
              {user.role === 'admin' && (
                <CustomSelect
                  value={m.cabangId}
                  onChange={e => m.setCabangId(e.target.value)}
                  className="input w-full md:w-44 text-xs sm:text-sm"
                >
                  <option value="">Semua Cabang</option>
                  {m.cabang.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nama}
                    </option>
                  ))}
                </CustomSelect>
              )}
              <CustomSelect
                value={filterJenjang}
                onChange={e => setFilterJenjang(e.target.value)}
                className="input w-full md:w-40 text-xs sm:text-sm"
              >
                <option value="">Semua Jenjang</option>
                {m.jenjang.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
              </CustomSelect>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filteredRombel.map(r => {
          const assignedGurus = r.gurus || [];
          return (
            <div
              key={r.id}
              className="relative bg-white border border-slate-200/80 rounded-xl p-3 shadow-sm transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="truncate font-extrabold text-slate-800 text-base" title={r.nama}>
                        {r.nama}
                      </div>
                      {['admin', 'admin_cabang'].includes(user.role) && (
                        <div className="flex shrink-0 items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                          <IconButton
                            icon={Pencil}
                            label={`Edit Rombel ${r.nama}`}
                            onClick={() => setEditingRombel({ ...r })}
                            size="sm"
                          />
                          <IconButton
                            icon={Trash2}
                            label={`Hapus Rombel ${r.nama}`}
                            onClick={() => setDeleteConfirm(r)}
                            size="sm"
                            variant="danger"
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-400 mt-0.5 uppercase tracking-wide">
                      {r.cabang_nama}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <span className="bg-indigo-50/70 text-indigo-600 border border-indigo-100/50 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      {r.jenjang_nama}
                    </span>
                    <span
                      className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full ${
                        r.aktif ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {r.aktif ? 'aktif' : 'nonaktif'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Guru Pengajar</div>
                      <div className="mt-1 min-h-9">
                        <GuruAvatarStack gurus={assignedGurus} onSelect={() => setGuruDetailRombel(r)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {filteredRombel.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm font-bold">
          Tidak ada data rombel yang ditemukan.
        </div>
      )}
    </div>
    {openForm && <Modal title="Tambah Rombel" onClose={()=>setOpenForm(false)} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Identitas Rombel</div>
          {user.role === 'admin' && (
            <div className="mt-3">
              <label className="block">
                <span className="label">Cabang Sekolah <span className="text-rose-500">*</span></span>
                <CustomSelect value={form.cabang_id || ''} onChange={e=>setForm(f=>({...f,cabang_id:e.target.value}))} className="input w-full">
                  <option value="">Pilih Cabang</option>
                  {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
                </CustomSelect>
              </label>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-3">
            <label className="block">
              <span className="label">Nama Rombel <span className="text-rose-500">*</span></span>
              <Input placeholder="Contoh: KB A Mawar" value={form.nama} onChange={v=>setForm(f=>({...f,nama:v}))}/>
            </label>
            <label className="block">
              <span className="label">Jenjang <span className="text-rose-500">*</span></span>
              <CustomSelect value={form.jenjang_id} onChange={e=>setForm(f=>({...f,jenjang_id:e.target.value}))} className="input w-full"><option value="">Pilih Jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</CustomSelect>
            </label>
          </div>
          <div className="mt-2 text-xs text-slate-500">Guru pengajar bisa ditugaskan setelah rombel dibuat.</div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100 pt-4">
          <ActionButton icon={X} onClick={()=>setOpenForm(false)} variant="ghost" className="w-full sm:w-auto">Batal</ActionButton>
          <ActionButton icon={Plus} onClick={add} disabled={!form.nama.trim()||!form.jenjang_id} className="w-full sm:w-auto">Tambah Rombel</ActionButton>
        </div>
      </div>
    </Modal>}
    {assignModalOpen && <Modal title="Tugaskan Guru" onClose={()=>setAssignModalOpen(false)} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Target Penugasan</div>
          <div className={`mt-3 grid grid-cols-1 gap-3 ${user.role==='admin'?'sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_10rem]':'sm:grid-cols-[1fr_12rem]'}`}>
            {user.role==='admin'&&<label className="block">
              <span className="label">Cabang <span className="text-rose-500">*</span></span>
              <CustomSelect value={assignForm.cabang_id} onChange={e=>setAssignForm(f=>({...f,cabang_id:e.target.value,rombel_id:'',pengguna_id:''}))} className="input w-full">
                <option value="">Pilih cabang</option>
                {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
              </CustomSelect>
            </label>}
            <label className="block">
              <span className="label">Rombel <span className="text-rose-500">*</span></span>
              <CustomSelect value={assignForm.rombel_id} onChange={e=>setAssignForm(f=>({...f,rombel_id:e.target.value,pengguna_id:''}))} className="input w-full" disabled={user.role==='admin'&&!assignForm.cabang_id}>
                <option value="">{user.role==='admin'&&!assignForm.cabang_id?'Pilih cabang dulu':'Pilih rombel'}</option>
                {assignRombelOptions.map(r=><option key={r.id} value={r.id}>{r.nama} - {r.jenjang_nama}</option>)}
              </CustomSelect>
            </label>
            <label className="block">
              <span className="label">Peran</span>
              <CustomSelect value={assignForm.role} onChange={e=>setAssignForm(f=>({...f,role:e.target.value}))} className="input w-full"><option value="bantu">Bantu</option><option value="utama">Utama</option></CustomSelect>
            </label>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Guru Terpasang</div>
              <div className="mt-0.5 text-xs text-slate-500">{selectedAssignRombel?.nama||'Pilih rombel terlebih dahulu'}</div>
            </div>
            {selectedAssignedGurus.length>0&&<GuruAvatarStack gurus={selectedAssignedGurus} onSelect={g=>selectedAssignRombel&&setRoleConfirm({rombel:selectedAssignRombel,guru:g})}/>}
          </div>
          {selectedAssignedGurus.length>0&&<div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
            {selectedAssignedGurus.map(g=><div key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <StudentAvatar name={g.display_name} url={g.foto} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-slate-700">{g.display_name}</div>
                  <button onClick={()=>setRoleConfirm({rombel:selectedAssignRombel,guru:g})} className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-black ${g.role==='utama'?'bg-indigo-50 text-indigo-600':'bg-slate-100 text-slate-500'}`}>{g.role==='utama'?'Utama':'Bantu'}</button>
                </div>
              </div>
              <IconButton icon={UserMinus} label={`Lepas ${g.display_name}`} onClick={()=>removeGuru(selectedAssignRombel,g)} size="sm" variant="danger"/>
            </div>)}
          </div>}
          {selectedAssignRombel&&selectedAssignedGurus.length===0&&<div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-400">Belum ada guru terpasang.</div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Tambah Guru</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <CustomSelect value={assignForm.pengguna_id} onChange={e=>setAssignForm(f=>({...f,pengguna_id:e.target.value}))} className="input w-full" disabled={!assignForm.rombel_id}>
              <option value="">{assignForm.rombel_id?(availableAssignGurus.length?'Pilih guru':'Semua guru sudah ditugaskan'):(user.role==='admin'&&!assignForm.cabang_id?'Pilih cabang dulu':'Pilih rombel dulu')}</option>
              {availableAssignGurus.map(g=><option key={g.id} value={g.id}>{g.display_name}</option>)}
            </CustomSelect>
            <ActionButton icon={Users} onClick={assignGuruFromModal} disabled={(user.role==='admin'&&!assignForm.cabang_id)||!assignForm.rombel_id||!assignForm.pengguna_id}>Simpan</ActionButton>
          </div>
        </div>
      </div>
    </Modal>}
    {guruDetailRombel&&<Modal title={`Guru ${guruDetailRombel.nama}`} onClose={()=>setGuruDetailRombel(null)} maxWidth="max-w-xl">
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Rombel</div>
          <div className="mt-1 font-black text-text-main">{guruDetailRombel.nama}</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{guruDetailRombel.cabang_nama} · {guruDetailRombel.jenjang_nama}</div>
        </div>
        {(guruDetailRombel.gurus||[]).length>0?<div className="max-h-80 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
          {(guruDetailRombel.gurus||[]).map(g=><div key={g.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <StudentAvatar name={g.display_name} url={g.foto} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-800">{g.display_name}</div>
                <button onClick={()=>setRoleConfirm({rombel:guruDetailRombel,guru:g})} className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-black ${g.role==='utama'?'bg-indigo-50 text-indigo-600':'bg-slate-100 text-slate-500'}`}>{g.role==='utama'?'Utama':'Bantu'}</button>
              </div>
            </div>
            <IconButton icon={UserMinus} label={`Lepas ${g.display_name}`} onClick={()=>removeGuru(guruDetailRombel,g)} size="sm" variant="danger"/>
          </div>)}
        </div>:<div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm italic text-slate-400">Belum ada guru terpasang.</div>}
      </div>
    </Modal>}
    {roleConfirm && <ConfirmActionModal
      title="Ubah Peran Guru"
      entityName={`${roleConfirm.guru.display_name} (${roleConfirm.rombel.nama})`}
      affectedBranch={roleConfirm.rombel.cabang_nama || m.cabang.find(c=>c.id===m.cabangId)?.nama || 'Pusat'}
      consequence={roleConfirm.guru.role === 'bantu'
        ? `Mengubah peran menjadi Guru Utama akan otomatis mengubah status Guru Utama saat ini di kelas ${roleConfirm.rombel.nama} menjadi Guru Bantu.`
        : `Mengubah peran menjadi Guru Bantu.`}
      actionLabel="Ya, Ubah Peran"
      actionVariant="primary"
      icon={RefreshCw}
      onClose={() => setRoleConfirm(null)}
      onSubmit={async () => {
        await toggleGuruRole(roleConfirm.rombel, roleConfirm.guru);
        setRoleConfirm(null);
      }}
    />}
    {editingRombel && <Modal title="Edit Rombel" onClose={()=>setEditingRombel(null)} maxWidth="max-w-md">
      <div className="space-y-4 p-1">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Rombel</span>
          <Input placeholder="Nama rombel (contoh: KB Tulip)" value={editingRombel.nama} onChange={v=>setEditingRombel(f=>({...f,nama:v}))}/>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jenjang</span>
          <CustomSelect value={editingRombel.jenjang_id} onChange={e=>setEditingRombel(f=>({...f,jenjang_id:e.target.value}))} className="input w-full"><option value="">Pilih Jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</CustomSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status Rombel</span>
          <CustomSelect value={editingRombel.aktif === undefined ? 1 : editingRombel.aktif} onChange={e=>setEditingRombel(f=>({...f,aktif:e.target.value === '1' ? 1 : 0}))} className="input w-full">
            <option value="1">Aktif</option>
            <option value="0">Nonaktif</option>
          </CustomSelect>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <ActionButton onClick={()=>setEditingRombel(null)} className="bg-slate-100 text-slate-600 hover:bg-slate-200">Batal</ActionButton>
          <ActionButton icon={Save} onClick={saveEdit}>Simpan Perubahan</ActionButton>
        </div>
      </div>
    </Modal>}
    {deleteConfirm && <ConfirmActionModal
      title="Hapus Rombel"
      entityName={deleteConfirm.nama}
      affectedBranch={deleteConfirm.cabang_nama || m.cabang.find(c=>c.id===m.cabangId)?.nama || 'Pusat'}
      consequence="Menghapus rombel ini juga akan menghapus data penugasan guru di dalamnya. Rombel tidak bisa dihapus jika masih ada siswa yang terdaftar aktif."
      actionLabel="Ya, Hapus Rombel"
      actionVariant="danger"
      icon={Trash2}
      onClose={() => setDeleteConfirm(null)}
      onSubmit={async () => {
        await removeRombel(deleteConfirm.id);
        setDeleteConfirm(null);
      }}
    />}
  </Panel>;
}

function GuruAvatarStack({gurus,onSelect}){
  const visible=gurus.slice(0,3);
  const extra=Math.max(0,gurus.length-visible.length);
  if(!gurus.length)return <div className="text-xs italic text-slate-400">Belum ada guru</div>;
  return <div className="flex items-center">
    <div className="flex -space-x-2">
      {visible.map(g=>{
        const title=`${g.display_name} - ${g.role==='utama'?'Utama':'Bantu'}`;
        return <button
          key={g.id}
          type="button"
          title={title}
          onClick={()=>onSelect(g)}
          className={`relative rounded-lg ring-2 ring-white transition hover:z-10 hover:-translate-y-0.5 ${g.role==='utama'?'ring-amber-200':''}`}
        >
          <StudentAvatar name={g.display_name} url={g.foto} size="sm" />
          {g.role==='utama'&&<span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary"/>}
        </button>;
      })}
      {extra>0&&<div title={gurus.slice(3).map(g=>`${g.display_name} (${g.role})`).join(', ')} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-xs font-black text-slate-600 ring-2 ring-white">+{extra}</div>}
    </div>
  </div>;
}

function BillingTab({user,toast}){
  const m=useMaster(user);
  const currentSchoolYear = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const start = month >= 7 ? year : year - 1;
    return `${start}/${start + 1}`;
  })();
  const[tarif,setTarif]=useState([]);
  const[diskon,setDiskon]=useState([]);
  const[tagihan,setTagihan]=useState([]);
  const[pembayaran,setPembayaran]=useState([]);
  const[invoices,setInvoices]=useState([]);
  const[siswa,setSiswa]=useState([]);
  const[selectedBills,setSelectedBills]=useState([]);
  const[preview,setPreview]=useState(null);
  const[alokasiPreview,setAlokasiPreview]=useState(null);
  const[alokasiEdit,setAlokasiEdit]=useState(null);
  const[confirmAction,setConfirmAction]=useState(null);
  const[submitting,setSubmitting]=useState(false);

  const[localCabangIdDiskon,setLocalCabangIdDiskon]=useState('');
  const[localCabangIdPayment,setLocalCabangIdPayment]=useState('');

  const filteredSiswaForPayment = useMemo(() => {
    if (!localCabangIdPayment) return siswa;
    return siswa.filter(s => String(s.cabang_id) === String(localCabangIdPayment));
  }, [siswa, localCabangIdPayment]);

  const filteredSiswaForDiskon = useMemo(() => {
    if (!localCabangIdDiskon) return siswa;
    return siswa.filter(s => String(s.cabang_id) === String(localCabangIdDiskon));
  }, [siswa, localCabangIdDiskon]);
  
  // Modal visibility states
  const[showTarifModal,setShowTarifModal]=useState(false);
  const[showDiskonModal,setShowDiskonModal]=useState(false);
  const[showPaymentModal,setShowPaymentModal]=useState(false);
  const[editingTarif,setEditingTarif]=useState(null);
  const[editingDiskon,setEditingDiskon]=useState(null);

  // Filter state
  const[filterTahunAjaran,setFilterTahunAjaran]=useState(currentSchoolYear);
  const[filterPeriode,setFilterPeriode]=useState('');
  const[billingSubTab,setBillingSubTab]=useState('ringkasan');
  const[showGenerate,setShowGenerate]=useState(false);
  const[form,setForm]=useState({periode:''});
  const[generateCabangId,setGenerateCabangId]=useState('');

  useEffect(()=>{
    if(m.cabangId){
      setGenerateCabangId(m.cabangId);
    }else{
      setGenerateCabangId('');
    }
  },[m.cabangId]);

  // Form states
  const[tarifForm,setTarifForm]=useState({cabang_id:'',tahun_ajaran:currentSchoolYear,jenjang_id:'',jenis:'spp',nama:'SPP',nominal:''});
  const[diskonForm,setDiskonForm]=useState({siswa_id:'',jenis:'spp',tipe:'nominal',nilai:'',catatan:''});
  const[payForm,setPayForm]=useState({siswa_id:'',nominal:'',metode:'tunai',tanggal:todayWIB(),reference:'',catatan:''});

  // Computed billing summary stats
  const billingStats=useMemo(()=>{
    const activeTagihan=tagihan.filter(t=>t.status!=='void');
    const totalTagihan=activeTagihan.reduce((s,t)=>s+Number(t.nominal_final||0),0);
    const totalTerbayar=activeTagihan.reduce((s,t)=>s+Number(t.paid_amount||0),0);
    const outstanding=totalTagihan-totalTerbayar;
    const collectionRate=totalTagihan>0?Math.round((totalTerbayar/totalTagihan)*100):0;
    const pendingCount=pembayaran.filter(p=>p.status==='pending_verification').length;
    const uniquePeriods=[...new Set(tagihan.map(t=>t.periode).filter(Boolean))].sort();
    return{totalTagihan,totalTerbayar,outstanding,collectionRate,pendingCount,uniquePeriods};
  },[tagihan,pembayaran]);

  // Filtered tagihan by period
  const filteredTagihan=useMemo(()=>{
    if(!filterPeriode)return tagihan;
    return tagihan.filter(t=>t.periode===filterPeriode);
  },[tagihan,filterPeriode]);

  // Grouped tarif by jenjang/global
  const groupedTarif = useMemo(() => {
    const groups = {};
    tarif.forEach(t => {
      const key = t.jenjang_nama || 'Global';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [tarif]);
  const selectedPaymentStudent=siswa.find(s=>String(s.id)===String(payForm.siswa_id));
  const paymentCabangId=m.cabangId||selectedPaymentStudent?.cabang_id||'';

  async function load(){
    try {
      const [tarifData, diskonData, tagihanData, pembayaranData, invoicesData, siswaData] = await Promise.all([
        api.tarif({cabang_id:m.cabangId,tahun_ajaran:filterTahunAjaran}),
        api.diskon({cabang_id:m.cabangId,tahun_ajaran:filterTahunAjaran}),
        api.tagihan({cabang_id:m.cabangId}),
        api.pembayaran({cabang_id:m.cabangId}),
        api.invoice({cabang_id:m.cabangId}),
        api.siswa({cabang_id:m.cabangId,status:'semua'})
      ]);

      setTarif(tarifData);
      setDiskon(diskonData);
      setTagihan(tagihanData);
      setPembayaran(pembayaranData);
      setInvoices(invoicesData);
      setSiswa(siswaData);
    } catch(e) {
      setTarif([]);
      setDiskon([]);
      setTagihan([]);
      setPembayaran([]);
      setInvoices([]);
      setSiswa([]);
      toast('err',e.message);
    }
  }

  useEffect(()=>{load();},[m.cabangId,filterTahunAjaran]);

  // Debounced auto-fetch for payment allocation preview
  useEffect(() => {
    if (showPaymentModal && paymentCabangId && payForm.siswa_id && payForm.nominal && Number(payForm.nominal) > 0) {
      const delayDebounceFn = setTimeout(() => {
        api.previewAlokasi({
          cabang_id: paymentCabangId,
          siswa_id: Number(payForm.siswa_id),
          nominal: Number(payForm.nominal)
        })
        .then(setAlokasiPreview)
        .catch(e => {
          setAlokasiPreview(null);
        });
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setAlokasiPreview(null);
    }
  }, [showPaymentModal, payForm.siswa_id, payForm.nominal, paymentCabangId]);

  async function addTarif(){
    if(submitting)return;
    setSubmitting(true);
    try{
      if(!tarifForm.jenjang_id||!tarifForm.nominal||!tarifForm.nama){
        setSubmitting(false);return toast('err','Semua data tarif wajib diisi');
      }
      const targetCabangId = user.role === 'admin' ? (tarifForm.cabang_id || m.cabangId) : user.cabang_id;
      if (!targetCabangId) {
        setSubmitting(false); return toast('err', 'Pilih cabang sekolah terlebih dahulu');
      }
      await api.createTarif({
        ...tarifForm,
        cabang_id:targetCabangId,
        jenjang_id:Number(tarifForm.jenjang_id),
        nominal:Number(tarifForm.nominal)
      });
      toast('ok','Tarif tersimpan');
      setShowTarifModal(false);
      setTarifForm({cabang_id:'',tahun_ajaran:currentSchoolYear,jenjang_id:'',jenis:'spp',nama:'SPP',nominal:''});
      load();
    }catch(e){
      toast('err',e.message);
    }finally{setSubmitting(false);}
  }

  function openEditTarif(t){
    setEditingTarif({...t,nominal:String(t.nominal),aktif:t.aktif===0?0:1});
  }

  async function saveTarifEdit(){
    if(!editingTarif)return;
    if(submitting)return;
    setSubmitting(true);
    try{
      await api.updateTarif(editingTarif.id,{
        nama:editingTarif.nama,
        nominal:Number(editingTarif.nominal),
        aktif:editingTarif.aktif===0?0:1
      });
      toast('ok','Tarif diperbarui');
      setEditingTarif(null);
      load();
    }catch(e){toast('err',e.message);}
    finally{setSubmitting(false);}
  }

  async function addDiskon(){
    if(submitting)return;
    setSubmitting(true);
    try{
      if(!diskonForm.siswa_id||!diskonForm.nilai){
        setSubmitting(false);return toast('err','Siswa dan nilai diskon wajib diisi');
      }
      const selectedStudent = siswa.find(s => String(s.id) === String(diskonForm.siswa_id));
      const targetCabangId = selectedStudent?.cabang_id || m.cabangId;
      if (!targetCabangId) {
        setSubmitting(false); return toast('err', 'Siswa terpilih tidak terhubung ke cabang aktif');
      }
      await api.createDiskon({
        cabang_id:targetCabangId,
        siswa_id:Number(diskonForm.siswa_id),
        tahun_ajaran:filterTahunAjaran,
        jenis:diskonForm.jenis||'spp',
        tipe:diskonForm.tipe,
        nilai:Number(diskonForm.nilai),
        catatan:diskonForm.catatan
      });
      toast('ok','Diskon tersimpan');
      setShowDiskonModal(false);
      setDiskonForm({siswa_id:'',jenis:'spp',tipe:'nominal',nilai:'',catatan:''});
      load();
    }catch(e){
      toast('err',e.message);
    }finally{setSubmitting(false);}
  }

  function openEditDiskon(d){
    setEditingDiskon({...d,nilai:String(d.nilai),aktif:d.aktif===0?0:1});
  }

  async function saveDiskonEdit(){
    if(!editingDiskon)return;
    if(submitting)return;
    setSubmitting(true);
    try{
      await api.updateDiskon(editingDiskon.id,{
        tipe:editingDiskon.tipe,
        nilai:Number(editingDiskon.nilai),
        catatan:editingDiskon.catatan,
        aktif:editingDiskon.aktif===0?0:1
      });
      toast('ok','Diskon diperbarui');
      setEditingDiskon(null);
      load();
    }catch(e){toast('err',e.message);}
    finally{setSubmitting(false);}
  }

  async function previewBulanan(){
    const targetCabangId = user.role === 'admin' ? generateCabangId : m.cabangId;
    if(!targetCabangId){toast('err','Pilih cabang dulu untuk generate tagihan');return;}
    try{
      const payload={cabang_id:m.cabangId}; if(form.periode)payload.periode=form.periode;
      payload.cabang_id=targetCabangId;
      const r=await api.generateBulananPreview(payload);
      setPreview({...r,kind:'bulanan',cabang_id:targetCabangId});
    }catch(e){
      toast('err',e.message);
    }
  }

  async function previewKegiatan(){
    const targetCabangId = user.role === 'admin' ? generateCabangId : m.cabangId;
    if(!targetCabangId){toast('err','Pilih cabang dulu untuk generate tagihan');return;}
    try{
      const r=await api.generateKegiatanPreview({cabang_id:targetCabangId,tahun_ajaran:filterTahunAjaran});
      setPreview({...r,kind:'kegiatan',cabang_id:targetCabangId});
    }catch(e){
      toast('err',e.message);
    }
  }

  async function confirmGenerate(){
    try{
      if(preview.kind==='bulanan'){
        const r=await api.generateBulanan({cabang_id:preview.cabang_id,periode:preview.period});
        toast('ok',r.created_count+' tagihan dibuat');
      }else{
        const r=await api.generateKegiatan({cabang_id:preview.cabang_id,tahun_ajaran:preview.tahun_ajaran});
        toast('ok',r.created_count+' tagihan kegiatan dibuat');
      }
      setPreview(null);
      load();
    }catch(e){
      toast('err',e.message);
    }
  }

  async function pay(){
    if(submitting)return;
    setSubmitting(true);
    try{
      if(!payForm.siswa_id||!payForm.nominal){
        setSubmitting(false);return toast('err','Pilih siswa and nominal dulu');
      }
      if(!paymentCabangId){
        setSubmitting(false);return toast('err','Pilih cabang atau siswa dengan cabang aktif dulu');
      }
      const alokasi=alokasiPreview?.allocations?.map(a=>({tagihan_id:a.tagihan_id,nominal:a.allocated}))||undefined;
      const r=await api.createPembayaran({
        cabang_id:paymentCabangId,
        siswa_id:Number(payForm.siswa_id),
        nominal:Number(payForm.nominal),
        metode:payForm.metode||'tunai',
        tanggal_bayar:payForm.tanggal||todayWIB(),
        reference:payForm.reference,
        catatan:payForm.catatan,
        alokasi
      });
      toast('ok','Pembayaran: '+(r.receipt_no||r.status));
      setShowPaymentModal(false);
      setPayForm({siswa_id:'',nominal:'',metode:'tunai',tanggal:todayWIB(),reference:'',catatan:''});
      setAlokasiPreview(null);
      load();
    }catch(e){
      toast('err',e.message);
    }finally{setSubmitting(false);}
  }

  async function editAlokasi(p){
    try{
      const detail=await api.alokasiPembayaran(p.id);
      setAlokasiEdit({
        payment:detail.payment,
        bills:detail.bills.map(b=>({...b,_alloc:b.allocated_amount||0}))
      });
    }catch(e){
      toast('err',e.message);
    }
  }

  async function saveAlokasi(){
    try{
      const total=alokasiEdit.bills.reduce((s,b)=>s+Number(b._alloc||0),0);
      if(total>alokasiEdit.payment.nominal){toast('err','Total alokasi melebihi nominal pembayaran');return;}
      const alokasi=alokasiEdit.bills.filter(b=>Number(b._alloc)>0).map(b=>({tagihan_id:b.id,nominal:Number(b._alloc)}));
      await api.updateAlokasi(alokasiEdit.payment.id,{alokasi});
      toast('ok','Alokasi diperbarui');
      setAlokasiEdit(null);
      load();
    }catch(e){
      toast('err',e.message);
    }
  }

  async function correctBill(t){
    setConfirmAction({
      title:'Koreksi Tagihan',
      fields:[{label:'Nominal final baru',key:'nominal',value:String(t.nominal_final)},{label:'Alasan koreksi',key:'reason',value:''}],
      onSubmit:async(v)=>{
        try{
          await api.correctTagihan(t.id,{nominal_final:Number(v.nominal),reason:v.reason});
          toast('ok','Tagihan dikoreksi');
          load();
        }catch(e){
          toast('err',e.message);
        }
        setConfirmAction(null);
      }
    });
  }

  async function voidBill(t){
    setConfirmAction({
      title:'Void Tagihan',
      fields:[{label:'Alasan void',key:'reason',value:''}],
      onSubmit:async(v)=>{
        try{
          await api.voidTagihan(t.id,v.reason);
          toast('ok','Tagihan void');
          load();
        }catch(e){
          toast('err',e.message);
        }
        setConfirmAction(null);
      }
    });
  }

  async function verify(p){
    try{
      const r=await api.verifyPembayaran(p.id);
      toast('ok','Terverifikasi: '+r.receipt_no);
      load();
    }catch(e){
      toast('err',e.message);
    }
  }

  async function reject(p){
    setConfirmAction({
      title:'Tolak Pembayaran',
      fields:[{label:'Alasan penolakan',key:'reason',value:''}],
      onSubmit:async(v)=>{
        try{
          await api.rejectPembayaran(p.id,v.reason);
          toast('ok','Pembayaran ditolak');
          load();
        }catch(e){
          toast('err',e.message);
        }
        setConfirmAction(null);
      }
    });
  }

  async function voidPay(p){
    setConfirmAction({
      title:'Void Pembayaran',
      fields:[{label:'Alasan void',key:'reason',value:''}],
      onSubmit:async(v)=>{
        try{
          await api.voidPembayaran(p.id,v.reason);
          toast('ok','Pembayaran void');
          load();
        }catch(e){
          toast('err',e.message);
        }
        setConfirmAction(null);
      }
    });
  }

  async function invoice(){
    try{
      const r=await api.createInvoice(selectedBills);
      toast('ok','Invoice dibuat: '+r.invoice_no);
      setSelectedBills([]);
      load();
    }catch(e){
      toast('err',e.message);
    }
  }

  async function openPdf(kind,id){
    try{
      const b=kind==='invoice'?await api.invoicePdf(id):await api.receiptPdf(id);
      const url=URL.createObjectURL(b);
      window.open(url,'_blank');
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){
      toast('err',e.message);
    }
  }

  function formatWhatsAppNumber(phone) {
    if (!phone) return '';
    let sanitized = phone.replace(/[^0-9]/g, '');
    if (sanitized.startsWith('0')) {
      sanitized = '62' + sanitized.slice(1);
    }
    return sanitized;
  }

  function sendWhatsAppInvoice(i) {
    const phone = formatWhatsAppNumber(i.wali_no_wa);
    if (!phone) {
      toast('err', 'Nomor WhatsApp wali tidak ditemukan');
      return;
    }
    const formattedTotal = 'Rp ' + Number(i.total || 0).toLocaleString('id-ID');
    const pdfUrl = `${window.location.origin}/api/billing/public/invoice/${i.id}/pdf?key=${i.public_key}`;
    const message = `Halo Bunda/Ayah dari ${i.siswa_nama},\n\nBerikut kami kirimkan rincian tagihan Invoice ${i.invoice_no} sebesar ${formattedTotal} untuk Tahun Ajaran ${i.tahun_ajaran}.\n\nAnda dapat melihat dan mengunduh berkas PDF Invoice resmi melalui tautan di bawah ini:\n${pdfUrl}\n\nTerima kasih atas perhatiannya.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  function toggleBill(id){
    const bill=tagihan.find(t=>t.id===id);
    if(!bill||bill.status==='void')return;
    setSelectedBills(v=>{
      if(v.includes(id))return v.filter(x=>x!==id);
      const first=tagihan.find(t=>t.id===v[0]);
      if(first&&first.siswa_id!==bill.siswa_id){
        toast('err','Invoice hanya bisa dibuat untuk satu siswa dalam satu waktu');
        return v;
      }
      return[...v,id];
    });
  }
  function canSelectBill(t){
    if(t.status==='void')return false;
    if(selectedBills.length===0||selectedBills.includes(t.id))return true;
    const first=tagihan.find(x=>x.id===selectedBills[0]);
    return !first||first.siswa_id===t.siswa_id;
  }

  const newItems=preview?preview.preview.filter(p=>!p.already_exists):[];
  const existingItems=preview?preview.preview.filter(p=>p.already_exists):[];

  const totals = useMemo(() => {
const active = filteredTagihan.filter(t => t.status !== 'void');
    const totalFinal = active.reduce((sum, t) => sum + (t.nominal_final || 0), 0);
    const totalPaid = active.reduce((sum, t) => sum + (t.paid_amount || 0), 0);
    const totalOutstanding = totalFinal - totalPaid;
    const collectionRate = totalFinal > 0 ? Math.round((totalPaid / totalFinal) * 100) : 0;
    return { totalFinal, totalPaid, totalOutstanding, collectionRate };
  }, [filteredTagihan]);

  // ═══ TAB RENDERING HELPERS ═══

  const renderRingkasanTab = () => (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center"><Receipt className="w-4 h-4 text-slate-500"/></div>
            <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Total Tagihan</span>
          </div>
          <div className="text-lg sm:text-2xl font-black text-text-main tabular-nums leading-tight">{money(billingStats.totalTagihan)}</div>
          <div className="text-[10px] text-slate-400 mt-1.5">Tagihan aktif (di luar void)</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-emerald-500"/></div>
            <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Terbayar</span>
          </div>
          <div className="text-lg sm:text-2xl font-black text-emerald-600 tabular-nums leading-tight">{money(billingStats.totalTerbayar)}</div>
          <div className="text-[10px] text-emerald-500 mt-1.5">Koleksi terkonfirmasi</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center"><Clock className="w-4 h-4 text-amber-500"/></div>
            <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Outstanding</span>
          </div>
          <div className="text-lg sm:text-2xl font-black text-amber-600 tabular-nums leading-tight">{money(billingStats.outstanding)}</div>
          <div className="text-[10px] text-amber-500 mt-1.5">Belum terbayar</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-primary-container flex items-center justify-center"><BarChart3 className="w-4 h-4 text-primary"/></div>
            <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Rasio Koleksi</span>
          </div>
          <div className="text-lg sm:text-2xl font-black text-primary tabular-nums leading-tight">{billingStats.collectionRate}%</div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden"><div className="bg-primary h-1.5 rounded-full transition-all duration-500" style={{width:`${billingStats.collectionRate}%`}}/></div>
        </div>
      </div>
      {billingStats.pendingCount>0&&(
        <button type="button" onClick={()=>setBillingSubTab('pembayaran')} className="w-full mb-5 flex items-center gap-3 p-4 bg-amber-50 border border-amber-200/80 rounded-2xl text-left hover:bg-amber-100/70 transition group">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0"><AlertCircle className="w-5 h-5 text-amber-600"/></div>
          <div className="min-w-0 flex-1">
            <div className="font-black text-amber-800 text-sm">{billingStats.pendingCount} Pembayaran Menunggu Verifikasi</div>
            <div className="text-xs text-amber-600/80 mt-0.5">Klik untuk mereview dan memverifikasi pembayaran</div>
          </div>
          <ChevronDown className="w-4 h-4 text-amber-400 -rotate-90 group-hover:translate-x-0.5 transition-transform shrink-0"/>
        </button>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {['admin','admin_cabang'].includes(user.role)&&<button type="button" onClick={()=>setShowPaymentModal(true)} className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl hover:border-primary/30 hover:bg-primary-container/20 transition group text-left">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Receipt className="w-5 h-5 text-primary"/></div>
          <div><div className="font-black text-text-main text-sm group-hover:text-primary transition">Catat Pembayaran</div><div className="text-[10px] text-slate-400 mt-0.5">Input pembayaran baru dari wali</div></div>
        </button>}
        <button type="button" onClick={()=>setBillingSubTab('tagihan')} className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl hover:border-slate-300 transition group text-left">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><FilePlus className="w-5 h-5 text-slate-500"/></div>
          <div><div className="font-black text-text-main text-sm">Generate Tagihan</div><div className="text-[10px] text-slate-400 mt-0.5">Buat tagihan bulanan atau kegiatan</div></div>
        </button>
        <button type="button" onClick={()=>setBillingSubTab('tarif')} className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl hover:border-slate-300 transition group text-left">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Settings className="w-5 h-5 text-slate-500"/></div>
          <div><div className="font-black text-text-main text-sm">Kelola Tarif</div><div className="text-[10px] text-slate-400 mt-0.5">Atur tarif dan diskon siswa</div></div>
        </button>
      </div>
      {tarif.length===0&&tagihan.length===0&&<div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-semibold flex items-center gap-2">
        <AlertCircle size={16} className="shrink-0"/>
        <span>Billing belum disiapkan untuk cabang ini. Mulai dengan menambahkan tarif di tab Tarif & Diskon.</span>
      </div>}
    </>
  );

  const renderTagihanTab = () => (
    <>
      {/* Control Panel / Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm mb-6 flex flex-col gap-4">
        {/* Row 1: Filters */}
        <div className="grid grid-cols-2 md:flex md:items-center gap-3 md:gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Tahun Ajaran</span>
            <CustomSelect value={filterTahunAjaran} onChange={e=>setFilterTahunAjaran(e.target.value)} className="w-full md:max-w-[150px] shadow-sm">
              <option value="2025/2026">2025/2026</option>
              <option value="2026/2027">2026/2027</option>
              {filterTahunAjaran !== '2025/2026' && filterTahunAjaran !== '2026/2027' && (
                <option value={filterTahunAjaran}>{filterTahunAjaran}</option>
              )}
            </CustomSelect>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Filter Periode</span>
            <CustomSelect value={filterPeriode} onChange={e=>setFilterPeriode(e.target.value)} className="w-full md:min-w-[160px] shadow-sm">
              <option value="">Semua Periode</option>
              {billingStats.uniquePeriods.map(p=><option key={p} value={p}>{p}</option>)}
            </CustomSelect>
          </div>
        </div>

        {/* Generate Tagihan Button & Collapsible Panel */}
        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowGenerate(!showGenerate)}
            className="w-full flex items-center justify-between py-2 px-3.5 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-slate-50 text-xs font-bold text-slate-600 transition duration-150 active:scale-[0.99] shadow-sm"
          >
            <span className="flex items-center gap-2">
              <FilePlus className="w-4 h-4 text-slate-450" />
              Generate Tagihan Baru (Bulanan / Kegiatan)
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showGenerate ? 'rotate-180' : ''}`} />
          </button>

          {showGenerate && (
            <div className="mt-3 bg-slate-50/30 border border-slate-150 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-slide-up">
              {user.role === 'admin' && (
                <div className="flex flex-col w-full sm:w-auto">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Pilih Cabang</span>
                  <CustomSelect
                    value={generateCabangId}
                    onChange={e => setGenerateCabangId(e.target.value)}
                    className="w-full sm:min-w-[160px] shadow-sm bg-white"
                  >
                    <option value="">Pilih Cabang…</option>
                    {m.cabang.map(c => (
                      <option key={c.id} value={c.id}>{c.nama}</option>
                    ))}
                  </CustomSelect>
                </div>
              )}
              <div className="flex flex-col w-full sm:w-auto">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Pilih Bulan Tagihan</span>
                <input
                  type="month"
                  value={form.periode||''}
                  onChange={e=>setForm(f=>({...f,periode:e.target.value}))}
                  className="input h-9 px-3 text-sm w-full sm:max-w-[160px] border border-slate-200 rounded-xl shadow-sm bg-white focus:border-primary/50 focus:ring-primary/20"
                />
              </div>
              <div className="flex flex-col w-full sm:w-auto">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Aksi Pembuatan</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={previewBulanan}
                    className="flex-1 sm:flex-initial h-9 px-4 rounded-xl text-xs font-black bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                  >
                    <FilePlus className="w-3.5 h-3.5 text-slate-500" />
                    Bulanan
                  </button>
                  <button
                    type="button"
                    onClick={previewKegiatan}
                    className="flex-1 sm:flex-initial h-9 px-4 rounded-xl text-xs font-black bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                  >
                    <FilePlus className="w-3.5 h-3.5 text-slate-500" />
                    Kegiatan
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedBills.length > 0 && (
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 animate-bounce-in">
            <ActionButton icon={Receipt} onClick={invoice} variant="primary" className="bg-primary hover:bg-primary-hover shadow-md font-black text-xs px-4 py-2 rounded-xl">
              Buat Invoice ({selectedBills.length} Terpilih)
            </ActionButton>
          </div>
        )}
      </div>

      {/* Dynamic Mini-Dashboard for Filtered Tagihan */}
      {filteredTagihan.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100"><Receipt className="w-3.5 h-3.5 text-slate-500"/></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Tagihan</span>
            </div>
            <div className="text-base sm:text-lg font-black text-text-main tabular-nums leading-tight">{money(totals.totalFinal)}</div>
            <span className="text-[9px] text-slate-400 mt-1">Berdasarkan filter aktif</span>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100/50"><TrendingUp className="w-3.5 h-3.5 text-emerald-500"/></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Terbayar</span>
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-600 tabular-nums leading-tight">{money(totals.totalPaid)}</div>
            <span className="text-[9px] text-emerald-500 mt-1">Koleksi terverifikasi</span>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100/50"><Clock className="w-3.5 h-3.5 text-amber-500"/></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Outstanding</span>
            </div>
            <div className="text-base sm:text-lg font-black text-amber-650 tabular-nums leading-tight">{money(totals.totalOutstanding)}</div>
            <span className="text-[9px] text-amber-500 mt-1">Belum terbayar</span>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center border border-primary/10"><BarChart3 className="w-3.5 h-3.5 text-primary"/></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Rasio Koleksi</span>
            </div>
            <div className="text-base sm:text-lg font-black text-primary tabular-nums leading-tight">{totals.collectionRate}%</div>
            <div className="w-full bg-slate-100 rounded-full h-1 mt-2 overflow-hidden"><div className="bg-primary h-1 rounded-full transition-all duration-500" style={{width:`${totals.collectionRate}%`}}/></div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-black text-text-main text-base">Tagihan Siswa</h3>
      </div>

      {filteredTagihan.length === 0 ? (
        <EmptyState icon="💸" title="Belum Ada Tagihan" description="Silakan generate tagihan bulanan atau kegiatan terlebih dahulu." />
      ) : (
        <>
          <div className="hidden md:block bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
            <Table headers={['','Siswa','Jenis','Periode','Final','Terbayar','Status','Aksi']}>
              {filteredTagihan.map(t=>{
                const student = siswa.find(x => x.id === t.siswa_id);
                return (
                  <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <Td className="w-10"><input type="checkbox" checked={selectedBills.includes(t.id)} onChange={()=>toggleBill(t.id)} disabled={!canSelectBill(t)} className="rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-40 cursor-pointer"/></Td>
                    <Td>
                      <div className="flex items-center gap-3 py-1">
                        <StudentAvatar name={t.siswa_nama} url={student?.foto} size="sm" />
                        <span className="font-semibold text-slate-855">{t.siswa_nama}</span>
                      </div>
                    </Td>
                    <Td className="font-medium text-slate-600">{t.nama}</Td>
                    <Td className="font-medium text-slate-500">{t.periode || '-'}</Td>
                    <MoneyCell>{money(t.nominal_final)}</MoneyCell>
                    <MoneyCell className="text-emerald-600 dark:text-emerald-400">{money(t.paid_amount)}</MoneyCell>
                    <Td><BillingStatusBadge status={t.status}/></Td>
                    <Td>
                      <div className="flex gap-1.5 justify-end">
                        <IconButton icon={FilePenLine} label={`Koreksi tagihan ${t.siswa_nama}`} onClick={()=>correctBill(t)} size="sm" className="hover:bg-slate-100 text-slate-600"/>
                        <IconButton icon={Ban} label={`Void tagihan ${t.siswa_nama}`} onClick={()=>voidBill(t)} size="sm" variant="danger"/>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50/80 dark:bg-slate-800/40 font-bold border-t border-slate-200 dark:border-slate-700">
                <Td></Td>
                <Td colSpan={3} className="text-slate-755 font-black uppercase text-xs tracking-wider">TOTAL RINGKASAN</Td>
                <MoneyCell className="text-slate-900 font-extrabold">{money(totals.totalFinal)}</MoneyCell>
                <MoneyCell className="text-emerald-600 dark:text-emerald-400 font-extrabold">{money(totals.totalPaid)}</MoneyCell>
                <Td className="text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-primary-container text-primary">
                    {totals.collectionRate}% Terkoleksi
                  </span>
                </Td>
                <Td></Td>
              </tr>
            </Table>
          </div>
          <div className="block md:hidden space-y-3">
            {filteredTagihan.map(t => {
              const student = siswa.find(x => x.id === t.siswa_id);
              const colorMap = {
                lunas: 'bg-emerald-500',
                paid: 'bg-emerald-500',
                confirmed: 'bg-emerald-500',
                sebagian: 'bg-blue-500',
                partially_paid: 'bg-blue-500',
                pending_verification: 'bg-violet-500',
                issued: 'bg-sky-500',
                open: 'bg-amber-500',
                unpaid: 'bg-amber-500'
              };
              const accentColor = colorMap[(t.status || '').toLowerCase()] || 'bg-slate-400';

              return (
                <div key={t.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col hover:border-slate-300 transition duration-200 relative overflow-hidden">
                  {/* Decorative side accent color bar indicating status */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                  <div className="p-4 pl-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex items-center h-5 mt-0.5">
                          <input
                            type="checkbox"
                            checked={selectedBills.includes(t.id)}
                            onChange={()=>toggleBill(t.id)}
                            disabled={!canSelectBill(t)}
                            className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-40"
                          />
                        </div>
                        <div className="flex gap-2.5 items-center min-w-0">
                          <StudentAvatar name={t.siswa_nama} url={student?.foto} size="sm" />
                          <div className="min-w-0">
                            <div className="font-black text-sm text-slate-805 truncate">{t.siswa_nama}</div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{t.nama}</div>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <BillingStatusBadge status={t.status} />
                      </div>
                    </div>

                    {/* Receipt-style dashed separator line */}
                    <div className="border-t border-dashed border-slate-200 my-1" />

                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">Periode</span>
                        <span className="font-bold text-slate-700">{t.periode || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">Telah Terbayar</span>
                        <span className="font-bold text-emerald-600 tabular-nums">{money(t.paid_amount)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">Nominal Tagihan</span>
                        <span className="font-black text-slate-800 text-sm tabular-nums">{money(t.nominal_final)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Aksi</span>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={()=>correctBill(t)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white hover:bg-slate-50 transition active:scale-95">
                          <FilePenLine className="w-3.5 h-3.5" /> Koreksi
                        </button>
                        <button type="button" onClick={()=>voidBill(t)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-black text-red-650 bg-red-50 hover:bg-red-100 transition active:scale-95">
                          <Ban className="w-3.5 h-3.5" /> Void
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Mobile Summary Slip */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-amber-500" />
              <div className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Ringkasan Total Filtered</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 font-medium block mb-0.5">Total Tagihan:</span>
                  <span className="font-extrabold text-sm text-slate-800 tabular-nums">{money(totals.totalFinal)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block mb-0.5">Total Terbayar:</span>
                  <span className="font-extrabold text-sm text-emerald-600 tabular-nums">{money(totals.totalPaid)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/80 pt-2.5 mt-1">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-450 font-black uppercase tracking-wide">Outstanding</span>
                  <span className="text-xs text-amber-650 font-black tabular-nums">{money(totals.totalOutstanding)}</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-primary-container text-primary">
                  {totals.collectionRate}% Terkoleksi
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  const renderPembayaranTab = () => (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-sm">
        <div>
          <h3 className="font-black text-text-main text-base">Riwayat Pembayaran</h3>
          <p className="text-xs text-slate-400 mt-1">Daftar penerimaan pembayaran SPP dan Kegiatan dari wali murid</p>
        </div>
        {['admin','admin_cabang'].includes(user.role)&&<ActionButton icon={Receipt} onClick={()=>setShowPaymentModal(true)} variant="primary" className="bg-primary hover:bg-primary-hover shadow-sm font-black text-xs px-4 py-2 rounded-xl">Catat Pembayaran</ActionButton>}
      </div>
      {pembayaran.length === 0 ? (
        <EmptyState icon="💳" title="Belum Ada Pembayaran" description="Belum ada riwayat pembayaran tercatat." />
      ) : (
        <>
          <div className="hidden md:block bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
            <Table headers={['Siswa','Nominal','Alokasi','Metode','Status','Kuitansi','Aksi']}>
              {pembayaran.map(p=>{
                const student = siswa.find(x => x.id === p.siswa_id);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <Td>
                      <div className="flex items-center gap-3 py-1">
                        <StudentAvatar name={p.siswa_nama} url={student?.foto} size="sm" />
                        <span className="font-semibold text-slate-855">{p.siswa_nama}</span>
                      </div>
                    </Td>
                    <MoneyCell className="text-slate-900 font-extrabold">{money(p.nominal)}</MoneyCell>
                    <Td>
                      <div className="space-y-1 text-xs">
                        <div className="font-bold text-slate-600 tabular-nums">{money(p.allocated_amount || 0)}</div>
                        {Number(p.credit_amount || 0)>0&&<span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">Kredit {money(p.credit_amount)}</span>}
                      </div>
                    </Td>
                    <Td><MethodBadge metode={p.metode}/></Td>
                    <Td><BillingStatusBadge status={p.status}/></Td>
                    <Td>
                      {p.receipt_no ? (
                        <code className="px-2 py-1 rounded bg-slate-100 font-mono text-[11px] text-slate-600 font-bold border border-slate-200/60">{p.receipt_no}</code>
                      ) : (
                        <span className="text-slate-400 font-bold">-</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex gap-1.5 justify-end">
                        {p.status==='confirmed'&&<IconButton icon={FileText} label={`PDF kuitansi ${p.siswa_nama}`} onClick={()=>openPdf('receipt',p.id)} size="sm" className="hover:bg-slate-100 text-slate-600"/>}
                        {p.status==='pending_verification'&&user.role==='admin'&&<>
                          <IconButton icon={CheckCircle2} label={`Verifikasi pembayaran ${p.siswa_nama}`} onClick={()=>verify(p)} size="sm" className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"/>
                          <IconButton icon={X} label={`Tolak pembayaran ${p.siswa_nama}`} onClick={()=>reject(p)} size="sm" variant="danger"/>
                        </>}
                        {['confirmed','pending_verification'].includes(p.status)&&<IconButton icon={FilePenLine} label={`Edit alokasi ${p.siswa_nama}`} onClick={()=>editAlokasi(p)} size="sm" className="hover:bg-slate-100 text-slate-600"/>}
                        {['confirmed','pending_verification'].includes(p.status)&&<IconButton icon={Ban} label={`Void pembayaran ${p.siswa_nama}`} onClick={()=>voidPay(p)} size="sm" variant="danger"/>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </div>
          <div className="block md:hidden space-y-3">
            {pembayaran.map(p => {
              const student = siswa.find(x => x.id === p.siswa_id);
              const colorMap = {
                confirmed: 'bg-emerald-500',
                pending_verification: 'bg-violet-500 animate-pulse',
                rejected: 'bg-red-500',
                void: 'bg-slate-400'
              };
              const accentColor = colorMap[(p.status || '').toLowerCase()] || 'bg-slate-400';
              const dateLabel = p.tanggal_bayar
                ? new Date(p.tanggal_bayar).toLocaleDateString('id-ID', { dateStyle: 'medium' })
                : 'Tanggal -';

              return (
                <div key={p.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col hover:border-slate-300 transition duration-200 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                  <div className="p-4 pl-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold block">{dateLabel}</span>
                        {p.receipt_no && (
                          <span className="inline-block mt-0.5"><code className="px-1.5 py-0.5 rounded bg-slate-50 font-mono text-[9px] text-slate-500 font-bold border border-slate-200/50">{p.receipt_no}</code></span>
                        )}
                      </div>
                      <div className="shrink-0">
                        <BillingStatusBadge status={p.status} />
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-200 my-1" />

                    <div className="flex items-center gap-3">
                      <StudentAvatar name={p.siswa_nama} url={student?.foto} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-sm text-slate-805 truncate">{p.siswa_nama}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-slate-400">Metode:</span>
                          <MethodBadge metode={p.metode} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">Nominal</span>
                        <div className="text-base font-black text-slate-855 tabular-nums">{money(p.nominal)}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">Terallokasi / Kredit</span>
                        <div className="text-xs font-bold text-slate-700 tabular-nums">
                          {money(p.allocated_amount || 0)}
                          {Number(p.credit_amount || 0) > 0 && (
                            <span className="block text-[10px] font-black text-amber-650">Kredit: {money(p.credit_amount)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Aksi Pembayaran</span>
                      <div className="flex flex-wrap gap-1.5">
                        {p.status==='confirmed'&& (
                          <button type="button" onClick={()=>openPdf('receipt',p.id)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white hover:bg-slate-50 transition active:scale-95 flex-1 min-w-[90px]">
                            <FileText className="w-3.5 h-3.5" /> PDF
                          </button>
                        )}
                        {p.status==='pending_verification'&&user.role==='admin'&& (
                          <>
                            <button type="button" onClick={()=>verify(p)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 text-[11px] font-black text-emerald-650 bg-emerald-50 hover:bg-emerald-100 transition active:scale-95 flex-1 min-w-[90px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Verifikasi
                            </button>
                            <button type="button" onClick={()=>reject(p)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-black text-red-650 bg-red-50 hover:bg-red-100 transition active:scale-95 flex-1 min-w-[90px]">
                              <X className="w-3.5 h-3.5" /> Tolak
                            </button>
                          </>
                        )}
                        {['confirmed','pending_verification'].includes(p.status)&& (
                          <button type="button" onClick={()=>editAlokasi(p)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white hover:bg-slate-50 transition active:scale-95 flex-1 min-w-[90px]">
                            <FilePenLine className="w-3.5 h-3.5" /> Alokasi
                          </button>
                        )}
                        {['confirmed','pending_verification'].includes(p.status)&& (
                          <button type="button" onClick={()=>voidPay(p)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-black text-red-655 bg-red-50 hover:bg-red-100 transition active:scale-95 flex-1 min-w-[90px]">
                            <Ban className="w-3.5 h-3.5" /> Void
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  const renderTarifTab = () => (
    <>
      {/* Toolbar / Configuration Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex flex-col w-full sm:w-auto">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Tahun Ajaran</span>
          <CustomSelect value={filterTahunAjaran} onChange={e=>setFilterTahunAjaran(e.target.value)} className="w-full sm:max-w-[150px] shadow-sm">
            <option value="2025/2026">2025/2026</option>
            <option value="2026/2027">2026/2027</option>
            {filterTahunAjaran !== '2025/2026' && filterTahunAjaran !== '2026/2027' && <option value={filterTahunAjaran}>{filterTahunAjaran}</option>}
          </CustomSelect>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
          {user.role === 'admin' && (
            <button
              type="button"
              onClick={() => { setTarifForm(f => ({ ...f, cabang_id: m.cabangId || '' })); setShowTarifModal(true); }}
              className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4 text-slate-500" /> Tarif
            </button>
          )}
          {['admin', 'admin_cabang'].includes(user.role) && (
            <button
              type="button"
              onClick={() => setShowDiskonModal(true)}
              className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4 text-slate-500" /> Diskon
            </button>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="font-black text-text-main text-base mb-4">Daftar Tarif Biaya</h3>
        {tarif.length === 0 ? (
          <EmptyState icon="📋" title="Belum Ada Tarif" description="Silakan buat tarif baru terlebih dahulu." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Object.entries(groupedTarif).map(([groupName, items]) => (
              <div key={groupName} className="bg-white border border-slate-250/70 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between hover:border-slate-350 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                <div>
                  <div className="flex items-center gap-2.5 mb-4 border-b border-slate-100 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-black text-sm shrink-0">
                      {groupName === 'Global' ? 'G' : groupName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-805 leading-tight">{groupName === 'Global' ? 'Tarif Global / Umum' : groupName}</h4>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5">{items.length} Tipe Tarif</p>
                    </div>
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1.5 custom-scrollbar">
                    {items.map(t => {
                      const isActive = t.aktif !== 0;
                      return (
                        <div key={t.id} className={`rounded-xl border p-3 transition duration-150 ${!isActive ? 'border-dashed border-slate-300 bg-slate-50/50 opacity-75' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                          <div className="flex justify-between items-start gap-2.5">
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-805 truncate" title={t.nama}>{t.nama}</div>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-wider">
                                  {t.jenis}
                                </span>
                                {!isActive && <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-red-50 text-red-650 uppercase tracking-wider">Nonaktif</span>}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <div className="text-xs font-black text-slate-855 tabular-nums">{money(t.nominal)}</div>
                              {user.role==='admin'&&<IconButton icon={Pencil} label={`Edit tarif ${t.nama}`} onClick={()=>openEditTarif(t)} size="sm" className="hover:bg-slate-100 text-slate-500"/>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4">
        <h3 className="font-black text-text-main text-base mb-4">Diskon & Keringanan Siswa</h3>
        {diskon.length === 0 ? (
          <EmptyState icon="%" title="Belum Ada Diskon" description="Tambahkan keringanan siswa jika ada potongan khusus." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {diskon.map(d => {
              const student = siswa.find(x => x.id === d.siswa_id);
              const isActive = d.aktif !== 0;

              return (
                <div key={d.id} className={`relative overflow-hidden bg-white border rounded-3xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-emerald-250 transition-all duration-300 ${!isActive ? 'border-dashed border-slate-300 bg-slate-50/50 opacity-75' : 'border-slate-200/80 bg-white'}`}>
                  {/* Visual Left Ticket Border Highlight */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />

                  <div className="pl-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <StudentAvatar name={d.siswa_nama} url={student?.foto} size="sm" />
                        <div className="min-w-0">
                          <h4 className="font-black text-sm text-slate-805 truncate">{d.siswa_nama}</h4>
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-wider">
                            Diskon {d.jenis}
                          </span>
                        </div>
                      </div>
                      {['admin','admin_cabang'].includes(user.role)&&<IconButton icon={Pencil} label={`Edit diskon ${d.siswa_nama}`} onClick={()=>openEditDiskon(d)} size="sm" className="hover:bg-slate-100 text-slate-500 shrink-0"/>}
                    </div>

                    {/* Voucher Ticket Dashed Divider */}
                    <div className="border-t border-dashed border-slate-200 my-4" />

                    <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100/50 p-3.5 flex items-center justify-between hover:bg-emerald-100/50 transition-colors mb-3">
                      <div>
                        <span className="text-[9px] font-black text-emerald-600/80 uppercase tracking-wider block mb-0.5">Nilai Potongan</span>
                        <span className="text-base sm:text-lg font-black text-emerald-700 tabular-nums">
                          {d.tipe==='persen'?`${d.nilai}%`:money(d.nilai)}
                        </span>
                      </div>
                      {isActive ? (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase tracking-wider">Kupon Aktif</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-[8px] font-black uppercase tracking-wider">Nonaktif</span>
                      )}
                    </div>

                    {d.catatan && (
                      <p className="text-xs text-slate-500 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 mt-2 font-medium italic">
                        "{d.catatan}"
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  const renderInvoiceTab = () => (
    <>
      <div className="flex flex-col gap-1 mb-6 bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-sm">
        <h3 className="font-black text-text-main text-base">Invoice Tagihan</h3>
        <p className="text-xs text-slate-400 mt-1">Daftar invoice resmi yang diterbitkan untuk wali murid</p>
      </div>
      {invoices.length === 0 ? (
        <EmptyState icon="📄" title="Belum Ada Invoice" description="Belum ada invoice tagihan yang dibuat." />
      ) : (
        <>
          <div className="hidden md:block bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
            <Table headers={['Nomor','Siswa','Total','Status','']}>
              {invoices.map(i=>{
                const student = siswa.find(x => x.id === i.siswa_id);
                return (
                  <tr key={i.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <Td>
                      <code className="px-2 py-1 rounded bg-slate-100 font-mono text-[11px] text-slate-600 font-bold border border-slate-200/60">{i.invoice_no}</code>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3 py-1">
                        <StudentAvatar name={i.siswa_nama} url={student?.foto} size="sm" />
                        <span className="font-semibold text-slate-855">{i.siswa_nama}</span>
                      </div>
                    </Td>
                    <MoneyCell className="text-slate-900 font-extrabold">{money(i.total)}</MoneyCell>
                    <Td><BillingStatusBadge status={i.status}/></Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <IconButton icon={FileText} label={`PDF invoice ${i.invoice_no}`} onClick={()=>openPdf('invoice',i.id)} size="sm" className="hover:bg-slate-100 text-slate-600"/>
                        {i.status!=='void'&&i.wali_no_wa&&<IconButton icon={Smartphone} label="Kirim WA" onClick={()=>sendWhatsAppInvoice(i)} size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"/>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </div>
          <div className="block md:hidden space-y-3">
            {invoices.map(i => {
              const student = siswa.find(x => x.id === i.siswa_id);
              const colorMap = {
                lunas: 'bg-emerald-500',
                paid: 'bg-emerald-500',
                confirmed: 'bg-emerald-500',
                sebagian: 'bg-blue-500',
                partially_paid: 'bg-blue-500',
                pending_verification: 'bg-violet-500 animate-pulse',
                issued: 'bg-sky-500',
                open: 'bg-amber-500',
                unpaid: 'bg-amber-500'
              };
              const accentColor = colorMap[(i.status || '').toLowerCase()] || 'bg-slate-400';

              return (
                <div key={i.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col hover:border-slate-300 transition duration-200 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                  <div className="p-4 pl-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold block">Invoice No</span>
                        <span className="inline-block mt-0.5"><code className="px-1.5 py-0.5 rounded bg-slate-50 font-mono text-[9px] text-slate-500 font-bold border border-slate-200/50">{i.invoice_no}</code></span>
                      </div>
                      <div className="shrink-0">
                        <BillingStatusBadge status={i.status} />
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-200 my-1" />

                    <div className="flex items-center gap-3">
                      <StudentAvatar name={i.siswa_nama} url={student?.foto} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-sm text-slate-855 truncate">{i.siswa_nama}</div>
                        <div className="text-[10px] font-semibold text-slate-400 mt-0.5">Total Tagihan: <span className="font-extrabold text-slate-805 tabular-nums">{money(i.total)}</span></div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Aksi Invoice</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={()=>openPdf('invoice',i.id)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-700 bg-white hover:bg-slate-50 active:scale-95 transition flex-1">
                          <FileText className="w-3.5 h-3.5 text-slate-500" /> Unduh PDF
                        </button>
                        {i.status!=='void'&&i.wali_no_wa&&(
                          <button type="button" onClick={()=>sendWhatsAppInvoice(i)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-250 text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 transition flex-1">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> Kirim WA
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  const renderModals = () => (
    <>
      {preview&&<Modal title={`Preview Generate ${preview.kind==='bulanan'?'Bulanan':'Kegiatan'}`} onClose={()=>setPreview(null)} maxWidth="max-w-3xl">
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            {preview.kind==='bulanan'?`Periode: ${preview.period} | Tahun ajaran: ${preview.tahun_ajaran}`:`Tahun ajaran: ${preview.tahun_ajaran}`}
            {' | '}Cabang: {m.cabang.find(c=>String(c.id)===String(preview.cabang_id))?.nama||preview.cabang_id}
          </div>
          {preview.errors.length>0&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <div className="font-black mb-1">Error ({preview.errors.length}):</div>
            {preview.errors.map((e,i)=><div key={i}>{e}</div>)}
          </div>}
          {newItems.length>0&&<>
            <div className="font-black text-text-main">Tagihan baru ({newItems.length})</div>
            <div className="overflow-x-auto max-h-64"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenis</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenjang</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Paket</th><th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Awal</th><th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Diskon</th><th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Final</th></tr></thead><tbody className="divide-y divide-slate-100">{newItems.map((p,i)=><tr key={i}><td className="py-2 px-3 text-slate-700">{p.siswa_nama}</td><td className="py-2 px-3 text-slate-700">{p.nama}</td><td className="py-2 px-3 text-slate-700">{p.jenjang_nama}</td><td className="py-2 px-3 text-slate-700">{p.paket}</td><td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-700">{money(p.nominal_awal)}</td><td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-700">{money(p.diskon_amount)}</td><td className="py-2 px-3 text-right tabular-nums font-black text-slate-900">{money(p.nominal_final)}</td></tr>)}</tbody></table></div>
          </>}
          {existingItems.length>0&&<div className="text-sm text-primary">⚠ {existingItems.length} tagihan sudah ada and akan dilewati.</div>}
          {newItems.length===0&&existingItems.length===0&&<div className="text-sm text-slate-400">Tidak ada tagihan yang akan dibuat.</div>}
          <div className="flex gap-2">
            <ActionButton icon={CheckCircle2} onClick={confirmGenerate} disabled={newItems.length===0}>Konfirmasi Generate</ActionButton>
            <ActionButton icon={X} onClick={()=>setPreview(null)} variant="secondary">Batal</ActionButton>
          </div>
        </div>
      </Modal>}

      {showTarifModal && (
        <Modal title="Tambah Tarif Baru" onClose={() => setShowTarifModal(false)}>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {user.role === 'admin' && (
                <div className="sm:col-span-2">
                  <label className="label font-bold text-slate-700 dark:text-slate-300">Cabang Sekolah <span className="text-red-500">*</span></label>
                  <CustomSelect value={tarifForm.cabang_id} onChange={e=>setTarifForm(f=>({...f,cabang_id:e.target.value}))} className="input w-full">
                    <option value="">Pilih Cabang</option>
                    {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
                  </CustomSelect>
                </div>
              )}
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Tahun Ajaran <span className="text-red-500">*</span></label>
                <Input placeholder="Tahun ajaran" value={tarifForm.tahun_ajaran} onChange={v=>setTarifForm(f=>({...f,tahun_ajaran:v}))}/>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Jenjang <span className="text-red-500">*</span></label>
                <CustomSelect value={tarifForm.jenjang_id} onChange={e=>setTarifForm(f=>({...f,jenjang_id:e.target.value}))} className="input w-full">
                  <option value="">Pilih Jenjang</option>
                  {m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Jenis Tarif <span className="text-red-500">*</span></label>
                <CustomSelect value={tarifForm.jenis} onChange={e=>setTarifForm(f=>({...f,jenis:e.target.value,nama:e.target.value.toUpperCase()}))} className="input w-full">
                  {['spp','full_day','care','kegiatan'].map(x=><option key={x} value={x}>{x.toUpperCase()}</option>)}
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nama Tarif <span className="text-red-500">*</span></label>
                <Input placeholder="Nama tarif (cth: SPP KB A)" value={tarifForm.nama} onChange={v=>setTarifForm(f=>({...f,nama:v}))}/>
              </div>
              <div className="sm:col-span-2">
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nominal <span className="text-red-500">*</span></label>
                <div className="relative flex items-stretch w-full">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                    Rp
                  </span>
                  <input
                    type="number"
                    placeholder="Nominal tarif"
                    value={tarifForm.nominal}
                    onChange={e=>setTarifForm(f=>({...f,nominal:e.target.value}))}
                    className="input rounded-l-none w-full"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
              <ActionButton icon={X} onClick={() => setShowTarifModal(false)} variant="secondary">Batal</ActionButton>
              <ActionButton
                icon={submitting ? undefined : Save}
                disabled={submitting}
                onClick={addTarif}
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan…
                  </span>
                ) : (
                  'Simpan Tarif'
                )}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {showDiskonModal && (
        <Modal title="Tambah Diskon / Keringanan Siswa" onClose={() => { setShowDiskonModal(false); setLocalCabangIdDiskon(''); }}>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {user.role === 'admin' && !m.cabangId && (
                <div className="sm:col-span-2">
                  <label className="label font-bold text-slate-700 dark:text-slate-300">Filter Cabang Siswa</label>
                  <CustomSelect value={localCabangIdDiskon} onChange={e=>{setLocalCabangIdDiskon(e.target.value); setDiskonForm(f=>({...f,siswa_id:''}));}} className="input w-full">
                    <option value="">Semua Cabang</option>
                    {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
                  </CustomSelect>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="label font-bold text-slate-700 dark:text-slate-300">Siswa <span className="text-red-500">*</span></label>
                <SearchableSelect value={diskonForm.siswa_id} onChange={e=>setDiskonForm(f=>({...f,siswa_id:e.target.value}))} className="input w-full" placeholder="Pilih Siswa" searchPlaceholder="Cari nama siswa…">
                  <option value="">Pilih Siswa</option>
                  {filteredSiswaForDiskon.map(s=><option key={s.id} value={s.id}>{`${s.nama}${s.rombel_nama?' - '+s.rombel_nama:''}${!m.cabangId&&s.cabang_nama?' ('+s.cabang_nama+')':''}`}</option>)}
                </SearchableSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Jenis Biaya <span className="text-red-500">*</span></label>
                <CustomSelect value={diskonForm.jenis} onChange={e=>setDiskonForm(f=>({...f,jenis:e.target.value}))} className="input w-full">
                  {['spp','full_day','care','kegiatan'].map(x=><option key={x} value={x}>{x.toUpperCase()}</option>)}
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Tipe Diskon <span className="text-red-500">*</span></label>
                <CustomSelect value={diskonForm.tipe} onChange={e=>setDiskonForm(f=>({...f,tipe:e.target.value}))} className="input w-full">
                  <option value="nominal">Nominal (Rp)</option>
                  <option value="persen">Persen (%)</option>
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nilai Diskon <span className="text-red-500">*</span></label>
                <div className="relative flex items-stretch w-full">
                  {diskonForm.tipe === 'nominal' && (
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                      Rp
                    </span>
                  )}
                  <input
                    type="number"
                    placeholder={diskonForm.tipe === 'nominal' ? "Nominal diskon" : "Persen diskon"}
                    value={diskonForm.nilai}
                    onChange={e=>setDiskonForm(f=>({...f,nilai:e.target.value}))}
                    className={`input w-full ${diskonForm.tipe === 'nominal' ? 'rounded-l-none' : 'rounded-r-none'}`}
                  />
                  {diskonForm.tipe === 'persen' && (
                    <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                      %
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Catatan</label>
                <Input placeholder="Keterangan diskon" value={diskonForm.catatan} onChange={v=>setDiskonForm(f=>({...f,catatan:v}))}/>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
              <ActionButton icon={X} onClick={() => { setShowDiskonModal(false); setLocalCabangIdDiskon(''); }} variant="secondary">Batal</ActionButton>
              <ActionButton
                icon={submitting ? undefined : Save}
                disabled={submitting}
                onClick={addDiskon}
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan…
                  </span>
                ) : (
                  'Simpan Diskon'
                )}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {editingTarif && (
        <Modal title="Edit Tarif" onClose={() => setEditingTarif(null)}>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nama Tarif</label>
                <Input value={editingTarif.nama || ''} onChange={v=>setEditingTarif(t=>({...t,nama:v}))} placeholder="Nama tarif"/>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nominal</label>
                <div className="relative flex items-stretch w-full">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">Rp</span>
                  <input type="number" value={editingTarif.nominal || ''} onChange={e=>setEditingTarif(t=>({...t,nominal:e.target.value}))} className="input rounded-l-none w-full" min="0"/>
                </div>
              </div>
              <div className="flex items-end">
                <Toggle label={editingTarif.aktif===0?'Nonaktif':'Aktif'} checked={editingTarif.aktif!==0} onChange={checked=>setEditingTarif(t=>({...t,aktif:checked?1:0}))}/>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
              {editingTarif.jenjang_nama || 'Jenjang'} · {String(editingTarif.jenis || '').toUpperCase()} · {editingTarif.tahun_ajaran}
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <ActionButton icon={X} onClick={() => setEditingTarif(null)} variant="secondary">Batal</ActionButton>
              <ActionButton icon={submitting ? undefined : Save} disabled={submitting} onClick={saveTarifEdit}>
                {submitting ? <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin"/>Menyimpan…</span> : 'Simpan Tarif'}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {editingDiskon && (
        <Modal title="Edit Diskon / Keringanan" onClose={() => setEditingDiskon(null)}>
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
              <div className="text-[10px] font-black text-slate-400 uppercase text-slate-550">Siswa</div>
              <div className="font-black text-slate-800">{editingDiskon.siswa_nama}</div>
              <div className="text-xs text-slate-500">{String(editingDiskon.jenis || '').toUpperCase()} · {editingDiskon.tahun_ajaran}</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Tipe Diskon</label>
                <CustomSelect value={editingDiskon.tipe} onChange={e=>setEditingDiskon(d=>({...d,tipe:e.target.value}))} className="input w-full">
                  <option value="nominal">Nominal (Rp)</option>
                  <option value="persen">Persen (%)</option>
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nilai</label>
                <div className="relative flex items-stretch w-full">
                  {editingDiskon.tipe === 'nominal' && <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">Rp</span>}
                  <input type="number" value={editingDiskon.nilai || ''} onChange={e=>setEditingDiskon(d=>({...d,nilai:e.target.value}))} className={`input w-full ${editingDiskon.tipe === 'nominal' ? 'rounded-l-none' : 'rounded-r-none'}`} min="0"/>
                  {editingDiskon.tipe === 'persen' && <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">%</span>}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="label font-bold text-slate-700 dark:text-slate-300">Catatan</label>
                <Input value={editingDiskon.catatan || ''} onChange={v=>setEditingDiskon(d=>({...d,catatan:v}))} placeholder="Catatan diskon"/>
              </div>
              <div className="sm:col-span-2">
                <Toggle label={editingDiskon.aktif===0?'Nonaktif':'Aktif'} checked={editingDiskon.aktif!==0} onChange={checked=>setEditingDiskon(d=>({...d,aktif:checked?1:0}))}/>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <ActionButton icon={X} onClick={() => setEditingDiskon(null)} variant="secondary">Batal</ActionButton>
              <ActionButton icon={submitting ? undefined : Save} disabled={submitting} onClick={saveDiskonEdit}>
                {submitting ? <span className="flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin"/>Menyimpan…</span> : 'Simpan Diskon'}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {showPaymentModal && (
        <Modal title="Catat Pembayaran Siswa" onClose={() => { setShowPaymentModal(false); setAlokasiPreview(null); setLocalCabangIdPayment(''); }} maxWidth="max-w-4xl">
          <div className="grid md:grid-cols-12 gap-6">
            <div className="md:col-span-5 space-y-4">
              {user.role === 'admin' && !m.cabangId && (
                <div>
                  <label className="label font-bold text-slate-700 dark:text-slate-300">Filter Cabang Siswa</label>
                  <CustomSelect value={localCabangIdPayment} onChange={e=>{setLocalCabangIdPayment(e.target.value); setPayForm(f=>({...f,siswa_id:''}));}} className="input w-full">
                    <option value="">Semua Cabang</option>
                    {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
                  </CustomSelect>
                </div>
              )}
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Siswa <span className="text-red-500">*</span></label>
                <SearchableSelect value={payForm.siswa_id} onChange={e=>setPayForm(f=>({...f,siswa_id:e.target.value}))} className="input w-full" placeholder="Pilih Siswa" searchPlaceholder="Cari nama siswa…">
                  <option value="">Pilih Siswa</option>
                  {filteredSiswaForPayment.map(s=><option key={s.id} value={s.id}>{`${s.nama}${s.rombel_nama?' - '+s.rombel_nama:''}${!m.cabangId&&s.cabang_nama?' ('+s.cabang_nama+')':''}`}</option>)}
                </SearchableSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nominal Pembayaran <span className="text-red-500">*</span></label>
                <div className="relative flex items-stretch w-full">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                    Rp
                  </span>
                  <input
                    type="number"
                    placeholder="Nominal pembayaran"
                    value={payForm.nominal}
                    onChange={e=>setPayForm(f=>({...f,nominal:e.target.value}))}
                    className="input rounded-l-none w-full"
                  />
                </div>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Metode Pembayaran <span className="text-red-500">*</span></label>
                <CustomSelect value={payForm.metode} onChange={e=>setPayForm(f=>({...f,metode:e.target.value}))} className="input w-full">
                  {['tunai','transfer','qris','lainnya'].map(x=><option key={x} value={x}>{x.toUpperCase()}</option>)}
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Tanggal Bayar <span className="text-red-500">*</span></label>
                <Input type="date" value={payForm.tanggal} onChange={v=>setPayForm(f=>({...f,tanggal:v}))}/>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Referensi / Bukti</label>
                <Input placeholder="Nomor referensi / note" value={payForm.reference} onChange={v=>setPayForm(f=>({...f,reference:v}))}/>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Catatan Tambahan</label>
                <Input placeholder="Catatan internal" value={payForm.catatan} onChange={v=>setPayForm(f=>({...f,catatan:v}))}/>
              </div>
            </div>

            <div className="md:col-span-7 bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <h4 className="font-black text-text-main mb-3 flex items-center gap-1.5 dark:text-slate-200">
                  <Receipt size={16} />
                  Pratinjau Alokasi Pembayaran (FIFO)
                </h4>
                
                {!payForm.siswa_id || !payForm.nominal || Number(payForm.nominal) <= 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-sm">
                    <p>Masukkan siswa dan nominal pembayaran</p>
                    <p className="text-xs mt-1">untuk melihat simulasi alokasi FIFO tagihan</p>
                  </div>
                ) : alokasiPreview ? (
                  <div className="space-y-4">
                    {alokasiPreview.allocations && alokasiPreview.allocations.length > 0 ? (
                      <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black">
                              <th className="text-left py-2 px-3">Tagihan</th>
                              <th className="text-left py-2 px-3">Periode</th>
                              <th className="text-right py-2 px-3">Total</th>
                              <th className="text-right py-2 px-3">Sisa</th>
                              <th className="text-right py-2 px-3 text-emerald-600 dark:text-emerald-400">Dialokasi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {alokasiPreview.allocations.map((a, i) => (
                              <tr key={i} className="text-slate-700 dark:text-slate-300">
                                <td className="py-2 px-3 font-semibold">{a.nama}</td>
                                <td className="py-2 px-3">{a.periode || '-'}</td>
                                <td className="py-2 px-3 text-right tabular-nums font-semibold">{money(a.nominal_final)}</td>
                                <td className="py-2 px-3 text-right tabular-nums font-semibold">{money(a.unpaid)}</td>
                                <td className="py-2 px-3 text-right tabular-nums font-black text-emerald-600 dark:text-emerald-400">
                                  {money(a.allocated)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="h-32 flex items-center justify-center text-slate-400 text-xs text-center">
                        Tidak ada tagihan aktif (open/sebagian) untuk siswa ini.
                      </div>
                    )}
                    
                    {alokasiPreview.remaining_unallocated > 0 && (
                      <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                        Sisa dana belum dialokasikan: <strong className="tabular-nums">{money(alokasiPreview.remaining_unallocated)}</strong>. Nominal tetap tercatat di pembayaran, tapi belum menjadi pelunasan tagihan mana pun.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                    Memuat simulasi alokasi…
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                <ActionButton icon={X} onClick={() => { setShowPaymentModal(false); setAlokasiPreview(null); setLocalCabangIdPayment(''); }} variant="secondary">Batal</ActionButton>
                <ActionButton
                  icon={submitting ? undefined : CheckCircle2}
                  disabled={submitting || !payForm.siswa_id || !payForm.nominal}
                  onClick={pay}
                >
                  {submitting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menyimpan…
                    </span>
                  ) : (
                    'Simpan & Catat Pembayaran'
                  )}
                </ActionButton>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {alokasiEdit && (
        <Modal title="Koreksi Alokasi Pembayaran" onClose={() => setAlokasiEdit(null)} maxWidth="max-w-3xl">
          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Wali / Siswa</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {siswa.find(s => String(s.id) === String(alokasiEdit.payment.siswa_id))?.nama || '-'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Nominal Pembayaran</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{money(alokasiEdit.payment.nominal)}</span>
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Belum Dialokasikan</span>
                <span className={`font-black tabular-nums ${alokasiEdit.payment.nominal - alokasiEdit.bills.reduce((sum, b) => sum + (b._alloc || 0), 0) < 0 ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {money(alokasiEdit.payment.nominal - alokasiEdit.bills.reduce((sum, b) => sum + (b._alloc || 0), 0))}
                </span>
              </div>
            </div>
            {alokasiEdit.payment.nominal - alokasiEdit.bills.reduce((sum, b) => sum + Number(b._alloc || 0), 0) > 0 && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Sisa dana akan disimpan sebagai saldo kredit pembayaran ini dan belum mengurangi tagihan lain.
              </div>
            )}

            <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black">
                    <th className="text-left py-2.5 px-4">Tagihan</th>
                    <th className="text-left py-2.5 px-4">Periode</th>
                    <th className="text-right py-2.5 px-4">Total Tagihan</th>
                    <th className="text-center py-2.5 px-4">Status</th>
                    <th className="text-right py-2.5 px-4 w-40">Alokasi Dana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {alokasiEdit.bills.map(b => {
                    const current = b._alloc !== undefined ? b._alloc : 0;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                        <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{b.nama}</td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{b.periode || '-'}</td>
                        <td className="py-3 px-4 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-300">{money(b.nominal_final)}</td>
                        <td className="py-3 px-4 text-center">
                          <BillingStatusBadge status={b.status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="relative flex items-center w-full">
                            <span className="absolute left-2.5 text-xs text-slate-400 font-bold">Rp</span>
                            <input
                              type="number"
                              value={current || ''}
                              onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setAlokasiEdit(ae => ({
                                  ...ae,
                                  bills: ae.bills.map(x => x.id === b.id ? { ...x, _alloc: val } : x)
                                }));
                              }}
                              className="input pl-8 py-1 h-8 text-right text-xs font-semibold w-full tabular-nums border border-slate-200 rounded-md focus:border-primary"
                              min="0"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <ActionButton icon={X} onClick={() => setAlokasiEdit(null)} variant="secondary">Batal</ActionButton>
              <ActionButton
                icon={Save}
                disabled={alokasiEdit.payment.nominal - alokasiEdit.bills.reduce((sum, b) => sum + (b._alloc || 0), 0) < 0}
                onClick={saveAlokasi}
              >
                Simpan Alokasi
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      
      {confirmAction&&<Modal title={confirmAction.title} onClose={()=>setConfirmAction(null)}>
        <div className="space-y-4">
          {confirmAction.fields.map(f=><div key={f.key}><div className="label">{f.label}</div><input value={f.value} onChange={e=>setConfirmAction(ca=>({...ca,fields:ca.fields.map(x=>x.key===f.key?{...x,value:e.target.value}:x)}))} className="input w-full"/></div>)}
          <div className="flex gap-2"><ActionButton icon={CheckCircle2} onClick={()=>confirmAction.onSubmit(Object.fromEntries(confirmAction.fields.map(f=>[f.key,f.value])))}>Konfirmasi</ActionButton><ActionButton icon={X} onClick={()=>setConfirmAction(null)} variant="secondary">Batal</ActionButton></div>
        </div>
      </Modal>}
    </>
  );

  return (
    <Panel title="Billing" right={<CabangFilter user={user} {...m}/>}>
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-5 overflow-x-auto scrollbar-none">
        {[
          {key:'ringkasan',label:'Ringkasan',icon:BarChart3},
          {key:'tagihan',label:'Tagihan',icon:Receipt},
          {key:'pembayaran',label:'Pembayaran',icon:CreditCard,badge:billingStats.pendingCount||0},
          {key:'tarif',label:'Tarif & Diskon',icon:Settings},
          {key:'invoice',label:'Invoice',icon:FileText},
        ].map(tab=>(
          <button key={tab.key} onClick={()=>setBillingSubTab(tab.key)} type="button"
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-all ${
              billingSubTab===tab.key
                ? 'bg-white text-text-main shadow-sm'
                : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
            }`}>
            <tab.icon className="w-3.5 h-3.5"/>
            {tab.label}
            {tab.badge>0&&<span className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-black leading-none">{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      {billingSubTab === 'ringkasan' && renderRingkasanTab()}
      {billingSubTab === 'tagihan' && renderTagihanTab()}
      {billingSubTab === 'pembayaran' && renderPembayaranTab()}
      {billingSubTab === 'tarif' && renderTarifTab()}
      {billingSubTab === 'invoice' && renderInvoiceTab()}

      {/* ═══ MODALS & DIALOGS ═══ */}
      {renderModals()}
    </Panel>
  );
}

function LaporanTab({user,toast}){
  const m=useMaster(user);const[rows,setRows]=useState([]);const[tanggal,setTanggal]=useState('');
  const[rombelId,setRombelId]=useState('');const[detail,setDetail]=useState(null);const[edits,setEdits]=useState(null);
  async function load(){try{const r=await api.dailyAdminHistory({cabang_id:m.cabangId,tanggal:tanggal||undefined,rombel_id:rombelId||undefined,limit:150});setRows(r);}catch(e){toast('err',e.message);}}
  useEffect(()=>{if(m.cabangId||user.role==='admin')load();},[m.cabangId,tanggal,rombelId]);
  useEffect(()=>{setRombelId('');},[m.cabangId]);
  async function open(r){setDetail(r);if(r.id)api.dailyEdits(r.id).then(setEdits).catch(()=>setEdits([]));}
  const RATING_OPTS_ADMIN=['BB','MB','BSH','BSB'];
  const PILLAR_KEYS_ADMIN=[{k:'iqra',l:'Tilawati'},{k:'akhlak',l:'Akhlak'},{k:'aktif_mandiri',l:'Aktif & Mandiri'},{k:'disiplin_tertib',l:'Disiplin & Tertib'}];
  function tapAdminRating(type,key,opt){
    setDetail(d=>{
      const obs=d.structured_observation||{};
      const section={...(obs[type]||{})};
      if(section[key]===opt){delete section[key];}else{section[key]=opt;}
      return {...d,structured_observation:{...obs,[type]:section}};
    });
  }
  async function saveEdit(){try{await api.saveDaily({siswa_id:detail.siswa_id,tanggal:detail.tanggal,mood:detail.mood,makan:detail.makan,tidur:detail.tidur,aktivitas:detail.aktivitas,catatan:detail.catatan,focus_theme_id:detail.focus_theme_id,observation_domain:detail.observation_domain,observation_note:detail.observation_note,parent_note:detail.parent_note,structured_observation:detail.structured_observation});toast('ok','Laporan dikoreksi');setDetail(null);load();}catch(e){toast('err',e.message);}}
  const completeness=()=>{if(!detail)return 0;let s=0;if(detail.focus_theme_id)s++;if(detail.mood)s++;if(detail.makan)s++;if(detail.tidur!==null&&detail.tidur!==undefined)s++;if(detail.observation_domain)s++;if(String(detail.observation_note||'').trim().length>=12)s++;return Math.round(s/6*100);};
  const showCabangColumn=user.role==='admin';
  const statusClass=status=>status==='published'?'bg-emerald-100 text-emerald-700':'bg-primary-container text-primary-active';
  const toolbar=<div className="grid w-full min-w-0 grid-cols-2 gap-2 xl:flex xl:w-auto xl:items-center xl:justify-end">
    <input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} className="input h-9 w-full min-w-0 text-xs xl:w-40 xl:text-sm"/>
    <CabangFilter user={user} {...m} plain className="h-9 w-full min-w-0 xl:w-64"/>
    <CustomSelect value={rombelId} onChange={e=>setRombelId(e.target.value)} className="input h-9 w-full min-w-0 xl:w-48">
      <option value="">Semua rombel</option>{m.rombel.map(r=><option key={r.id} value={r.id}>{showCabangColumn&&!m.cabangId?`${r.cabang_nama} - ${r.nama}`:r.nama}</option>)}
    </CustomSelect>
    <ActionButton icon={RefreshCw} onClick={load} variant="secondary" className="w-full px-2 text-xs xl:hidden">Refresh</ActionButton>
    <ActionButton icon={RefreshCw} onClick={load} variant="secondary" className="hidden xl:inline-flex">Refresh</ActionButton>
  </div>;
  return <Panel title="Histori & Koreksi Laporan Harian" className="min-w-0">
    <div className="min-w-0 space-y-4 overflow-hidden">
      {toolbar}
      <div className="grid w-full min-w-0 max-w-full gap-2 md:hidden">
        {rows.map(r=><button key={r.id} type="button" onClick={()=>open(r)} className={`block w-full min-w-0 max-w-full overflow-hidden rounded-xl border p-2.5 text-left transition active:scale-[0.99] ${detail?.id===r.id?'border-primary bg-primary-container':'border-slate-200 bg-white'}`}>
          <div className="w-full min-w-0 overflow-hidden">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-wider text-slate-400">{r.tanggal}</div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${statusClass(r.status)}`}>{r.status||'draft'}</span>
              </div>
              <div className="mt-1 block max-w-full truncate text-sm font-black leading-tight text-text-main" title={r.siswa_nama}>{r.siswa_nama}</div>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 text-[10px] font-bold text-slate-500">
                {showCabangColumn&&<span className="inline-block max-w-full truncate rounded bg-slate-50 px-1.5 py-0.5">{r.cabang_nama||'-'}</span>}
                <span className="inline-block max-w-full truncate rounded bg-slate-50 px-1.5 py-0.5">{r.rombel_nama||'-'}</span>
              </div>
              <div className="mt-2 max-w-full truncate text-[11px] font-semibold text-slate-500">Guru: {r.guru_nama||'Belum ada guru'}</div>
            </div>
          </div>
        </button>)}
        {rows.length===0&&<EmptyState icon="clipboard" title="Belum Ada Laporan" description="Tidak ada laporan yang cocok dengan filter saat ini."/>}
      </div>
      <div className="hidden overflow-x-auto max-w-full md:block"><table className="w-full min-w-[860px] text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Tanggal</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th>{showCabangColumn&&<th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Cabang</th>}<th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Rombel</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Status</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Guru</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black sticky right-0 z-10 border-l border-slate-200/80"></th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(r=><tr key={r.id} className={detail?.id===r.id?'bg-primary-container':''}><td className="py-2 px-3 text-slate-700">{r.tanggal}</td><td className="py-2 px-3 font-bold text-text-main">{r.siswa_nama}</td>{showCabangColumn&&<td className="py-2 px-3 text-slate-600">{r.cabang_nama||'-'}</td>}<td className="py-2 px-3 text-slate-600">{r.rombel_nama}</td><td className="py-2 px-3"><span className={`text-xs font-black px-2 py-1 rounded-full ${statusClass(r.status)}`}>{r.status||'draft'}</span></td><td className="py-2 px-3 text-slate-600">{r.guru_nama||'-'}</td><td className="py-2 px-3 sticky right-0 z-10 bg-white border-l border-slate-200/80"><IconButton icon={FilePenLine} label={`Lihat atau edit laporan ${r.siswa_nama}`} onClick={()=>open(r)} size="sm"/></td></tr>)}</tbody></table></div>
      {detail&&<Modal title={`Koreksi Laporan - ${detail.siswa_nama}`} onClose={()=>{setDetail(null);setEdits(null);}}>
      <div className="space-y-3">
        <div className="text-sm text-slate-500">{detail.tanggal} - {detail.cabang_nama} - {detail.rombel_nama}</div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="label">Focus Theme</div>
          <div className="font-black text-text-main">{detail.focus_theme_title||'-'}</div>
          {detail.modul_ajar_title&&<div className="text-xs text-slate-500 mt-1">Modul: {detail.modul_ajar_title}</div>}
          {detail.focus_theme_activity_summary&&<div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{detail.focus_theme_activity_summary}</div>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CustomSelect value={detail.mood||''} onChange={e=>setDetail(d=>({...d,mood:e.target.value||null}))} className="input"><option value="">Mood</option><option value="ceria">😊 Ceria</option><option value="biasa">😐 Biasa</option><option value="rewel">😢 Rewel</option></CustomSelect>
          <CustomSelect value={detail.makan||''} onChange={e=>setDetail(d=>({...d,makan:e.target.value||null}))} className="input"><option value="">Makan</option><option value="habis">🍽️ Habis</option><option value="setengah">🍱 Setengah</option><option value="tidak">❌ Tidak</option></CustomSelect>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={detail.tidur===1} onChange={e=>setDetail(d=>({...d,tidur:e.target.checked?1:0}))}/> Tidur siang</label>
        <div><div className="label">Domain observasi</div><input value={detail.observation_domain||''} onChange={e=>setDetail(d=>({...d,observation_domain:e.target.value}))} className="input w-full" placeholder="Mis. Literasi, Numerasi, Sosial Emosional"/></div>
        <textarea value={detail.observation_note||''} onChange={e=>setDetail(d=>({...d,observation_note:e.target.value}))} className="input w-full min-h-24" placeholder="Catatan observasi objektif"/>
        <div><div className="label">Aktivitas</div><div className="flex flex-wrap gap-1">{[...'Mewarnai,Bernyanyi & Menari,Bermain Bebas,Membaca & Menulis,Motorik Halus,Motorik Kasar,Ibadah / Doa,Seni & Kerajinan,Bercerita,Bermain Peran'.split(',')].map(a=><button key={a} onClick={()=>setDetail(d=>({...d,aktivitas:(d.aktivitas||[]).includes(a)?(d.aktivitas||[]).filter(x=>x!==a):[...(d.aktivitas||[]),a]}))} className={`text-xs px-2 py-1 rounded-lg border transition-all duration-200 ${(detail.aktivitas||[]).includes(a)?'bg-primary-container border-primary/20 text-primary-active active:scale-95':'bg-white border-slate-200 text-slate-600 hover:border-primary/20'}`}>{a}</button>)}</div></div>

        {/* Penilaian Capaian Perkembangan */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Penilaian Capaian Perkembangan</div>

          {/* Aktivitas dari Focus Theme */}
          {(() => {
            const acts = String(detail.focus_theme_activity_summary||'').split('\n').map(l=>l.replace(/^[\s\-•*]+/,'').trim()).filter(Boolean);
            const actRatings = (detail.structured_observation||{}).activities||{};
            if(acts.length===0) return <p className="text-xs text-slate-400 italic">Tidak ada rencana kegiatan pada Focus Theme ini.</p>;
            return (
              <div className="space-y-2">
                <div className="text-xs font-bold text-text-main">Rencana Kegiatan</div>
                {acts.map(act=>(
                  <div key={act} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100">
                    <span className="text-xs font-semibold text-slate-700">{act}</span>
                    <div className="flex gap-1">{RATING_OPTS_ADMIN.map(opt=>(
                      <button key={opt} type="button" onClick={()=>tapAdminRating('activities',act,opt)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                          actRatings[act]===opt
                            ? opt==='BSB'?'bg-emerald-500 text-white border-transparent'
                              :opt==='BSH'?'bg-primary text-white border-transparent'
                              :opt==='MB'?'bg-amber-500 text-white border-transparent':'bg-red-500 text-white border-transparent'
                            :'bg-white border-slate-200 text-slate-500 hover:border-primary/40'
                        }`}>{opt}</button>
                    ))}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Pilar Karakter */}
          <div className="space-y-2 pt-3 border-t border-slate-200">
            <div className="text-xs font-bold text-text-main">Pilar Karakter & Tilawati</div>
            {PILLAR_KEYS_ADMIN.map(p=>{
              const pRatings=(detail.structured_observation||{}).pillars||{};
              return(
                <div key={p.k} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-xs font-semibold text-slate-700">{p.l}</span>
                  <div className="flex gap-1">{RATING_OPTS_ADMIN.map(opt=>(
                    <button key={opt} type="button" onClick={()=>tapAdminRating('pillars',p.k,opt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                        pRatings[p.k]===opt
                          ? opt==='BSB'?'bg-emerald-500 text-white border-transparent'
                            :opt==='BSH'?'bg-primary text-white border-transparent'
                            :opt==='MB'?'bg-amber-500 text-white border-transparent':'bg-red-500 text-white border-transparent'
                          :'bg-white border-slate-200 text-slate-500 hover:border-primary/40'
                      }`}>{opt}</button>
                  ))}</div>
                </div>
              );
            })}
          </div>
        </div>

        <textarea value={detail.catatan||''} onChange={e=>setDetail(d=>({...d,catatan:e.target.value}))} className="input w-full min-h-20" placeholder="Catatan"/>
        <textarea value={detail.parent_note||''} onChange={e=>setDetail(d=>({...d,parent_note:e.target.value}))} className="input w-full min-h-20" placeholder="Catatan untuk wali"/>
        <div className="text-xs text-slate-400">Kelengkapan: {completeness()}%</div>
        <div className="flex gap-2"><ActionButton icon={Save} onClick={saveEdit}>Simpan Koreksi</ActionButton><ActionButton icon={X} onClick={()=>{setDetail(null);setEdits(null);}} variant="secondary">Batal</ActionButton></div>
        {edits&&edits.length>0&&<div className="border-t border-slate-200 pt-3"><div className="text-xs font-black text-slate-500 mb-2">Riwayat Edit</div><div className="space-y-1">{edits.slice(0,10).map((e,i)=><div key={i} className="text-xs text-slate-500"><span className="font-bold">{e.guru_nama||'Guru'}</span> - {fmtTime(e.created_at)}</div>)}</div></div>}
      </div>
      </Modal>}
    </div>
  </Panel>;
}

function ConfigTab({user,toast}){
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Wallet className="h-5 w-5"/></div>
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
            <div className="flex items-center gap-2 text-sm font-black text-text-main"><Banknote className="h-4 w-4 text-emerald-700"/>Rekening pembayaran</div>
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

function ConfigStat({icon:Icon,label,value}){
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{Icon&&<Icon className="h-3.5 w-3.5"/>}{label}</div>
    <div className="mt-1 truncate text-lg font-black text-text-main">{value}</div>
  </div>;
}

function ConfigTimeSummary({label,value}){
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
    <div className="truncate text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div>
    <div className="mt-0.5 truncate text-sm font-black text-text-main">{value}</div>
  </div>;
}

function ConfigTimeField({label,value,onChange,disabled=false}){
  return <label className="block min-w-0">
    <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
    <div className="relative">
      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
      <Input type="time" value={value||''} onChange={onChange} disabled={disabled} className="h-10 pl-9 font-black text-text-main disabled:bg-slate-100 disabled:text-slate-400"/>
    </div>
  </label>;
}

function ConfigTextField({label,value,onChange,className=''}) {
  return <label className={`block min-w-0 ${className}`}>
    <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
    <Input value={value} onChange={onChange} className="h-10 font-semibold text-text-main"/>
  </label>;
}

function ConfigSwitch({label,hint,checked,onChange}){
  return <button type="button" onClick={()=>onChange(!checked)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.99] ${checked?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-white hover:border-primary/30'}`}>
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked?'border-emerald-500 bg-emerald-500 text-white':'border-slate-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5"/></span>
    <span className="min-w-0">
      <span className={`block text-sm font-black ${checked?'text-emerald-800':'text-text-main'}`}>{label}</span>
      <span className="mt-0.5 block text-xs font-medium leading-snug text-slate-500">{hint}</span>
    </span>
  </button>;
}

function KalenderTab({user,toast}){
  const m=useMaster(user);const[tahun,setTahun]=useState(new Date().getFullYear().toString());const[events,setEvents]=useState([]);const[collapsedMonths,setCollapsedMonths]=useState(new Set());const[form,setForm]=useState({tanggal:'',tipe:'libur',nama:'',scope:'yayasan',cabang_id:''});const[openForm,setOpenForm]=useState(false);const[deleteConfirm,setDeleteConfirm]=useState(null);
  useEffect(()=>{if(m.cabangId||user.role==='admin')api.kalender({cabang_id:m.cabangId,tahun}).then(setEvents).catch(e=>toast('err',e.message));},[m.cabangId,tahun]);
  async function add(){
    if(!form.tanggal||!form.nama.trim()){toast('err','Tanggal dan nama event wajib diisi');return;}
    const scope = user.role==='admin' ? form.scope : 'cabang';
    const targetCabangId = scope === 'cabang' ? (user.role === 'admin' ? form.cabang_id : user.cabang_id) : null;
    if(scope === 'cabang' && !targetCabangId){toast('err','Pilih cabang terlebih dahulu untuk event cabang');return;}
    try{await api.createKalender({...form,nama:form.nama.trim(),cabang_id:targetCabangId,scope});toast('ok','Event ditambahkan');setForm({tanggal:'',tipe:'libur',nama:'',scope:'yayasan',cabang_id:''});setOpenForm(false);const r=await api.kalender({cabang_id:m.cabangId,tahun});setEvents(r);}catch(e){toast('err',e.message);}
  }
  async function remove(id){try{await api.deleteKalender(id);toast('ok','Event dihapus');setEvents(events.filter(e=>e.id!==id));}catch(e){toast('err',e.message);}}
  const toggleMonth=(key)=>{setCollapsedMonths(prev=>{const newSet=new Set(prev);if(newSet.has(key))newSet.delete(key);else newSet.add(key);return newSet;});};
  const months=["01","02","03","04","05","06","07","08","09","10","11","12"];
  const totalLibur=events.filter(e=>e.tipe==='libur').length;
  const totalMasuk=events.filter(e=>e.tipe!=='libur').length;
  const openAddForm=()=>{setForm({tanggal:'',tipe:'libur',nama:'',scope:'yayasan',cabang_id:m.cabangId||''});setOpenForm(true);};
  const right=<div className="calendar-toolbar">
    <Input type="number" value={tahun} onChange={v=>setTahun(v)} placeholder="Tahun" className="calendar-year-input"/>
    {user.role==='admin'
      ? <CustomSelect value={m.cabangId} onChange={e=>m.setCabangId(e.target.value)} className="input calendar-branch-select"><option value="">Pilih cabang</option>{m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}</CustomSelect>
      : <div className="calendar-branch-spacer"/>}
    <IconButton icon={CalendarPlus} label="Tambah event" onClick={openAddForm} variant="primary" className="calendar-add-icon"/>
    <ActionButton icon={CalendarPlus} onClick={openAddForm} className="calendar-add-button">Tambah Event</ActionButton>
  </div>;
  return <Panel title="Kalender Akademik" right={right}>
    <div className="calendar-compact-stats mb-3">
      <div className="calendar-compact-stat"><span>Event</span><b>{events.length}</b></div>
      <div className="calendar-compact-stat"><span>Libur</span><b>{totalLibur}</b></div>
      <div className="calendar-compact-stat"><span>Masuk</span><b>{totalMasuk}</b></div>
    </div>
    <div className="calendar-scroll custom-scrollbar">
      <div className="calendar-board grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {months.map(m=>{
          const prefix=`${tahun}-${m}`;
          const monthEvents=events.filter(e=>e.tanggal.startsWith(prefix));
          const monthName=new Date(Number(tahun),Number(m)-1,1).toLocaleString('id-ID',{month:'long'});
          const monthKey=`${tahun}-${m}`;
          const isOpen=!collapsedMonths.has(monthKey);
          const liburCount=monthEvents.filter(e=>e.tipe==='libur').length;
          const masukCount=monthEvents.length-liburCount;
          return <div key={m} className={`calendar-month ${monthEvents.length?'has-events':''}`}>
            <button type="button" className="calendar-month-head" onClick={()=>toggleMonth(monthKey)}>
              <div className="calendar-month-code">{m}</div>
              <div className="min-w-0">
                <div className="calendar-month-name">{monthName}</div>
                <div className="calendar-month-meta">{tahun} · {liburCount} libur · {masukCount} masuk</div>
              </div>
              <div className="calendar-month-tools">
                <span className="calendar-count">{monthEvents.length}</span>
                <ChevronDown className={`chevron-rotate ${isOpen?'open':''}`} size={16}/>
              </div>
            </button>
            {isOpen && (
              monthEvents.length===0 ?
                <div className="calendar-empty">Tidak ada event</div>
                :
                <div className="calendar-event-list custom-scrollbar">{monthEvents.map(e=><div key={e.id} className={`calendar-event ${e.tipe==='libur'?'is-holiday':'is-schoolday'}`}>
                  <div className="calendar-event-date">
                    <span>{e.tanggal.slice(8)}</span>
                  </div>
                  <div className="calendar-event-main">
                    <div className="min-w-0">
                      <div className="calendar-event-title">{e.nama}</div>
                      <div className="calendar-event-tags">
                        <span>{e.tipe==='libur'?'Libur':'Masuk Khusus'}</span>
                        <span>{e.cabang_nama||'Taruna Prima'}</span>
                      </div>
                    </div>
                    <div className="calendar-event-action">
                    <IconButton icon={Trash2} label={`Hapus ${e.nama}`} onClick={()=>setDeleteConfirm(e)} size="sm" variant="danger"/>
                    </div>
                  </div>
                </div>)}
                </div>
            )}
          </div>
        })}
      </div>
    </div>
    {openForm&&<Modal title="Tambah Event Kalender" onClose={()=>setOpenForm(false)} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
            <CalendarPlus className="w-3.5 h-3.5"/>
            Data Event
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Tanggal <span className="text-rose-500">*</span></span>
              <Input type="date" value={form.tanggal} onChange={v=>setForm(f=>({...f,tanggal:v}))}/>
            </label>
            <label className="block">
              <span className="label">Tipe Event <span className="text-rose-500">*</span></span>
              <CustomSelect value={form.tipe} onChange={e=>setForm(f=>({...f,tipe:e.target.value}))} className="input w-full"><option value="libur">Libur</option><option value="masuk">Masuk Khusus</option></CustomSelect>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Nama Event <span className="text-rose-500">*</span></span>
              <Input placeholder="Contoh: Libur Idul Fitri" value={form.nama} onChange={v=>setForm(f=>({...f,nama:v}))}/>
            </label>
            {user.role==='admin'&&<label className="block sm:col-span-2">
              <span className="label">Scope</span>
              <CustomSelect value={form.scope} onChange={e=>setForm(f=>({...f,scope:e.target.value}))} className="input w-full"><option value="yayasan">Semua cabang</option><option value="cabang">Cabang</option></CustomSelect>
            </label>}
            {user.role==='admin'&&form.scope==='cabang'&&<label className="block sm:col-span-2">
              <span className="label">Cabang Sekolah <span className="text-rose-500">*</span></span>
              <CustomSelect value={form.cabang_id||''} onChange={e=>setForm(f=>({...f,cabang_id:e.target.value}))} className="input w-full">
                <option value="">Pilih Cabang</option>
                {m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}
              </CustomSelect>
            </label>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"/>
            <div>
              <div className="text-xs font-black text-slate-700">Event memengaruhi absensi dan daily record</div>
              <div className="mt-0.5 text-xs leading-relaxed text-slate-500">Gunakan semua cabang untuk event Taruna Prima, atau scope cabang untuk event khusus cabang yang sedang dipilih.</div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <ActionButton icon={X} onClick={()=>setOpenForm(false)} variant="secondary">Batal</ActionButton>
          <ActionButton icon={CalendarPlus} onClick={add}>Tambah Event</ActionButton>
        </div>
      </div>
    </Modal>}
    {deleteConfirm&&<ConfirmActionModal
      title="Hapus Event Kalender"
      entityName={`${deleteConfirm.tanggal} - ${deleteConfirm.nama}`}
      affectedBranch={deleteConfirm.cabang_nama||'Semua Cabang'}
      consequence="Tindakan ini akan menghapus event dari kalender akademik dan tidak dapat dibatalkan."
      actionLabel="Ya, Hapus Event"
      actionVariant="danger"
      icon={Trash2}
      onClose={()=>setDeleteConfirm(null)}
      onSubmit={async()=>{await remove(deleteConfirm.id);setDeleteConfirm(null);}}
    />}
  </Panel>;
}

function CalendarStat({label,value,tone='slate'}){
  const tones={
    slate:'text-slate-900 bg-white border-slate-200',
    red:'text-red-700 bg-red-50 border-red-100',
    emerald:'text-emerald-700 bg-emerald-50 border-emerald-100'
  };
  return <div className={`rounded-xl border px-3 py-2 ${tones[tone]||tones.slate}`}>
    <div className="text-[10px] font-black uppercase opacity-60">{label}</div>
    <div className="text-xl font-black leading-tight">{value}</div>
  </div>;
}

function AuditTab({user,toast}){
  const m=useMaster(user);const[rows,setRows]=useState([]);
  const[searchQuery,setSearchQuery]=useState('');
  useEffect(()=>{api.auditLog({cabang_id:m.cabangId,limit:150}).then(setRows).catch(e=>toast('err',e.message));},[m.cabangId]);
  const filteredRows = useMemo(() => {
    return rows.filter(a => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesActor = (a.actor_name || 'Sistem').toLowerCase().includes(q);
        const matchesAction = (a.action || '').toLowerCase().includes(q);
        const matchesType = (a.entity_type || '').toLowerCase().includes(q);
        const matchesReason = (a.reason || '').toLowerCase().includes(q);
        if (!matchesActor && !matchesAction && !matchesType && !matchesReason) return false;
      }
      return true;
    });
  }, [rows, searchQuery]);
  return <Panel title="Audit Log" right={null} className="overflow-visible md:overflow-hidden">
    <div className="space-y-4">
      {/* Unified Search & Filter Panel */}
      <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
        <div className="flex flex-row items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Cari log…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-8 w-full text-xs sm:text-sm font-bold"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Hapus pencarian audit"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {user.role === 'admin' && (
            <CustomSelect
              value={m.cabangId}
              onChange={e => m.setCabangId(e.target.value)}
              className="input w-32 sm:w-44 text-xs sm:text-sm shrink-0 font-bold"
            >
              <option value="">Semua Cabang</option>
              {m.cabang.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </CustomSelect>
          )}
        </div>
      </div>

      {/* Desktop view table */}
      <div className="hidden md:block">
        <Table headers={['Waktu','Actor','Action','Entity','Cabang','Alasan']}>
          {filteredRows.map(a=><tr key={a.id}><Td>{fmtTime(a.created_at)}</Td><Td>{a.actor_name||'Sistem'}</Td><Td>{a.action}</Td><Td>{a.entity_type} #{a.entity_id||'-'}</Td><Td>{a.cabang_nama||'-'}</Td><Td>{a.reason||'-'}</Td></tr>)}
        </Table>
      </div>

      {/* Mobile view card stack */}
      <div className="block md:hidden space-y-3">
        {filteredRows.map(a => (
          <div key={a.id} className="bg-white border border-slate-200/80 rounded-xl p-3 space-y-2.5 transition active:scale-[0.98]">
            <div className="flex justify-between items-start gap-2">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">{fmtTime(a.created_at)}</span>
                <div className="font-bold text-text-main text-sm mt-0.5">{a.actor_name || 'Sistem'}</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-black uppercase tracking-wide">{a.action}</span>
            </div>
            <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
              <div className="font-black text-slate-400 uppercase">Entitas</div>
              <div className="font-bold text-slate-700">{a.entity_type} #{a.entity_id || '-'}</div>
              <div className="font-black text-slate-400 uppercase">Cabang</div>
              <div className="font-bold text-slate-700">{a.cabang_nama || '-'}</div>
              <div className="font-black text-slate-400 uppercase">Alasan</div>
              <div className="font-bold text-slate-700 truncate" title={a.reason || ''}>{a.reason || '-'}</div>
            </div>
          </div>
        ))}
      </div>

      {filteredRows.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm font-bold">
          Tidak ada log audit yang ditemukan.
        </div>
      )}
    </div>
  </Panel>;
}

function Panel({title,right,children,className=''}){return <section className={`bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 max-w-full overflow-hidden ${className}`}><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4"><h2 className="text-lg font-black text-text-main">{title}</h2>{right}</div>{children}</section>;}
function Input({value,onChange,placeholder,className='',...props}){return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={`input w-full ${className}`} {...props}/>;}
function Textarea({label,value,onChange,placeholder}){return <div><div className="label">{label}</div><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3} className="input w-full min-h-20 resize-none"/></div>;}
function Table({headers,children}){return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{headers.map((h,i)=><th key={`${i}-${h||'empty'}`} className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>;}
function Td({children,className='',...props}){return <td className={`py-2 px-3 text-slate-700 whitespace-nowrap ${className}`} {...props}>{children}</td>;}
function Toggle({label,checked,onChange}){return <label className="flex items-center gap-3 cursor-pointer select-none"><button type="button" role="switch" aria-checked={checked} onClick={()=>onChange(!checked)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 ${checked?'bg-emerald-500':'bg-slate-300'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked?'translate-x-6':'translate-x-1'}`}/></button><span className="text-sm font-medium text-slate-700">{label}</span></label>;}
async function downloadQrCard({siswa,pickup}){
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
function FotoUpload({url,onUpload,onDelete,size='md'}){
  const box=size==='xl'?'w-32 h-32 sm:w-36 sm:h-36':'w-16 h-16';
  const icon=size==='xl'?'w-10 h-10':'w-6 h-6';
  return <div className="relative group flex-shrink-0">
    {url?<img src={url} className={`${box} rounded-2xl object-cover border-2 border-white`} alt="foto"/>:<div className={`${box} rounded-2xl bg-slate-200 border-2 border-white flex items-center justify-center text-slate-400`}><Users className={icon} strokeWidth={2.4}/></div>}
    <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" title="Ubah foto">
      <ImagePlus className="w-5 h-5 text-white" strokeWidth={2.4}/>
      <input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)onUpload(f);e.target.value='';}}/>
    </label>
    {url&&<IconButton icon={Trash2} label="Hapus foto" onClick={onDelete} size="sm" variant="danger" className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity"/>}
  </div>;
}
function money(v){return 'Rp '+Number(v||0).toLocaleString('id-ID');}
function fmtTime(v){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v));}catch{return v;}}

function BillingStatusBadge({status}){
  const s=(status||'').toLowerCase();
  const cfg={
    lunas:{bg:'bg-emerald-50 dark:bg-emerald-950/30',text:'text-emerald-700 dark:text-emerald-400',border:'border-emerald-200/80 dark:border-emerald-800',dot:'bg-emerald-500',label:'Lunas'},
    paid:{bg:'bg-emerald-50 dark:bg-emerald-950/30',text:'text-emerald-700 dark:text-emerald-400',border:'border-emerald-200/80 dark:border-emerald-800',dot:'bg-emerald-500',label:'Lunas'},
    confirmed:{bg:'bg-emerald-50 dark:bg-emerald-950/30',text:'text-emerald-700 dark:text-emerald-400',border:'border-emerald-200/80 dark:border-emerald-800',dot:'bg-emerald-500',label:'Terkonfirmasi'},
    open:{bg:'bg-amber-50 dark:bg-amber-950/30',text:'text-amber-700 dark:text-amber-400',border:'border-amber-200/80 dark:border-amber-800',dot:'bg-amber-500',label:'Belum Bayar'},
    unpaid:{bg:'bg-amber-50 dark:bg-amber-950/30',text:'text-amber-700 dark:text-amber-400',border:'border-amber-200/80 dark:border-amber-800',dot:'bg-amber-500',label:'Belum Bayar'},
    sebagian:{bg:'bg-blue-50 dark:bg-blue-950/30',text:'text-blue-700 dark:text-blue-400',border:'border-blue-200/80 dark:border-blue-800',dot:'bg-blue-500',label:'Sebagian'},
    partially_paid:{bg:'bg-blue-50 dark:bg-blue-950/30',text:'text-blue-700 dark:text-blue-400',border:'border-blue-200/80 dark:border-blue-800',dot:'bg-blue-500',label:'Sebagian'},
    pending_verification:{bg:'bg-violet-50 dark:bg-violet-950/30',text:'text-violet-700 dark:text-violet-400',border:'border-violet-200/80 dark:border-violet-800',dot:'bg-violet-500 animate-pulse',label:'Menunggu Verifikasi'},
    issued:{bg:'bg-sky-50 dark:bg-sky-950/30',text:'text-sky-700 dark:text-sky-400',border:'border-sky-200/80 dark:border-sky-800',dot:'bg-sky-500',label:'Terbit'},
    rejected:{bg:'bg-red-50 dark:bg-red-950/30',text:'text-red-700 dark:text-red-400',border:'border-red-200/80 dark:border-red-800',dot:'bg-red-500',label:'Ditolak'},
    void:{bg:'bg-slate-100 dark:bg-slate-800/50',text:'text-slate-500 dark:text-slate-400',border:'border-slate-200/80 dark:border-slate-700',dot:'bg-slate-400',label:'Void'},
  }[s]||{bg:'bg-slate-50',text:'text-slate-600',border:'border-slate-200',dot:'bg-slate-400',label:status};
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1.5 shrink-0`}/><span>{cfg.label}</span></span>;
}

function MethodBadge({metode}){
  const m=(metode||'').toLowerCase();
  const cfg={
    tunai:{icon:Banknote,bg:'bg-emerald-50 dark:bg-emerald-950/30',text:'text-emerald-700 dark:text-emerald-400',label:'Tunai'},
    transfer:{icon:CreditCard,bg:'bg-blue-50 dark:bg-blue-950/30',text:'text-blue-700 dark:text-blue-400',label:'Transfer'},
    qris:{icon:Smartphone,bg:'bg-violet-50 dark:bg-violet-950/30',text:'text-violet-700 dark:text-violet-400',label:'QRIS'},
    lainnya:{icon:Wallet,bg:'bg-slate-100 dark:bg-slate-800/50',text:'text-slate-600 dark:text-slate-400',label:'Lainnya'},
  }[m]||{icon:Wallet,bg:'bg-slate-50',text:'text-slate-600',label:metode};
  const Icon=cfg.icon;
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${cfg.bg} ${cfg.text}`}><Icon className="w-3.5 h-3.5"/>{cfg.label}</span>;
}

function MoneyCell({children,className=''}){return <td className={`py-2 px-3 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap ${className}`}>{children}</td>;}
