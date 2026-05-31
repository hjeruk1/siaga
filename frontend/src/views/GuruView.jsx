import{useEffect,useMemo,useState}from'react';
import{api}from'../api';
import{ConfirmActionModal,Modal,CustomSelect}from'../components/Shared';
import{ArrowLeft,BookOpen,Camera,CheckCircle2,ChevronDown,ClipboardCheck,Eye,MessageCircle,Send,Sparkles,X}from'lucide-react';

function generatePedagogicalNote(nama, activities, mood) {
  const sentences = [];
  if (activities && activities.length > 0) {
    sentences.push(`${nama} aktif mengikuti kegiatan ${activities.join(' dan ')} dengan baik.`);
  }
  if (mood) {
    const moodMap = {
      ceria: 'Anak tampak sangat ceria, bersemangat, dan antusias sepanjang hari.',
      biasa: 'Kondisi anak stabil dan mengikuti seluruh rutinitas kelas dengan tenang.',
      rewel: 'Anak memerlukan perhatian lebih karena tampak kurang nyaman atau rewel hari ini.'
    };
    if (moodMap[mood]) sentences.push(moodMap[mood]);
  }
  return sentences.length > 0 ? sentences.join(' ') : 'Silakan pilih aktivitas atau mood anak terlebih dahulu.';
}

const AKTIVITAS=['Mewarnai','Bernyanyi & Menari','Bermain Bebas','Membaca & Menulis',
  'Motorik Halus','Motorik Kasar','Ibadah / Doa','Seni & Kerajinan','Bercerita','Bermain Peran'];
const MOOD_OPT=[{v:'ceria',l:'😊 Ceria',c:'bg-emerald-500'},{v:'biasa',l:'😐 Biasa',c:'bg-primary'},{v:'rewel',l:'😢 Rewel',c:'bg-red-500'}];
const MAKAN_OPT=[{v:'habis',l:'🍽️ Habis',c:'bg-emerald-500'},{v:'setengah',l:'🍱 Setengah',c:'bg-primary'},{v:'tidak',l:'❌ Tidak Dimakan',c:'bg-red-500'}];
const TIDUR_OPT=[{v:1,l:'💤 Ya',c:'bg-blue-500'},{v:0,l:'🙅 Tidak',c:'bg-slate-500'}];

const OBSERVATION_DOMAINS=['Agama & Budi Pekerti','Jati Diri','Literasi','Numerasi','Sains & Teknologi','Motorik','Sosial Emosional','Seni'];
const sections = { opening: 'Pembuka', focus_theme: 'Inti', break: 'Istirahat', closing: 'Penutup' };

function noteOk(v){return String(v||'').trim().length>=12;}
function themeDomains(v){
  if(Array.isArray(v))return v;
  if(!v)return[];
  return String(v).split(',').map(x=>x.trim()).filter(Boolean);
}
function activityLinesFromText(v){
  return String(v||'')
    .split('\n')
    .map(line=>line.replace(/^[\s\-*\u2022]+/,'').trim())
    .filter(Boolean);
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
  if(pct===0)return<span className="text-[10px] xs:text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 whitespace-nowrap flex-shrink-0">Belum diisi</span>;
  if(pct<100)return<span className="text-[10px] xs:text-xs px-2 py-0.5 rounded-full bg-primary-container text-primary-active font-bold border border-primary/20 whitespace-nowrap flex-shrink-0">Sebagian {pct}%</span>;
  return<span className="text-[10px] xs:text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap flex-shrink-0">✓ Lengkap</span>;
}

export default function GuruView({user,toast,tab}){
  const tabs = ['daily', 'absensi'];
  const activeTab = tabs.includes(tab) ? tab : 'daily';
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
  const [showTutupHariConfirm, setShowTutupHariConfirm] = useState(false);
  const [ketModal, setKetModal] = useState(null);
  const [ketCatatan, setKetCatatan] = useState('');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [classThemeOpen, setClassThemeOpen] = useState(false);
  const [classThemeRombelId, setClassThemeRombelId] = useState('');
  const [classThemeForm, setClassThemeForm] = useState({
    rombel_id: '',
    modul_ajar_id: '',
    title: '',
    activity_summary: '',
    suggested_domains: '',
    menu_makanan: ''
  });
  const [classModules, setClassModules] = useState([]);

  const [exportScope, setExportScope] = useState('class');
  const [exportSiswaId, setExportSiswaId] = useState('');
  const [exportPeriod, setExportPeriod] = useState('current_month');
  const [exportStartDate, setExportStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 2).toISOString().slice(0, 10);
  });
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportBusy, setExportBusy] = useState(false);

  const getDatesForPeriod = (period) => {
    const now = new Date();
    let start = '', end = '';
    if (period === 'current_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
    } else if (period === 'prev_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (period === 'current_year') {
      const year = now.getFullYear();
      const startYear = now.getMonth() >= 6 ? year : year - 1;
      start = new Date(startYear, 6, 1); // July 1st
      end = now;
    } else {
      return { start: exportStartDate, end: exportEndDate };
    }
    return {
      start: new Intl.DateTimeFormat('sv-SE').format(start),
      end: new Intl.DateTimeFormat('sv-SE').format(end)
    };
  };

  async function handleExport(format) {
    if (exportBusy) return;
    const activeRombelId = list[0]?.rombel_id;
    if (!activeRombelId) {
      toast('err', 'Tidak ada rombel aktif untuk diekspor');
      return;
    }
    const { start, end } = getDatesForPeriod(exportPeriod);
    const params = {
      format,
      start_date: start,
      end_date: end
    };
    if (exportScope === 'siswa') {
      if (!exportSiswaId) {
        toast('err', 'Pilih siswa terlebih dahulu');
        return;
      }
      params.siswa_id = exportSiswaId;
    } else {
      params.rombel_id = activeRombelId;
    }
    setExportBusy(true);
    try {
      const blobData = await api.exportRekap(params);
      const url = window.URL.createObjectURL(blobData);
      const a = document.createElement('a');
      a.href = url;
      const filename = exportScope === 'siswa'
        ? `rekap_absensi_siswa_${exportSiswaId}_${start}_to_${end}.${format === 'excel' ? 'csv' : 'pdf'}`
        : `rekap_absensi_kelas_${activeRombelId}_${start}_to_${end}.${format === 'excel' ? 'csv' : 'pdf'}`;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast('ok', 'Ekspor berhasil diunduh');
    } catch (e) {
      toast('err', e.message || 'Gagal mengekspor data');
    } finally {
      setExportBusy(false);
    }
  }

  async function load(){const data=await api.dailyToday({tanggal});const rows=data.rows||data;setList(rows);setIsSchoolDay(data.is_school_day);}
  async function loadAbsensi(){const data=await api.absensiToday({tanggal});setAbsensi(data.rows||data);if(data.is_school_day!==undefined)setIsSchoolDay(data.is_school_day);}
  async function loadReminder(){try{const cfg=await api.operasionalConfig(user.cabang_id);if(cfg[0])setReminder({aktif:!!cfg[0].daily_record_wajib,jam:cfg[0].daily_record_due_time||'18:00'});}catch{}}
  async function loadTutupHari(){try{const s=await api.tutupHariStatus({cabang_id:user.cabang_id,tanggal});setDayClosed(s.closed);}catch{}}
  useEffect(()=>{load().catch(e=>toast('err',e.message));loadReminder();},[tanggal]);
  useEffect(()=>{if(activeTab==='absensi'){loadAbsensi().catch(e=>toast('err',e.message));loadTutupHari();}},[tanggal,activeTab]);
  async function open(row){
    setSelected(row);
    const seed={siswa_id:row.siswa_id,tanggal,mood:null,makan:null,tidur:null,aktivitas:[],catatan:'',observation_domain:row.observation_domain||'',observation_note:row.observation_note||'',parent_note:row.parent_note||'',focus_theme_id:row.focus_theme_id||null,focus_theme_title:row.focus_theme_title||'',focus_theme_activity_summary:row.focus_theme_activity_summary||'',focus_theme_domains:row.focus_theme_domains||[],attachments:[],comments:[],id:null};
    if(row.laporan_id){
      const d=await api.dailyDetail(row.laporan_id);
      setDetail({...seed,...d,focus_theme_id:d.focus_theme_id||row.focus_theme_id||null,focus_theme_title:d.focus_theme_title||row.focus_theme_title||'',focus_theme_activity_summary:d.focus_theme_activity_summary||row.focus_theme_activity_summary||'',focus_theme_domains:d.focus_theme_domains?.length?d.focus_theme_domains:(row.focus_theme_domains||[])});
    }else setDetail(seed);
  }
  async function checkin(siswaId){try{await api.checkin({siswa_id:siswaId,tanggal});toast('ok','Check-in berhasil');loadAbsensi();}catch(e){toast('err',e.message);}}
  function setKeterangan(siswaId,status){
    setKetModal({ siswaId, status });
    setKetCatatan('');
  }
  async function submitKeterangan(){
    if(!ketModal) return;
    const { siswaId, status } = ketModal;
    setKetModal(null);
    try{
      await api.setKeterangan({siswa_id:siswaId,tanggal,status,catatan:ketCatatan.trim()});
      toast('ok','Status: '+status);
      loadAbsensi();
    }catch(e){
      toast('err',e.message);
    }
  }
  async function pulangkan(ids){try{await api.pulangkan(ids);toast('ok',ids.length>1?`${ids.length} siswa dipulangkan`:'Siswa dipulangkan');setSelectedAbsensi([]);loadAbsensi();}catch(e){toast('err',e.message);}}
  function doTutupHari(){
    setShowTutupHariConfirm(true);
  }
  async function confirmTutupHari(){
    setShowTutupHariConfirm(false);
    setTutupHariLoading(true);
    try{
      const r=await api.tutupHari({cabang_id:user.cabang_id,tanggal});
      toast('ok',`Hari ditutup. ${r.remaining_count} siswa tersisa (${r.details?.filter(d=>d.status==='Belum').length||0} jadi Absen).`);
      setDayClosed(true);
      loadAbsensi();
    }catch(e){
      toast('err',e.message);
    }finally{
      setTutupHariLoading(false);
    }
  }
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
  const rombels = useMemo(() => {
    const map = {};
    list.forEach(r => {
      if (r.rombel_id) {
        map[r.rombel_id] = r.rombel_name;
      }
    });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [list]);

  useEffect(() => {
    if (classThemeOpen) {
      api.modulAjar({ cabang_id: user.cabang_id, tanggal }).then(setClassModules).catch(() => {});
    }
  }, [classThemeOpen, tanggal, user.cabang_id]);

  const selectedClassModule = useMemo(() => {
    return classModules.find(x => String(x.id) === String(classThemeForm.modul_ajar_id));
  }, [classModules, classThemeForm.modul_ajar_id]);

  const classTodayDayName = useMemo(() => getIndonesianDayName(tanggal), [tanggal]);

  const classSuggestedActivities = useMemo(() => {
    const norm = normalizeActivities(selectedClassModule?.suggested_activities);
    return norm[classTodayDayName] || { opening: [], focus_theme: [], break: [], closing: [] };
  }, [selectedClassModule, classTodayDayName]);

  const handleClassActivityCheckboxChange = (activityName, checked) => {
    const currentLines = classThemeForm.activity_summary
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);
    let updatedLines;
    const formatted = `- ${activityName}`;
    if (checked) {
      if (!currentLines.includes(formatted) && !currentLines.includes(activityName)) {
        updatedLines = [...currentLines, formatted];
      } else {
        updatedLines = currentLines;
      }
    } else {
      updatedLines = currentLines.filter(line => line !== formatted && line !== activityName);
    }
    setClassThemeForm(prev => ({ ...prev, activity_summary: updatedLines.join('\n') }));
  };

  useEffect(() => {
    if (!classThemeOpen || !classThemeRombelId) return;
    
    let alive = true;
    async function loadClassFocusTheme() {
      try {
        const [mods, theme] = await Promise.all([
          api.modulAjar({ cabang_id: user.cabang_id, tanggal }).catch(() => []),
          api.focusTheme({ rombel_id: classThemeRombelId, tanggal }).catch(() => null)
        ]);
        if (!alive) return;
        
        const source = theme;
        let defaultModulAjarId = source?.modul_ajar_id || '';
        let defaultTitle = source?.title || '';
        let defaultDomains = themeDomains(source?.suggested_domains).join(', ');
        
        if (!defaultModulAjarId && Array.isArray(mods)) {
          const sampleStudent = list.find(s => String(s.rombel_id) === String(classThemeRombelId));
          if (sampleStudent) {
            const matched = mods.find(m => {
              const paketOk = !m.paket || !sampleStudent.paket || String(m.paket) === String(sampleStudent.paket);
              const scopeOk =
                (!m.rombel_id && !m.jenjang_id) ||
                (m.rombel_id && String(m.rombel_id) === String(classThemeRombelId)) ||
                (!m.rombel_id && m.jenjang_id && String(m.jenjang_id) === String(sampleStudent.jenjang_id));
              return paketOk && scopeOk;
            });
            if (matched) {
              defaultModulAjarId = matched.id;
              if (!defaultTitle) defaultTitle = matched.title;
              if (!defaultDomains) defaultDomains = themeDomains(matched.suggested_domains).join(', ');
            }
          }
        }
        
        setClassThemeForm({
          rombel_id: classThemeRombelId,
          modul_ajar_id: defaultModulAjarId,
          title: defaultTitle,
          activity_summary: source?.activity_summary || '',
          suggested_domains: defaultDomains,
          menu_makanan: source?.menu_makanan || ''
        });
      } catch (e) {
        toast('err', e.message);
      }
    }
    
    loadClassFocusTheme();
    return () => { alive = false; };
  }, [classThemeOpen, classThemeRombelId, tanggal, user.cabang_id]);

  async function saveClassTheme() {
    const title = classThemeForm.title.trim();
    if (!title) {
      toast('err', 'Judul Focus Theme wajib diisi');
      return;
    }
    try {
      const payload = {
        cabang_id: user.cabang_id,
        rombel_id: classThemeRombelId,
        tanggal,
        modul_ajar_id: classThemeForm.modul_ajar_id || null,
        title,
        activity_summary: classThemeForm.activity_summary.trim(),
        suggested_domains: themeDomains(classThemeForm.suggested_domains),
        menu_makanan: classThemeForm.menu_makanan.trim()
      };
      await api.saveFocusTheme(payload);
      toast('ok', 'Focus Theme kelas berhasil disimpan');
      setClassThemeOpen(false);
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }

  const showReminder=reminder?.aktif&&isSchoolDay!==false&&tanggal===new Date().toISOString().slice(0,10)&&(()=>{const now=new Date();const[h,m]=reminder.jam.split(':').map(Number);const t=new Date();t.setHours(h,m,0,0);return now>=t&&done<list.length;})();
  return <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
    {activeTab==='daily'&&<div className="w-full space-y-4 lg:h-[calc(100vh-132px)] lg:min-h-0 lg:flex lg:flex-col">
      {showReminder&&<div className="bg-primary-container border-2 border-primary rounded-2xl px-4 py-3 flex items-center gap-3"><span className="text-2xl">⏰</span><div className="flex-1"><p className="font-black text-primary-active text-sm">Pengingat Laporan Harian</p><p className="text-primary-active opacity-90 text-xs">{list.length-done} siswa belum dilaporkan — selesaikan sebelum akhir hari.</p></div></div>}
      <section className="grid lg:grid-cols-[390px_minmax(0,1fr)] 2xl:grid-cols-[430px_minmax(0,1fr)] gap-4 lg:flex-1 lg:min-h-0">
        <aside className={`${selected?'hidden lg:flex':'flex'} w-full min-w-0 bg-white border border-slate-200 rounded-2xl p-4 flex-col min-h-0 h-full`}>
        <div className="flex flex-row items-center justify-between gap-3 mb-4">
          <div className="min-w-0"><h1 className="text-lg sm:text-xl font-black text-text-main truncate">Daily Record</h1><p className="text-xs sm:text-sm text-slate-500 truncate">{isSchoolDay===false&&<span className="text-red-500 font-black">Hari Libur</span>}{isSchoolDay===true&&<span className="text-emerald-500 font-black">Hari Masuk</span>}{isSchoolDay===null&&'Draft & feedback'}</p></div>
          <input type="date" value={tanggal} onChange={e=>{setTanggal(e.target.value);setSelected(null);setDetail(null);}} className="input w-[130px] sm:w-auto flex-shrink-0"/>
        </div>
        <div className="space-y-3 mb-4">
          <input value={dailySearch} onChange={e=>setDailySearch(e.target.value)} autoComplete="off" className="input w-full" placeholder="Cari siswa atau rombel"/>
          <div className="grid grid-cols-2 min-[350px]:grid-cols-4 gap-2">{[{id:'all',label:'Semua',count:dailyCounts.all},{id:'belum',label:'Belum',count:dailyCounts.belum},{id:'sebagian',label:'Sebagian',count:dailyCounts.sebagian},{id:'lengkap',label:'Lengkap',count:dailyCounts.lengkap}].map(f=><button key={f.id} onClick={()=>setDailyFilter(f.id)} className={`px-2 py-2 rounded-lg text-[10px] xs:text-xs font-medium transition-all duration-200 active:scale-95 ${dailyFilter===f.id?'bg-text-main text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><span className="block truncate">{f.label}</span><span className={`block text-xs sm:text-base leading-tight ${dailyFilter===f.id?'text-white':'text-text-main font-semibold'}`}>{f.count}</span></button>)}</div>
          <button
            onClick={() => {
              if (rombels.length > 0) {
                setClassThemeRombelId(rombels[0].id);
              }
              setClassThemeOpen(true);
            }}
            className="w-full h-10 rounded-xl bg-primary hover:bg-primary-hover text-white font-black text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
          >
            🎯 Atur Tema & Kegiatan Kelas
          </button>
        </div>
        <div className="space-y-2 overflow-y-auto pr-1 lg:flex-1 lg:min-h-0">
          {filteredDaily.map(r=>{const pct=completeness(r);const active=selected?.siswa_id===r.siswa_id;return(
             <div key={r.siswa_id} onClick={()=>open(r)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')open(r);}} className={`text-left border rounded-2xl p-3 cursor-pointer flex gap-3 items-center transition-all active:scale-[0.98] ${active?'bg-primary-container border-primary/40':'bg-white border-slate-200 hover:border-primary/30'}`}>
               {r.foto
                 ?<img src={r.foto} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" alt={r.nama}/>
                 :<div className="w-14 h-14 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 text-2xl flex-shrink-0">👤</div>}
               <div className="flex-1 min-w-0">
                 <div className="font-black text-text-main text-sm truncate">{r.nama}{r.is_late&&<span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-black align-middle">Terlambat</span>}</div>
                 <div className="text-xs text-slate-500 truncate">{r.rombel_nama} · {r.paket}</div>
                 <div className="flex items-center justify-between mt-1"><CompleteBadge pct={pct}/><button onClick={e=>{e.stopPropagation();setHistoryFor(r);}} className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors" title="Riwayat"><span className="text-xs">📖</span></button></div>
               </div>
             </div>
           )})}
          {filteredDaily.length===0&&<div className="text-center py-10 text-sm text-slate-400">Tidak ada siswa sesuai filter.</div>}
        </div>
        </aside>
        <div className={`${selected&&detail?'fixed inset-0 z-50 bg-white lg:static lg:z-auto lg:bg-transparent lg:p-0 lg:overflow-y-auto lg:h-full':'hidden lg:flex'} min-w-0 lg:min-h-0`}>
          {selected&&detail?<Editor row={selected} detail={detail} setDetail={setDetail} onClose={()=>{setSelected(null);setDetail(null);load();}} user={user} toast={toast}/>:
          <div className="hidden lg:grid w-full place-items-center bg-white border border-slate-200 rounded-2xl text-center p-10 text-slate-400"><div><div className="text-lg font-black text-slate-500">Pilih siswa</div><div className="text-sm mt-1">Editor laporan harian akan muncul di sini.</div></div></div>}
        </div>
      </section>
    </div>}
    {activeTab==='absensi'&&<section className="space-y-4 w-full max-w-full">
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 min-w-0 w-full max-w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div><h1 className="text-xl font-black text-text-main">Absensi Kelas</h1><p className="text-sm text-slate-500">Check-in pagi, keterangan, NFC, dan pulang setelah gerbang validasi penjemput. {isSchoolDay===false&&<span className="font-black text-red-500">Hari Libur</span>}{isSchoolDay===true&&<span className="font-black text-emerald-600">Hari Masuk</span>}</p></div>
          <div className="flex flex-wrap gap-2"><input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} className="input"/><button onClick={loadAbsensi} className="btn-secondary">Refresh</button></div>
        </div>
        <div className="grid grid-cols-2 min-[350px]:grid-cols-4 lg:grid-cols-8 gap-2 mt-4">
          {absenStats.map(x => (
            <button 
              key={x.s} 
              onClick={() => setAbsenStatus(x.s)} 
              className={`text-left rounded-lg border p-2 sm:p-3 transition-all duration-200 active:scale-95 ${absenStatus === x.s ? 'border-primary bg-primary-container' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
            >
              <div className="text-[9px] xs:text-[10px] sm:text-xs font-black text-slate-500 truncate">{x.s}</div>
              <div className="text-base xs:text-lg sm:text-2xl font-black text-text-main leading-tight">{x.n}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] gap-4 w-full max-w-full">
        <div className="flex flex-col gap-2 xl:gap-0">
          <button 
            onClick={() => setSidebarExpanded(!sidebarExpanded)} 
            className="xl:hidden flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-black text-text-main text-sm active:scale-[0.99] transition-all duration-200"
          >
            <div className="flex items-center gap-2">
              <span>📟</span>
              <span>NFC & Kontrol Absensi</span>
              <span className="text-[10px] bg-primary-container text-primary-active px-2 py-0.5 rounded-md uppercase font-bold">{absenMode}</span>
            </div>
            <span className={`text-slate-400 transition-transform duration-200 ${sidebarExpanded ? 'rotate-180' : ''}`}>▼</span>
          </button>
          <aside className={`${sidebarExpanded ? 'block' : 'hidden'} xl:block bg-white border border-slate-200 rounded-2xl p-4 space-y-4`}>
            <div><div className="label">Mode NFC</div><div className="grid grid-cols-2 gap-2">{[{id:'masuk',label:'Masuk'},{id:'pulang',label:'Pulang'}].map(m=><button key={m.id} onClick={()=>setAbsenMode(m.id)} className={`py-2 rounded-lg text-sm font-medium border transition-all duration-200 active:scale-95 ${absenMode===m.id?'bg-text-main text-white border-text-main':'bg-white text-slate-600 border-slate-200 hover:border-primary/40'}`}>{m.label}</button>)}</div></div>
            <form onSubmit={e=>{e.preventDefault();processNfc(nfcToken);}} className="space-y-2">
              <label className="label">Tap / input token NFC</label>
              <input value={nfcToken} onChange={e=>setNfcToken(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} className="input w-full font-mono" placeholder="SIAGA-STU-XXXXXXXXXX" disabled={nfcBusy}/>
              <div className="grid grid-cols-2 gap-2"><button className="btn" disabled={nfcBusy}>{nfcBusy?'Proses…':'Proses'}</button><button type="button" onClick={startWebNfc} className="btn-secondary">Web NFC</button></div>
            </form>
            {nfcMsg&&<div className={`rounded-lg p-3 text-sm font-bold ${nfcMsg.type==='ok'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-red-50 text-red-700 border border-red-200'}`}>{nfcMsg.text}</div>}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <div className="label">Bulk pulang</div>
              <p className="text-xs text-slate-500">Pilih siswa berstatus Menunggu, lalu konfirmasi pulang.</p>
              <button onClick={()=>pulangkan(selectedAbsensi)} disabled={!selectedAbsensi.length} className="btn w-full">Pulangkan ({selectedAbsensi.length})</button>
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <div className="label">Tutup Hari</div>
              <p className="text-xs text-slate-500">{dayClosed?'Hari sudah ditutup. Tidak ada perubahan absensi yang bisa dilakukan.':'Kunci absensi hari ini. Siswa Belum → Absen.'}</p>
              <button onClick={doTutupHari} disabled={dayClosed||tutupHariLoading} className={`w-full py-2 rounded-lg text-sm font-medium border transition-all duration-200 active:scale-[0.98] ${dayClosed?'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed':'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}>{dayClosed?'✓ Hari Ditutup':tutupHariLoading?'Menutup…':'Tutup Hari'}</button>
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="label flex items-center gap-1.5">
                <span>📊</span>
                <span>Ekspor Rekap Absensi</span>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Cakupan</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button 
                    type="button"
                    onClick={() => { setExportScope('class'); setExportSiswaId(''); }} 
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 active:scale-95 ${exportScope === 'class' ? 'bg-primary text-white border-transparent' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    Satu Kelas
                  </button>
                  <button 
                    type="button"
                    onClick={() => setExportScope('siswa')} 
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 active:scale-95 ${exportScope === 'siswa' ? 'bg-primary text-white border-transparent' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    Perorangan
                  </button>
                </div>
              </div>

              {exportScope === 'siswa' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Pilih Siswa</label>
                  <CustomSelect 
                    value={exportSiswaId} 
                    onChange={e => setExportSiswaId(e.target.value)}
                    className="input w-full text-xs"
                  >
                    <option value="">Pilih siswa…</option>
                    {absensi.map(a => <option key={a.siswa_id} value={a.siswa_id}>{a.nama}</option>)}
                  </CustomSelect>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Periode</label>
                <CustomSelect 
                  value={exportPeriod} 
                  onChange={e => setExportPeriod(e.target.value)}
                  className="input w-full text-xs"
                >
                  <option value="current_month">Bulan Ini</option>
                  <option value="prev_month">Bulan Lalu</option>
                  <option value="current_year">Tahun Ajaran Ini</option>
                  <option value="custom">Kustom (Rentang Tanggal)</option>
                </CustomSelect>
              </div>

              {exportPeriod === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Mulai</label>
                    <input 
                      type="date" 
                      value={exportStartDate} 
                      onChange={e => setExportStartDate(e.target.value)} 
                      className="input w-full text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Selesai</label>
                    <input 
                      type="date" 
                      value={exportEndDate} 
                      onChange={e => setExportEndDate(e.target.value)} 
                      className="input w-full text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button 
                  type="button" 
                  disabled={exportBusy} 
                  onClick={() => handleExport('pdf')} 
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
                >
                  Unduh PDF
                </button>
                <button 
                  type="button" 
                  disabled={exportBusy} 
                  onClick={() => handleExport('excel')} 
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
                >
                  Unduh Excel
                </button>
              </div>
            </div>
          </aside>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 min-w-0 w-full max-w-full">
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between mb-4">
            <div className="flex flex-col xs:flex-row flex-1 gap-2"><input value={absenSearch} onChange={e=>setAbsenSearch(e.target.value)} autoComplete="off" className="input flex-1" placeholder="Cari siswa atau rombel"/><CustomSelect value={absenStatus} onChange={e=>setAbsenStatus(e.target.value)} className="input w-full xs:w-40"><option value="all">Semua</option>{absenStats.map(x=><option key={x.s} value={x.s}>{x.s}</option>)}</CustomSelect></div>
            <div className="grid grid-cols-2 gap-2"><button onClick={()=>setAbsenView('card')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${absenView==='card'?'bg-text-main text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Kartu</button><button onClick={()=>setAbsenView('list')} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${absenView==='list'?'bg-text-main text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>List</button></div>
          </div>
          {absenView==='card'?<div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">{filteredAbsensi.map(a=><AbsensiCard key={a.siswa_id} row={a} selected={selectedAbsensi.includes(a.siswa_id)} onSelect={()=>toggleAbsensi(a.siswa_id)} onCheckin={()=>checkin(a.siswa_id)} onKet={setKeterangan} onPulang={()=>pulangkan([a.siswa_id])}/>)}</div>:
          <>
            {/* Mobile/Tablet List View (< lg) */}
            <div className="lg:hidden space-y-3">
              {filteredAbsensi.map(a => (
                <div key={a.siswa_id} className={`flex flex-col p-3 rounded-2xl border transition-all duration-200 ${selectedAbsensi.includes(a.siswa_id) ? 'border-primary bg-primary-container' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <input 
                        type="checkbox" 
                        checked={selectedAbsensi.includes(a.siswa_id)} 
                        onChange={() => toggleAbsensi(a.siswa_id)} 
                        disabled={a.status!=='Menunggu'}
                        className="w-4 h-4 rounded accent-primary flex-shrink-0 disabled:opacity-30"
                      />
                      <div className="min-w-0">
                        <h4 className="font-black text-text-main text-sm truncate">{a.nama}</h4>
                        <p className="text-[10px] text-slate-500 truncate">{a.rombel_nama}</p>
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] xs:text-xs text-slate-500 bg-slate-50/70 rounded-xl px-2 py-1.5 my-2">
                    <div>
                      <div className="text-[8px] xs:text-[9px] font-semibold text-slate-400 uppercase">Masuk</div>
                      <div className="font-bold text-slate-700">{a.jam_masuk || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[8px] xs:text-[9px] font-semibold text-slate-400 uppercase">Tunggu</div>
                      <div className="font-bold text-slate-700">{a.jam_tunggu || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[8px] xs:text-[9px] font-semibold text-slate-400 uppercase">Pulang</div>
                      <div className="font-bold text-slate-700">{a.jam_pulang || '-'}</div>
                    </div>
                  </div>
                  
                  <div className="w-full">
                    <AbsensiActions row={a} onCheckin={() => checkin(a.siswa_id)} onKet={setKeterangan} onPulang={() => pulangkan([a.siswa_id])} compact={true} />
                  </div>
                </div>
              ))}
              {filteredAbsensi.length===0&&<div className="text-center py-10 text-sm text-slate-400">Tidak ada siswa sesuai filter.</div>}
            </div>

            {/* Desktop List View (>= lg) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>{['','Siswa','Rombel','Status','Masuk','Tunggu','Pulang','Aksi'].map(h=><th key={h} className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAbsensi.map(a=>(
                    <tr key={a.siswa_id}>
                      <td className="py-2 px-3"><input type="checkbox" checked={selectedAbsensi.includes(a.siswa_id)} onChange={()=>toggleAbsensi(a.siswa_id)} disabled={a.status!=='Menunggu'}/></td>
                      <td className="py-2 px-3 font-black text-text-main">{a.nama}</td>
                      <td className="py-2 px-3 text-slate-600">{a.rombel_nama}</td>
                      <td className="py-2 px-3"><StatusBadge status={a.status}/></td>
                      <td className="py-2 px-3">{a.jam_masuk||'-'}</td>
                      <td className="py-2 px-3">{a.jam_tunggu||'-'}</td>
                      <td className="py-2 px-3">{a.jam_pulang||'-'}</td>
                      <td className="py-2 px-3"><AbsensiActions row={a} onCheckin={()=>checkin(a.siswa_id)} onKet={setKeterangan} onPulang={()=>pulangkan([a.siswa_id])}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredAbsensi.length===0&&<div className="text-center py-10 text-sm text-slate-400">Tidak ada siswa sesuai filter.</div>}
            </div>
          </>
          }
        </div>
      </div>
    </section>}
    {historyFor&&<HistoryModal siswa={historyFor} onClose={()=>setHistoryFor(null)}/>}
    {showTutupHariConfirm && (
      <ConfirmActionModal
        title="Tutup Hari Absensi"
        entityName={`Absensi Tanggal ${tanggal}`}
        affectedBranch={user.cabang_nama}
        consequence="Siswa dengan status Belum akan otomatis menjadi Absen. Tindakan ini tidak bisa dibatalkan."
        actionLabel="Tutup Hari"
        actionVariant="danger"
        onClose={() => setShowTutupHariConfirm(false)}
        onSubmit={confirmTutupHari}
      />
    )}
    {ketModal && (
      <Modal title={`Keterangan ${ketModal.status}`} onClose={() => setKetModal(null)}>
        <div className="space-y-4">
          <div>
            <label className="label">Catatan (opsional)</label>
            <textarea
              value={ketCatatan}
              onChange={e => setKetCatatan(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Tulis alasan izin/sakit/absen…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setKetModal(null)} className="btn-secondary">Batal</button>
            <button onClick={submitKeterangan} className="btn">Simpan</button>
          </div>
        </div>
      </Modal>
    )}
    {classThemeOpen && (
      <Modal title="Atur Tema & Kegiatan Kelas" onClose={() => setClassThemeOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="label">Pilih Rombel / Kelas</label>
            <CustomSelect value={classThemeRombelId} onChange={e => setClassThemeRombelId(e.target.value)} className="input w-full">
              <option value="">Pilih rombel</option>
              {rombels.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </CustomSelect>
          </div>
          
          {classThemeRombelId ? (
            <>
              <div>
                <label className="label">Kegiatan Mingguan</label>
                <CustomSelect
                  value={classThemeForm.modul_ajar_id || ''}
                  onChange={e => {
                    const id = e.target.value;
                    const m = classModules.find(x => String(x.id) === String(id));
                    const domains = themeDomains(m?.suggested_domains).join(', ');
                    
                    // Auto-fill all activities of the selected week day by default
                    const norm = normalizeActivities(m?.suggested_activities);
                    const dayActs = norm[classTodayDayName] || { opening: [], focus_theme: [], break: [], closing: [] };
                    const allActs = [...dayActs.opening, ...dayActs.focus_theme, ...dayActs.break, ...dayActs.closing];
                    const activitySummary = allActs.map(a => `- ${a}`).join('\n');
                    
                    setClassThemeForm(f => ({
                      ...f,
                      modul_ajar_id: id,
                      title: m?.title || f.title || '',
                      suggested_domains: domains || f.suggested_domains,
                      activity_summary: activitySummary
                    }));
                  }}
                  className="input w-full"
                >
                  <option value="">Tanpa modul</option>
                  {classModules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </CustomSelect>
              </div>

              <div>
                <label className="label">Judul Tema Hari Ini</label>
                <input
                  value={classThemeForm.title}
                  onChange={e => setClassThemeForm(f => ({ ...f, title: e.target.value }))}
                  autoComplete="off"
                  className="input w-full"
                  placeholder="Contoh: Membuat konten baik"
                />
              </div>

              <div>
                <label className="label">Menu Makanan Hari Ini</label>
                <input
                  value={classThemeForm.menu_makanan}
                  onChange={e => setClassThemeForm(f => ({ ...f, menu_makanan: e.target.value }))}
                  autoComplete="off"
                  className="input w-full"
                  placeholder="Contoh: Nasi kuning + ayam goreng"
                />
              </div>

              {classThemeForm.modul_ajar_id && (
                <div className="space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="text-xs font-black text-slate-500 uppercase tracking-wider font-bold">Pilih Rangkaian Kegiatan ({classTodayDayName})</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(sections).map(([sectionKey, sectionLabel]) => {
                      const list = classSuggestedActivities[sectionKey] || [];
                      if (list.length === 0) return null;
                      return (
                        <div key={sectionKey} className="bg-white rounded-lg p-2.5 border border-slate-100">
                          <div className="mb-2 text-[10px] font-black uppercase text-slate-400 font-bold">{sectionLabel}</div>
                          <div className="space-y-1">
                            {list.map((act, idx) => {
                              const isSelected = activityLinesFromText(classThemeForm.activity_summary).includes(act);
                              return (
                                <label key={idx} className="flex items-start gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={e => handleClassActivityCheckboxChange(act, e.target.checked)}
                                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/45"
                                  />
                                  <span className="leading-snug">{act}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="label">Ringkasan Aktivitas</label>
                <textarea
                  value={classThemeForm.activity_summary}
                  onChange={e => setClassThemeForm(f => ({ ...f, activity_summary: e.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Daftar kegiatan harian (satu per baris)..."
                />
              </div>

              <div>
                <label className="label">Domain Observasi yang Disarankan</label>
                <input
                  value={classThemeForm.suggested_domains}
                  onChange={e => setClassThemeForm(f => ({ ...f, suggested_domains: e.target.value }))}
                  autoComplete="off"
                  className="input w-full"
                  placeholder="Literasi, Numerasi, dll"
                />
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-slate-400 text-xs italic">
              Pilih rombel terlebih dahulu untuk melihat tema.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onClick={() => setClassThemeOpen(false)} className="btn-secondary">Batal</button>
            <button onClick={saveClassTheme} disabled={!classThemeRombelId} className="btn">Simpan & Terapkan ke Kelas</button>
          </div>
        </div>
      </Modal>
    )}
  </div>;
}

function StatusBadge({status}){
  const cls=status==='Hadir'?'bg-emerald-100 text-emerald-700 border-emerald-200':status==='Terlambat'?'bg-orange-100 text-orange-700 border-orange-200':status==='Menunggu'?'bg-primary-container text-primary-active border-primary/20':status==='Pulang'?'bg-slate-100 text-slate-600 border-slate-200':['Izin','Sakit','Absen'].includes(status)?'bg-blue-100 text-blue-700 border-blue-200':'bg-slate-50 text-slate-400 border-slate-200';
  return <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-black ${cls}`}>{status||'Belum'}</span>;
}

function AbsensiActions({row,onCheckin,onKet,onPulang,compact}){
  const canEnter=['Belum','Absen'].includes(row.status);
  const canKet=['Belum','Absen','Izin','Sakit'].includes(row.status);
  
  if (compact) {
    if (!canEnter && !canKet && row.status !== 'Menunggu') {
      return <div className="text-[10px] font-bold text-slate-400 text-center py-2 bg-slate-50 rounded-lg border border-slate-100">Tidak ada aksi</div>;
    }
    return (
      <div className="flex flex-col gap-2 w-full pt-2 border-t border-slate-100">
        {canEnter&&<button onClick={onCheckin} className="w-full py-2 rounded-lg bg-primary text-white text-[11px] font-medium text-center transition-all duration-200 active:scale-95">Check-in</button>}
        {canKet&&<div className="flex gap-1.5 xs:gap-2 w-full">
          <button onClick={()=>onKet(row.siswa_id,'Izin')} className="flex-1 min-w-0 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-[10px] xs:text-[11px] font-medium text-center transition-all duration-200 active:scale-95 truncate">Izin</button>
          <button onClick={()=>onKet(row.siswa_id,'Sakit')} className="flex-1 min-w-0 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 text-[10px] xs:text-[11px] font-medium text-center transition-all duration-200 active:scale-95 truncate">Sakit</button>
          <button onClick={()=>onKet(row.siswa_id,'Absen')} className="flex-1 min-w-0 py-2 rounded-lg bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 text-[10px] xs:text-[11px] font-medium text-center transition-all duration-200 active:scale-95 truncate">Absen</button>
        </div>}
        {row.status==='Menunggu'&&<button onClick={onPulang} className="w-full py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-medium text-center transition-all duration-200 active:scale-95">Pulang</button>}
      </div>
    );
  }
  
  return <div className="flex flex-wrap gap-2">
    {canEnter&&<button onClick={onCheckin} className="link">Check-in</button>}
    {canKet&&<><button onClick={()=>onKet(row.siswa_id,'Izin')} className="link">Izin</button><button onClick={()=>onKet(row.siswa_id,'Sakit')} className="link">Sakit</button><button onClick={()=>onKet(row.siswa_id,'Absen')} className="link text-red-600">Absen</button></>}
    {row.status==='Menunggu'&&<button onClick={onPulang} className="link text-emerald-700">Pulang</button>}
  </div>;
}

function AbsensiCard({row,selected,onSelect,onCheckin,onKet,onPulang}){
  return <article className={`rounded-2xl border overflow-hidden transition-all duration-200 ${selected?'border-primary bg-primary-container':'border-slate-200 bg-white hover:border-primary/40'}`}>
    <div className="relative">
      {row.foto
        ?<img src={row.foto} className="w-full aspect-[4/3] object-cover" alt={row.nama}/>
        :<div className="w-full aspect-[4/3] bg-slate-200 flex items-center justify-center text-slate-400 text-5xl">👤</div>}
      <div className="absolute top-2 left-2"><StatusBadge status={row.status}/></div>
      {row.status==='Menunggu'&&<input type="checkbox" checked={selected} onChange={onSelect} className="absolute top-2 right-2 w-5 h-5 accent-primary"/>}
    </div>
    <div className="p-3 space-y-2">
      <h3 className="font-black text-text-main text-sm leading-tight truncate">{row.nama}</h3>
      <p className="text-xs text-slate-500 truncate">{row.rombel_nama} · {row.paket}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg py-2">
          <div className="text-[8px] xs:text-[10px] font-black text-slate-400">Masuk</div>
          <div className="font-black text-slate-700 text-[10px] xs:text-xs">{row.jam_masuk||'-'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <div className="text-[8px] xs:text-[10px] font-black text-slate-400">Tunggu</div>
          <div className="font-black text-slate-700 text-[10px] xs:text-xs">{row.jam_tunggu||'-'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <div className="text-[8px] xs:text-[10px] font-black text-slate-400">Pulang</div>
          <div className="font-black text-slate-700 text-[10px] xs:text-xs">{row.jam_pulang||'-'}</div>
        </div>
      </div>
      {row.penjemput_nama&&<div className="text-[10px] sm:text-[11px] text-slate-500 bg-primary-container border border-primary/20 rounded-lg px-3 py-2 truncate">🚗 <span className="font-black text-slate-700">{row.penjemput_nama}</span></div>}
      <div className="block sm:hidden w-full">
        <AbsensiActions row={row} onCheckin={onCheckin} onKet={onKet} onPulang={onPulang} compact={true}/>
      </div>
      <div className="hidden sm:block">
        <AbsensiActions row={row} onCheckin={onCheckin} onKet={onKet} onPulang={onPulang}/>
      </div>
    </div>
  </article>;
}

function HistoryModal({siswa,onClose}){
  const[rows,setRows]=useState([]);const[loading,setLoading]=useState(true);
  const MOOD={ceria:'😊',biasa:'😐',rewel:'😢'};const MAKAN={habis:'Habis',setengah:'Setengah',tidak:'Tidak'};
  useEffect(()=>{api.dailyHistory(siswa.siswa_id,60).then(d=>{setRows(d);setLoading(false);});},[siswa.siswa_id]);
  return<div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
    <div className="bg-white rounded-t-3xl w-full max-h-[80vh] flex flex-col" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"><div><div className="font-black text-text-main">Riwayat Laporan</div><div className="text-xs text-slate-400">{siswa.nama} · {siswa.rombel_nama}</div></div><button onClick={onClose} className="text-slate-400 text-xl">✕</button></div>
      <div className="overflow-y-auto flex-1 p-4">
        {loading?<div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary-container border-t-primary rounded-full animate-spin"/></div>:
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

const normalizeActivities = (v) => {
  const result = {};
  const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  
  let parsed = {};
  if (v && typeof v === 'object') {
    parsed = v;
  } else if (v && typeof v === 'string') {
    try {
      parsed = JSON.parse(v || '{}');
    } catch {}
  }

  DAYS.forEach(day => {
    const dayData = parsed[day] || {};
    result[day] = {
      opening: Array.isArray(dayData.opening) ? dayData.opening.filter(Boolean) : [],
      focus_theme: Array.isArray(dayData.focus_theme) ? dayData.focus_theme.filter(Boolean) : [],
      break: Array.isArray(dayData.break) ? dayData.break.filter(Boolean) : [],
      closing: Array.isArray(dayData.closing) ? dayData.closing.filter(Boolean) : []
    };
  });

  return result;
};

const getIndonesianDayName = (dateStr) => {
  if (!dateStr) return 'Senin';
  const parts = dateStr.split('-');
  if (parts.length < 3) return 'Senin';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const map = {
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu',
    0: 'Minggu'
  };
  return map[day] || 'Senin';
};

function Editor({row,detail,setDetail,onClose,user,toast}){
  const[comment,setComment]=useState('');const[busy,setBusy]=useState(false);const[preview,setPreview]=useState(false);
  const[edits,setEdits]=useState(null);
  const[mobileChecklistOpen,setMobileChecklistOpen]=useState(false);
  const activities=useMemo(()=>Array.isArray(detail.aktivitas)?detail.aktivitas:[],[detail.aktivitas]);
  const tanggal=detail.tanggal||row.tanggal;
  const cabangId=user?.cabang_id||row.cabang_id;
  const todayDayName = useMemo(() => getIndonesianDayName(tanggal), [tanggal]);

  const activeActivities = useMemo(() => {
    return activityLinesFromText(detail.focus_theme_activity_summary);
  }, [detail.focus_theme_activity_summary]);

  const PILLAR_KEYS = [
    { k: 'iqra', l: 'Tilawati' },
    { k: 'akhlak', l: 'Akhlak' },
    { k: 'aktif_mandiri', l: 'Aktif & Mandiri' },
    { k: 'disiplin_tertib', l: 'Disiplin & Tertib' }
  ];

  useEffect(()=>{if(detail.id)api.dailyEdits(detail.id).then(setEdits).catch(()=>setEdits([]));else setEdits(null);},[detail.id]);

  useEffect(()=>{
    let alive=true;
    async function loadFocusTheme(){
      try{
        const theme = await (row.rombel_id?api.focusTheme({rombel_id:row.rombel_id,tanggal}).catch(()=>null):Promise.resolve(null));
        if(!alive)return;
        
        let detailUpdate = {};
        if(theme?.id) {
          detailUpdate = {
            focus_theme_id:theme.id,
            focus_theme_title:theme.title,
            focus_theme_activity_summary:theme.activity_summary||'',
            focus_theme_domains:theme.suggested_domains||[],
            focus_theme_menu_makanan:theme.menu_makanan||''
          };
        }
        
        // Auto-precheck: if row.laporan_id is null or detail.aktivitas is empty,
        // pre-fill and save the activities from the Focus Theme
        const currentActivities = Array.isArray(detail.aktivitas) ? detail.aktivitas : [];
        const themeActivities = activityLinesFromText(theme?.activity_summary || detail.focus_theme_activity_summary);
        
        if (!row.laporan_id && currentActivities.length === 0 && themeActivities.length > 0) {
          // Build structured observation defaulting to BSH
          const obs = { ...(detail.structured_observation || {}) };
          const actObs = { ...(obs.activities || {}) };
          themeActivities.forEach(act => {
            if (!actObs[act]) actObs[act] = 'BSH';
          });
          
          const updatedDetail = {
            ...detail,
            ...detailUpdate,
            aktivitas: themeActivities,
            structured_observation: { ...obs, activities: actObs }
          };
          
          setDetail(updatedDetail);
          
          // Save to backend immediately so they are persisted as draft
          const payload = {
            ...updatedDetail,
            siswa_id: row.siswa_id,
            tanggal,
            focus_theme_id: updatedDetail.focus_theme_id || null
          };
          
          api.saveDaily(payload).then(saved => {
            if (saved?.id) {
              api.dailyDetail(saved.id).then(freshD => {
                if (alive) {
                  setDetail(prev => ({ ...prev, ...freshD }));
                }
              }).catch(() => {});
            }
          }).catch(() => {});
        } else if (theme?.id) {
          setDetail(d => ({ ...d, ...detailUpdate }));
        }
      }catch(e){toast('err',e.message);}
    }
    loadFocusTheme();
    return()=>{alive=false;};
  },[row.rombel_id,row.jenjang_id,row.paket,tanggal,cabangId]);

  function update(k,v){setDetail(d=>({...d,[k]:v}));}

  function buildDailyPayload(extra={}){
    return {...detail,siswa_id:row.siswa_id,tanggal,focus_theme_id:detail.focus_theme_id||row.focus_theme_id||null,structured_observation:detail.structured_observation||{},...extra};
  }

  async function tap(field,value){setBusy(true);try{const payload=buildDailyPayload({[field]:value});const r=await api.saveDaily(payload);if(!detail.id&&r.id){const d=await api.dailyDetail(r.id).catch(()=>null);if(d)setDetail(prev=>({...prev,...d,focus_theme_id:d.focus_theme_id||prev.focus_theme_id,focus_theme_title:d.focus_theme_title||prev.focus_theme_title,focus_theme_domains:d.focus_theme_domains?.length?d.focus_theme_domains:prev.focus_theme_domains,focus_theme_menu_makanan:d.focus_theme_menu_makanan||prev.focus_theme_menu_makanan}));}else{setDetail(prev=>({...prev,[field]:value}));}if(detail.id)api.dailyEdits(detail.id).then(setEdits).catch(()=>{});}catch(e){toast('err',e.message);}finally{setBusy(false);}}

  async function tapActivityCheckbox(act, checked) {
    setBusy(true);
    try {
      const currentActs = Array.isArray(detail.aktivitas) ? detail.aktivitas : [];
      let updatedActs;
      const obs = { ...(detail.structured_observation || {}) };
      const actObs = { ...(obs.activities || {}) };
      
      if (checked) {
        updatedActs = currentActs.includes(act) ? currentActs : [...currentActs, act];
        if (!actObs[act]) {
          actObs[act] = 'BSH'; // Default to BSH
        }
      } else {
        updatedActs = currentActs.filter(x => x !== act);
        delete actObs[act];
      }
      
      const updatedObs = { ...obs, activities: actObs };
      const payload = buildDailyPayload({ aktivitas: updatedActs, structured_observation: updatedObs });
      const r = await api.saveDaily(payload);
      
      setDetail(prev => ({ ...prev, aktivitas: updatedActs, structured_observation: updatedObs }));
      if (!detail.id && r.id) {
        const d = await api.dailyDetail(r.id).catch(() => null);
        if (d) setDetail(prev => ({ ...prev, ...d }));
      }
    } catch (e) {
      toast('err', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function tapRating(type, key, opt) {
    setBusy(true);
    try {
      const obs = { ...(detail.structured_observation || {}) };
      const section = { ...(obs[type] || {}) };
      if (opt === null) {
        delete section[key];
      } else {
        section[key] = opt;
      }
      const updatedObs = { ...obs, [type]: section };
      const payload = buildDailyPayload({ structured_observation: updatedObs });
      const r = await api.saveDaily(payload);
      
      setDetail(prev => ({ ...prev, structured_observation: updatedObs }));
      if (!detail.id && r.id) {
        const d = await api.dailyDetail(r.id).catch(() => null);
        if (d) setDetail(prev => ({ ...prev, ...d }));
      }
    } catch (e) {
      toast('err', e.message);
    } finally {
      setBusy(false);
    }
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
  if(preview) {
    const tidurText = detail.tidur === 1 ? 'Ya' : detail.tidur === 0 ? 'Tidak' : '-';
    return <section className="bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-2xl p-0 sm:p-4 flex flex-col min-h-screen sm:min-h-0">
      <div className="sticky top-0 bg-white border-b border-slate-200 sm:border-0 px-4 py-3 sm:px-0 sm:py-0 flex justify-between items-center gap-3 mb-4 z-20">
        <h2 className="text-sm sm:text-lg font-black text-text-main truncate">Preview Tampilan Wali</h2>
        <div className="flex gap-2">
          <button onClick={()=>setPreview(false)} className="btn-secondary h-9 rounded-lg font-medium px-4 text-xs">Kembali Edit</button>
          <button onClick={onClose} className="link text-xs">Tutup</button>
        </div>
      </div>
      <div className="p-4 sm:p-0 flex-1 overflow-y-auto">
        <div className="bg-slate-50 rounded-2xl p-4 sm:p-6 border border-slate-200 max-w-lg mx-auto space-y-4">
          <div><div className="font-black text-text-main text-lg">{row.nama}</div><div className="text-sm text-slate-500">{detail.tanggal||row.tanggal}</div></div>
          {detail.focus_theme_title&&<div><div className="text-xs text-slate-500 mb-1">Focus Theme</div><div className="bg-white rounded-xl p-3 text-sm text-slate-700"><div className="font-black text-text-main">{detail.focus_theme_title}</div>{detail.focus_theme_activity_summary&&<div className="mt-1 text-slate-600">{detail.focus_theme_activity_summary}</div>}</div></div>}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 text-center"><div className="text-xs text-slate-500">Mood</div><div className="font-black text-text-main text-sm truncate">{detail.mood||'-'}</div></div>
            <div className="bg-white rounded-xl p-3 text-center"><div className="text-xs text-slate-500">Makan</div><div className="font-black text-text-main text-sm truncate" title={detail.focus_theme_menu_makanan}>{detail.makan ? `${detail.makan.toUpperCase()} ${detail.focus_theme_menu_makanan ? `(${detail.focus_theme_menu_makanan})` : ''}` : '-'}</div></div>
            <div className="bg-white rounded-xl p-3 text-center"><div className="text-xs text-slate-500">Tidur</div><div className="font-black text-text-main text-sm truncate">{tidurText}</div></div>
          </div>
          {detail.observation_note&&<div><div className="text-xs text-slate-500 mb-1">Observasi Anak</div><div className="bg-white rounded-xl p-3 text-sm text-slate-700"><span className="font-black text-text-main">{detail.observation_domain||'Observasi'}: </span>{detail.observation_note}</div></div>}
          {detail.structured_observation && (detail.structured_observation.activities || detail.structured_observation.pillars) && (
            <div className="bg-white rounded-xl p-4 space-y-4 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Capaian Perkembangan</div>
              
              {detail.structured_observation.activities && Object.keys(detail.structured_observation.activities).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-text-main">Rencana Kegiatan</div>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(detail.structured_observation.activities).map(([act, rating]) => (
                      <div key={act} className="flex justify-between items-center gap-3 p-2 bg-slate-50 rounded-lg text-xs border border-slate-100">
                        <span className="text-slate-700 font-medium">{act}</span>
                        <span className={`px-2 py-0.5 rounded font-black text-[10px] border ${
                          rating === 'BSB' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          rating === 'BSH' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          rating === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>{rating}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.structured_observation.pillars && Object.keys(detail.structured_observation.pillars).length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <div className="text-xs font-bold text-text-main">Pilar Karakter & Tilawati</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(detail.structured_observation.pillars).map(([pillar, rating]) => {
                      const labelMap = { iqra: 'Tilawati', akhlak: 'Akhlak', aktif_mandiri: 'Aktif & Mandiri', disiplin_tertib: 'Disiplin & Tertib' };
                      return (
                        <div key={pillar} className="text-center p-2 bg-slate-50 rounded-lg text-xs border border-slate-100">
                          <div className="text-[10px] text-slate-400 font-semibold mb-1 truncate">{labelMap[pillar] || pillar}</div>
                          <span className={`inline-block px-2.5 py-0.5 rounded font-black text-[10px] border ${
                            rating === 'BSB' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            rating === 'BSH' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            rating === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
                          }`}>{rating}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {detail.parent_note&&<div><div className="text-xs text-slate-500 mb-1">Catatan untuk wali</div><div className="bg-white rounded-xl p-3 text-sm text-slate-700">{detail.parent_note}</div></div>}
          {activities.length>0&&<div><div className="text-xs text-slate-500 mb-1">Aktivitas</div><div className="flex flex-wrap gap-1">{activities.map((a,i)=><span key={i} className="bg-white px-2 py-1 rounded-lg text-sm text-slate-700">{a}</span>)}</div></div>}
          {detail.catatan&&<div><div className="text-xs text-slate-500 mb-1">Catatan</div><div className="bg-white rounded-xl p-3 text-sm text-slate-700">{detail.catatan}</div></div>}
          {(detail.attachments||[]).length>0&&<div><div className="text-xs text-slate-500 mb-2">Foto</div><div className="grid grid-cols-3 gap-2">{(detail.attachments||[]).map(a=><img key={a.id} src={a.url} className="aspect-square object-cover rounded-xl border border-slate-200 w-full" alt="foto"/>)}</div></div>}
        </div>
      </div>
    </section>;
  }
  const completedSteps=required.filter(x=>x.ok).length;
  const missingCount=required.length-completedSteps;
  const statusText=detail.status==='published'?'Published':'Draft';
  const saveObservation=()=>tap('observation_note',detail.observation_note||'');
  const saveTeacherNote=()=>tap('catatan',detail.catatan||'');
  const saveParentNote=()=>tap('parent_note',detail.parent_note||'');

  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 border-slate-200 bg-slate-50 sm:rounded-2xl sm:border lg:h-auto">
    <div className="flex-shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onClose} aria-label="Kembali" className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-all hover:bg-slate-200 active:scale-95">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.4}/>
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-text-main">{row.nama}</div>
            <div className="truncate text-[11px] font-semibold text-slate-500">{row.rombel_nama} - {tanggal}</div>
          </div>
        </div>
        {busy&&<div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-primary-container border-t-primary"/>}
      </div>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
      <div className="sticky top-2 z-30 mb-4 lg:hidden">
        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-lg shadow-slate-900/10 backdrop-blur-md">
          <button type="button" onClick={()=>setMobileChecklistOpen(v=>!v)} aria-expanded={mobileChecklistOpen} className="w-full px-3.5 py-3 text-left active:scale-[0.99]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase text-slate-400">Checklist kirim</div>
                <div className="truncate text-xs font-semibold text-slate-600">{missingCount===0?'Siap dikirim':`${missingCount} item belum lengkap`}</div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="rounded-xl bg-slate-50 px-2.5 py-1 text-right ring-1 ring-slate-200">
                  <div className="text-sm font-black tabular-nums text-text-main">{completedSteps}/{required.length}</div>
                </div>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${mobileChecklistOpen?'rotate-180':''}`} strokeWidth={2.5}/>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{width:`${pct}%`}}/></div>
          </button>
          {mobileChecklistOpen&&<div className="space-y-1.5 border-t border-slate-100 bg-slate-50/80 px-3.5 pb-3 pt-2">
            {required.map(x=><div key={x.label} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${x.ok?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-white'}`}><span className={`text-xs font-black ${x.ok?'text-emerald-700':'text-slate-500'}`}>{x.label}</span>{x.ok?<CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2.6}/>:<span className="h-2 w-2 rounded-full bg-slate-300"/>}</div>)}
          </div>}
        </section>
      </div>
      <div className="mx-auto grid max-w-7xl gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <header className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
            <div className="p-4 sm:p-5">
                <div className="flex items-start gap-4">
                  {row.foto?<img src={row.foto} className="h-16 w-16 rounded-2xl object-cover sm:h-20 sm:w-20" alt={row.nama}/>:<div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-xl font-black text-slate-400 sm:h-20 sm:w-20">{String(row.nama||'?').slice(0,1)}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-black leading-tight text-text-main sm:text-2xl">{row.nama}</h2>
                      <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${detail.status==='published'?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-slate-200 bg-slate-50 text-slate-600'}`}>{statusText}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{row.rombel_nama} - {detail.tanggal||row.tanggal}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={publish} className="btn gap-2"><Send className="h-4 w-4" strokeWidth={2.4}/>Kirim ke Wali</button>
                      <button onClick={()=>setPreview(true)} className="btn-secondary gap-2"><Eye className="h-4 w-4" strokeWidth={2.4}/>Preview</button>
                      <label className="btn-secondary cursor-pointer gap-2"><Camera className="h-4 w-4" strokeWidth={2.4}/>Tambah Foto<input type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label>
                      <button onClick={onClose} className="hidden h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-200 active:scale-[0.98] lg:inline-flex"><X className="h-4 w-4" strokeWidth={2.4}/>Tutup</button>
                    </div>
                  </div>
                </div>
            </div>
          </header>

          {detail.focus_theme_id ? (
            <div className="bg-gradient-to-r from-primary/10 to-indigo-50/10 border border-primary/20 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase text-primary-active mb-2">
                <BookOpen className="h-4 w-4" strokeWidth={2.4}/>
                Konteks kelas hari ini
              </div>
              <h3 className="text-base font-black text-text-main leading-tight">{detail.focus_theme_title}</h3>
              {detail.focus_theme_menu_makanan && (
                <div className="mt-2 text-xs text-slate-650 bg-white/60 w-fit px-2.5 py-1 border border-slate-100 rounded-lg">
                  🍽️ Menu makanan: <strong className="text-slate-800">{detail.focus_theme_menu_makanan}</strong>
                </div>
              )}
              {detail.focus_theme_activity_summary && (
                <div className="mt-3 text-xs text-slate-600 bg-white/45 border border-slate-200/60 rounded-xl p-3 whitespace-pre-wrap leading-relaxed">
                  {detail.focus_theme_activity_summary}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase text-amber-700 mb-2">
                <BookOpen className="h-4 w-4" strokeWidth={2.4}/>
                Tema Kelas Belum Diatur
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Silakan atur tema & kegiatan kelas terlebih dahulu menggunakan tombol <strong>"Atur Tema & Kegiatan Kelas"</strong> di daftar siswa sebelah kiri agar bisa mengisi laporan harian.
              </p>
            </div>
          )}

          <section className="grid gap-5 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-sm font-black text-text-main">Kondisi harian</h3>
              <div className="mt-4 space-y-5">
                <div><p className="mb-2 text-xs font-black text-slate-500">Mood hari ini</p><div className="grid grid-cols-3 gap-2">{MOOD_OPT.map(o=><button key={o.v} onClick={()=>tap('mood',o.v)} className={`min-h-11 rounded-xl border-2 px-2 text-xs font-black transition-all duration-200 active:scale-95 ${detail.mood===o.v?o.c+' text-white border-transparent shadow-sm':'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}>{o.l}</button>)}</div></div>
                <div><p className="mb-2 flex items-center justify-between gap-2 text-xs font-black text-slate-500"><span>Makan siang</span>{detail.focus_theme_menu_makanan&&<span className="truncate text-[11px] font-bold normal-case text-slate-400">Menu: {detail.focus_theme_menu_makanan}</span>}</p><div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">{MAKAN_OPT.map(o=><button key={o.v} onClick={()=>tap('makan',o.v)} className={`min-h-11 rounded-xl border-2 px-2 text-xs font-black transition-all duration-200 active:scale-95 ${detail.makan===o.v?o.c+' text-white border-transparent shadow-sm':'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}>{o.l}</button>)}</div></div>
                <div><p className="mb-2 text-xs font-black text-slate-500">Tidur siang</p><div className="grid max-w-xs grid-cols-2 gap-2">{TIDUR_OPT.map(o=><button key={o.v} onClick={()=>tap('tidur',o.v)} className={`min-h-11 rounded-xl border-2 px-2 text-xs font-black transition-all duration-200 active:scale-95 ${detail.tidur===o.v?o.c+' text-white border-transparent shadow-sm':'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}>{o.l}</button>)}</div></div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-sm font-black text-text-main">Aktivitas anak</h3>
              <div className="mt-4 space-y-5">
                {activeActivities.length > 0 ? (
                  <div>
                    <div className="mb-2 text-xs font-black text-slate-500">Aktivitas Kegiatan Mingguan / Tema</div>
                    <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                      {activeActivities.map(act => {
                        const isSelected = activities.includes(act);
                        return (
                          <label key={act} className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs font-bold transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                            isSelected ? 'border-primary bg-primary-container/20 text-text-main font-black' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'
                          }`}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!detail.focus_theme_id}
                              onChange={e => tapActivityCheckbox(act, e.target.checked)}
                              className="mt-[2px] h-4 w-4 shrink-0 rounded border-slate-300 text-primary focus:ring-primary/45 disabled:opacity-40"
                            />
                            <span className="block min-w-0 leading-snug">{act}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-400">
                    Belum ada rencana kegiatan Focus Theme untuk hari ini. Gunakan aktivitas tambahan di bawah.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Penilaian Capaian Perkembangan */}
          {activities.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-black text-text-main">Penilaian Capaian Perkembangan</h3>
                <p className="text-xs text-slate-500 mt-0.5">Nilai tingkat perkembangan anak untuk setiap kegiatan hari ini.</p>
              </div>
              <div className="space-y-2.5">
                {activities.map(act => {
                  const rating = (detail.structured_observation?.activities || {})[act] || 'BSH';
                  return (
                    <div key={act} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/65">
                      <span className="text-xs font-bold text-slate-700 leading-snug">{act}</span>
                      <div className="flex gap-1 shrink-0">
                        {['BB', 'MB', 'BSH', 'BSB'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => tapRating('activities', act, opt)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                              rating === opt
                                ? opt === 'BSB' ? 'bg-emerald-500 text-white border-transparent shadow-sm'
                                  : opt === 'BSH' ? 'bg-primary text-white border-transparent shadow-sm'
                                  : opt === 'MB' ? 'bg-amber-500 text-white border-transparent shadow-sm' : 'bg-red-500 text-white border-transparent shadow-sm'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-primary/30'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Pilar Karakter & Tilawati */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
            <div>
              <h3 className="text-sm font-black text-text-main">Pilar Karakter & Tilawati</h3>
              <p className="text-xs text-slate-500 mt-0.5">Penilaian perkembangan pilar & tilawati (biarkan - jika tidak ada kegiatan).</p>
            </div>
            <div className="space-y-2.5">
              {PILLAR_KEYS.map(p => {
                const rating = (detail.structured_observation?.pillars || {})[p.k] || null;
                return (
                  <div key={p.k} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/65">
                    <span className="text-xs font-bold text-slate-700 leading-snug">{p.l}</span>
                    <div className="flex gap-1 items-center shrink-0">
                      {/* Reset Button */}
                      <button
                        type="button"
                        onClick={() => tapRating('pillars', p.k, null)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                          rating === null
                            ? 'bg-slate-500 text-white border-transparent shadow-sm'
                            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-350'
                        }`}
                        title="Hapus Penilaian"
                      >
                        -
                      </button>
                      {['BB', 'MB', 'BSH', 'BSB'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => tapRating('pillars', p.k, opt)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                            rating === opt
                              ? opt === 'BSB' ? 'bg-emerald-500 text-white border-transparent shadow-sm'
                                : opt === 'BSH' ? 'bg-primary text-white border-transparent shadow-sm'
                                : opt === 'MB' ? 'bg-amber-500 text-white border-transparent shadow-sm' : 'bg-red-500 text-white border-transparent shadow-sm'
                              : 'bg-white border-slate-200 text-slate-550 hover:border-primary/30'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-black text-text-main">Observasi anak</h3><p className="mt-1 text-xs font-semibold text-slate-500">Pilih domain, lalu tulis perilaku yang terlihat hari ini.</p></div>
              <button type="button" onClick={()=>{const existing=(detail.observation_note||'').trim();if(existing.length>20&&!window.confirm('Catatan observasi yang sudah ada akan ditimpa. Lanjutkan?'))return;const note=generatePedagogicalNote(row.nama,activities,detail.mood);update('observation_note',note);}} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition-all hover:bg-emerald-100 active:scale-[0.98]"><Sparkles className="h-4 w-4" strokeWidth={2.4}/>Bantu deskripsi</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{domainOptions(detail).map(d=><button key={d} onClick={()=>tap('observation_domain',d)} className={`rounded-lg border px-3 py-2 text-xs font-black transition-all duration-200 active:scale-95 ${detail.observation_domain===d?'border-text-main bg-text-main text-white':'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}>{d}</button>)}</div>
            <div className="mt-4"><textarea value={detail.observation_note||''} onChange={e=>update('observation_note',e.target.value)} rows={4} placeholder="Contoh: Rafi menunggu giliran saat memakai krayon dan meminta bantuan ketika tutupnya sulit dibuka." className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"/><div className="mt-2 flex flex-wrap items-center justify-between gap-2">{detail.observation_note&&!noteOk(detail.observation_note)?<p className="text-xs font-bold text-primary-active">Minimal 12 karakter agar bisa dikirim.</p>:<p className="text-xs font-semibold text-slate-400">Catatan ini tampil di laporan wali.</p>}<button onClick={saveObservation} className="h-9 rounded-lg bg-text-main px-4 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]">Simpan observasi</button></div></div>
            <div className="mt-5 border-t border-slate-100 pt-4"><div className="mb-2 text-xs font-black text-slate-500">Aktivitas tambahan</div><div className="flex flex-wrap gap-2">{AKTIVITAS.map(a=>{const on=activities.includes(a);return <button key={a} disabled={!detail.focus_theme_id} onClick={()=>tapActivityCheckbox(a, !on)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all duration-200 active:scale-95 disabled:opacity-40 ${on?'border-primary bg-primary text-white':'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}>{a}</button>;})}</div></div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-sm font-black text-text-main">Catatan tambahan</h3>
              <div className="mt-4 space-y-4"><div><label className="label">Catatan guru</label><textarea value={detail.catatan||''} onChange={e=>update('catatan',e.target.value)} rows={3} placeholder="Tambahkan catatan khusus untuk hari ini…" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"/><button onClick={saveTeacherNote} className="mt-2 h-9 w-full rounded-lg bg-primary px-4 text-sm font-bold text-white transition-all hover:bg-primary-hover active:scale-[0.98]">Simpan catatan guru</button></div><div className="border-t border-slate-100 pt-4"><label className="label">Catatan untuk wali</label><textarea value={detail.parent_note||''} onChange={e=>update('parent_note',e.target.value)} rows={2} placeholder="Opsional. Info singkat yang perlu diketahui wali." className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"/><button onClick={saveParentNote} className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]">Simpan catatan wali</button></div></div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black text-text-main">Dokumentasi foto</h3><label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-black text-slate-600 transition-all hover:bg-slate-200 active:scale-95"><Camera className="h-4 w-4" strokeWidth={2.4}/>Upload<input type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label></div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">{(detail.attachments||[]).map(a=><div key={a.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={a.url} className="aspect-square w-full object-cover" alt="foto daily record"/><button onClick={()=>deletePhoto(a.id)} aria-label="Hapus foto" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-lg bg-red-600 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><X className="h-4 w-4" strokeWidth={2.6}/></button></div>)}{(!detail.attachments||detail.attachments.length===0)&&<div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">Belum ada foto yang diunggah.</div>}</div>
            </div>
          </section>

          {formal&&<section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5"><div className="flex items-center gap-2 text-xs font-black uppercase text-sky-700"><ClipboardCheck className="h-4 w-4" strokeWidth={2.4}/>Preview laporan formal</div><p className="mt-3 text-sm leading-relaxed text-sky-900">{formal}</p><button onClick={copyFormal} className="mt-3 h-9 rounded-lg bg-sky-700 px-4 text-sm font-bold text-white transition-all hover:bg-sky-800 active:scale-[0.98]">Copy laporan</button></section>}
          {edits&&edits.length>0&&<section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-black uppercase text-slate-400">Riwayat perubahan</h3><div className="mt-3 max-h-32 space-y-2 overflow-y-auto">{edits.map((l,i)=><div key={i} className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300"/><span>{l.created_at?.slice(0,16).replace('T',' ')} - {l.guru_nama||'Sistem'}</span></div>)}</div></section>}
        </div>

        <aside className="space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <section className="hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block"><div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-text-main">Checklist kirim</h3><p className="text-xs font-semibold text-slate-500">{missingCount===0?'Laporan siap dipublish.':`${missingCount} item belum lengkap.`}</p></div><div className="text-right"><div className="text-xl font-black tabular-nums text-text-main">{pct}%</div><div className="text-[10px] font-black uppercase text-slate-400">Lengkap</div></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{width:`${pct}%`}}/></div><div className="mt-4 space-y-2">{required.map(x=><div key={x.label} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${x.ok?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-slate-50'}`}><span className={`text-xs font-black ${x.ok?'text-emerald-700':'text-slate-500'}`}>{x.label}</span>{x.ok?<CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2.6}/>:<span className="h-2 w-2 rounded-full bg-slate-300"/>}</div>)}</div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2"><MessageCircle className="h-4 w-4 text-slate-500" strokeWidth={2.4}/><h3 className="font-black text-text-main">Feedback Wali</h3></div><div className="max-h-80 space-y-2 overflow-y-auto pr-1">{(detail.comments||[]).map(c=><div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-black text-slate-500">{c.author_name} - {c.author_role}</div><div className="mt-1 text-sm text-text-main">{c.body}</div></div>)}{(!detail.comments||detail.comments.length===0)&&<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-400">Belum ada komentar.</div>}</div>{detail.status==='published'&&<div className="mt-3 flex gap-2"><input value={comment} onChange={e=>setComment(e.target.value)} autoComplete="off" className="input min-w-0 flex-1 bg-white" placeholder="Balas wali…"/><button onClick={sendComment} className="btn px-3" aria-label="Kirim feedback"><Send className="h-4 w-4" strokeWidth={2.4}/></button></div>}</section>
        </aside>
      </div>
    </div>

    <div className="flex flex-shrink-0 gap-2 border-t border-slate-200/80 bg-white/95 p-3 backdrop-blur-md lg:hidden">
      <button onClick={publish} className="btn h-10 flex-1 gap-1 px-2 text-[11px] font-bold"><Send className="h-4 w-4" strokeWidth={2.4}/>Kirim</button>
      <button onClick={()=>setPreview(true)} className="btn-secondary h-10 gap-1 px-3 text-[11px] font-bold"><Eye className="h-4 w-4" strokeWidth={2.4}/>Preview</button>
      <label className="btn-secondary h-10 cursor-pointer gap-1 px-3 text-[11px] font-bold"><Camera className="h-4 w-4" strokeWidth={2.4}/>Foto<input type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label>
    </div>
  </section>;
}
