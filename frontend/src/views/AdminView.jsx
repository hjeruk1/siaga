import{useEffect,useMemo,useState}from'react';
import{api}from'../api';
import{Modal}from'../components/Shared';

export default function AdminView({user,toast}){
  const[tab,setTab]=useState('siswa');
  const tabs=['cabang','siswa','staff','wali','rombel','billing','laporan','modulAjar','config','kalender','audit'];
  return <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map(t=><button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${tab===t?'bg-slate-900 text-white':'bg-white text-slate-600 border border-slate-200'}`}>{label(t)}</button>)}
    </div>
    {tab==='cabang'&&<CabangTab user={user} toast={toast}/>}
    {tab==='siswa'&&<SiswaTab user={user} toast={toast}/>}
    {tab==='staff'&&<StaffTab user={user} toast={toast}/>}
    {tab==='wali'&&<WaliTab user={user} toast={toast}/>}
    {tab==='rombel'&&<RombelTab user={user} toast={toast}/>}
    {tab==='billing'&&<BillingTab user={user} toast={toast}/>}
    {tab==='laporan'&&<LaporanTab user={user} toast={toast}/>}
    {tab==='modulAjar'&&<ModulAjarTab user={user} toast={toast}/>}
    {tab==='config'&&<ConfigTab user={user} toast={toast}/>}
    {tab==='kalender'&&<KalenderTab user={user} toast={toast}/>}
    {tab==='audit'&&<AuditTab user={user} toast={toast}/>}
  </div>;
}
function label(t){return{ cabang:'Cabang',siswa:'Siswa',staff:'Staff',wali:'Wali',rombel:'Rombel',billing:'Billing',laporan:'Laporan',modulAjar:'Modul Ajar',config:'Konfigurasi',kalender:'Kalender',audit:'Audit'}[t];}

function useMaster(user){
  const[cabang,setCabang]=useState([]),[jenjang,setJenjang]=useState([]),[rombel,setRombel]=useState([]);
  const[cabangId,setCabangId]=useState(user.role==='admin'?'':user.cabang_id);
  async function load(){const [c,j]=await Promise.all([api.cabang(),api.jenjang()]);setCabang(c);setJenjang(j);const preferred=c.find(x=>x.kode==='GDN'&&x.aktif)||c.find(x=>x.aktif)||c[0];const cid=cabangId||preferred?.id;if(user.role==='admin'&&!cabangId&&cid)setCabangId(cid);setRombel(await api.rombel(cid));}
  useEffect(()=>{load().catch(()=>{});},[cabangId]);
  return{cabang,jenjang,rombel,cabangId,setCabangId,load};
}

function SiswaTable({list,selected,open}){
  const headers=[
    {label:'',className:'w-14'},
    {label:'Nama',className:'min-w-52 w-64'},
    {label:'NIS',className:'w-36'},
    {label:'Cabang',className:'w-36'},
    {label:'Jenjang',className:'w-28'},
    {label:'Rombel',className:'w-32'},
    {label:'Paket',className:'w-28'},
    {label:'Status',className:'w-24'},
    {label:'',className:'w-28 sticky right-0 z-10 bg-slate-50 shadow-[-8px_0_12px_-12px_rgba(15,23,42,.45)]'}
  ];
  return <div className="overflow-x-auto rounded-xl border border-slate-100">
    <table className="w-full min-w-[920px] table-fixed text-sm">
      <thead><tr>{headers.map((h,i)=><th key={`${i}-${h.label||'empty'}`} className={`text-left py-2 px-3 bg-slate-50 text-slate-500 font-black ${h.className}`}>{h.label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">
        {list.map(s=>{
          const active=selected?.id===s.id;
          const rowBg=active?'bg-amber-50':'bg-white';
          return <tr key={s.id} className={active?'bg-amber-50':''}>
            <td className="py-2.5 px-3 text-slate-700">{s.foto?<img src={s.foto} className="w-9 h-9 rounded-lg object-cover" alt=""/>:<div className="w-9 h-9 rounded-lg bg-slate-200"/>}</td>
            <td className="py-2.5 px-3 font-black text-slate-800 truncate" title={s.nama}>{s.nama}</td>
            <td className="py-2.5 px-3 text-slate-600 truncate" title={s.nis||'-'}>{s.nis||'-'}</td>
            <td className="py-2.5 px-3 text-slate-600 truncate" title={s.cabang_nama}>{s.cabang_nama}</td>
            <td className="py-2.5 px-3 text-slate-600 truncate" title={s.jenjang_nama}>{s.jenjang_nama}</td>
            <td className="py-2.5 px-3 text-slate-600 truncate" title={s.rombel_nama}>{s.rombel_nama}</td>
            <td className="py-2.5 px-3 text-slate-600 truncate" title={s.paket}>{s.paket}</td>
            <td className="py-2.5 px-3 text-slate-600 truncate" title={s.status}>{s.status}</td>
            <td className={`py-2.5 px-3 sticky right-0 z-10 ${rowBg} shadow-[-8px_0_12px_-12px_rgba(15,23,42,.45)]`}>
              <button onClick={()=>open(s)} className="link whitespace-nowrap">Kelola</button>
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
  async function load(){setList(await api.cabang());}
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[]);
  async function add(){try{await api.createCabang(form);toast('ok','Cabang dibuat');setForm(empty);setOpenForm(false);load();}catch(e){toast('err',e.message);}}
  async function saveEdit(){try{await api.updateCabang(editing.id,editing);toast('ok','Cabang diperbarui');setEditing(null);load();}catch(e){toast('err',e.message);}}
  async function toggle(c){try{await api.updateCabang(c.id,{...c,aktif:c.aktif?0:1});toast('ok',c.aktif?'Cabang dinonaktifkan':'Cabang diaktifkan');load();}catch(e){toast('err',e.message);}}
  const right=user.role==='admin'?<button onClick={()=>{setForm(empty);setOpenForm(true);}} className="btn">Tambah Cabang</button>:null;
  return <Panel title="Cabang Taruna Prima" right={right}>
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{list.map(c=><div key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex justify-between gap-3"><div><div className="font-black text-slate-900">{c.nama}</div><div className="text-sm text-slate-500">{c.kode}</div></div><span className={`text-xs font-black ${c.aktif?'text-emerald-600':'text-red-600'}`}>{c.aktif?'aktif':'nonaktif'}</span></div>
      <div className="text-sm text-slate-500">{c.alamat||'Alamat belum diisi'}</div>
      <div className="text-xs text-slate-500">Kontak: <span className="font-bold text-slate-700">{c.kontak||'-'}</span></div>
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="text-[11px] font-black text-slate-400 uppercase">Kepsek</div>
        <div className="font-black text-slate-800">{c.kepsek_nama||'Belum diatur'}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Siswa Aktif" value={c.siswa_aktif_count||0}/>
        <StatBox label="Staff Aktif" value={c.staff_aktif_count||0}/>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <MiniBox label="KB" value={c.kb_count||0}/>
        <MiniBox label="TK" value={c.tk_count||0}/>
        <MiniBox label="Care" value={c.care_count||0}/>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <MiniBox label="Admin" value={c.admin_count||0}/>
        <MiniBox label="Kepsek" value={c.kepsek_count||0}/>
        <MiniBox label="Guru" value={c.guru_count||0}/>
        <MiniBox label="Gerbang" value={c.gerbang_count||0}/>
      </div>
      {user.role==='admin'&&<div className="flex gap-2 pt-1"><button onClick={()=>setEditing(c)} className="link">Edit</button><button onClick={()=>toggle(c)} className={`${c.aktif?'link text-red-600':'link'}`}>{c.aktif?'Nonaktifkan':'Aktifkan'}</button></div>}
    </div>)}</div>
    {openForm&&<CabangModal title="Tambah Cabang" form={form} setForm={setForm} onClose={()=>setOpenForm(false)} onSubmit={add} submitLabel="Tambah Cabang"/>}
    {editing&&<CabangModal title="Edit Cabang" form={editing} setForm={setEditing} onClose={()=>setEditing(null)} onSubmit={saveEdit} submitLabel="Simpan Perubahan" showStatus/>}
  </Panel>;
}

function CabangModal({title,form,setForm,onClose,onSubmit,submitLabel,showStatus=false}){
  return <Modal title={title} onClose={onClose}>
    <div className="space-y-3">
      <Input placeholder="Nama cabang" value={form.nama||''} onChange={v=>setForm(f=>({...f,nama:v}))}/>
      <Input placeholder="Kode" value={form.kode||''} onChange={v=>setForm(f=>({...f,kode:v.toUpperCase()}))}/>
      <Input placeholder="Alamat" value={form.alamat||''} onChange={v=>setForm(f=>({...f,alamat:v}))}/>
      <Input placeholder="Kontak" value={form.kontak||''} onChange={v=>setForm(f=>({...f,kontak:v}))}/>
      {showStatus&&<label className="block text-xs font-black text-slate-500 uppercase space-y-1">
        <span>Status</span>
        <select value={form.aktif?1:0} onChange={e=>setForm(f=>({...f,aktif:Number(e.target.value)}))} className="input w-full"><option value={1}>Aktif</option><option value={0}>Nonaktif</option></select>
      </label>}
      <div className="flex gap-2"><button onClick={onSubmit} className="btn">{submitLabel}</button><button onClick={onClose} className="btn-secondary">Batal</button></div>
    </div>
  </Modal>;
}

function StatBox({label,value}){return <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="text-[11px] font-black text-slate-400 uppercase">{label}</div><div className="text-2xl font-black text-slate-900">{value}</div></div>;}
function MiniBox({label,value}){return <div className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center"><div className="text-[10px] font-black text-slate-400 uppercase truncate">{label}</div><div className="font-black text-slate-800">{value}</div></div>;}

function CabangFilter({user,cabang,cabangId,setCabangId}){
  if(user.role!=='admin')return null;
  return <select value={cabangId} onChange={e=>setCabangId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"><option value="">Pilih cabang</option>{cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}</select>;
}

function SiswaTab({user,toast}){
  const m=useMaster(user);const[list,setList]=useState([]);const[form,setForm]=useState({nama:'',nis:'',jenjang_id:'',rombel_id:'',paket:'reguler'});
  const[selected,setSelected]=useState(null);const[detail,setDetail]=useState(null);
  const[kenaikanPreview,setKenaikanPreview]=useState(null);
  async function load(){if(!m.cabangId&&user.role==='admin')return;setList(await api.siswa({cabang_id:m.cabangId,status:'semua'}));}
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[m.cabangId]);
  const rombelFiltered=m.rombel.filter(r=>!form.jenjang_id||String(r.jenjang_id)===String(form.jenjang_id));
  async function add(){try{await api.createSiswa({...form,cabang_id:m.cabangId,jenjang_id:Number(form.jenjang_id),rombel_id:Number(form.rombel_id)});toast('ok','Siswa tersimpan');setForm({nama:'',nis:'',jenjang_id:'',rombel_id:'',paket:'reguler'});load();}catch(e){toast('err',e.message);}}
  async function open(s){try{setSelected(s);setDetail(await api.siswaDetail(s.id));}catch(e){toast('err',e.message);}}
  async function refreshDetail(id=selected?.id){if(!id)return;setDetail(await api.siswaDetail(id));load();}
  async function previewKenaikan(){try{const r=await api.kenaikanPreview({cabang_id:m.cabangId});setKenaikanPreview(r);}catch(e){toast('err',e.message);}}
  async function doKenaikan(){try{const r=await api.kenaikan({cabang_id:m.cabangId,tanggal_efektif:new Date().toISOString().slice(0,10)});toast('ok',r.results.length+' siswa diproses');setKenaikanPreview(null);load();}catch(e){toast('err',e.message);}}
  return <Panel title="Data Siswa" right={<CabangFilter user={user} {...m}/>}>
    <div className="grid sm:grid-cols-6 gap-2 mb-4">
      <Input placeholder="Nama siswa" value={form.nama} onChange={v=>setForm(f=>({...f,nama:v}))}/>
      <Input placeholder="NIS" value={form.nis} onChange={v=>setForm(f=>({...f,nis:v}))}/>
      <select value={form.jenjang_id} onChange={e=>setForm(f=>({...f,jenjang_id:e.target.value,rombel_id:''}))} className="input"><option value="">Jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</select>
      <select value={form.rombel_id} onChange={e=>setForm(f=>({...f,rombel_id:e.target.value}))} className="input"><option value="">Rombel</option>{rombelFiltered.map(r=><option key={r.id} value={r.id}>{r.nama}</option>)}</select>
      <select value={form.paket} onChange={e=>setForm(f=>({...f,paket:e.target.value}))} className="input"><option value="reguler">Reguler</option><option value="full_day">Full day</option><option value="care">Care</option></select>
      <button onClick={add} className="btn">Tambah</button>
    </div>
    <div className="flex gap-2 mb-4"><button onClick={previewKenaikan} className="btn-secondary">Kenaikan Tahun Ajaran</button></div>
    <SiswaTable list={list} selected={selected} open={open}/>
    {detail&&<SiswaDrawer onClose={()=>{setSelected(null);setDetail(null);}}>
      <SiswaDetailPanel user={user} m={m} detail={detail} setDetail={setDetail} toast={toast} refresh={()=>refreshDetail(detail.id)} close={()=>{setSelected(null);setDetail(null);}}/>
    </SiswaDrawer>}
    {kenaikanPreview&&<Modal title="Preview Kenaikan Tahun Ajaran" onClose={()=>setKenaikanPreview(null)}>
      <div className="space-y-4 min-w-0">
        <div className="text-sm text-slate-600">Cabang: {m.cabang.find(c=>String(c.id)===String(kenaikanPreview.cabang_id))?.nama||kenaikanPreview.cabang_id}</div>
        <div className="overflow-x-auto max-h-80"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Dari</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Ke</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{kenaikanPreview.preview.map((p,i)=><tr key={i}><td className="py-2 px-3 text-slate-700">{p.nama}</td><td className="py-2 px-3 text-slate-700">{p.jenjang_nama} - {p.rombel_nama}</td><td className="py-2 px-3 text-slate-700">{p.target_jenjang} - {p.target_rombel}</td><td className="py-2 px-3"><span className={`text-xs font-black px-2 py-0.5 rounded-full ${p.action==='naik'?'bg-emerald-100 text-emerald-700':p.action==='lulus'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600'}`}>{p.action==='naik'?'Naik':p.action==='lulus'?'Lulus':'Tetap'}</span></td></tr>)}</tbody></table></div>
        <div className="flex gap-2"><button onClick={doKenaikan} className="btn">Konfirmasi Kenaikan</button><button onClick={()=>setKenaikanPreview(null)} className="btn-secondary">Batal</button></div>
      </div>
    </Modal>}
  </Panel>;
}

function SiswaDrawer({children,onClose}){
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onClick={onClose}>
    <div className="w-full sm:max-w-2xl xl:max-w-3xl h-full bg-slate-100 shadow-2xl overflow-y-auto p-3 sm:p-4 animate-slide-up" onClick={e=>e.stopPropagation()}>
      {children}
    </div>
  </div>;
}

function SiswaDetailPanel({user,m,detail,setDetail,toast,refresh,close}){
  const[move,setMove]=useState({cabang_id:m.cabangId||detail.enrollment?.cabang_id||'',jenjang_id:detail.enrollment?.jenjang_id||'',rombel_id:detail.enrollment?.rombel_id||'',paket:detail.enrollment?.paket||'reguler',tanggal_mulai:new Date().toISOString().slice(0,10),alasan:'Pindah cabang/rombel'});
  const[targetRombel,setTargetRombel]=useState(m.rombel);
  const[pickup,setPickup]=useState({nama:'',no_wa:'',relasi:'',catatan:''});
  const[tagihanSiswa,setTagihanSiswa]=useState(null);
  useEffect(()=>{if(move.cabang_id)api.rombel(move.cabang_id).then(setTargetRombel).catch(()=>setTargetRombel(m.rombel));},[move.cabang_id]);
  useEffect(()=>{api.tagihan({siswa_id:detail.id}).then(setTagihanSiswa).catch(()=>setTagihanSiswa([]));},[detail.id]);
  const moveRombel=targetRombel.filter(r=>(!move.jenjang_id||String(r.jenjang_id)===String(move.jenjang_id))&&(!move.cabang_id||String(r.cabang_id)===String(move.cabang_id)));
  function d(k,v){setDetail(x=>({...x,[k]:v}));}
  async function save(){try{await api.updateSiswa(detail.id,detail);toast('ok','Data siswa diperbarui');refresh();}catch(e){toast('err',e.message);}}
  async function pindah(){try{await api.moveSiswa(detail.id,{...move,cabang_id:Number(move.cabang_id),jenjang_id:Number(move.jenjang_id),rombel_id:Number(move.rombel_id)});toast('ok','Enrollment siswa dipindah');refresh();}catch(e){toast('err',e.message);}}
  async function nfc(){try{const r=await api.reissueNfc(detail.id);toast('ok','NFC baru: '+r.nfc_token);refresh();}catch(e){toast('err',e.message);}}
  async function addPickup(){try{const r=await api.addPenjemput(detail.id,pickup);toast('ok','QR penjemput: '+r.qr_code);setPickup({nama:'',no_wa:'',relasi:'',catatan:''});refresh();}catch(e){toast('err',e.message);}}
  return <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-5">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-4"><FotoUpload url={detail.foto} onUpload={async file=>{const r=await api.uploadSiswaFoto(detail.id,file);setDetail(d=>({...d,foto:r.url}));toast('ok','Foto diperbarui');}} onDelete={async()=>{await api.deleteSiswaFoto(detail.id);setDetail(d=>({...d,foto:null}));toast('ok','Foto dihapus');}}/><div><div className="font-black text-slate-900">{detail.nama}</div><div className="text-sm text-slate-500">{detail.enrollment?.cabang_nama} - {detail.enrollment?.rombel_nama}</div></div></div><button onClick={close} className="link">Tutup</button></div>
    <div>
      <div className="font-black text-slate-800 mb-2">Profil</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Input placeholder="Nama" value={detail.nama||''} onChange={v=>d('nama',v)}/>
        <Input placeholder="NIS" value={detail.nis||''} onChange={v=>d('nis',v)}/>
        <Input placeholder="Nama panggilan" value={detail.nama_panggilan||''} onChange={v=>d('nama_panggilan',v)}/>
        <select value={detail.gender||''} onChange={e=>d('gender',e.target.value)} className="input"><option value="">Gender</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select>
        <Input placeholder="Tanggal lahir" value={detail.tanggal_lahir||''} onChange={v=>d('tanggal_lahir',v)}/>
        <select value={detail.status||'aktif'} onChange={e=>d('status',e.target.value)} className="input"><option value="aktif">Aktif</option><option value="keluar">Keluar</option><option value="lulus">Lulus</option></select>
      </div>
      <textarea value={detail.alamat||''} onChange={e=>d('alamat',e.target.value)} className="input w-full mt-2 min-h-20" placeholder="Alamat"/>
      <textarea value={detail.catatan_khusus||''} onChange={e=>d('catatan_khusus',e.target.value)} className="input w-full mt-2 min-h-20" placeholder="Catatan khusus"/>
      <textarea value={detail.catatan_sekolah_luar||''} onChange={e=>d('catatan_sekolah_luar',e.target.value)} className="input w-full mt-2 min-h-20" placeholder="Catatan sekolah luar (untuk anak care)"/>
      <div className="flex flex-wrap gap-2 mt-2"><button onClick={save} className="btn">Simpan Profil</button><button onClick={nfc} className="btn-secondary">Reissue NFC</button></div>
      {detail.nfc_token&&<div className="mt-2 text-xs text-slate-500">NFC aktif: <span className="font-black text-slate-700">{detail.nfc_token}</span></div>}
    </div>
    <div>
      <div className="font-black text-slate-800 mb-2">Pindah Cabang/Rombel</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {user.role==='admin'&&<select value={move.cabang_id} onChange={e=>setMove(x=>({...x,cabang_id:e.target.value,rombel_id:''}))} className="input"><option value="">Cabang</option>{m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}</select>}
        <select value={move.jenjang_id} onChange={e=>setMove(x=>({...x,jenjang_id:e.target.value,rombel_id:''}))} className="input"><option value="">Jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</select>
        <select value={move.rombel_id} onChange={e=>setMove(x=>({...x,rombel_id:e.target.value}))} className="input"><option value="">Rombel tujuan</option>{moveRombel.map(r=><option key={r.id} value={r.id}>{r.cabang_nama} - {r.nama}</option>)}</select>
        <select value={move.paket} onChange={e=>setMove(x=>({...x,paket:e.target.value}))} className="input"><option value="reguler">Reguler</option><option value="full_day">Full day</option><option value="care">Care</option></select>
        <Input placeholder="Tanggal mulai" value={move.tanggal_mulai} onChange={v=>setMove(x=>({...x,tanggal_mulai:v}))}/>
        <Input placeholder="Alasan" value={move.alasan} onChange={v=>setMove(x=>({...x,alasan:v}))}/>
      </div>
      <button onClick={pindah} className="btn mt-2">Pindahkan</button>
    </div>
    <div>
      <div className="font-black text-slate-800 mb-2">Penjemput</div>
      <div className="space-y-2 mb-3">{(detail.penjemput||[]).map(p=><div key={p.id} className="bg-white border border-slate-200 rounded-lg p-3 text-sm"><div className="font-black text-slate-800">{p.nama} <span className="text-xs text-slate-400">({p.relasi||'-'})</span></div><div className="text-slate-500">{p.no_wa||'-'} - QR: {p.qr_code}</div></div>)}{(!detail.penjemput||detail.penjemput.length===0)&&<div className="text-sm text-slate-400">Belum ada penjemput.</div>}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Input placeholder="Nama penjemput" value={pickup.nama} onChange={v=>setPickup(x=>({...x,nama:v}))}/>
        <Input placeholder="No WA" value={pickup.no_wa} onChange={v=>setPickup(x=>({...x,no_wa:v}))}/>
        <Input placeholder="Relasi" value={pickup.relasi} onChange={v=>setPickup(x=>({...x,relasi:v}))}/>
        <Input placeholder="Catatan" value={pickup.catatan} onChange={v=>setPickup(x=>({...x,catatan:v}))}/>
      </div>
      <button onClick={addPickup} className="btn-secondary mt-2">Tambah Penjemput</button>
    </div>
    <div>
      <div className="font-black text-slate-800 mb-2">Riwayat Tagihan</div>
      {tagihanSiswa===null?<div className="text-sm text-slate-400">Memuat...</div>:
      tagihanSiswa.length===0?<div className="text-sm text-slate-400">Belum ada tagihan.</div>:
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Cabang</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenis</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Periode</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Final</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Terbayar</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{tagihanSiswa.map(t=><tr key={t.id}><td className="py-2 px-3 text-slate-700">{t.cabang_nama}</td><td className="py-2 px-3 text-slate-700">{t.nama}</td><td className="py-2 px-3 text-slate-700">{t.periode||'-'}</td><td className="py-2 px-3 text-slate-700">{money(t.nominal_final)}</td><td className="py-2 px-3 text-slate-700">{money(t.paid_amount)}</td><td className="py-2 px-3 text-slate-700">{t.status}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}

function StaffTab({user,toast}){
  const m=useMaster(user);const[list,setList]=useState([]);const[form,setForm]=useState({display_name:'',username:'',role:'guru'});
  const[edit,setEdit]=useState(null);const[tempPw,setTempPw]=useState(null);
  async function load(){setList(await api.staff(m.cabangId));}
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[m.cabangId]);
  async function add(){try{const r=await api.createStaff({...form,cabang_id:m.cabangId});setTempPw(r.temporary_password);setForm({display_name:'',username:'',role:'guru'});load();}catch(e){toast('err',e.message);}}
  async function reset(id){try{const r=await api.resetPassword(id);setTempPw(r.temporary_password);}catch(e){toast('err',e.message);}}
  async function setStatus(s,status){try{await api.updateStaff(s.id,{display_name:s.display_name,role:s.role,cabang_id:s.cabang_id,status});toast('ok',status==='nonaktif'?'Staff dinonaktifkan':'Staff diaktifkan');load();}catch(e){toast('err',e.message);}}
  async function saveEdit(){try{await api.updateStaff(edit.id,edit);toast('ok','Staff diperbarui');setEdit(null);load();}catch(e){toast('err',e.message);}}
  const roles=user.role==='admin'?['admin','admin_cabang','kepsek','guru','gerbang']:['guru','gerbang'];
  return <Panel title="Staff" right={<CabangFilter user={user} {...m}/>}>
    <div className="grid sm:grid-cols-5 gap-2 mb-4">
      <Input placeholder="Nama" value={form.display_name} onChange={v=>setForm(f=>({...f,display_name:v}))}/>
      <Input placeholder="Username" value={form.username} onChange={v=>setForm(f=>({...f,username:v}))}/>
      <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="input">{roles.map(r=><option key={r}>{r}</option>)}</select>
      <button onClick={add} className="btn">Tambah Staff</button>
    </div>
    <Table headers={['Nama','Username','Role','Cabang','Status','Aksi']}>{list.map(s=><tr key={s.id}><Td>{s.display_name}</Td><Td>{s.username}</Td><Td>{s.role}</Td><Td>{s.cabang_nama||'Pusat'}</Td><Td>{s.status}</Td><Td><div className="flex gap-2"><button onClick={()=>setEdit(s)} className="link">Edit</button><button onClick={()=>reset(s.id)} className="link">Reset</button>{s.status==='nonaktif'?<button onClick={()=>setStatus(s,'aktif')} className="link">Aktifkan</button>:<button onClick={()=>setStatus(s,'nonaktif')} className="link text-red-600">Nonaktifkan</button>}</div></Td></tr>)}</Table>
    {edit&&<div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
      <div className="font-black text-slate-800 mb-3">Edit Staff</div>
      <div className="flex items-center gap-4 mb-3"><FotoUpload url={edit.foto} onUpload={async file=>{const r=await api.uploadStaffFoto(edit.id,file);setEdit(e=>({...e,foto:r.url}));toast('ok','Foto diperbarui');}} onDelete={async()=>{await api.deleteStaffFoto(edit.id);setEdit(e=>({...e,foto:null}));toast('ok','Foto dihapus');}}/></div>
      <div className="grid sm:grid-cols-5 gap-2">
        <Input placeholder="Nama" value={edit.display_name||''} onChange={v=>setEdit(e=>({...e,display_name:v}))}/>
        <select value={edit.role} onChange={e=>setEdit(x=>({...x,role:e.target.value,cabang_id:e.target.value==='admin'?'':x.cabang_id}))} className="input">{roles.map(r=><option key={r}>{r}</option>)}</select>
        {user.role==='admin'&&<select value={edit.cabang_id||''} onChange={e=>setEdit(x=>({...x,cabang_id:e.target.value}))} className="input"><option value="">Pusat</option>{m.cabang.map(c=><option key={c.id} value={c.id}>{c.nama}</option>)}</select>}
        <select value={edit.status} onChange={e=>setEdit(x=>({...x,status:e.target.value}))} className="input"><option value="undangan">undangan</option><option value="aktif">aktif</option><option value="nonaktif">nonaktif</option></select>
        <div className="flex gap-2"><button onClick={saveEdit} className="btn">Simpan</button><button onClick={()=>setEdit(null)} className="btn-secondary">Batal</button></div>
      </div>
    </div>}
    {tempPw&&<Modal title="Password Sementara" onClose={()=>setTempPw(null)}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">Password sementara telah dibuat. Salin dan bagikan kepada pengguna:</div>
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
          <span className="text-2xl font-black text-slate-900 tracking-widest select-all">{tempPw}</span>
        </div>
        <button onClick={()=>{navigator.clipboard.writeText(tempPw);toast('ok','Password disalin ke clipboard');}} className="btn w-full">Salin Password</button>
        <div className="text-xs text-slate-400">Password ini hanya ditampilkan sekali. Tutup dialog untuk menghapusnya.</div>
      </div>
    </Modal>}
  </Panel>;
}

function WaliTab({user,toast}){
  const m=useMaster(user);const[siswa,setSiswa]=useState([]);const[wali,setWali]=useState([]);const[form,setForm]=useState({display_name:'',no_wa:'',siswa_id:'',relasi:''});
  const[tempPw,setTempPw]=useState(null);const[editing,setEditing]=useState(null);
  async function load(){setSiswa(await api.siswa({cabang_id:m.cabangId,status:'semua'}));setWali(await api.wali(m.cabangId));}
  useEffect(()=>{if(m.cabangId||user.role!=='admin')load().catch(e=>toast('err',e.message));},[m.cabangId]);
  async function add(){try{const r=await api.createWali(form);if(r.temporary_password){setTempPw(r.temporary_password);}else{toast('ok','Akun wali yang sudah ada dikaitkan ke siswa');}setForm({display_name:'',no_wa:'',siswa_id:'',relasi:''});load();}catch(e){toast('err',e.message);}}
  async function reset(id){try{const r=await api.resetPassword(id);setTempPw(r.temporary_password);}catch(e){toast('err',e.message);}}
  async function setStatus(w,status){try{await api.updateWali(w.id,{display_name:w.display_name,no_wa:w.no_wa,status});toast('ok',status==='nonaktif'?'Akun wali dinonaktifkan':'Akun wali diaktifkan');load();}catch(e){toast('err',e.message);}}
  async function saveEdit(){try{await api.updateWali(editing.id,{display_name:editing.display_name,no_wa:editing.no_wa,status:editing.status});toast('ok','Akun wali diperbarui');setEditing(null);load();}catch(e){toast('err',e.message);}}
  return <Panel title="Akun Wali" right={<CabangFilter user={user} {...m}/>}>
    <div className="grid sm:grid-cols-5 gap-2 mb-4">
      <Input placeholder="Nama wali" value={form.display_name} onChange={v=>setForm(f=>({...f,display_name:v}))}/>
      <Input placeholder="Nomor WA" value={form.no_wa} onChange={v=>setForm(f=>({...f,no_wa:v}))}/>
      <select value={form.siswa_id} onChange={e=>setForm(f=>({...f,siswa_id:e.target.value}))} className="input"><option value="">Pilih siswa</option>{siswa.map(s=><option key={s.id} value={s.id}>{s.nama}</option>)}</select>
      <Input placeholder="Relasi" value={form.relasi} onChange={v=>setForm(f=>({...f,relasi:v}))}/>
      <button onClick={add} className="btn">Tambah Wali</button>
    </div>
    <Table headers={['Nama','WA','Siswa','Status','Aksi']}>{wali.map(w=><tr key={w.id}><Td>{w.display_name}</Td><Td>{w.no_wa}</Td><Td>{w.siswa_nama||'-'}</Td><Td>{w.status}</Td><Td><div className="flex gap-2"><button onClick={()=>setEditing(w)} className="link">Edit</button><button onClick={()=>reset(w.id)} className="link">Reset</button>{w.status==='nonaktif'?<button onClick={()=>setStatus(w,'aktif')} className="link">Aktifkan</button>:<button onClick={()=>setStatus(w,'nonaktif')} className="link text-red-600">Nonaktifkan</button>}</div></Td></tr>)}</Table>
    {editing&&<Modal title="Edit Akun Wali" onClose={()=>setEditing(null)}>
      <div className="space-y-4">
        <Input placeholder="Nama wali" value={editing.display_name||''} onChange={v=>setEditing(e=>({...e,display_name:v}))}/>
        <Input placeholder="Nomor WA" value={editing.no_wa||''} onChange={v=>setEditing(e=>({...e,no_wa:v}))}/>
        <div className="flex gap-2"><button onClick={saveEdit} className="btn">Simpan</button><button onClick={()=>setEditing(null)} className="btn-secondary">Batal</button></div>
      </div>
    </Modal>}
    {tempPw&&<Modal title="Password Sementara" onClose={()=>setTempPw(null)}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">Password sementara telah dibuat. Salin dan bagikan kepada pengguna:</div>
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
          <span className="text-2xl font-black text-slate-900 tracking-widest select-all">{tempPw}</span>
        </div>
        <button onClick={()=>{navigator.clipboard.writeText(tempPw);toast('ok','Password disalin ke clipboard');}} className="btn w-full">Salin Password</button>
        <div className="text-xs text-slate-400">Password ini hanya ditampilkan sekali. Tutup dialog untuk menghapusnya.</div>
      </div>
    </Modal>}
  </Panel>;
}

function RombelTab({user,toast}){
  const m=useMaster(user);const[form,setForm]=useState({nama:'',jenjang_id:''});const[staff,setStaff]=useState([]);const[assign,setAssign]=useState({});
  useEffect(()=>{if(m.cabangId||user.role!=='admin')api.staff(m.cabangId).then(setStaff).catch(e=>toast('err',e.message));},[m.cabangId]);
  async function add(){try{await api.createRombel({...form,cabang_id:m.cabangId,jenjang_id:Number(form.jenjang_id)});toast('ok','Rombel dibuat');setForm({nama:'',jenjang_id:''});m.load();}catch(e){toast('err',e.message);}}
  async function assignGuru(r){const a=assign[r.id]||{};if(!a.pengguna_id)return toast('err','Pilih guru dulu');try{await api.assignGuruRombel(r.id,{pengguna_id:Number(a.pengguna_id),role:a.role||'bantu'});toast('ok','Guru ditugaskan');setAssign(p=>({...p,[r.id]:{pengguna_id:'',role:'bantu'}}));m.load();}catch(e){toast('err',e.message);}}
  async function removeGuru(r,g){try{await api.removeGuruRombel(r.id,g.id);toast('ok','Guru dilepas');m.load();}catch(e){toast('err',e.message);}}
  const gurus=staff.filter(s=>s.role==='guru'&&s.status!=='nonaktif');
  return <Panel title="Rombel" right={<CabangFilter user={user} {...m}/>}>
    <div className="grid sm:grid-cols-4 gap-2 mb-4">
      <Input placeholder="Nama rombel" value={form.nama} onChange={v=>setForm(f=>({...f,nama:v}))}/>
      <select value={form.jenjang_id} onChange={e=>setForm(f=>({...f,jenjang_id:e.target.value}))} className="input"><option value="">Jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</select>
      <button onClick={add} className="btn">Tambah Rombel</button>
    </div>
    <div className="grid lg:grid-cols-2 gap-3">{m.rombel.map(r=><div key={r.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
      <div className="flex justify-between gap-3"><div><div className="font-black text-slate-900">{r.nama}</div><div className="text-sm text-slate-500">{r.cabang_nama} - {r.jenjang_nama}</div></div><span className="text-xs font-black text-slate-400">{r.aktif?'aktif':'nonaktif'}</span></div>
      <div className="mt-3 space-y-2">{(r.gurus||[]).map(g=><div key={g.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-700">{g.display_name} <span className="text-xs text-slate-400">({g.role})</span></span><button onClick={()=>removeGuru(r,g)} className="link text-red-600">Lepas</button></div>)}{(!r.gurus||r.gurus.length===0)&&<div className="text-sm text-slate-400">Belum ada guru.</div>}</div>
      <div className="mt-3 grid sm:grid-cols-[1fr_auto_auto] gap-2">
        <select value={(assign[r.id]||{}).pengguna_id||''} onChange={e=>setAssign(p=>({...p,[r.id]:{...(p[r.id]||{}),pengguna_id:e.target.value}}))} className="input"><option value="">Pilih guru</option>{gurus.filter(g=>!(r.gurus||[]).some(x=>x.id===g.id)).map(g=><option key={g.id} value={g.id}>{g.display_name}</option>)}</select>
        <select value={(assign[r.id]||{}).role||'bantu'} onChange={e=>setAssign(p=>({...p,[r.id]:{...(p[r.id]||{}),role:e.target.value}}))} className="input"><option value="bantu">Bantu</option><option value="utama">Utama</option></select>
        <button onClick={()=>assignGuru(r)} className="btn">Assign</button>
      </div>
    </div>)}</div>
  </Panel>;
}

function BillingTab({user,toast}){
  const m=useMaster(user);const[tarif,setTarif]=useState([]);const[tagihan,setTagihan]=useState([]);const[pembayaran,setPembayaran]=useState([]);const[invoices,setInvoices]=useState([]);const[siswa,setSiswa]=useState([]);const[selectedBills,setSelectedBills]=useState([]);
  const[preview,setPreview]=useState(null);
  const[alokasiPreview,setAlokasiPreview]=useState(null);
  const[alokasiEdit,setAlokasiEdit]=useState(null);
  const[confirmAction,setConfirmAction]=useState(null);
  const[form,setForm]=useState({tahun_ajaran:'2026/2027',jenis:'spp',nama:'SPP',nominal:'',diskon_tipe:'nominal',diskon_nilai:''});
  async function load(){setTarif(await api.tarif({cabang_id:m.cabangId,tahun_ajaran:form.tahun_ajaran}));setTagihan(await api.tagihan({cabang_id:m.cabangId}));setPembayaran(await api.pembayaran({cabang_id:m.cabangId}));setInvoices(await api.invoice({cabang_id:m.cabangId}));setSiswa(await api.siswa({cabang_id:m.cabangId,status:'semua'}));}
  useEffect(()=>{if(m.cabangId||user.role!=='admin')load().catch(e=>toast('err',e.message));},[m.cabangId,form.tahun_ajaran]);
  async function addTarif(){try{await api.createTarif({...form,cabang_id:m.cabangId,jenjang_id:Number(form.jenjang_id),nominal:Number(form.nominal)});toast('ok','Tarif tersimpan');load();}catch(e){toast('err',e.message);}}
  async function addDiskon(){try{await api.createDiskon({cabang_id:m.cabangId,siswa_id:Number(form.diskon_siswa_id),tahun_ajaran:form.tahun_ajaran,jenis:form.diskon_jenis||'spp',tipe:form.diskon_tipe,nilai:Number(form.diskon_nilai),catatan:form.diskon_catatan});toast('ok','Diskon tersimpan');load();}catch(e){toast('err',e.message);}}
  async function previewBulanan(){try{const r=await api.generateBulananPreview({cabang_id:m.cabangId,periode:form.periode||'2026-07'});setPreview({...r,kind:'bulanan'});}catch(e){toast('err',e.message);}}
  async function previewKegiatan(){try{const r=await api.generateKegiatanPreview({cabang_id:m.cabangId,tahun_ajaran:form.tahun_ajaran});setPreview({...r,kind:'kegiatan'});}catch(e){toast('err',e.message);}}
  async function confirmGenerate(){try{if(preview.kind==='bulanan'){const r=await api.generateBulanan({cabang_id:m.cabangId,periode:preview.period});toast('ok',r.created_count+' tagihan dibuat');}else{const r=await api.generateKegiatan({cabang_id:m.cabangId,tahun_ajaran:preview.tahun_ajaran});toast('ok',r.created_count+' tagihan kegiatan dibuat');}setPreview(null);load();}catch(e){toast('err',e.message);}}
  async function previewPay(){if(!form.pay_siswa_id||!form.pay_nominal)return toast('err','Pilih siswa dan nominal dulu');try{const r=await api.previewAlokasi({cabang_id:m.cabangId,siswa_id:form.pay_siswa_id,nominal:Number(form.pay_nominal)});setAlokasiPreview(r);}catch(e){toast('err',e.message);}}
  async function pay(){try{const alokasi=alokasiPreview?.allocations?.map(a=>({tagihan_id:a.tagihan_id,nominal:a.allocated}))||undefined;const r=await api.createPembayaran({cabang_id:m.cabangId,siswa_id:Number(form.pay_siswa_id),nominal:Number(form.pay_nominal),metode:form.pay_metode||'tunai',tanggal_bayar:form.pay_tanggal||new Date().toISOString().slice(0,10),reference:form.pay_ref,alokasi});toast('ok','Pembayaran: '+(r.receipt_no||r.status));setAlokasiPreview(null);load();}catch(e){toast('err',e.message);}}
  async function editAlokasi(p){try{const allocs=await api.pembayaran({cabang_id:m.cabangId});const payment=allocs.find(x=>x.id===p.id);const bills=tagihan.filter(t=>t.siswa_id===p.siswa_id&&t.status!=='void');setAlokasiEdit({payment,bills});}catch(e){toast('err',e.message);}}
  async function saveAlokasi(){try{const alokasi=alokasiEdit.bills.filter(b=>b._alloc>0).map(b=>({tagihan_id:b.id,nominal:b._alloc}));await api.updateAlokasi(alokasiEdit.payment.id,{alokasi});toast('ok','Alokasi diperbarui');setAlokasiEdit(null);load();}catch(e){toast('err',e.message);}}
  async function correctBill(t){setConfirmAction({title:'Koreksi Tagihan',fields:[{label:'Nominal final baru',key:'nominal',value:String(t.nominal_final)},{label:'Alasan koreksi',key:'reason',value:''}],onSubmit:async(v)=>{try{await api.correctTagihan(t.id,{nominal_final:Number(v.nominal),reason:v.reason});toast('ok','Tagihan dikoreksi');load();}catch(e){toast('err',e.message);}setConfirmAction(null);}});}
  async function voidBill(t){setConfirmAction({title:'Void Tagihan',fields:[{label:'Alasan void',key:'reason',value:''}],onSubmit:async(v)=>{try{await api.voidTagihan(t.id,v.reason);toast('ok','Tagihan void');load();}catch(e){toast('err',e.message);}setConfirmAction(null);}});}
  async function verify(p){try{const r=await api.verifyPembayaran(p.id);toast('ok','Terverifikasi: '+r.receipt_no);load();}catch(e){toast('err',e.message);}}
  async function reject(p){setConfirmAction({title:'Tolak Pembayaran',fields:[{label:'Alasan penolakan',key:'reason',value:''}],onSubmit:async(v)=>{try{await api.rejectPembayaran(p.id,v.reason);toast('ok','Pembayaran ditolak');load();}catch(e){toast('err',e.message);}setConfirmAction(null);}});}
  async function voidPay(p){setConfirmAction({title:'Void Pembayaran',fields:[{label:'Alasan void',key:'reason',value:''}],onSubmit:async(v)=>{try{await api.voidPembayaran(p.id,v.reason);toast('ok','Pembayaran void');load();}catch(e){toast('err',e.message);}setConfirmAction(null);}});}
  async function invoice(){try{const r=await api.createInvoice(selectedBills);toast('ok','Invoice dibuat: '+r.invoice_no);setSelectedBills([]);load();}catch(e){toast('err',e.message);}}
  async function openPdf(kind,id){try{const b=kind==='invoice'?await api.invoicePdf(id):await api.receiptPdf(id);const url=URL.createObjectURL(b);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){toast('err',e.message);}}
  function toggleBill(id){setSelectedBills(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);}
  const newItems=preview?preview.preview.filter(p=>!p.already_exists):[];
  const existingItems=preview?preview.preview.filter(p=>p.already_exists):[];
  return <Panel title="Billing" right={<CabangFilter user={user} {...m}/>}>
    {user.role==='admin'&&<div className="grid sm:grid-cols-7 gap-2 mb-4">
      <Input placeholder="Tahun ajaran" value={form.tahun_ajaran} onChange={v=>setForm(f=>({...f,tahun_ajaran:v}))}/>
      <select value={form.jenjang_id||''} onChange={e=>setForm(f=>({...f,jenjang_id:e.target.value}))} className="input"><option value="">Jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</select>
      <select value={form.jenis} onChange={e=>setForm(f=>({...f,jenis:e.target.value,nama:e.target.value.toUpperCase()}))} className="input">{['spp','full_day','care','kegiatan'].map(x=><option key={x}>{x}</option>)}</select>
      <Input placeholder="Nama tarif" value={form.nama} onChange={v=>setForm(f=>({...f,nama:v}))}/>
      <Input placeholder="Nominal" value={form.nominal} onChange={v=>setForm(f=>({...f,nominal:v}))}/>
      <button onClick={addTarif} className="btn">Simpan Tarif</button>
    </div>}
    <div className="flex flex-wrap gap-2 mb-4">
      <Input placeholder="Periode 2026-07" value={form.periode||''} onChange={v=>setForm(f=>({...f,periode:v}))}/>
      <button onClick={previewBulanan} className="btn">Generate Bulanan</button>
      <button onClick={previewKegiatan} className="btn-secondary">Generate Kegiatan</button>
      <button onClick={invoice} disabled={!selectedBills.length} className="btn-secondary">Buat Invoice ({selectedBills.length})</button>
    </div>
    {preview&&<Modal title={`Preview Generate ${preview.kind==='bulanan'?'Bulanan':'Kegiatan'}`} onClose={()=>setPreview(null)}>
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
          <div className="font-black text-slate-800">Tagihan baru ({newItems.length})</div>
          <div className="overflow-x-auto max-h-64"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenis</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenjang</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Paket</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Awal</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Diskon</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Final</th></tr></thead><tbody className="divide-y divide-slate-100">{newItems.map((p,i)=><tr key={i}><td className="py-2 px-3 text-slate-700">{p.siswa_nama}</td><td className="py-2 px-3 text-slate-700">{p.nama}</td><td className="py-2 px-3 text-slate-700">{p.jenjang_nama}</td><td className="py-2 px-3 text-slate-700">{p.paket}</td><td className="py-2 px-3 text-slate-700">{money(p.nominal_awal)}</td><td className="py-2 px-3 text-slate-700">{money(p.diskon_amount)}</td><td className="py-2 px-3 text-slate-700 font-black">{money(p.nominal_final)}</td></tr>)}</tbody></table></div>
        </>}
        {existingItems.length>0&&<div className="text-sm text-amber-600">⚠ {existingItems.length} tagihan sudah ada dan akan dilewati.</div>}
        {newItems.length===0&&existingItems.length===0&&<div className="text-sm text-slate-400">Tidak ada tagihan yang akan dibuat.</div>}
        <div className="flex gap-2">
          <button onClick={confirmGenerate} disabled={newItems.length===0} className="btn">Konfirmasi Generate</button>
          <button onClick={()=>setPreview(null)} className="btn-secondary">Batal</button>
        </div>
      </div>
    </Modal>}
    <div className="grid lg:grid-cols-2 gap-3 mb-6">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div className="font-black text-slate-800 mb-2">Diskon/Keringanan</div>
        <div className="grid sm:grid-cols-3 gap-2">
          <select value={form.diskon_siswa_id||''} onChange={e=>setForm(f=>({...f,diskon_siswa_id:e.target.value}))} className="input"><option value="">Siswa</option>{siswa.map(s=><option key={s.id} value={s.id}>{s.nama}</option>)}</select>
          <select value={form.diskon_jenis||'spp'} onChange={e=>setForm(f=>({...f,diskon_jenis:e.target.value}))} className="input">{['spp','full_day','care','kegiatan'].map(x=><option key={x}>{x}</option>)}</select>
          <select value={form.diskon_tipe} onChange={e=>setForm(f=>({...f,diskon_tipe:e.target.value}))} className="input"><option value="nominal">Nominal</option><option value="persen">Persen</option></select>
          <Input placeholder="Nilai" value={form.diskon_nilai||''} onChange={v=>setForm(f=>({...f,diskon_nilai:v}))}/>
          <Input placeholder="Catatan" value={form.diskon_catatan||''} onChange={v=>setForm(f=>({...f,diskon_catatan:v}))}/>
          <button onClick={addDiskon} className="btn">Simpan Diskon</button>
        </div>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div className="font-black text-slate-800 mb-2">Input Pembayaran</div>
        <div className="grid sm:grid-cols-3 gap-2">
          <select value={form.pay_siswa_id||''} onChange={e=>setForm(f=>({...f,pay_siswa_id:e.target.value}))} className="input"><option value="">Siswa</option>{siswa.map(s=><option key={s.id} value={s.id}>{s.nama}</option>)}</select>
          <Input placeholder="Nominal" value={form.pay_nominal||''} onChange={v=>setForm(f=>({...f,pay_nominal:v}))}/>
          <select value={form.pay_metode||'tunai'} onChange={e=>setForm(f=>({...f,pay_metode:e.target.value}))} className="input">{['tunai','transfer','qris','lainnya'].map(x=><option key={x}>{x}</option>)}</select>
          <Input placeholder="Tanggal" value={form.pay_tanggal||''} onChange={v=>setForm(f=>({...f,pay_tanggal:v}))}/>
          <Input placeholder="Referensi" value={form.pay_ref||''} onChange={v=>setForm(f=>({...f,pay_ref:v}))}/>
          <div className="flex gap-2"><button onClick={previewPay} className="btn-secondary">Cek Alokasi</button><button onClick={pay} className="btn">Catat Pembayaran</button></div>
        </div>
      </div>
    </div>
    <h3 className="font-black text-slate-800 mb-2">Tarif</h3>
    <Table headers={['Jenjang','Jenis','Nama','Nominal']}>{tarif.map(t=><tr key={t.id}><Td>{t.jenjang_nama}</Td><Td>{t.jenis}</Td><Td>{t.nama}</Td><Td>{money(t.nominal)}</Td></tr>)}</Table>
    <h3 className="font-black text-slate-800 mt-6 mb-2">Tagihan</h3>
    <Table headers={['','Siswa','Jenis','Periode','Final','Terbayar','Status','Aksi']}>{tagihan.map(t=><tr key={t.id}><Td><input type="checkbox" checked={selectedBills.includes(t.id)} onChange={()=>toggleBill(t.id)} disabled={t.status==='void'}/></Td><Td>{t.siswa_nama}</Td><Td>{t.nama}</Td><Td>{t.periode}</Td><Td>{money(t.nominal_final)}</Td><Td>{money(t.paid_amount)}</Td><Td>{t.status}</Td><Td><div className="flex gap-2"><button onClick={()=>correctBill(t)} className="link">Koreksi</button><button onClick={()=>voidBill(t)} className="link text-red-600">Void</button></div></Td></tr>)}</Table>
    <h3 className="font-black text-slate-800 mt-6 mb-2">Pembayaran</h3>
    <Table headers={['Siswa','Nominal','Metode','Status','Kuitansi','Aksi']}>{pembayaran.map(p=><tr key={p.id}><Td>{p.siswa_nama}</Td><Td>{money(p.nominal)}</Td><Td>{p.metode}</Td><Td>{p.status}</Td><Td>{p.receipt_no||'-'}</Td><Td><div className="flex gap-2">{p.status==='confirmed'&&<button onClick={()=>openPdf('receipt',p.id)} className="link">PDF</button>}{p.status==='pending_verification'&&user.role==='admin'&&<><button onClick={()=>verify(p)} className="link">Verify</button><button onClick={()=>reject(p)} className="link text-red-600">Reject</button></>} {['confirmed','pending_verification'].includes(p.status)&&<button onClick={()=>editAlokasi(p)} className="link">Alokasi</button>}{['confirmed','pending_verification'].includes(p.status)&&<button onClick={()=>voidPay(p)} className="link text-red-600">Void</button>}</div></Td></tr>)}</Table>
    <h3 className="font-black text-slate-800 mt-6 mb-2">Invoice</h3>
    <Table headers={['Nomor','Siswa','Total','Status','']}>{invoices.map(i=><tr key={i.id}><Td>{i.invoice_no}</Td><Td>{i.siswa_nama}</Td><Td>{money(i.total)}</Td><Td>{i.status}</Td><Td><button onClick={()=>openPdf('invoice',i.id)} className="link">PDF</button></Td></tr>)}</Table>
    {alokasiPreview&&<Modal title="Preview Alokasi Pembayaran" onClose={()=>setAlokasiPreview(null)}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">Siswa: {siswa.find(s=>String(s.id)===String(alokasiPreview.siswa_id))?.nama||'-'} | Nominal: {money(form.pay_nominal)}</div>
        {alokasiPreview.allocations.length>0&&<>
          <div className="font-black text-slate-800">Alokasi FIFO</div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Tagihan</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Periode</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Tagihan</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Terbayar</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Sisa</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Dialokasi</th></tr></thead><tbody className="divide-y divide-slate-100">{alokasiPreview.allocations.map((a,i)=><tr key={i}><td className="py-2 px-3 text-slate-700">{a.nama}</td><td className="py-2 px-3 text-slate-700">{a.periode||'-'}</td><td className="py-2 px-3 text-slate-700">{money(a.nominal_final)}</td><td className="py-2 px-3 text-slate-700">{money(a.paid)}</td><td className="py-2 px-3 text-slate-700">{money(a.unpaid)}</td><td className="py-2 px-3 text-slate-700 font-black">{money(a.allocated)}</td></tr>)}</tbody></table></div>
        </>}
        {alokasiPreview.remaining_unallocated>0&&<div className="text-sm text-amber-600">Sisa tidak teralokasi: {money(alokasiPreview.remaining_unallocated)}</div>}
        {alokasiPreview.allocations.length===0&&<div className="text-sm text-slate-400">Tidak ada tagihan open/sebagian untuk siswa ini.</div>}
        <div className="flex gap-2"><button onClick={pay} className="btn">Konfirmasi & Catat</button><button onClick={()=>setAlokasiPreview(null)} className="btn-secondary">Batal</button></div>
      </div>
    </Modal>}
    {alokasiEdit&&<Modal title="Edit Alokasi Pembayaran" onClose={()=>setAlokasiEdit(null)}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">Siswa: {siswa.find(s=>String(s.id)===String(alokasiEdit.payment.siswa_id))?.nama||'-'} | Nominal: {money(alokasiEdit.payment.nominal)}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Tagihan</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Periode</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Final</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Status</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Alokasi</th></tr></thead><tbody className="divide-y divide-slate-100">{alokasiEdit.bills.map(b=>{const current=b._alloc!==undefined?b._alloc:0;return <tr key={b.id}><td className="py-2 px-3 text-slate-700">{b.nama}</td><td className="py-2 px-3 text-slate-700">{b.periode||'-'}</td><td className="py-2 px-3 text-slate-700">{money(b.nominal_final)}</td><td className="py-2 px-3 text-slate-700">{b.status}</td><td className="py-2 px-3"><input type="number" value={current||''} onChange={e=>setAlokasiEdit(ae=>({...ae,bills:ae.bills.map(x=>x.id===b.id?{...x,_alloc:Number(e.target.value)||0}:x)}))} className="input w-28" min="0"/></td></tr>;})}</tbody></table></div>
        <div className="flex gap-2"><button onClick={saveAlokasi} className="btn">Simpan Alokasi</button><button onClick={()=>setAlokasiEdit(null)} className="btn-secondary">Batal</button></div>
      </div>
    </Modal>}
    {confirmAction&&<Modal title={confirmAction.title} onClose={()=>setConfirmAction(null)}>
      <div className="space-y-4">
        {confirmAction.fields.map(f=><div key={f.key}><div className="label">{f.label}</div><input value={f.value} onChange={e=>setConfirmAction(ca=>({...ca,fields:ca.fields.map(x=>x.key===f.key?{...x,value:e.target.value}:x)}))} className="input w-full"/></div>)}
        <div className="flex gap-2"><button onClick={()=>confirmAction.onSubmit(Object.fromEntries(confirmAction.fields.map(f=>[f.key,f.value])))} className="btn">Konfirmasi</button><button onClick={()=>setConfirmAction(null)} className="btn-secondary">Batal</button></div>
      </div>
    </Modal>}
  </Panel>;
}

function ModulAjarTab({user,toast}){
  const m=useMaster(user);
  const today=new Date().toISOString().slice(0,10);
  const empty={id:null,title:'',week_start:today,week_end:today,jenjang_id:'',rombel_id:'',paket:'',goals:'',suggested_activities:'',suggested_domains:'',attachment_url:''};
  const[rows,setRows]=useState([]);const[form,setForm]=useState(empty);const[openForm,setOpenForm]=useState(false);const[editForm,setEditForm]=useState(null);
  const[tanggal,setTanggal]=useState(today);const[filterJenjang,setFilterJenjang]=useState('');const[filterRombel,setFilterRombel]=useState('');
  const[busy,setBusy]=useState(false);
  const parseList=v=>String(v||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean);
  const joinList=v=>Array.isArray(v)?v.join(', '):String(v||'');
  const scopedRombel=draft=>m.rombel.filter(r=>!draft.jenjang_id||String(r.jenjang_id)===String(draft.jenjang_id));
  const filteredRows=rows.filter(r=>(!filterJenjang||String(r.jenjang_id)===String(filterJenjang))&&(!filterRombel||String(r.rombel_id)===String(filterRombel)));
  async function load(){
    if(!m.cabangId&&user.role==='admin')return;
    const data=await api.modulAjar({cabang_id:m.cabangId,tanggal});
    setRows(data);
  }
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[m.cabangId,tanggal]);
  function reset(){setForm(empty);}
  function edit(row){
    setEditForm({
      id:row.id,
      title:row.title||'',
      week_start:row.week_start||today,
      week_end:row.week_end||row.week_start||today,
      jenjang_id:row.jenjang_id||'',
      rombel_id:row.rombel_id||'',
      paket:row.paket||'',
      goals:joinList(row.goals),
      suggested_activities:joinList(row.suggested_activities),
      suggested_domains:joinList(row.suggested_domains),
      attachment_url:row.attachment_url||''
    });
  }
  async function save(draft=form){
    if(!draft.title.trim()){toast('err','Judul modul wajib diisi');return;}
    if(!draft.week_start||!draft.week_end){toast('err','Periode minggu wajib diisi');return;}
    if(!m.cabangId){toast('err','Pilih cabang dulu');return;}
    const payload={
      cabang_id:m.cabangId,
      jenjang_id:draft.jenjang_id||null,
      rombel_id:draft.rombel_id||null,
      paket:draft.paket||null,
      title:draft.title.trim(),
      week_start:draft.week_start,
      week_end:draft.week_end,
      goals:parseList(draft.goals),
      suggested_activities:parseList(draft.suggested_activities),
      suggested_domains:parseList(draft.suggested_domains),
      attachment_url:draft.attachment_url.trim()||null
    };
    setBusy(true);
    try{
      if(draft.id)await api.updateModulAjar(draft.id,payload);
      else await api.createModulAjar(payload);
      toast('ok',draft.id?'Modul ajar diperbarui':'Modul ajar dibuat');
      if(draft.id)setEditForm(null);else{reset();setOpenForm(false);}
      load();
    }catch(e){toast('err',e.message);}
    finally{setBusy(false);}
  }
  const right=<div className="flex flex-col sm:flex-row gap-2 sm:items-center"><CabangFilter user={user} {...m}/><button onClick={()=>{setForm(empty);setOpenForm(true);}} className="btn">Tambah Modul Ajar</button></div>;
  return <Panel title="Modul Ajar" right={right}>
    <div className="space-y-4 min-w-0">
        <div className="grid sm:grid-cols-4 gap-2">
          <input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} className="input"/>
          <select value={filterJenjang} onChange={e=>{setFilterJenjang(e.target.value);setFilterRombel('');}} className="input"><option value="">Semua jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</select>
          <select value={filterRombel} onChange={e=>setFilterRombel(e.target.value)} className="input"><option value="">Semua rombel</option>{m.rombel.filter(r=>!filterJenjang||String(r.jenjang_id)===String(filterJenjang)).map(r=><option key={r.id} value={r.id}>{r.nama}</option>)}</select>
          <button onClick={load} className="btn-secondary">Refresh</button>
        </div>
        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-100">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr>{['Minggu','Judul','Jenjang','Rombel','Domain','Dibuat oleh',''].map((h,i)=><th key={h} className={`text-left py-2 px-3 bg-slate-50 text-slate-500 font-black ${i===6?'sticky right-0 z-10 shadow-[-8px_0_12px_-12px_rgba(15,23,42,.45)]':''}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(r=><tr key={r.id} className={editForm?.id===r.id?'bg-amber-50':'bg-white'}>
                <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{r.week_start} - {r.week_end}</td>
                <td className="py-2.5 px-3 font-black text-slate-900 min-w-56">{r.title}</td>
                <td className="py-2.5 px-3 text-slate-600">{r.jenjang_nama||'-'}</td>
                <td className="py-2.5 px-3 text-slate-600">{r.rombel_nama||'Semua rombel'}</td>
                <td className="py-2.5 px-3 text-slate-600 max-w-64">{(r.suggested_domains||[]).join(', ')||'-'}</td>
                <td className="py-2.5 px-3 text-slate-600">{r.created_by_name||'-'}</td>
                <td className="py-2.5 px-3 sticky right-0 z-10 bg-white shadow-[-8px_0_12px_-12px_rgba(15,23,42,.45)]"><button onClick={()=>edit(r)} className="link">Edit</button></td>
              </tr>)}
              {filteredRows.length===0&&<tr><td colSpan={7} className="py-8 text-center text-slate-400">Belum ada modul ajar untuk filter ini.</td></tr>}
            </tbody>
          </table>
        </div>
    </div>
    {openForm&&<Modal title="Tambah Modul Ajar" onClose={()=>setOpenForm(false)}>
      <div className="space-y-3">
        <Input placeholder="Judul modul" value={form.title} onChange={v=>setForm(f=>({...f,title:v}))}/>
        <div className="grid grid-cols-2 gap-2"><input type="date" value={form.week_start} onChange={e=>setForm(f=>({...f,week_start:e.target.value}))} className="input"/><input type="date" value={form.week_end} onChange={e=>setForm(f=>({...f,week_end:e.target.value}))} className="input"/></div>
        <select value={form.jenjang_id} onChange={e=>setForm(f=>({...f,jenjang_id:e.target.value,rombel_id:''}))} className="input w-full"><option value="">Semua jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</select>
        <select value={form.rombel_id} onChange={e=>setForm(f=>({...f,rombel_id:e.target.value}))} className="input w-full"><option value="">Semua rombel</option>{scopedRombel(form).map(r=><option key={r.id} value={r.id}>{r.nama}</option>)}</select>
        <select value={form.paket} onChange={e=>setForm(f=>({...f,paket:e.target.value}))} className="input w-full"><option value="">Semua paket</option><option value="reguler">Reguler</option><option value="full_day">Full day</option><option value="care">Care</option></select>
        <Textarea label="Tujuan pembelajaran" value={form.goals} onChange={v=>setForm(f=>({...f,goals:v}))} placeholder="Pisahkan dengan koma atau baris baru"/>
        <Textarea label="Aktivitas yang disarankan" value={form.suggested_activities} onChange={v=>setForm(f=>({...f,suggested_activities:v}))} placeholder="Circle time, Kolase daun"/>
        <Textarea label="Domain observasi" value={form.suggested_domains} onChange={v=>setForm(f=>({...f,suggested_domains:v}))} placeholder="Literasi, Numerasi, Sosial Emosional"/>
        <Input placeholder="Link/lampiran dokumen opsional" value={form.attachment_url} onChange={v=>setForm(f=>({...f,attachment_url:v}))}/>
        <div className="flex gap-2"><button onClick={()=>save(form)} disabled={busy} className="btn">{busy?'Menyimpan...':'Tambah Modul Ajar'}</button><button onClick={()=>setOpenForm(false)} className="btn-secondary">Batal</button></div>
      </div>
    </Modal>}
    {editForm&&<Modal title="Edit Modul Ajar" onClose={()=>setEditForm(null)}>
      <div className="space-y-3">
        <Input placeholder="Judul modul" value={editForm.title} onChange={v=>setEditForm(f=>({...f,title:v}))}/>
        <div className="grid grid-cols-2 gap-2"><input type="date" value={editForm.week_start} onChange={e=>setEditForm(f=>({...f,week_start:e.target.value}))} className="input"/><input type="date" value={editForm.week_end} onChange={e=>setEditForm(f=>({...f,week_end:e.target.value}))} className="input"/></div>
        <select value={editForm.jenjang_id} onChange={e=>setEditForm(f=>({...f,jenjang_id:e.target.value,rombel_id:''}))} className="input w-full"><option value="">Semua jenjang</option>{m.jenjang.map(j=><option key={j.id} value={j.id}>{j.nama}</option>)}</select>
        <select value={editForm.rombel_id} onChange={e=>setEditForm(f=>({...f,rombel_id:e.target.value}))} className="input w-full"><option value="">Semua rombel</option>{scopedRombel(editForm).map(r=><option key={r.id} value={r.id}>{r.nama}</option>)}</select>
        <select value={editForm.paket} onChange={e=>setEditForm(f=>({...f,paket:e.target.value}))} className="input w-full"><option value="">Semua paket</option><option value="reguler">Reguler</option><option value="full_day">Full day</option><option value="care">Care</option></select>
        <Textarea label="Tujuan pembelajaran" value={editForm.goals} onChange={v=>setEditForm(f=>({...f,goals:v}))} placeholder="Pisahkan dengan koma atau baris baru"/>
        <Textarea label="Aktivitas yang disarankan" value={editForm.suggested_activities} onChange={v=>setEditForm(f=>({...f,suggested_activities:v}))} placeholder="Circle time, Kolase daun"/>
        <Textarea label="Domain observasi" value={editForm.suggested_domains} onChange={v=>setEditForm(f=>({...f,suggested_domains:v}))} placeholder="Literasi, Numerasi, Sosial Emosional"/>
        <Input placeholder="Link/lampiran dokumen opsional" value={editForm.attachment_url} onChange={v=>setEditForm(f=>({...f,attachment_url:v}))}/>
        <div className="flex gap-2"><button onClick={()=>save(editForm)} disabled={busy} className="btn">{busy?'Menyimpan...':'Simpan Perubahan'}</button><button onClick={()=>setEditForm(null)} className="btn-secondary">Batal</button></div>
      </div>
    </Modal>}
  </Panel>;
}

function LaporanTab({user,toast}){
  const m=useMaster(user);const[rows,setRows]=useState([]);const[tanggal,setTanggal]=useState('');
  const[rombelId,setRombelId]=useState('');const[detail,setDetail]=useState(null);const[edits,setEdits]=useState(null);
  async function load(){try{const r=await api.dailyAdminHistory({cabang_id:m.cabangId,tanggal:tanggal||undefined,rombel_id:rombelId||undefined,limit:150});setRows(r);}catch(e){toast('err',e.message);}}
  useEffect(()=>{if(m.cabangId||user.role==='admin')load();},[m.cabangId,tanggal,rombelId]);
  async function open(r){setDetail(r);if(r.id)api.dailyEdits(r.id).then(setEdits).catch(()=>setEdits([]));}
  async function saveEdit(){try{await api.saveDaily({siswa_id:detail.siswa_id,tanggal:detail.tanggal,mood:detail.mood,makan:detail.makan,tidur:detail.tidur,aktivitas:detail.aktivitas,catatan:detail.catatan,focus_theme_id:detail.focus_theme_id,observation_domain:detail.observation_domain,observation_note:detail.observation_note,parent_note:detail.parent_note,structured_observation:detail.structured_observation});toast('ok','Laporan dikoreksi');setDetail(null);load();}catch(e){toast('err',e.message);}}
  const completeness=()=>{if(!detail)return 0;let s=0;if(detail.focus_theme_id)s++;if(detail.mood)s++;if(detail.makan)s++;if(detail.tidur!==null&&detail.tidur!==undefined)s++;if(detail.observation_domain)s++;if(String(detail.observation_note||'').trim().length>=12)s++;return Math.round(s/6*100);};
  return <Panel title="Histori & Koreksi Laporan Harian" right={<CabangFilter user={user} {...m}/>}>
    <div className="flex flex-wrap gap-2 mb-4">
      <input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} className="input"/>
      <select value={rombelId} onChange={e=>setRombelId(e.target.value)} className="input"><option value="">Semua rombel</option>{m.rombel.map(r=><option key={r.id} value={r.id}>{r.nama}</option>)}</select>
      <button onClick={load} className="btn-secondary">Refresh</button>
    </div>
    <div className="space-y-4">
      <div className="overflow-x-auto max-w-full"><table className="w-full text-sm"><thead><tr><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Tanggal</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Rombel</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Status</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Guru</th><th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black sticky right-0 z-10 shadow-[-8px_0_12px_-12px_rgba(15,23,42,.45)]"></th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(r=><tr key={r.id} className={detail?.id===r.id?'bg-amber-50':''}><td className="py-2 px-3 text-slate-700">{r.tanggal}</td><td className="py-2 px-3 font-bold text-slate-800">{r.siswa_nama}</td><td className="py-2 px-3 text-slate-600">{r.rombel_nama}</td><td className="py-2 px-3"><span className={`text-xs font-black px-2 py-0.5 rounded-full ${r.status==='published'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{r.status||'draft'}</span></td><td className="py-2 px-3 text-slate-600">{r.guru_nama||'-'}</td><td className="py-2 px-3 sticky right-0 z-10 bg-white shadow-[-8px_0_12px_-12px_rgba(15,23,42,.45)]"><button onClick={()=>open(r)} className="link">Lihat/Edit</button></td></tr>)}</tbody></table></div>
      {detail&&<Modal title={`Koreksi Laporan - ${detail.siswa_nama}`} onClose={()=>{setDetail(null);setEdits(null);}}>
      <div className="space-y-3">
        <div className="text-sm text-slate-500">{detail.tanggal} - {detail.rombel_nama}</div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="label">Focus Theme</div>
          <div className="font-black text-slate-900">{detail.focus_theme_title||'-'}</div>
          {detail.modul_ajar_title&&<div className="text-xs text-slate-500 mt-1">Modul: {detail.modul_ajar_title}</div>}
          {detail.focus_theme_activity_summary&&<div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{detail.focus_theme_activity_summary}</div>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={detail.mood||''} onChange={e=>setDetail(d=>({...d,mood:e.target.value||null}))} className="input"><option value="">Mood</option><option value="ceria">😊 Ceria</option><option value="biasa">😐 Biasa</option><option value="rewel">😢 Rewel</option></select>
          <select value={detail.makan||''} onChange={e=>setDetail(d=>({...d,makan:e.target.value||null}))} className="input"><option value="">Makan</option><option value="habis">🍽️ Habis</option><option value="setengah">🍱 Setengah</option><option value="tidak">❌ Tidak</option></select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={detail.tidur===1} onChange={e=>setDetail(d=>({...d,tidur:e.target.checked?1:0}))}/> Tidur siang</label>
        <div><div className="label">Domain observasi</div><input value={detail.observation_domain||''} onChange={e=>setDetail(d=>({...d,observation_domain:e.target.value}))} className="input w-full" placeholder="Mis. Literasi, Numerasi, Sosial Emosional"/></div>
        <textarea value={detail.observation_note||''} onChange={e=>setDetail(d=>({...d,observation_note:e.target.value}))} className="input w-full min-h-24" placeholder="Catatan observasi objektif"/>
        <div><div className="label">Aktivitas</div><div className="flex flex-wrap gap-1">{[...'Mewarnai,Bernyanyi & Menari,Bermain Bebas,Membaca & Menulis,Motorik Halus,Motorik Kasar,Ibadah / Doa,Seni & Kerajinan,Bercerita,Bermain Peran'.split(',')].map(a=><button key={a} onClick={()=>setDetail(d=>({...d,aktivitas:(d.aktivitas||[]).includes(a)?(d.aktivitas||[]).filter(x=>x!==a):[...(d.aktivitas||[]),a]}))} className={`text-xs px-2 py-1 rounded-lg border ${(detail.aktivitas||[]).includes(a)?'bg-amber-100 border-amber-300 text-amber-800':'bg-white border-slate-200 text-slate-600'}`}>{a}</button>)}</div></div>
        <textarea value={detail.catatan||''} onChange={e=>setDetail(d=>({...d,catatan:e.target.value}))} className="input w-full min-h-20" placeholder="Catatan"/>
        <textarea value={detail.parent_note||''} onChange={e=>setDetail(d=>({...d,parent_note:e.target.value}))} className="input w-full min-h-20" placeholder="Catatan untuk wali"/>
        <div className="text-xs text-slate-400">Kelengkapan: {completeness()}%</div>
        <div className="flex gap-2"><button onClick={saveEdit} className="btn">Simpan Koreksi</button><button onClick={()=>{setDetail(null);setEdits(null);}} className="btn-secondary">Batal</button></div>
        {edits&&edits.length>0&&<div className="border-t border-slate-200 pt-3"><div className="text-xs font-black text-slate-500 mb-2">Riwayat Edit</div><div className="space-y-1">{edits.slice(0,10).map((e,i)=><div key={i} className="text-xs text-slate-500"><span className="font-bold">{e.guru_nama||'Guru'}</span> - {fmtTime(e.created_at)}</div>)}</div></div>}
      </div>
      </Modal>}
    </div>
  </Panel>;
}

function ConfigTab({user,toast}){
  const m=useMaster(user);const[cfg,setCfg]=useState([]);const[org,setOrg]=useState(null);
  useEffect(()=>{if(m.cabangId||user.role!=='admin')api.operasionalConfig(m.cabangId).then(setCfg).catch(e=>toast('err',e.message));},[m.cabangId]);
  useEffect(()=>{if(user.role==='admin')api.organisasi().then(setOrg).catch(()=>{});},[]);
  async function save(c){try{await api.updateOperasionalConfig(c.id,c);toast('ok','Konfigurasi disimpan');}catch(e){toast('err',e.message);}}
  async function saveOrg(){try{await api.updateOrganisasi(org);toast('ok','Data yayasan disimpan');}catch(e){toast('err',e.message);}}
  return <div className="space-y-6">
    {user.role==='admin'&&org&&<Panel title="Data Yayasan & Rekening">
      <div className="grid sm:grid-cols-2 gap-3">
        <Input placeholder="Nama yayasan" value={org.nama||''} onChange={v=>setOrg(o=>({...o,nama:v}))}/>
        <Input placeholder="Alamat" value={org.alamat||''} onChange={v=>setOrg(o=>({...o,alamat:v}))}/>
        <Input placeholder="Kontak" value={org.kontak||''} onChange={v=>setOrg(o=>({...o,kontak:v}))}/>
        <Input placeholder="Nama pemilik rekening" value={org.rekening_nama||''} onChange={v=>setOrg(o=>({...o,rekening_nama:v}))}/>
        <Input placeholder="Nama bank" value={org.rekening_bank||''} onChange={v=>setOrg(o=>({...o,rekening_bank:v}))}/>
        <Input placeholder="Nomor rekening" value={org.rekening_nomor||''} onChange={v=>setOrg(o=>({...o,rekening_nomor:v}))}/>
        <button onClick={saveOrg} className="btn">Simpan Data Yayasan</button>
      </div>
    </Panel>}
    <Panel title="Konfigurasi Operasional" right={<CabangFilter user={user} {...m}/>}>
      <div className="grid md:grid-cols-2 gap-3">{cfg.map(c=><div key={c.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <div className="font-black text-slate-800">{c.jenjang_nama} - {c.paket}</div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Input placeholder="Jam masuk" value={c.jam_masuk} onChange={v=>setCfg(a=>a.map(x=>x.id===c.id?{...x,jam_masuk:v}:x))}/>
          <Input placeholder="Jam pulang" value={c.jam_pulang} onChange={v=>setCfg(a=>a.map(x=>x.id===c.id?{...x,jam_pulang:v}:x))}/>
          <Input placeholder="Batas publish" value={c.daily_record_due_time} onChange={v=>setCfg(a=>a.map(x=>x.id===c.id?{...x,daily_record_due_time:v}:x))}/>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Toggle label="Hitung terlambat" checked={!!c.hitung_terlambat} onChange={v=>setCfg(a=>a.map(x=>x.id===c.id?{...x,hitung_terlambat:v?1:0}:x))}/>
          <Toggle label="Pakai kalender" checked={!!c.pakai_kalender} onChange={v=>setCfg(a=>a.map(x=>x.id===c.id?{...x,pakai_kalender:v?1:0}:x))}/>
          <Toggle label="Daily record wajib" checked={!!c.daily_record_wajib} onChange={v=>setCfg(a=>a.map(x=>x.id===c.id?{...x,daily_record_wajib:v?1:0}:x))}/>
          <Toggle label="Pickup fleksibel" checked={!!c.pickup_fleksibel} onChange={v=>setCfg(a=>a.map(x=>x.id===c.id?{...x,pickup_fleksibel:v?1:0}:x))}/>
        </div>
        <button onClick={()=>save(c)} className="btn mt-2">Simpan</button>
      </div>)}</div>
    </Panel>
  </div>;
}

function KalenderTab({user,toast}){
  const m=useMaster(user);const[events,setEvents]=useState([]);const[tahun,setTahun]=useState(new Date().getFullYear().toString());
  const[form,setForm]=useState({tanggal:'',tipe:'libur',nama:'',scope:'yayasan'});
  useEffect(()=>{if(m.cabangId||user.role==='admin')api.kalender({cabang_id:m.cabangId,tahun}).then(setEvents).catch(e=>toast('err',e.message));},[m.cabangId,tahun]);
  async function add(){try{await api.createKalender({...form,cabang_id:m.cabangId});toast('ok','Event ditambahkan');setForm({tanggal:'',tipe:'libur',nama:'',scope:'yayasan'});const r=await api.kalender({cabang_id:m.cabangId,tahun});setEvents(r);}catch(e){toast('err',e.message);}}
  async function remove(id){if(!confirm('Hapus event ini?'))return;try{await api.deleteKalender(id);toast('ok','Event dihapus');setEvents(events.filter(e=>e.id!==id));}catch(e){toast('err',e.message);}}
  const months=Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0'));
  return <Panel title="Kalender Akademik" right={<CabangFilter user={user} {...m}/>}>
    <div className="flex flex-wrap gap-2 mb-4 items-center">
      <select value={tahun} onChange={e=>setTahun(e.target.value)} className="input">
        {[2025,2026,2027,2028].map(y=><option key={y} value={y}>{y}/{y+1}</option>)}
      </select>
      <Input placeholder="Tanggal (YYYY-MM-DD)" value={form.tanggal} onChange={v=>setForm(f=>({...f,tanggal:v}))}/>
      <select value={form.tipe} onChange={e=>setForm(f=>({...f,tipe:e.target.value}))} className="input"><option value="libur">Libur</option><option value="masuk">Masuk Khusus</option></select>
      <Input placeholder="Nama event" value={form.nama} onChange={v=>setForm(f=>({...f,nama:v}))}/>
      {user.role==='admin'&&<select value={form.scope} onChange={e=>setForm(f=>({...f,scope:e.target.value}))} className="input"><option value="yayasan">Yayasan</option><option value="cabang">Cabang</option></select>}
      <button onClick={add} className="btn">Tambah</button>
    </div>
    <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
      {months.map(m=>{
        const prefix=`${tahun}-${m}`;
        const monthEvents=events.filter(e=>e.tanggal.startsWith(prefix));
        const monthName=new Date(Number(tahun),Number(m)-1,1).toLocaleString('id-ID',{month:'long'});
        return <div key={m} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <div className="font-black text-slate-800 mb-2">{monthName} {tahun}</div>
          {monthEvents.length===0?<div className="text-xs text-slate-400">Tidak ada event</div>:
          monthEvents.map(e=><div key={e.id} className={`text-xs rounded-lg px-2 py-1 mb-1 flex justify-between items-center ${e.tipe==='libur'?'bg-red-100 text-red-700':'bg-emerald-100 text-emerald-700'}`}>
            <span><span className="font-black">{e.tanggal.slice(8)}</span> {e.nama}{e.cabang_nama?` (${e.cabang_nama})`:''}</span>
            <button onClick={()=>remove(e.id)} className="text-red-500 hover:text-red-700 font-black ml-2">&times;</button>
          </div>)}
        </div>;
      })}
    </div>
  </Panel>;
}

function AuditTab({user,toast}){
  const m=useMaster(user);const[rows,setRows]=useState([]);
  useEffect(()=>{api.auditLog({cabang_id:m.cabangId,limit:150}).then(setRows).catch(e=>toast('err',e.message));},[m.cabangId]);
  return <Panel title="Audit Log" right={<CabangFilter user={user} {...m}/>}>
    <Table headers={['Waktu','Actor','Action','Entity','Cabang','Alasan']}>{rows.map(a=><tr key={a.id}><Td>{fmtTime(a.created_at)}</Td><Td>{a.actor_name||'Sistem'}</Td><Td>{a.action}</Td><Td>{a.entity_type} #{a.entity_id||'-'}</Td><Td>{a.cabang_nama||'-'}</Td><Td>{a.reason||'-'}</Td></tr>)}</Table>
  </Panel>;
}

function Panel({title,right,children}){return <section className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm max-w-full overflow-hidden"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4"><h2 className="text-lg font-black text-slate-900">{title}</h2>{right}</div>{children}</section>;}
function Input({value,onChange,placeholder}){return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="input"/>;}
function Textarea({label,value,onChange,placeholder}){return <div><div className="label">{label}</div><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3} className="input w-full min-h-20 resize-none"/></div>;}
function Table({headers,children}){return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{headers.map((h,i)=><th key={`${i}-${h||'empty'}`} className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>;}
function Td({children}){return <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{children}</td>;}
function Toggle({label,checked,onChange}){return <label className="flex items-center gap-3 cursor-pointer select-none"><button type="button" role="switch" aria-checked={checked} onClick={()=>onChange(!checked)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 ${checked?'bg-emerald-500':'bg-slate-300'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked?'translate-x-6':'translate-x-1'}`}/></button><span className="text-sm font-medium text-slate-700">{label}</span></label>;}
function FotoUpload({url,onUpload,onDelete}){
  return <div className="relative group flex-shrink-0">
    {url?<img src={url} className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow" alt="foto"/>:<div className="w-16 h-16 rounded-2xl bg-slate-200 border-2 border-white shadow flex items-center justify-center text-slate-400 text-2xl">👤</div>}
    <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
      <span className="text-white text-xs font-black">Ubah</span>
      <input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)onUpload(f);e.target.value='';}}/>
    </label>
    {url&&<button onClick={onDelete} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Hapus foto">&times;</button>}
  </div>;
}
function money(v){return 'Rp '+Number(v||0).toLocaleString('id-ID');}
function fmtTime(v){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v));}catch{return v;}}
