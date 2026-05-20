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
      localStorage.setItem('siaga_token',d.token);onLogin(d.user);
    }catch(e){setErr(e.message);}finally{setLoading(false);}
  }
  return <div className="min-h-screen bg-[#f6f7f9] grid lg:grid-cols-[1fr_460px]">
    <section className="hidden lg:flex min-h-screen bg-slate-950 text-white p-10 flex-col justify-between">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 grid place-items-center font-black text-xl">S</div>
        <div><div className="text-xl font-black leading-tight">SIAGA</div><div className="text-sm text-slate-300">Yayasan Taruna Prima</div></div>
      </div>
      <div className="max-w-2xl">
        <div className="text-sm font-black tracking-wide text-amber-300 uppercase">Satu server, lima cabang</div>
        <h1 className="mt-4 text-5xl font-black leading-tight">Operasional sekolah, penitipan, billing, dan portal wali dalam satu tempat.</h1>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {['Godean','Kentungan','Nitikan','Balong','Solo'].map(c=><div key={c} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-slate-300">Cabang</div><div className="font-black">{c}</div></div>)}
        </div>
      </div>
      <div className="text-sm text-slate-400">Akses staff, guru, gerbang, kepala sekolah, admin cabang, admin pusat, dan wali murid.</div>
    </section>
    <main className="min-h-screen flex items-center justify-center p-4">
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white grid place-items-center font-black text-lg">S</div>
        <div>
          <div className="text-2xl font-black text-slate-900 leading-none">SIAGA</div>
          <div className="text-sm text-slate-500">Taruna Prima</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 mb-5">
        {[['staff','Staff'],['wali','Wali Murid']].map(([id,label])=>
          <button key={id} type="button" onClick={()=>setTab(id)} className={`py-2 text-sm font-bold rounded-lg ${tab===id?'bg-white text-amber-700 shadow-sm':'text-slate-500'}`}>{label}</button>
        )}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {tab==='staff'?<Field label="Username" value={form.username} onChange={v=>setForm(f=>({...f,username:v}))} autoFocus/>:
          <Field label="Nomor WhatsApp" value={form.no_wa} onChange={v=>setForm(f=>({...f,no_wa:v}))} autoFocus/>}
        <Field label="Password" type="password" value={form.password} onChange={v=>setForm(f=>({...f,password:v}))}/>
        {err&&<div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{err}</div>}
        <button disabled={loading} className="w-full py-3 bg-amber-500 text-white font-black rounded-xl disabled:opacity-50">{loading?'Masuk...':'Masuk'}</button>
      </form>
      {import.meta.env.DEV&&tab==='staff'&&<button onClick={()=>setForm({username:'admin',no_wa:'',password:'admin123'})} className="mt-4 text-xs font-bold text-amber-700">Isi akun dev admin</button>}
    </div>
    </main>
  </div>;
}

function Field({label,value,onChange,type='text',autoFocus=false}){
  return <label className="block">
    <span className="text-xs font-bold text-slate-500">{label}</span>
    <input type={type} value={value} autoFocus={autoFocus} onChange={e=>onChange(e.target.value)} className="mt-1 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"/>
  </label>;
}
