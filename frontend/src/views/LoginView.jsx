import{useState}from'react';
import{api}from'../api';
import{Eye,EyeOff,Sun,Moon}from'lucide-react';

export default function LoginView({onLogin, theme, setTheme}){
  const[tab,setTab]=useState('staff');
  const[form,setForm]=useState({username:'',no_wa:'',password:''});
  const[err,setErr]=useState('');const[loading,setLoading]=useState(false);
  const[showPassword,setShowPassword]=useState(false);
  async function submit(e){
    e.preventDefault();setErr('');setLoading(true);
    try{
      const d=await api.login(tab==='wali'?{tipe:'wali',no_wa:form.no_wa.trim(),password:form.password}:{tipe:'staff',username:form.username.trim(),password:form.password});
      api.setToken(d.token);onLogin(d.user);
    }catch(e){setErr(e.message);}finally{setLoading(false);}
  }
  const canSubmit=tab==='wali'?form.no_wa.trim()&&form.password:form.username.trim()&&form.password;
  const branchStats=['Godean','Kentungan','Nitikan','Balong','Solo'];
  return <div className="min-h-[100dvh] bg-slate-50 grid lg:grid-cols-[minmax(0,1fr)_460px]">
    <section className="hidden lg:flex min-h-[100dvh] bg-slate-950 text-white p-10 xl:p-12 flex-col justify-between relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,.05),transparent_42%)] pointer-events-none" />
      <div className="relative flex items-center gap-5">
        <div className="rounded-2xl bg-white p-3 shadow-[0_24px_80px_rgba(15,23,42,.35)]">
          <img src="/tp_logo.png" alt="Taruna Prima Logo" width="224" height="64" className="w-56 h-auto object-contain" />
        </div>
        <div className="border-l border-white/15 pl-5">
          <div className="text-2xl font-black tracking-wide leading-none">SIAGA</div>
          <div className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-[0.18em]">Sistem Informasi</div>
        </div>
      </div>
      <div className="relative max-w-2xl">
        <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black tracking-[0.16em] text-primary uppercase">Satu server, lima cabang</div>
        <h1 className="mt-5 text-5xl xl:text-6xl font-black leading-[1.02] tracking-[-0.03em]">Operasional sekolah yang rapi dari gerbang sampai laporan wali.</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300">Absensi, penitipan, billing, catatan guru, dan akses wali murid dikelola dalam satu alur kerja yang konsisten untuk seluruh cabang Taruna Prima.</p>
        <div className="mt-9 grid grid-cols-5 gap-2">
          {branchStats.map((c,i)=><div key={c} className={`rounded-xl border border-white/10 bg-white/[0.06] p-3 ${i===0?'col-span-2':''}`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Cabang</div>
            <div className="mt-1 font-black text-white">{c}</div>
          </div>)}
        </div>
      </div>
      <div className="relative grid grid-cols-3 gap-3 text-sm text-slate-300">
        <div className="border-t border-white/10 pt-3"><span className="block text-lg font-black text-white">7</span>Peran pengguna</div>
        <div className="border-t border-white/10 pt-3"><span className="block text-lg font-black text-white">5</span>Cabang aktif</div>
        <div className="border-t border-white/10 pt-3"><span className="block text-lg font-black text-white">1</span>Portal terpadu</div>
      </div>
    </section>
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6">
    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 sm:p-7 relative overflow-hidden shadow-[0_24px_80px_rgba(15,23,42,.08)]">
      {/* Decorative mascot */}
      <img
        src="/runa-rima.png"
        alt=""
        width="112"
        height="112"
        className="absolute -right-5 -top-5 w-28 opacity-90 pointer-events-none select-none"
      />
      <div className="mb-6 flex flex-col gap-4 relative z-10">
        <div className="flex items-center justify-between gap-3">
          <img src="/tp_logo.png" alt="Taruna Prima Logo" width="176" height="50" className="w-44 h-auto object-contain" />
          <button
            type="button"
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 flex-shrink-0"
            aria-label={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
        <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-black text-text-main leading-none tracking-[-0.02em]">Masuk SIAGA</div>
              <div className="mt-1 text-sm text-slate-500">Portal akses sekolah Taruna Prima</div>
            </div>
            <span className="rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">Aman</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 mb-5" role="tablist" aria-label="Tipe akses">
        {[['staff','Staff'],['wali','Wali Murid']].map(([id,label])=>
          <button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>setTab(id)} className={`py-2 text-sm font-bold rounded-lg transition-all duration-200 ${tab===id?'bg-white text-primary border border-slate-200 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{label}</button>
        )}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {tab==='staff'?<Field label="Username" value={form.username} onChange={v=>setForm(f=>({...f,username:v}))} autoComplete="username" spellCheck={false} autoFocus/>:
          <Field label="Nomor WhatsApp" value={form.no_wa} onChange={v=>setForm(f=>({...f,no_wa:v}))} autoComplete="username" spellCheck={false} autoFocus/>}
        <Field label="Password" type={showPassword?'text':'password'} value={form.password} onChange={v=>setForm(f=>({...f,password:v}))} autoComplete="current-password" trailing={
          <button type="button" onClick={()=>setShowPassword(v=>!v)} className="rounded-lg p-1.5 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20" aria-label={showPassword?'Sembunyikan password':'Lihat password'}>
            {showPassword?<EyeOff className="size-4"/>:<Eye className="size-4"/>}
          </button>
        }/>
        {err&&<div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2" role="alert">{err}</div>}
        <button disabled={loading||!canSubmit} className="w-full h-11 px-4 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover active:bg-primary-active active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">{loading?'Masuk...':'Masuk'}</button>
      </form>
      {import.meta.env.DEV&&tab==='staff'&&<button onClick={()=>setForm({username:'admin',no_wa:'',password:'admin123'})} className="mt-4 text-xs font-bold text-primary hover:text-primary-hover transition-colors duration-200">Isi akun dev admin</button>}
    </div>
    </main>
  </div>;
}

function Field({label,value,onChange,type='text',autoFocus=false,autoComplete,spellCheck,trailing}){
  return <label className="block">
    <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
    <span className="mt-1.5 flex items-center rounded-xl border border-slate-200 bg-white px-3 transition-all duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <input type={type} value={value} autoFocus={autoFocus} onChange={e=>onChange(e.target.value)} autoComplete={autoComplete} spellCheck={spellCheck} className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm outline-none"/>
      {trailing}
    </span>
  </label>;
}
