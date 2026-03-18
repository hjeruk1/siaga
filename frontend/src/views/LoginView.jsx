import{useState}from'react';import{api}from'../api';
export default function LoginView({onLogin}){
  const[form,setForm]=useState({username:'',password:''});
  const[err,setErr]=useState('');const[loading,setLoading]=useState(false);
  async function submit(e){e.preventDefault();setErr('');setLoading(true);
    try{const d=await api.login(form.username,form.password);localStorage.setItem('siaga_token',d.token);onLogin(d.user);}
    catch(e){setErr(e.message);}finally{setLoading(false);}
  }
  return(<div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 animate-bounce-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-2xl shadow-lg">🌟</div>
        <div><div className="font-black text-xl text-slate-800">SIAGA</div><div className="text-xs text-slate-400">KBTK Taruna Prima</div></div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="text-xs font-bold text-slate-500 block mb-1.5">USERNAME</label>
          <input value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} placeholder="Username" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 text-sm" autoFocus/></div>
        <div><label className="text-xs font-bold text-slate-500 block mb-1.5">PASSWORD</label>
          <input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Password" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 text-sm"/></div>
        {err&&<div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{err}</div>}
        <button type="submit" disabled={loading} className="w-full py-3.5 bg-amber-500 text-white font-black rounded-xl hover:bg-amber-600 disabled:opacity-50">{loading?'Masuk...':'Masuk →'}</button>
      </form>
      <div className="mt-6 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-400 text-center mb-2">Akun Demo:</p>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {[['admin','admin123'],['kepsek','kepsek123'],['ratna','ratna123'],['gerbang','gerbang123']].map(([u,p])=>(
            <button key={u} onClick={()=>setForm({username:u,password:p})} className="text-left px-2 py-1 bg-slate-50 hover:bg-amber-50 rounded-lg">
              <span className="font-bold text-slate-700">{u}</span> / {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>);
}