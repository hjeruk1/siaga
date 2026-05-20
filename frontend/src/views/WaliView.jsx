import{useEffect,useState,useCallback}from'react';
import{api}from'../api';

export default function WaliView({toast}){
  const[siswa,setSiswa]=useState([]);const[selected,setSelected]=useState(null);const[history,setHistory]=useState([]);const[detail,setDetail]=useState(null);const[comment,setComment]=useState('');
  const[notif,setNotif]=useState([]);
  async function load(){const s=await api.waliChildren();setSiswa(s);if(!selected&&s[0])setSelected(s[0]);}
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[]);
  useEffect(()=>{api.notifikasi().then(setNotif).catch(()=>{});},[]);
  useEffect(()=>{if(selected)api.dailyHistory(selected.id,30).then(setHistory).catch(e=>toast('err',e.message));},[selected?.id]);
  async function open(id){const d=await api.dailyDetail(id);setDetail(d);if(d.read===null)api.notifikasi().then(setNotif).catch(()=>{});}
  async function send(){try{await api.commentDaily(detail.id,comment);setComment('');setDetail(await api.dailyDetail(detail.id));toast('ok','Feedback terkirim');}catch(e){toast('err',e.message);}}
  async function markRead(id){try{await api.readNotif(id);setNotif(n=>n.map(x=>x.id===id?{...x,read_at:new Date().toISOString()}:x));}catch{}}
  async function openFromNotif(n){if(n.entity_type==='laporan_harian'&&n.entity_id){markRead(n.id);open(n.entity_id);}}
  const unreadCount=notif.filter(n=>!n.read_at).length;
  return <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4">
    <section className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><div><h1 className="text-xl font-black text-slate-900">Portal Wali</h1><p className="text-sm text-slate-500">Daily record dan feedback.{unreadCount>0&&<span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-black">{unreadCount} baru</span>}</p></div>
      <select value={selected?.id||''} onChange={e=>setSelected(siswa.find(s=>String(s.id)===e.target.value))} className="input">{siswa.map(s=><option key={s.id} value={s.id}>{s.nama}</option>)}</select></div>
      <div className="grid md:grid-cols-[.8fr_1.2fr] gap-4">
        <div className="space-y-2">
          {history.map(h=><button key={h.id} onClick={()=>open(h.id)} className={`block w-full text-left rounded-xl border p-3 ${detail?.id===h.id?'border-amber-400 bg-amber-50':'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center gap-2"><span className="font-black text-slate-800">{h.tanggal}</span>{h.read===null&&<span className="w-2 h-2 bg-red-500 rounded-full" title="Belum dibaca"/>}</div>
            <div className="text-sm text-slate-500">{h.rombel_nama} - {h.guru_nama||'Guru'}</div>
          </button>)}
          {history.length===0&&<div className="text-sm text-slate-400">Belum ada daily record published.</div>}
        </div>
        <div>{detail?<Record detail={detail} comment={comment} setComment={setComment} send={send}/>:<div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-400">Pilih daily record.</div>}</div>
      </div>
    </section>
    {notif.length>0&&<section className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3"><h2 className="font-black text-slate-900">Notifikasi</h2><span className="text-xs text-slate-400">{unreadCount} belum dibaca dari {notif.length}</span></div>
      <div className="space-y-2">{notif.slice(0,15).map(n=><button key={n.id} onClick={()=>openFromNotif(n)} className={`w-full text-left rounded-xl p-3 border transition-colors ${n.read_at?'bg-slate-50 border-slate-200 hover:bg-slate-100':'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}><div className="flex items-start justify-between gap-2"><div className="font-bold text-slate-800 text-sm">{n.title}{!n.read_at&&<span className="ml-2 inline-block w-2 h-2 bg-amber-500 rounded-full align-middle"/>}</div><span className="text-[11px] text-slate-400 whitespace-nowrap">{fmtNotifTime(n.created_at)}</span></div><div className="text-xs text-slate-500 mt-1">{n.body||n.tipe}</div></button>)}</div>
    </section>}
  </div>;
}

function Record({detail,comment,setComment,send}){
  const tidur=detail.tidur===1?'Ya':detail.tidur===0?'Tidak':'-';
  return <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
    <div><div className="text-lg font-black text-slate-900">{detail.siswa_nama}</div><div className="text-sm text-slate-500">{detail.tanggal} - {detail.rombel_nama}</div></div>
    {(detail.focus_theme_title||detail.modul_ajar_title)&&<div className="bg-white border border-amber-200 rounded-xl p-3">
      <div className="label">Focus Theme</div>
      <div className="font-black text-slate-900">{detail.focus_theme_title||'-'}</div>
      {detail.modul_ajar_title&&<div className="text-xs text-slate-500 mt-1">Modul: {detail.modul_ajar_title}</div>}
      {detail.focus_theme_activity_summary&&<div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{detail.focus_theme_activity_summary}</div>}
    </div>}
    <div className="grid sm:grid-cols-3 gap-2">
      <Info label="Mood" value={detail.mood||'-'}/><Info label="Makan" value={detail.makan||'-'}/><Info label="Tidur" value={tidur}/>
    </div>
    {(detail.observation_domain||detail.observation_note)&&<div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="label">Observasi Guru</div>
      {detail.observation_domain&&<div className="text-xs font-black text-amber-700 uppercase mb-1">{detail.observation_domain}</div>}
      <div className="text-sm text-slate-800 whitespace-pre-wrap">{detail.observation_note||'-'}</div>
    </div>}
    <div><div className="label">Aktivitas</div><div className="text-sm text-slate-800">{(detail.aktivitas||[]).join(', ')||'-'}</div></div>
    <div><div className="label">Catatan</div><div className="text-sm text-slate-800 whitespace-pre-wrap">{detail.catatan||'-'}</div></div>
    {detail.parent_note&&<div><div className="label">Catatan untuk Wali</div><div className="text-sm text-slate-800 whitespace-pre-wrap">{detail.parent_note}</div></div>}
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{(detail.attachments||[]).map(a=><img key={a.id} src={a.url} className="aspect-square object-cover rounded-xl border border-slate-200" alt="foto daily record"/>)}</div>
    <div className="border-t border-slate-200 pt-4">
      <h3 className="font-black text-slate-900 mb-2">Komentar</h3>
      <div className="space-y-2 mb-3">{(detail.comments||[]).map(c=><div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3"><div className="text-xs font-black text-slate-500">{c.author_name}</div><div className="text-sm text-slate-800">{c.body}</div></div>)}</div>
      <div className="flex gap-2"><input value={comment} onChange={e=>setComment(e.target.value)} className="input flex-1" placeholder="Tulis feedback"/><button onClick={send} className="btn">Kirim</button></div>
    </div>
  </div>;
}
function Info({label,value}){return <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="label">{label}</div><div className="font-black text-slate-800">{value}</div></div>;}
function fmtNotifTime(v){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v));}catch{return v;}}
