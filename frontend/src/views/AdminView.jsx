import{useState,useEffect}from'react';import{api}from'../api';import{Modal,Spinner}from'../components/Shared';
export default function AdminView({addToast}){
  const[tab,setTab]=useState('siswa');
  return(<div className="min-h-screen bg-slate-50">
    <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
      <div className="px-5 py-4"><div className="font-black text-xl text-slate-800">Panel Admin</div></div>
      <div className="flex overflow-x-auto px-5 border-t border-slate-100">
        {[{id:'siswa',l:'👦 Siswa'},{id:'guru',l:'👩‍🏫 Guru'},{id:'kelas',l:'🏫 Kelas'},{id:'rekap',l:'📋 Rekap'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 ${tab===t.id?'border-amber-500 text-amber-700':'border-transparent text-slate-400'}`}>{t.l}</button>
        ))}
      </div>
    </div>
    <div className="p-4 md:p-6">
      {tab==='siswa'&&<SiswaTab addToast={addToast}/>}
      {tab==='guru' &&<GuruTab  addToast={addToast}/>}
      {tab==='kelas'&&<KelasTab addToast={addToast}/>}
      {tab==='rekap'&&<RekapTab addToast={addToast}/>}
    </div>
  </div>);
}
function SiswaTab({addToast}){
  const[list,setList]=useState([]);const[kelas,setKelas]=useState([]);const[loading,setLoading]=useState(true);
  const[modal,setModal]=useState(null);const[pjModal,setPjModal]=useState(null);
  const[form,setForm]=useState({nama:'',kelas_id:''});const[cari,setCari]=useState('');
  async function load(){const[s,k]=await Promise.all([api.getSiswa(),api.getKelas()]);setList(s);setKelas(k);setLoading(false);}
  useEffect(()=>{load();},[]);
  async function submit(){try{modal==='add'?await api.createSiswa(form):await api.updateSiswa(modal.id,{...form,status_kartu:modal.status_kartu});addToast('ok','Tersimpan');setModal(null);load();}catch(e){addToast('err',e.message);}}
  async function hapus(id){if(!confirm('Hapus siswa ini?'))return;await api.deleteSiswa(id);addToast('ok','Dihapus');load();}
  return(<div>
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <input value={cari} onChange={e=>setCari(e.target.value)} placeholder="Cari siswa..." className="flex-1 max-w-xs px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
      <button onClick={()=>{setForm({nama:'',kelas_id:kelas[0]?.id||''});setModal('add');}} className="px-4 py-2.5 bg-amber-500 text-white font-bold rounded-xl text-sm">+ Tambah Siswa</button>
    </div>
    {loading?<Spinner/>:<div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500"><th className="text-left py-3 px-4">Nama</th><th className="text-left py-3 px-4">Kelas</th><th className="text-center py-3 px-4">Penjemput</th><th className="py-3 px-4"/></tr></thead>
        <tbody>{list.filter(s=>s.nama.toLowerCase().includes(cari.toLowerCase())).map((s,i)=>(
          <tr key={s.id} className={`border-b border-slate-100 ${i%2===0?'bg-white':'bg-slate-50/40'}`}>
            <td className="py-3 px-4 font-semibold text-slate-800">{s.nama}</td>
            <td className="py-3 px-4 text-slate-600">{s.kelas_nama}</td>
            <td className="py-3 px-4 text-center"><button onClick={()=>setPjModal(s)} className="px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-bold">👥 {s.jumlah_penjemput}</button></td>
            <td className="py-3 px-4"><div className="flex gap-2 justify-end">
              <button onClick={()=>{setForm({nama:s.nama,kelas_id:s.kelas_id});setModal(s);}} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">Edit</button>
              <button onClick={()=>hapus(s.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold">Hapus</button>
            </div></td>
          </tr>
        ))}</tbody>
      </table>
    </div>}
    {modal&&<Modal title={modal==='add'?'Tambah Siswa':'Edit Siswa'} onClose={()=>setModal(null)}>
      <div className="space-y-4">
        <div><label className="text-xs font-bold text-slate-500 block mb-1.5">NAMA</label><input value={form.nama} onChange={e=>setForm(f=>({...f,nama:e.target.value}))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/></div>
        <div><label className="text-xs font-bold text-slate-500 block mb-1.5">KELAS</label><select value={form.kelas_id} onChange={e=>setForm(f=>({...f,kelas_id:parseInt(e.target.value)}))} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none bg-white">{kelas.map(k=><option key={k.id} value={k.id}>{k.nama}</option>)}</select></div>
        <button onClick={submit} className="w-full py-3 bg-amber-500 text-white font-black rounded-xl">Simpan</button>
      </div>
    </Modal>}
    {pjModal&&<PjModal siswa={pjModal} onClose={()=>{setPjModal(null);load();}} addToast={addToast}/>}
  </div>);
}
function PjModal({siswa,onClose,addToast}){
  const[list,setList]=useState([]);const[form,setForm]=useState({nama:'',no_wa:'',relasi:'Ibu'});const[loading,setLoading]=useState(true);
  async function load(){const d=await api.getSiswaDetail(siswa.id);setList(d.penjemput);setLoading(false);}
  useEffect(()=>{load();},[]);
  async function add(){try{const r=await api.addPenjemput(siswa.id,form);addToast('ok','QR: '+r.qr_code);setForm({nama:'',no_wa:'',relasi:'Ibu'});load();}catch(e){addToast('err',e.message);}}
  async function hapus(id){await api.deletePenjemput(id);addToast('ok','Dihapus');load();}
  return(<Modal title={'Penjemput — '+siswa.nama} onClose={onClose}>
    {loading?<Spinner/>:<div className="space-y-4">
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {list.length===0&&<div className="text-sm text-slate-400 text-center py-4">Belum ada penjemput</div>}
        {list.map(p=><div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <div className="flex-1"><div className="font-semibold text-sm">{p.nama} <span className="text-xs text-slate-400">({p.relasi})</span></div><div className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded inline-block mt-0.5">{p.qr_code}</div></div>
          <button onClick={()=>hapus(p.id)} className="text-red-400 hover:text-red-600 text-xs font-bold">Hapus</button>
        </div>)}
      </div>
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-xs font-bold text-slate-500">TAMBAH PENJEMPUT</p>
        <input value={form.nama} onChange={e=>setForm(f=>({...f,nama:e.target.value}))} placeholder="Nama penjemput" className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
        <div className="flex gap-2">
          <input value={form.no_wa} onChange={e=>setForm(f=>({...f,no_wa:e.target.value}))} placeholder="No. WhatsApp" className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none"/>
          <select value={form.relasi} onChange={e=>setForm(f=>({...f,relasi:e.target.value}))} className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">{['Ayah','Ibu','Kakek','Nenek','Saudara','Lainnya'].map(r=><option key={r}>{r}</option>)}</select>
        </div>
        <button onClick={add} className="w-full py-2.5 bg-amber-500 text-white font-black rounded-xl text-sm">+ Tambah & Generate QR</button>
      </div>
    </div>}
  </Modal>);
}
function GuruTab({addToast}){
  const[list,setList]=useState([]);const[modal,setModal]=useState(null);const[form,setForm]=useState({nama:'',no_wa:'',username:'',password:'',role:'guru'});
  async function load(){setList(await api.getGuru());}useEffect(()=>{load();},[]);
  async function submit(){try{modal==='add'?await api.createGuru(form):await api.updateGuru(modal.id,form);addToast('ok','Tersimpan');setModal(null);load();}catch(e){addToast('err',e.message);}}
  async function hapus(id){if(!confirm('Hapus?'))return;await api.deleteGuru(id);addToast('ok','Dihapus');load();}
  const RS={admin:'bg-red-100 text-red-700',kepsek:'bg-purple-100 text-purple-700',guru:'bg-blue-100 text-blue-700',gerbang:'bg-slate-100 text-slate-600'};
  return(<div>
    <div className="flex justify-end mb-4"><button onClick={()=>{setForm({nama:'',no_wa:'',username:'',password:'',role:'guru'});setModal('add');}} className="px-4 py-2.5 bg-amber-500 text-white font-bold rounded-xl text-sm">+ Tambah Akun</button></div>
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50 border-b text-xs text-slate-500"><th className="text-left py-3 px-4">Nama</th><th className="text-left py-3 px-4">Username</th><th className="text-center py-3 px-4">Role</th><th className="py-3 px-4"/></tr></thead>
        <tbody>{list.map((g,i)=><tr key={g.id} className={`border-b border-slate-100 ${i%2===0?'':'bg-slate-50/40'}`}>
          <td className="py-3 px-4 font-semibold">{g.nama}</td><td className="py-3 px-4 font-mono text-sm text-slate-600">{g.username}</td>
          <td className="py-3 px-4 text-center"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${RS[g.role]||'bg-gray-100'}`}>{g.role}</span></td>
          <td className="py-3 px-4"><div className="flex gap-2 justify-end">
            <button onClick={()=>{setForm({nama:g.nama,no_wa:g.no_wa||'',username:g.username,password:'',role:g.role});setModal(g);}} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">Edit</button>
            <button onClick={()=>hapus(g.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold">Hapus</button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
    {modal&&<Modal title={modal==='add'?'Tambah Akun':'Edit Akun'} onClose={()=>setModal(null)}>
      <div className="space-y-3">
        {[{l:'NAMA',k:'nama',t:'text',ph:'Nama lengkap'},{l:'NO. WA',k:'no_wa',t:'text',ph:'08xx'},{l:'USERNAME',k:'username',t:'text',ph:'username'},{l:'PASSWORD',k:'password',t:'password',ph:modal==='add'?'Password baru':'Kosongkan jika tidak berubah'}].map(f=>(
          <div key={f.k}><label className="text-xs font-bold text-slate-500 block mb-1">{f.l}</label><input type={f.t} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/></div>
        ))}
        <div><label className="text-xs font-bold text-slate-500 block mb-1">ROLE</label><select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">{['admin','kepsek','guru','gerbang'].map(r=><option key={r}>{r}</option>)}</select></div>
        <button onClick={submit} className="w-full py-3 bg-amber-500 text-white font-black rounded-xl mt-2">Simpan</button>
      </div>
    </Modal>}
  </div>);
}
function KelasTab({addToast}){
  const[kelas,setKelas]=useState([]);const[guru,setGuru]=useState([]);
  async function load(){const[k,g]=await Promise.all([api.getKelas(),api.getGuru()]);setKelas(k);setGuru(g.filter(x=>x.role==='guru'));}
  useEffect(()=>{load();},[]);
  async function assign(kid,gid){try{await api.updateKelas(kid,{guru_id:gid||null});addToast('ok','Diperbarui');load();}catch(e){addToast('err',e.message);}}
  return(<div className="max-w-md">
    <p className="text-sm text-slate-500 mb-4">Guru yang bertugas akan menerima notifikasi penjemputan kelasnya.</p>
    <div className="space-y-3">{kelas.map(k=><div key={k.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center font-black text-amber-700 text-sm flex-shrink-0">{k.nama}</div>
      <div className="flex-1"><div className="font-bold text-slate-800">{k.nama}</div><div className="text-xs text-slate-400">{k.guru_nama||'— belum diassign'}</div></div>
      <select value={k.guru_id||''} onChange={e=>assign(k.id,e.target.value?parseInt(e.target.value):null)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
        <option value="">— Pilih guru</option>{guru.map(g=><option key={g.id} value={g.id}>{g.nama}</option>)}
      </select>
    </div>)}</div>
  </div>);
}
function RekapTab({addToast}){
  const now=new Date();
  const[bulan,setBulan]=useState(now.getMonth()+1);const[tahun,setTahun]=useState(now.getFullYear());
  const[kid,setKid]=useState('');const[kelas,setKelas]=useState([]);const[data,setData]=useState(null);const[loading,setLoading]=useState(false);
  useEffect(()=>{api.getKelas().then(setKelas);},[]);
  async function load(){setLoading(true);try{setData(await api.getRekap(bulan,tahun,kid||undefined));}catch(e){addToast('err',e.message);}finally{setLoading(false);}}
  const hari=data?[...new Set(data.data.flatMap(s=>Object.keys(s.absensi)))].sort():[];
  const CC={Hadir:'bg-emerald-500',Terlambat:'bg-orange-500',Izin:'bg-sky-500',Sakit:'bg-purple-500',Absen:'bg-red-500'};
  const CK={Hadir:'H',Terlambat:'T',Izin:'I',Sakit:'S',Absen:'A'};
  return(<div>
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      <select value={bulan} onChange={e=>setBulan(parseInt(e.target.value))} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">{[...Array(12)].map((_,i)=><option key={i+1} value={i+1}>{new Date(2025,i,1).toLocaleDateString('id-ID',{month:'long'})}</option>)}</select>
      <select value={tahun} onChange={e=>setTahun(parseInt(e.target.value))} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">{[2024,2025,2026].map(y=><option key={y}>{y}</option>)}</select>
      <select value={kid} onChange={e=>setKid(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"><option value="">Semua Kelas</option>{kelas.map(k=><option key={k.id} value={k.id}>{k.nama}</option>)}</select>
      <button onClick={load} className="px-4 py-2 bg-amber-500 text-white font-bold rounded-xl text-sm">Tampilkan</button>
    </div>
    <div className="flex gap-3 mb-4 flex-wrap text-xs text-slate-600">
      {[['H','Hadir','bg-emerald-500'],['T','Terlambat','bg-orange-500'],['I','Izin','bg-sky-500'],['S','Sakit','bg-purple-500'],['A','Absen','bg-red-500']].map(([c,l,bg])=>(
        <div key={c} className="flex items-center gap-1.5"><div className={`w-5 h-5 ${bg} rounded text-white flex items-center justify-center font-bold`}>{c}</div>{l}</div>
      ))}
    </div>
    {loading&&<Spinner/>}
    {data&&!loading&&<div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="text-xs min-w-max w-full">
      <thead><tr className="bg-slate-50 border-b border-slate-200">
        <th className="text-left py-3 px-4 font-bold text-slate-600 sticky left-0 bg-slate-50 min-w-[150px]">Nama</th>
        <th className="py-3 px-3 font-bold text-slate-500 text-center">Kelas</th>
        {hari.map(h=><th key={h} className="py-3 px-1 font-semibold text-slate-400 text-center w-8">{h}</th>)}
        <th className="py-3 px-3 font-bold text-emerald-600 text-center">H</th><th className="py-3 px-3 font-bold text-orange-500 text-center">T</th>
        <th className="py-3 px-3 font-bold text-sky-500 text-center">I</th><th className="py-3 px-3 font-bold text-red-500 text-center">A</th>
      </tr></thead>
      <tbody>{data.data.map((s,i)=><tr key={s.id} className={`border-b border-slate-100 ${i%2===0?'bg-white':'bg-slate-50/40'}`}>
        <td className="py-2.5 px-4 font-semibold text-slate-800 sticky left-0 bg-inherit">{s.nama}</td>
        <td className="py-2.5 px-3 text-center text-slate-500">{s.kelas_nama}</td>
        {hari.map(h=>{const st=s.absensi[h];return<td key={h} className="py-2 px-1 text-center">{st?<span className={`inline-flex w-6 h-6 items-center justify-center rounded-lg font-black text-white ${CC[st]}`}>{CK[st]}</span>:<span className="text-slate-200">·</span>}</td>;})}
        <td className="py-2.5 px-3 text-center font-black text-emerald-600">{s.counts.H}</td>
        <td className="py-2.5 px-3 text-center font-black text-orange-500">{s.counts.T}</td>
        <td className="py-2.5 px-3 text-center font-black text-sky-500">{s.counts.I}</td>
        <td className="py-2.5 px-3 text-center font-black text-red-500">{s.counts.A}</td>
      </tr>)}</tbody>
    </table></div></div>}
  </div>);
}