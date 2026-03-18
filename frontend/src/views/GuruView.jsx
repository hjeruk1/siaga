import{useState,useEffect,useCallback}from'react';import{api}from'../api';import{Chip,LiveClock,Spinner,Modal,meniTunggu}from'../components/Shared';
export default function GuruView({user,addToast}){
  const[kelas,setKelas]=useState(null);const[kelasList,setKelasList]=useState([]);
  const[siswaList,setSiswaList]=useState([]);const[tab,setTab]=useState('masuk');
  const[cari,setCari]=useState('');const[manual,setManual]=useState('');
  const[batch,setBatch]=useState([]);const[batchModal,setBatchModal]=useState(false);
  const[notifs,setNotifs]=useState([]);const[loading,setLoading]=useState(true);
  const[keterModal,setKeterModal]=useState(null);
  async function loadKelas(){const list=await api.getKelas();setKelasList(list);const mine=list.find(k=>k.guru_id===user.id);setKelas(mine||list[0]||null);}
  const loadSiswa=useCallback(async()=>{if(!kelas)return;try{setSiswaList(await api.getAbsensiToday(kelas.id));}catch(e){addToast('err',e.message);}},[kelas]);
  async function loadNotif(){try{setNotifs(await api.getNotif(user.id));}catch{}}
  useEffect(()=>{loadKelas();},[]);
  useEffect(()=>{if(kelas){setLoading(true);loadSiswa().finally(()=>setLoading(false));}},[kelas]);
  useEffect(()=>{loadNotif();const i=setInterval(loadNotif,5000);return()=>clearInterval(i);},[]);
  async function doCheckin(id,isManual=false){try{await api.checkin(id,isManual);addToast('ok','Check-in berhasil ✓');loadSiswa();}catch(e){addToast('err',e.message);}}
  async function doManual(){const f=siswaList.find(s=>s.nama.toLowerCase().includes(manual.toLowerCase()));if(!f)return addToast('err','Siswa tidak ditemukan');await doCheckin(f.id,true);setManual('');}
  async function doPulang(ids){try{await api.pulangkan(ids);addToast('ok',ids.length+' siswa dipulangkan ✓');setBatch([]);setBatchModal(false);loadSiswa();}catch(e){addToast('err',e.message);}}
  async function doKet(id,status,catatan){try{await api.setKeterangan(id,status,catatan);addToast('ok','Status: '+status);setKeterModal(null);loadSiswa();}catch(e){addToast('err',e.message);}}
  async function bacaNotif(id){await api.bacaNotif(id);setNotifs(n=>n.filter(x=>x.id!==id));}
  const list=siswaList.filter(s=>s.nama.toLowerCase().includes(cari.toLowerCase()));
  const ct=st=>siswaList.filter(s=>s.status===st).length;
  const pjN=notifs.filter(n=>n.tipe==='penjemputan');
  return(<div className="min-h-screen bg-amber-50 pb-24">
    <div className="bg-white border-b border-amber-100 sticky top-0 z-20 shadow-sm">
      <div className="px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div><div className="text-lg font-black text-slate-800">Absensi Kelas</div><div className="text-xs text-slate-400">{kelas?.guru_nama||user.nama} · <LiveClock/></div></div>
          <div className="flex items-center gap-2">
            {pjN.length>0&&<div className="relative"><button className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center animate-blink">🔔</button><span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center font-black">{pjN.length}</span></div>}
            <select value={kelas?.id||''} onChange={e=>setKelas(kelasList.find(k=>k.id===parseInt(e.target.value)))} className="text-sm border-2 border-amber-200 rounded-xl px-3 py-2 bg-white font-bold focus:outline-none">
              {kelasList.map(k=><option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
        </div>
        {pjN.map(n=><div key={n.id} className="flex items-center gap-3 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2.5 mb-2 animate-bounce-in">
          <span className="text-lg">🔔</span><div className="flex-1 text-sm font-semibold text-amber-800">{n.pesan}</div>
          <button onClick={()=>bacaNotif(n.id)} className="text-xs text-amber-600 font-bold">✓ OK</button>
        </div>)}
        <div className="grid grid-cols-4 gap-2 pb-3">
          {[{l:'Hadir',st:'Hadir',c:'text-emerald-600 bg-emerald-50 border-emerald-200'},{l:'Menunggu',st:'Menunggu',c:'text-amber-600 bg-amber-50 border-amber-200'},{l:'Terlambat',st:'Terlambat',c:'text-orange-600 bg-orange-50 border-orange-200'},{l:'Pulang',st:'Pulang',c:'text-slate-500 bg-slate-50 border-slate-200'}].map(s=>(
            <div key={s.l} className={`${s.c} border rounded-xl p-2 text-center`}><div className="text-xl font-black">{ct(s.st)}</div><div className="text-xs font-medium opacity-80">{s.l}</div></div>
          ))}
        </div>
        <div className="flex border-t border-amber-100">
          {[{id:'masuk',l:'✅ Check-in Pagi'},{id:'pulang',l:'🏠 Serah Terima'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`flex-1 py-2.5 text-sm font-bold border-b-2 ${tab===t.id?'border-amber-500 text-amber-700':'border-transparent text-slate-400'}`}>{t.l}</button>
          ))}
        </div>
      </div>
    </div>
    <div className="p-4 space-y-3">
      <div className="relative"><span className="absolute left-3.5 top-3 text-slate-400">🔍</span><input value={cari} onChange={e=>setCari(e.target.value)} placeholder="Cari nama siswa..." className="w-full pl-10 pr-4 py-3 bg-white border border-amber-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/></div>
      <div className="flex gap-2 bg-amber-100/70 border border-amber-200 rounded-2xl p-3">
        <input value={manual} onChange={e=>setManual(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doManual()} placeholder="Input manual — ketik nama siswa" className="flex-1 text-sm px-3 py-2.5 border border-amber-200 rounded-xl bg-white focus:outline-none"/>
        <button onClick={doManual} className="px-4 py-2 bg-amber-500 text-white text-sm font-black rounded-xl hover:bg-amber-600">✏️ Manual</button>
      </div>
      {loading?<Spinner/>:<div className="space-y-2">{list.map(s=>{
        const mnt=meniTunggu(s.jam_tunggu),red=s.status==='Menunggu'&&mnt&&mnt>15,inB=batch.includes(s.id);
        return(<div key={s.id} className={`flex items-center gap-3 p-3.5 rounded-2xl border ${red?'bg-red-50 border-red-200':inB?'bg-blue-50 border-blue-300':'bg-white border-amber-100'}`}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black flex-shrink-0">{s.nama[0]}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 text-sm">{s.nama}</div>
            <div className="text-xs text-slate-400">{s.jam_masuk?'Masuk '+s.jam_masuk:'Belum masuk'}{red&&<span className="text-red-500 font-bold"> · ⏰{mnt}mnt!</span>}{s.nama_penjemput&&<span> · {s.nama_penjemput}</span>}</div>
          </div>
          <Chip status={s.status} manual={s.manual}/>
          {tab==='masuk'&&(s.status==='Belum'||s.status==='Absen')&&<div className="flex gap-1 ml-1">
            <button onClick={()=>doCheckin(s.id,false)} className="px-3 py-2 bg-emerald-500 text-white text-xs font-black rounded-xl hover:bg-emerald-600">TAP</button>
            <button onClick={()=>setKeterModal(s)} className="px-2 py-2 bg-slate-100 text-slate-600 text-xs rounded-xl hover:bg-slate-200">···</button>
          </div>}
          {tab==='pulang'&&s.status==='Menunggu'&&<div className="flex items-center gap-2 ml-1">
            <button onClick={()=>doPulang([s.id])} className="px-3 py-2 bg-emerald-500 text-white text-xs font-black rounded-xl">✓ Pulang</button>
            <button onClick={()=>setBatch(p=>inB?p.filter(i=>i!==s.id):[...p,s.id])} className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center ${inB?'bg-blue-600 border-blue-600 text-white':'border-slate-300 text-slate-300'}`}>✓</button>
          </div>}
        </div>);
      })}</div>}
    </div>
    {batch.length>0&&<div className="fixed bottom-6 inset-x-4 flex justify-center z-30">
      <button onClick={()=>setBatchModal(true)} className="px-8 py-4 bg-blue-700 text-white font-black rounded-full shadow-2xl hover:bg-blue-800">📦 Pulangkan {batch.length} Siswa</button>
    </div>}
    {batchModal&&<div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={()=>setBatchModal(false)}>
      <div className="bg-white rounded-t-3xl w-full p-6" onClick={e=>e.stopPropagation()}>
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5"/>
        <div className="font-black text-xl mb-4">Batch Out — {batch.length} Siswa</div>
        <div className="border-2 border-dashed border-amber-300 bg-amber-50 rounded-2xl p-8 text-center text-amber-500 mb-4"><div className="text-4xl mb-2">📸</div><div className="font-bold text-sm">Foto Grup Siswa + Penjemput</div></div>
        <div className="flex gap-3"><button onClick={()=>setBatchModal(false)} className="flex-1 py-3.5 border-2 border-slate-200 rounded-2xl font-black text-slate-600">Batal</button><button onClick={()=>doPulang(batch)} className="flex-1 py-3.5 bg-blue-700 text-white rounded-2xl font-black">✓ Pulangkan</button></div>
      </div>
    </div>}
    {keterModal&&<Modal title={'Keterangan — '+keterModal.nama} onClose={()=>setKeterModal(null)}>
      {(()=>{const[st,setSt]=useState('Izin');const[cat,setCat]=useState('');return(<div className="space-y-4">
        <div><label className="text-xs font-bold text-slate-500 block mb-2">STATUS</label><div className="flex gap-2">{['Izin','Sakit'].map(s=><button key={s} onClick={()=>setSt(s)} className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 ${st===s?'bg-sky-500 text-white border-sky-500':'border-slate-200 text-slate-600'}`}>{s}</button>)}</div></div>
        <div><label className="text-xs font-bold text-slate-500 block mb-2">CATATAN</label><textarea value={cat} onChange={e=>setCat(e.target.value)} rows={3} placeholder="Keterangan..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"/></div>
        <button onClick={()=>doKet(keterModal.id,st,cat)} className="w-full py-3 bg-amber-500 text-white font-black rounded-xl">Simpan</button>
      </div>);})()}
    </Modal>}
  </div>);
}