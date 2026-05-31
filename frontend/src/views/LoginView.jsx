import{useState}from'react';
import{api}from'../api';

export default function LoginView({onLogin}){
  const[tab,setTab]=useState('staff');
  const[form,setForm]=useState({username:'',no_wa:'',password:''});
  const[err,setErr]=useState('');const[loading,setLoading]=useState(false);
  async function submit(e){
    e.preventDefault();setErr('');setLoading(true);
    try{
      const d=await api.login(tab==='wali'?{tipe:'wali',no_wa:form.no_wa,password:form.password}:{tipe:'staff',username:form.username,password:form.password});
      api.setToken(d.token);onLogin(d.user);
    }catch(e){setErr(e.message);}finally{setLoading(false);}
  }
  return <div className="min-h-screen bg-[#f6f7f9] grid lg:grid-cols-[1fr_460px]">
    <section className="hidden lg:flex min-h-screen bg-slate-950 text-white p-10 flex-col justify-between">
      <div className="flex items-center gap-5">
        <img src="/tp_logo.png" alt="Taruna Prima Logo" className="w-64 h-auto object-contain transform hover:rotate-1 transition-transform duration-200" />
        <div className="border-l border-white/20 pl-5">
          <div className="text-2xl font-black tracking-wider leading-none">SIAGA</div>
          <div className="text-xs text-slate-400 mt-1 uppercase font-semibold">Sistem Informasi</div>
        </div>
      </div>
      <div className="max-w-2xl">
        <div className="text-sm font-black tracking-wide text-primary uppercase">Satu server, lima cabang</div>
        <h1 className="mt-4 text-5xl font-black leading-tight">Operasional sekolah, penitipan, billing, dan portal wali dalam satu tempat.</h1>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {['Godean','Kentungan','Nitikan','Balong','Solo'].map(c=><div key={c} className="rounded-2xl border border-white/10 bg-white/5 p-4 transform hover:-translate-y-1 transition-all duration-200"><div className="text-sm text-slate-300">Cabang</div><div className="font-black">{c}</div></div>)}
        </div>
      </div>
      <div className="text-sm text-slate-400">Akses staff, guru, gerbang, kepala sekolah, admin cabang, admin pusat, dan wali murid.</div>
    </section>
    <main className="min-h-screen flex items-center justify-center p-4">
    <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-md p-6 relative overflow-hidden">
      {/* Decorative mascot */}
      <img
        src="/runa-rima.png"
        alt=""
        className="absolute -right-4 -top-4 w-28 opacity-90 pointer-events-none select-none"
      />
      <div className="mb-6 flex flex-col gap-4 relative z-10">
        <img src="/tp_logo.png" alt="Taruna Prima Logo" className="w-48 h-auto object-contain" />
        <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
          <div className="text-xl font-black text-text-main leading-none">SIAGA</div>
          <div className="text-xs text-slate-400">Portal Akses Sekolah</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 mb-5">
        {[['staff','Staff'],['wali','Wali Murid']].map(([id,label])=>
          <button key={id} type="button" onClick={()=>setTab(id)} className={`py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${tab===id?'bg-white text-primary border border-slate-200':'text-slate-500 hover:text-slate-700'}`}>{label}</button>
        )}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {tab==='staff'?<Field label="Username" value={form.username} onChange={v=>setForm(f=>({...f,username:v}))} autoComplete="username" spellCheck={false} autoFocus/>:
          <Field label="Nomor WhatsApp" value={form.no_wa} onChange={v=>setForm(f=>({...f,no_wa:v}))} autoComplete="username" spellCheck={false} autoFocus/>}
        <Field label="Password" type="password" value={form.password} onChange={v=>setForm(f=>({...f,password:v}))} autoComplete="current-password"/>
        {err&&<div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2 animate-pulse">{err}</div>}
        <button disabled={loading} className="w-full h-11 px-4 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover active:bg-primary-active active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">{loading?'Masuk…':'Masuk'}</button>
      </form>
      {import.meta.env.DEV&&tab==='staff'&&<button onClick={()=>setForm({username:'admin',no_wa:'',password:'admin123'})} className="mt-4 text-xs font-bold text-primary hover:text-primary-hover transition-colors duration-200">Isi akun dev admin</button>}
    </div>
    </main>
  </div>;
}

function Field({label,value,onChange,type='text',autoFocus=false,autoComplete,spellCheck}){
  return <label className="block">
    <span className="text-xs font-semibold text-slate-500">{label}</span>
    <input type={type} value={value} autoFocus={autoFocus} onChange={e=>onChange(e.target.value)} autoComplete={autoComplete} spellCheck={spellCheck} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"/>
  </label>;
}
