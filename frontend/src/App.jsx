import{Suspense,lazy,useEffect,useState,useRef}from'react';
import{api}from'./api';
import LoginView from'./views/LoginView';
import{ActionButton,IconButton}from'./components/Shared';
import{Bell,CheckCheck,LogOut,Save,Menu,Shield,GraduationCap,BookOpen,KeyRound,User,ChevronDown,ChevronRight,Eye,EyeOff,Sun,Moon}from'lucide-react';

const AdminView=lazy(()=>import('./views/AdminView'));
const GuruView=lazy(()=>import('./views/GuruView'));
const KepsekView=lazy(()=>import('./views/KepsekView'));
const GerbangView=lazy(()=>import('./views/GerbangView'));
const WaliView=lazy(()=>import('./views/WaliView'));

const iconMap = {
  admin: Shield,
  kepsek: GraduationCap,
  guru: BookOpen,
  gerbang: KeyRound,
  wali: User
};

const submenuMap = {
  admin: [
    { id: 'siswa', label: 'Siswa' },
    { id: 'cabang', label: 'Cabang' },
    { id: 'staff', label: 'Staff' },
    { id: 'wali', label: 'Wali' },
    { id: 'rombel', label: 'Rombel' },
    { id: 'billing', label: 'Billing' },
    { id: 'laporan', label: 'Laporan' },
    { id: 'config', label: 'Konfigurasi' },
    { id: 'kalender', label: 'Kalender' },
    { id: 'audit', label: 'Audit Log' }
  ],
  kepsek: [
    { id: 'monitoring', label: 'Monitoring' },
    { id: 'laporan', label: 'Laporan Harian' },
    { id: 'keuangan', label: 'Keuangan' },
    { id: 'notifikasi', label: 'Notifikasi' }
  ],
  guru: [
    { id: 'daily', label: 'Daily Record' },
    { id: 'absensi', label: 'Absensi' },
    { id: 'modulAjar', label: 'Focus Theme' }
  ]
};

export default function App(){
  const[user,setUser]=useState(null);const[view,setView]=useState('');const[checking,setChecking]=useState(true);const[toasts,setToasts]=useState([]);
  const[notif,setNotif]=useState([]);const[showNotif,setShowNotif]=useState(false);
  const[sidebarOpen,setSidebarOpen]=useState(false);
  const[desktopCollapsed,setDesktopCollapsed]=useState(()=>{
    try{
      return localStorage.getItem('sidebar_collapsed')==='true';
    }catch(e){
      return false;
    }
  });
  const[activeTab,setActiveTab]=useState('');
  const[expandedMenus,setExpandedMenus]=useState({});
  const sidebarRef = useRef(null);
  const[theme,setTheme]=useState(()=>{
    try{
      const saved=localStorage.getItem('siaga_theme');
      if(saved)return saved;
      if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches){
        return 'dark';
      }
      return 'light';
    }catch(e){
      return 'light';
    }
  });

  useEffect(()=>{
    try{
      localStorage.setItem('siaga_theme',theme);
    }catch(e){}
    if(theme==='dark'){
      document.documentElement.classList.add('dark');
    }else{
      document.documentElement.classList.remove('dark');
    }
    const metaThemeColor=document.querySelector('meta[name="theme-color"]');
    if(metaThemeColor){
      metaThemeColor.setAttribute('content',theme==='dark'?'#090d16':'#f59e0b');
    }
  },[theme]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (window.innerWidth >= 768 && !desktopCollapsed) {
        if (sidebarRef.current) {
          const path = event.composedPath();
          const clickedInside = path.includes(sidebarRef.current);
          if (!clickedInside) {
            const isToggleBtn = path.some(el => el.classList && el.classList.contains('menu-toggle-btn'));
            if (isToggleBtn) {
              return;
            }
            setDesktopCollapsed(true);
          }
        }
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [desktopCollapsed]);
  useEffect(()=>{
    try{
      localStorage.setItem('sidebar_collapsed',desktopCollapsed?'true':'false');
    }catch(e){}
  },[desktopCollapsed]);
  useEffect(()=>{
    api.me().then(u=>{
      setUser(u);
      const searchParams = new URLSearchParams(window.location.search);
      const urlView = searchParams.get('view');
      const urlTab = searchParams.get('tab');
      const nav = navFor(u);
      let targetView = urlView;
      if (!urlView || !nav.some(n => n.id === urlView)) {
        targetView = defaultView(u);
      }
      setView(targetView);
      const sub = submenuMap[targetView];
      if (sub) {
        const targetTab = sub.some(s => s.id === urlTab) ? urlTab : sub[0].id;
        setActiveTab(targetTab);
        setExpandedMenus(prev => ({ ...prev, [targetView]: true }));
      } else {
        setActiveTab('');
      }
    }).catch(()=>{}).finally(()=>setChecking(false));
  },[]);
  useEffect(()=>{
    function handleUnauthorized(){
      setUser(null);
      setView('');
      setActiveTab('');
      setNotif([]);
      setShowNotif(false);
      window.history.replaceState(null,'',window.location.pathname);
      toast('err','Sesi berakhir. Silakan masuk kembali.');
    }
    window.addEventListener('siaga:unauthorized',handleUnauthorized);
    return()=>window.removeEventListener('siaga:unauthorized',handleUnauthorized);
  },[]);
  useEffect(() => {
    if (view) {
      const searchParams = new URLSearchParams(window.location.search);
      let changed = false;
      if (searchParams.get('view') !== view) {
        searchParams.set('view', view);
        changed = true;
      }
      const sub = submenuMap[view];
      if (sub && activeTab) {
        if (searchParams.get('tab') !== activeTab) {
          searchParams.set('tab', activeTab);
          changed = true;
        }
      } else {
        if (searchParams.has('tab')) {
          searchParams.delete('tab');
          changed = true;
        }
      }
      if (changed) {
        window.history.replaceState(null, '', `?${searchParams.toString()}`);
      }
    }
    setSidebarOpen(false);
  }, [view, activeTab]);
  useEffect(()=>{if(user&&!user.must_change_password)api.notifikasi().then(setNotif).catch(()=>{});},[user?.id,user?.must_change_password,view]);
  function login(u){
    setUser(u);
    const searchParams = new URLSearchParams(window.location.search);
    const urlView = searchParams.get('view');
    const urlTab = searchParams.get('tab');
    const nav = navFor(u);
    let targetView = urlView;
    if (!urlView || !nav.some(n => n.id === urlView)) {
      targetView = defaultView(u);
    }
    setView(targetView);
    const sub = submenuMap[targetView];
    if (sub) {
      const targetTab = sub.some(s => s.id === urlTab) ? urlTab : sub[0].id;
      setActiveTab(targetTab);
      setExpandedMenus(prev => ({ ...prev, [targetView]: true }));
    } else {
      setActiveTab('');
    }
  }
  function handleMainMenuClick(viewId) {
    const sub = submenuMap[viewId];
    if (sub) {
      setExpandedMenus(prev => ({ ...prev, [viewId]: !prev[viewId] }));
    }
    if (view !== viewId) {
      setView(viewId);
      if (sub) {
        setActiveTab(sub[0].id);
        setExpandedMenus(prev => ({ ...prev, [viewId]: true }));
      } else {
        setActiveTab('');
      }
    }
  }
  function logout(){api.logout().catch(()=>{});api.clearToken();setUser(null);setView('');setNotif([]);window.history.replaceState(null, '', window.location.pathname);}
  function toast(type,msg){const id=Date.now();setToasts(t=>[...t,{id,type,msg}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);}
  async function markAllRead(){try{await api.readAllNotif();setNotif(n=>n.map(x=>({...x,read_at:x.read_at||new Date().toISOString()})));}catch{}}
  if(checking)return <div className="min-h-screen grid place-items-center bg-slate-100"><div className="w-8 h-8 border-4 border-primary-container border-t-primary rounded-full animate-spin"/></div>;
  if(!user)return <LoginView onLogin={login} theme={theme} setTheme={setTheme}/>;
  if(user.must_change_password) {
    return <>
      <ChangePassword user={user} onDone={login} onLogout={logout} toast={toast}/>
      <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 space-y-2 z-50" aria-live="polite" aria-atomic="false">
        {toasts.map(t=><div key={t.id} className={`px-4 py-3 rounded-xl border border-black/10 text-sm font-bold shadow-xl shadow-slate-900/10 ${t.type==='err'?'bg-red-600 text-white':'bg-text-main text-white'}`}>{t.msg}</div>)}
      </div>
    </>;
  }
  const nav=navFor(user);
  const activeViewLabel=nav.find(n => n.id === view)?.label || 'Dashboard';
  const unreadCount=notif.filter(n=>!n.read_at).length;
  return <div className="min-h-[100dvh] bg-slate-100 text-text-main flex flex-col md:flex-row">
    {/* Sidebar drawer backdrop (mobile only) */}
    {sidebarOpen && (
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden" 
        onClick={() => setSidebarOpen(false)} 
      />
    )}

    {/* Left Sidebar */}
    <aside 
      ref={sidebarRef}
      className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200/70 flex flex-col transition-all duration-300 md:sticky md:top-0 md:h-[100dvh] md:translate-x-0 shadow-2xl shadow-slate-900/10 md:shadow-none ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } ${
        desktopCollapsed ? 'w-64 md:w-16' : 'w-64'
      }`}
    >
      {/* Profile summary card in Sidebar - Starts immediately at the top */}
      <div className={`border-b border-slate-200/70 bg-slate-50 flex items-center justify-between gap-3 transition-all duration-300 ${
        desktopCollapsed ? 'md:p-3 md:justify-center p-4' : 'p-4'
      }`}>
        <div className={`flex items-center gap-3 min-w-0 ${desktopCollapsed ? 'md:justify-center w-full' : ''}`}>
          {user.foto ? (
            <img 
              src={user.foto} 
              className="w-10 h-10 rounded-full object-cover border border-slate-200/60 shadow-sm flex-shrink-0" 
              alt={user.display_name} 
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-primary-container border border-primary/20 text-primary flex items-center justify-center font-black flex-shrink-0">
              {user.display_name?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div className={`min-w-0 ${desktopCollapsed ? 'md:hidden' : 'block'}`}>
            <div className="text-sm font-bold text-text-main truncate">{user.display_name}</div>
            <div className="text-[11px] font-bold text-slate-400 capitalize tracking-wide">{user.role.replace('_',' ')}</div>
          </div>
        </div>
        {/* Hamburger close button inside the drawer (mobile only) */}
        <IconButton 
          icon={Menu} 
          onClick={() => setSidebarOpen(false)} 
          className="md:hidden flex-shrink-0" 
          label="Tutup Menu" 
        />
      </div>

      {/* Navigation Stack */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
        {nav.map(n => {
          const Icon = iconMap[n.id] || Shield;
          const isActive = view === n.id;
          return (
            <div key={n.id} className="space-y-1">
              <button
                onClick={() => {
                  handleMainMenuClick(n.id);
                  if (!submenuMap[n.id]) {
                    setSidebarOpen(false);
                  }
                }}
                className={`w-full flex items-center justify-between rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  desktopCollapsed ? 'md:justify-center md:p-2 px-3 py-2' : 'px-3 py-2'
                } ${
                  isActive
                    ? 'bg-primary text-white shadow-sm shadow-primary/20'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/70'
                }`}
                title={n.label}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className={desktopCollapsed ? 'md:hidden' : ''}>{n.label}</span>
                </div>
                {submenuMap[n.id] && (
                  <span className={`${isActive ? 'text-white' : 'text-slate-400'} ${desktopCollapsed ? 'md:hidden' : ''}`}>
                    {expandedMenus[n.id] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </span>
                )}
              </button>
              
              {/* Collapsible Submenus */}
              {submenuMap[n.id] && expandedMenus[n.id] && (
                <div className={`pl-6 space-y-1 mt-1 border-l border-slate-200 ml-5 ${desktopCollapsed ? 'md:hidden' : ''}`}>
                  {submenuMap[n.id].map(sub => {
                    const isSubActive = view === n.id && activeTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setView(n.id);
                          setActiveTab(sub.id);
                          setSidebarOpen(false);
                        }}
                        className={`w-full text-left rounded-lg text-[11px] font-bold px-3 py-1.5 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                          isSubActive
                            ? 'bg-primary-container text-primary'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-200/70 flex flex-col gap-2">
        <button
          onClick={logout}
          className={`w-full flex items-center rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-transparent transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 ${
            desktopCollapsed ? 'md:justify-center md:p-2 gap-3 px-3 py-2' : 'gap-3 px-3 py-2'
          }`}
          title="Keluar"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className={desktopCollapsed ? 'md:hidden' : ''}>Keluar</span>
        </button>
      </div>
    </aside>

    {/* Right side container */}
    <div className="flex-1 min-w-0 flex flex-col min-h-[100dvh]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/70 transition-all duration-300">
        <div className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
             {/* Hamburger button for mobile, collapse button for desktop */}
             <IconButton 
               icon={Menu} 
               onClick={() => {
                 if (window.innerWidth < 768) {
                   setSidebarOpen(true);
                 } else {
                   setDesktopCollapsed(v => !v);
                 }
               }} 
               label="Menu" 
               className="menu-toggle-btn"
             />

              {/* Logo and Brand (SIAGA - Taruna Prima) always outside in header */}
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src="/tp_logo.png"
                  alt="Taruna Prima Logo"
                  className="h-10 w-auto object-contain flex-shrink-0"
                />
                <div className="hidden xs:block border-l border-slate-200 h-8 self-center" />
                <div className="min-w-0 leading-tight">
                  <span className="font-black text-text-main text-sm sm:text-base block leading-none">SIAGA</span>
                  <span className="mt-1 text-[10px] font-bold text-slate-400 block truncate max-w-[100px] sm:max-w-[180px]">
                    {user.cabang_nama||'Taruna Prima'}
                  </span>
                </div>
              </div>

             {/* Divider and active view title */}
             <div className="hidden xs:flex items-center gap-2 min-w-0">
               <div className="w-[1px] h-4 bg-slate-200/80 flex-shrink-0" />
               <span className="font-black text-text-main text-xs truncate">
                 {activeViewLabel}
               </span>
             </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <IconButton
              icon={theme==='dark'?Sun:Moon}
              label={theme==='dark'?'Mode Terang':'Mode Gelap'}
              onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}
            />

            {/* Notifications Toggle */}
            <div className="relative">
              <IconButton 
                icon={Bell} 
                label={`Notifikasi ${unreadCount}`}
                onClick={()=>setShowNotif(v=>!v)} 
                className="relative"
              />
              {unreadCount>0&&<span className="absolute -top-1 -right-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-black border-2 border-white">{unreadCount}</span>}
              {showNotif&&<div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-2xl p-3 z-50 animate-bounce-in shadow-2xl shadow-slate-900/12">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="font-black text-text-main leading-none">Notifikasi</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-400">{unreadCount} belum dibaca</div>
                  </div>
                  <ActionButton icon={CheckCheck} onClick={markAllRead} variant="ghost" className="px-3 py-1 text-xs">Tandai</ActionButton>
                </div>
                <div className="max-h-96 overflow-y-auto space-y-2 custom-scrollbar">{notif.map(n=><div key={n.id} className={`rounded-xl border p-3 transition-colors duration-200 ${n.read_at?'bg-white border-slate-100':'bg-primary-container border-primary/20'}`}><div className="text-sm font-black text-text-main">{n.title}</div><div className="text-xs text-slate-500 mt-1 leading-relaxed">{n.body||n.tipe}</div><div className="text-[11px] font-bold text-slate-400 mt-2">{fmtTime(n.created_at)}</div></div>)}{notif.length===0&&<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm font-bold text-slate-400 p-6 text-center">Belum ada notifikasi.</div>}</div>
              </div>}
            </div>

            {/* Logout button (mobile top bar shortcut / keep consistent) */}
            <IconButton icon={LogOut} label="Keluar" onClick={logout} className="md:hidden" />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 bg-slate-100">
        <Suspense fallback={<div className="grid min-h-[50vh] place-items-center"><div className="flex flex-col items-center gap-3 text-sm font-bold text-slate-500"><div className="w-8 h-8 border-4 border-primary-container border-t-primary rounded-full animate-spin"/><span>Memuat modul...</span></div></div>}>
          {view==='admin'&&<AdminView user={user} toast={toast} tab={activeTab}/>}
          {view==='guru'&&<GuruView user={user} toast={toast} tab={activeTab}/>}
          {view==='kepsek'&&<KepsekView user={user} toast={toast} tab={activeTab}/>}
          {view==='gerbang'&&<GerbangView user={user} toast={toast}/>}
          {view==='wali'&&<WaliView user={user} toast={toast}/>}
        </Suspense>
      </main>
    </div>

    {/* Toasts */}
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 space-y-2 z-50" aria-live="polite" aria-atomic="false">{toasts.map(t=><div key={t.id} className={`px-4 py-3 rounded-xl border border-black/10 text-sm font-bold shadow-xl shadow-slate-900/10 ${t.type==='err'?'bg-red-600 text-white':'bg-text-main text-white'}`}>{t.msg}</div>)}</div>
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
  const[form,setForm]=useState({old_password:'',new_password:'',confirm_password:''});const[loading,setLoading]=useState(false);const[show,setShow]=useState({});
  const passwordMismatch=form.confirm_password&&form.new_password!==form.confirm_password;
  const passwordInvalid=form.new_password&&!(form.new_password.length>=10&&/[A-Za-z]/.test(form.new_password)&&/\d/.test(form.new_password));
  async function submit(e){
    e.preventDefault();
    if(form.new_password!==form.confirm_password){toast('err','Konfirmasi password tidak sama');return;}
    if(!(form.new_password.length>=10&&/[A-Za-z]/.test(form.new_password)&&/\d/.test(form.new_password))){toast('err','Password baru minimal 10 karakter serta mengandung huruf dan angka');return;}
    setLoading(true);
    try{const result=await api.changePassword({old_password:form.old_password,new_password:form.new_password});api.setToken(result.token);onDone(result.user);toast('ok','Password diperbarui');}catch(e){toast('err',e.message);}finally{setLoading(false);}
  }
  return <div className="min-h-[100dvh] bg-slate-50 grid place-items-center p-4">
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 w-full max-w-md space-y-4 shadow-[0_24px_80px_rgba(15,23,42,.08)]">
      <div className="space-y-2">
        <div className="inline-flex rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">Keamanan akun</div>
        <div className="text-2xl font-black text-text-main tracking-[-0.02em]">Ganti password</div>
        <div className="text-sm text-slate-500 leading-relaxed">Halo {user.display_name}, password sementara harus diganti sebelum lanjut memakai SIAGA.</div>
      </div>
      {!user.must_change_password&&<Input label="Password lama" type={show.old?'text':'password'} value={form.old_password} onChange={v=>setForm(f=>({...f,old_password:v}))} trailing={<PasswordToggle shown={show.old} onClick={()=>setShow(s=>({...s,old:!s.old}))}/>}/>}
      <Input label="Password baru" type={show.new?'text':'password'} value={form.new_password} onChange={v=>setForm(f=>({...f,new_password:v}))} trailing={<PasswordToggle shown={show.new} onClick={()=>setShow(s=>({...s,new:!s.new}))}/>}/>
      <Input label="Ulangi password baru" type={show.confirm?'text':'password'} value={form.confirm_password} onChange={v=>setForm(f=>({...f,confirm_password:v}))} trailing={<PasswordToggle shown={show.confirm} onClick={()=>setShow(s=>({...s,confirm:!s.confirm}))}/>}/>
      {passwordInvalid&&<div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">Password minimal 10 karakter serta mengandung huruf dan angka.</div>}
      {passwordMismatch&&<div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">Konfirmasi password harus sama.</div>}
      <ActionButton type="submit" icon={Save} disabled={loading||!form.new_password||!form.confirm_password||passwordMismatch||passwordInvalid} className="w-full rounded-xl">{loading?'Menyimpan...':'Simpan'}</ActionButton>
      <ActionButton icon={LogOut} type="button" onClick={onLogout} variant="ghost" className="w-full">Keluar</ActionButton>
    </form>
  </div>;
}
function PasswordToggle({shown,onClick}){
  return <button type="button" onClick={onClick} className="rounded-lg p-1.5 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20" aria-label={shown?'Sembunyikan password':'Lihat password'}>{shown?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button>;
}
function Input({label,value,onChange,type='text',trailing}){
  return <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span><span className="mt-1.5 flex items-center rounded-xl border border-slate-200 bg-white px-3 transition-all duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"><input type={type} value={value} onChange={e=>onChange(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent py-2.5 outline-none"/>{trailing}</span></label>;
}
