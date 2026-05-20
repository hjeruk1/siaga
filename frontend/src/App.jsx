import{useEffect,useState}from'react';
import{api}from'./api';
import LoginView from'./views/LoginView';
import AdminView from'./views/AdminView';
import GuruView from'./views/GuruView';
import KepsekView from'./views/KepsekView';
import GerbangView from'./views/GerbangView';
import WaliView from'./views/WaliView';

export default function App(){
  const[user,setUser]=useState(null);const[view,setView]=useState('');const[checking,setChecking]=useState(true);const[toasts,setToasts]=useState([]);
  const[notif,setNotif]=useState([]);const[showNotif,setShowNotif]=useState(false);
  useEffect(()=>{api.me().then(u=>{setUser(u);setView(defaultView(u));}).catch(()=>{}).finally(()=>setChecking(false));},[]);
  useEffect(()=>{if(user&&!user.must_change_password)api.notifikasi().then(setNotif).catch(()=>{});},[user?.id,user?.must_change_password,view]);
  function login(u){setUser(u);setView(defaultView(u));}
  function logout(){localStorage.removeItem('siaga_token');setUser(null);setView('');setNotif([]);}
  function toast(type,msg){const id=Date.now();setToasts(t=>[...t,{id,type,msg}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);}
  async function markAllRead(){try{await api.readAllNotif();setNotif(n=>n.map(x=>({...x,read_at:x.read_at||new Date().toISOString()})));}catch{}}
  if(checking)return <div className="min-h-screen grid place-items-center bg-slate-100"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin"/></div>;
  if(!user)return <LoginView onLogin={login}/>;
  if(user.must_change_password)return <ChangePassword user={user} onDone={login} onLogout={logout} toast={toast}/>;
  const nav=navFor(user);
  return <div className="min-h-screen bg-slate-100">
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="w-full px-3 sm:px-4 lg:px-6 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white grid place-items-center font-black">S</div>
        <div className="min-w-0">
          <div className="font-black text-slate-900 leading-none">SIAGA</div>
          <div className="text-xs text-slate-500 truncate">{user.cabang_nama||'Yayasan Taruna Prima'}</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto flex-1 min-w-full sm:min-w-0 sm:ml-2 order-last sm:order-none">
          {nav.map(n=><button key={n.id} onClick={()=>setView(n.id)} className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${view===n.id?'bg-amber-500 text-white':'bg-slate-100 text-slate-600'}`}>{n.label}</button>)}
        </nav>
        <div className="hidden sm:block text-right">
          <div className="text-sm font-bold text-slate-800">{user.display_name}</div>
          <div className="text-xs text-slate-400">{user.role}</div>
        </div>
        <div className="relative">
          <button onClick={()=>setShowNotif(v=>!v)} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-600">Notifikasi {notif.filter(n=>!n.read_at).length>0&&<span className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-amber-500 text-white">{notif.filter(n=>!n.read_at).length}</span>}</button>
          {showNotif&&<div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50">
            <div className="flex items-center justify-between mb-2"><div className="font-black text-slate-900">Notifikasi</div><button onClick={markAllRead} className="text-xs font-black text-amber-700">Tandai dibaca</button></div>
            <div className="max-h-96 overflow-y-auto space-y-2">{notif.map(n=><div key={n.id} className={`rounded-xl border p-3 ${n.read_at?'bg-white border-slate-100':'bg-amber-50 border-amber-200'}`}><div className="text-sm font-black text-slate-800">{n.title}</div><div className="text-xs text-slate-500 mt-1">{n.body||n.tipe}</div><div className="text-[11px] text-slate-400 mt-1">{fmtTime(n.created_at)}</div></div>)}{notif.length===0&&<div className="text-sm text-slate-400 p-3">Belum ada notifikasi.</div>}</div>
          </div>}
        </div>
        <button onClick={logout} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-600">Keluar</button>
      </div>
    </header>
    <main className="min-h-[calc(100vh-73px)]">
      {view==='admin'&&<AdminView user={user} toast={toast}/>}
      {view==='guru'&&<GuruView user={user} toast={toast}/>}
      {view==='kepsek'&&<KepsekView user={user} toast={toast}/>}
      {view==='gerbang'&&<GerbangView user={user} toast={toast}/>}
      {view==='wali'&&<WaliView user={user} toast={toast}/>}
    </main>
    <div className="fixed bottom-4 right-4 space-y-2 z-50">{toasts.map(t=><div key={t.id} className={`px-4 py-3 rounded-xl shadow-lg text-sm font-bold ${t.type==='err'?'bg-red-600 text-white':'bg-slate-900 text-white'}`}>{t.msg}</div>)}</div>
  </div>;
}

function defaultView(u){
  if(u.role==='wali')return'wali';
  if(u.role==='admin'||u.role==='admin_cabang')return'admin';
  if(u.role==='kepsek')return'kepsek';
  if(u.role==='gerbang')return'gerbang';
  return'guru';
}
function navFor(u){
  if(u.role==='wali')return[{id:'wali',label:'Portal Wali'}];
  const n=[];
  if(['admin','admin_cabang'].includes(u.role))n.push({id:'admin',label:'Admin'});
  if(['admin','admin_cabang','kepsek'].includes(u.role))n.push({id:'kepsek',label:'Kepsek'});
  if(['admin','admin_cabang','kepsek','guru'].includes(u.role))n.push({id:'guru',label:'Guru'});
  if(['admin','admin_cabang','kepsek','guru','gerbang'].includes(u.role))n.push({id:'gerbang',label:'Gerbang'});
  return n;
}
function fmtTime(v){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v));}catch{return v;}}

function ChangePassword({user,onDone,onLogout,toast}){
  const[form,setForm]=useState({old_password:'',new_password:''});const[loading,setLoading]=useState(false);
  async function submit(e){e.preventDefault();setLoading(true);try{await api.changePassword(form);const u=await api.me();onDone(u);toast('ok','Password diperbarui');}catch(e){toast('err',e.message);}finally{setLoading(false);}}
  return <div className="min-h-screen bg-slate-100 grid place-items-center p-4">
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-md space-y-4">
      <div><div className="text-xl font-black text-slate-900">Ganti Password</div><div className="text-sm text-slate-500">Halo {user.display_name}, password sementara harus diganti.</div></div>
      {!user.must_change_password&&<Input label="Password lama" type="password" value={form.old_password} onChange={v=>setForm(f=>({...f,old_password:v}))}/>}
      <Input label="Password baru" type="password" value={form.new_password} onChange={v=>setForm(f=>({...f,new_password:v}))}/>
      <button disabled={loading} className="w-full py-3 rounded-xl bg-amber-500 text-white font-black">Simpan</button>
      <button type="button" onClick={onLogout} className="w-full py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold">Keluar</button>
    </form>
  </div>;
}
function Input({label,value,onChange,type='text'}){
  return <label className="block"><span className="text-xs font-bold text-slate-500">{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200"/></label>;
}
