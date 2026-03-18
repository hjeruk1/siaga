import{useState,useEffect}from'react';
import LoginView   from'./views/LoginView';
import KepsekView  from'./views/KepsekView';
import GuruView    from'./views/GuruView';
import GerbangView from'./views/GerbangView';
import AdminView   from'./views/AdminView';
import{Toast}from'./components/Shared';
import{api}from'./api';
const RD={admin:'admin',kepsek:'kepsek',guru:'guru',gerbang:'gerbang'};
export default function App(){
  const[user,setUser]=useState(null);const[view,setView]=useState(null);
  const[toasts,setToasts]=useState([]);const[checking,setChecking]=useState(true);
  useEffect(()=>{api.me().then(u=>{setUser(u);setView(RD[u.role]||'guru');}).catch(()=>{}).finally(()=>setChecking(false));},[]);
  function login(u){setUser(u);setView(RD[u.role]||'guru');}
  function logout(){localStorage.removeItem('siaga_token');setUser(null);setView(null);}
  function addToast(type,msg){const id=Date.now();setToasts(p=>[...p,{id,type,msg}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3500);}
  if(checking)return<div className="min-h-screen bg-amber-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin"/></div>;
  if(!user)return<LoginView onLogin={login}/>;
  const NAV=[{id:'kepsek',l:'🏫 Kepsek',r:['admin','kepsek']},{id:'guru',l:'📋 Guru',r:['admin','guru','kepsek']},{id:'gerbang',l:'🚪 Gerbang',r:['admin','gerbang','kepsek']},{id:'admin',l:'⚙️ Admin',r:['admin']}].filter(n=>n.r.includes(user.role));
  return(<div className="min-h-screen">
    <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
      <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 mr-2"><div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black shadow-sm">TP</div><div><div className="font-black text-slate-800 text-sm leading-none">SIAGA</div><div className="text-slate-400 text-xs">Taruna Prima</div></div></div>
        <div className="flex gap-1 flex-wrap flex-1">{NAV.map(n=><button key={n.id} onClick={()=>setView(n.id)} className={`px-4 py-2 rounded-xl text-sm font-bold border ${view===n.id?'bg-amber-500 text-white border-amber-500':'bg-white text-slate-600 border-slate-200 hover:border-amber-300'}`}>{n.l}</button>)}</div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="text-right hidden sm:block"><div className="text-sm font-bold text-slate-700">{user.nama}</div><div className="text-xs text-slate-400">{user.role}</div></div>
          <button onClick={logout} className="px-3 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200">Keluar</button>
        </div>
      </div>
    </div>
    <div className="max-w-screen-xl mx-auto">
      {view==='kepsek' &&<KepsekView  user={user} addToast={addToast}/>}
      {view==='guru'   &&<GuruView    user={user} addToast={addToast}/>}
      {view==='gerbang'&&<GerbangView user={user} addToast={addToast}/>}
      {view==='admin'  &&<AdminView   user={user} addToast={addToast}/>}
    </div>
    <Toast items={toasts}/>
  </div>);
}