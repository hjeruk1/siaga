import{useEffect,useState,useCallback}from'react';
import{api}from'../api';
import{IconButton,ActionButton}from'../components/Shared';
import{Send,ArrowLeft,Receipt,CreditCard,FileText,Download,BookOpen,GraduationCap,Users,MapPin,Award}from'lucide-react';

function StudentAvatar({ name, url, size = 'md' }) {
  const boxClass = size === 'xl' 
    ? 'w-20 h-20 rounded-2xl' 
    : size === 'lg' 
      ? 'w-12 h-12 rounded-xl' 
      : 'w-9 h-9 rounded-lg';
  const textClass = size === 'xl' ? 'text-2xl' : size === 'lg' ? 'text-lg' : 'text-xs';

  if (url) {
    return <img src={url} className={`${boxClass} object-cover border border-slate-200/60 shadow-sm`} alt={name} />;
  }

  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0] ? parts[0][0].toUpperCase() : '?';

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-50 text-blue-600 border-blue-100',
    'bg-emerald-50 text-emerald-600 border-emerald-100',
    'bg-indigo-50 text-indigo-600 border-indigo-100',
    'bg-violet-50 text-violet-600 border-violet-100',
    'bg-amber-50 text-amber-600 border-amber-100',
    'bg-rose-50 text-rose-600 border-rose-100',
    'bg-cyan-50 text-cyan-600 border-cyan-100',
  ];
  const colorClass = colors[Math.abs(hash) % colors.length];

  return (
    <div className={`${boxClass} flex items-center justify-center font-black ${colorClass} border shadow-sm`}>
      <span className={textClass}>{initials}</span>
    </div>
  );
}

export default function WaliView({toast}){
  const[siswa,setSiswa]=useState([]);const[selected,setSelected]=useState(null);const[history,setHistory]=useState([]);const[detail,setDetail]=useState(null);const[comment,setComment]=useState('');
  const[notif,setNotif]=useState([]);
  const[activeTab,setActiveTab]=useState('daily');
  const[billingInfo,setBillingInfo]=useState(null);
  const[loadingBilling,setLoadingBilling]=useState(false);

  async function load(){const s=await api.waliChildren();setSiswa(s);if(!selected&&s[0])setSelected(s[0]);}
  useEffect(()=>{load().catch(e=>toast('err',e.message));},[]);
  useEffect(()=>{api.notifikasi().then(setNotif).catch(()=>{});},[]);

  const loadBilling = useCallback(async (siswaId) => {
    setLoadingBilling(true);
    try {
      const data = await api.waliBilling(siswaId);
      setBillingInfo(data);
    } catch (e) {
      toast('err', e.message);
    } finally {
      setLoadingBilling(false);
    }
  }, [toast]);

  useEffect(()=>{
    if(selected) {
      api.dailyHistory(selected.id,30).then(setHistory).catch(e=>toast('err',e.message));
      loadBilling(selected.id);
    }
  },[selected?.id, loadBilling]);

  async function open(id){const d=await api.dailyDetail(id);setDetail(d);if(d.read===null)api.notifikasi().then(setNotif).catch(()=>{});}
  async function send(){try{await api.commentDaily(detail.id,comment);setComment('');setDetail(await api.dailyDetail(detail.id));toast('ok','Feedback terkirim');}catch(e){toast('err',e.message);}}
  async function markRead(id){try{await api.readNotif(id);setNotif(n=>n.map(x=>x.id===id?{...x,read_at:new Date().toISOString()}:x));}catch{}}
  
  async function openFromNotif(n){
    if(n.entity_type==='laporan_harian'&&n.entity_id){
      markRead(n.id);
      setActiveTab('daily');
      open(n.entity_id);
    } else if (['invoice', 'pembayaran'].includes(n.entity_type)) {
      markRead(n.id);
      setActiveTab('billing');
    }
  }

  const unreadCount=notif.filter(n=>!n.read_at).length;

  function money(v) {
    return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
  }

  return <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4">
    <section className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-black text-text-main">Portal Wali</h1>
          <p className="text-sm text-slate-500">Daily record dan feedback.{unreadCount>0&&<span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">{unreadCount} baru</span>}</p>
        </div>
        {siswa.length > 1 ? (
          <div className="flex gap-1.5 p-1 bg-slate-100 rounded-lg">
            {siswa.map(s => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                  selected?.id === s.id
                    ? 'bg-white text-text-main border border-slate-200/50'
                    : 'text-slate-500 hover:text-text-main'
                }`}
              >
                {s.nama_panggilan || s.nama.split(' ')[0]}
              </button>
            ))}
          </div>
        ) : siswa.length === 1 ? (
          <span className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50">
            {siswa[0].nama}
          </span>
        ) : null}
      </div>

      {/* Redesigned Student & Teacher Info Card */}
      {selected && (
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200 rounded-2xl p-5 mb-6 relative overflow-hidden group">
          {/* Decorative accent gradient bar */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-indigo-500" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Student Info (Siswa) */}
            <div className="flex items-center gap-4">
              <StudentAvatar name={selected.nama} url={selected.foto} size="xl" />
              <div>
                <span className="text-[10px] font-black text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">Siswa Aktif</span>
                <h2 className="text-xl font-black text-slate-800 mt-1 leading-tight">{selected.nama}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                    Kelas: <span className="font-bold text-slate-700">{selected.rombel_nama || '-'}</span>
                  </div>
                  <span className="text-slate-300">•</span>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {selected.cabang_nama || 'Pusat'}
                  </div>
                  {selected.paket && (
                    <>
                      <span className="text-slate-300">•</span>
                      <div className="flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-slate-400" />
                        Paket: <span className="font-bold text-slate-700 uppercase">{selected.paket}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Current Teachers (Guru Kelas) */}
            <div className="border-t md:border-t-0 md:border-l border-slate-200/80 pt-4 md:pt-0 md:pl-6 flex-1 max-w-xl">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Guru Kelas
              </h3>
              {selected.gurus && selected.gurus.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selected.gurus.map(g => (
                    <div key={g.id} className="bg-white border border-slate-200/60 rounded-xl p-2.5 flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StudentAvatar name={g.display_name} url={g.foto} size="md" />
                        <div className="min-w-0">
                          <div className="font-black text-slate-700 text-xs truncate max-w-[130px]" title={g.display_name}>{g.display_name}</div>
                          <span className={`inline-block text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase mt-0.5 ${
                            g.role === 'utama' 
                              ? 'bg-primary/10 text-primary' 
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {g.role === 'utama' ? 'Wali Kelas' : 'Bantu'}
                          </span>
                        </div>
                      </div>
                      
                      {g.no_wa && (
                        <a 
                          href={`https://wa.me/${g.no_wa.replace(/^0/, '62')}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-colors shadow-sm"
                          title={`Chat WhatsApp dengan ${g.display_name}`}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic bg-white border border-dashed border-slate-200 rounded-xl p-3 text-center">
                  Belum ada guru kelas yang ditugaskan.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-5 max-w-[200px]">
        <button type="button" onClick={() => setActiveTab('daily')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
            activeTab === 'daily'
              ? 'bg-white text-text-main shadow-sm'
              : 'text-slate-400 hover:text-slate-600'
          }`}>
          Harian
        </button>
        <button type="button" onClick={() => setActiveTab('billing')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
            activeTab === 'billing'
              ? 'bg-white text-text-main shadow-sm'
              : 'text-slate-400 hover:text-slate-600'
          }`}>
          Tagihan
        </button>
      </div>

      {activeTab === 'daily' ? (
        <div className="grid grid-cols-1 md:grid-cols-[.8fr_1.2fr] gap-4">
          <div className={`${detail ? 'hidden md:block' : 'block'} space-y-4`}>
            <div className="space-y-2">
              {history.map(h=><button key={h.id} onClick={()=>open(h.id)} className={`block w-full text-left rounded-xl border p-3 transition-all duration-200 ${detail?.id===h.id?'border-primary bg-primary-container':'border-slate-200 bg-slate-50 hover:border-primary/30'}`}>
                <div className="flex items-center gap-2"><span className="font-black text-text-main">{h.tanggal}</span>{h.read===null&&<span className="w-2 h-2 bg-red-500 rounded-full" title="Belum dibaca"/>}</div>
                <div className="text-sm text-slate-500">{h.rombel_nama} - {h.guru_nama||'Guru'}</div>
              </button>)}
              {history.length===0&&<div className="text-sm text-slate-400">Belum ada daily record published.</div>}
            </div>

            {/* Pedoman Istilah / Glossary */}
            <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <BookOpen className="w-4 h-4 text-primary" />
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">Pedoman Istilah Daily Record</h3>
              </div>
              
              <div className="space-y-3.5 text-[11px] leading-relaxed text-slate-600">
                {/* Mood Harian */}
                <div>
                  <div className="font-black text-slate-700 mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Mood Harian
                  </div>
                  <div className="pl-2.5 space-y-0.5 text-slate-500">
                    <div><b className="text-slate-800 font-black">Ceria:</b> Anak aktif berinteraksi, bersemangat, dan gembira.</div>
                    <div><b className="text-slate-800 font-black">Biasa:</b> Kondisi emosi anak stabil dan tenang.</div>
                    <div><b className="text-slate-800 font-black">Rewel:</b> Anak murung, menangis, atau butuh perhatian ekstra.</div>
                  </div>
                </div>

                {/* Konsumsi Makan */}
                <div>
                  <div className="font-black text-slate-700 mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Konsumsi Makan
                  </div>
                  <div className="pl-2.5 space-y-0.5 text-slate-500">
                    <div><b className="text-slate-800 font-black">Habis:</b> Porsi makan dihabiskan seutuhnya.</div>
                    <div><b className="text-slate-800 font-black">Setengah:</b> Hanya menghabiskan sekitar setengah porsi.</div>
                    <div><b className="text-slate-800 font-black">Tidak:</b> Anak menolak makan atau makan sangat sedikit.</div>
                  </div>
                </div>

                {/* Status Perkembangan */}
                <div>
                  <div className="font-black text-slate-700 mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    Status Perkembangan (IK)
                  </div>
                  <div className="pl-2.5 space-y-2 text-slate-500">
                    <div className="flex gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[9px] font-black h-fit shrink-0 min-w-[24px] text-center">BB</span>
                      <div><b className="text-slate-800 font-black">Belum Berkembang:</b> Anak belum menunjukkan kemampuan yang diharapkan.</div>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-black h-fit shrink-0 min-w-[24px] text-center">MB</span>
                      <div><b className="text-slate-800 font-black">Mulai Berkembang:</b> Anak mulai mencoba tetapi masih dibantu guru.</div>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-black h-fit shrink-0 min-w-[24px] text-center">BSH</span>
                      <div><b className="text-slate-800 font-black">Berkembang Sesuai Harapan:</b> Anak menunjukkan kemampuan secara konsisten.</div>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-black h-fit shrink-0 min-w-[24px] text-center">BSB</span>
                      <div><b className="text-slate-800 font-black">Berkembang Sangat Baik:</b> Anak mandiri dan melampaui target usianya.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={`${detail ? 'block' : 'hidden md:block'}`}>
            {detail?<Record detail={detail} comment={comment} setComment={setComment} send={send} onBack={()=>setDetail(null)}/>:<div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-400">Pilih daily record.</div>}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {loadingBilling ? (
            <div className="text-center py-12 text-slate-400 font-bold text-xs">Memuat data billing…</div>
          ) : !billingInfo ? (
            <div className="text-center py-12 text-slate-400 font-bold text-xs">Data billing tidak tersedia.</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col hover:border-slate-350 transition duration-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><Receipt className="w-4 h-4 text-amber-500"/></div>
                    <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Tagihan Tertunda</span>
                  </div>
                  <div className="text-base sm:text-2xl font-black text-amber-600 tabular-nums leading-tight">
                    {money(billingInfo.tagihan.reduce((sum, t) => sum + (t.nominal_final - t.paid_amount), 0))}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1.5">{billingInfo.tagihan.length} tagihan belum lunas</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col hover:border-slate-350 transition duration-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><CreditCard className="w-4 h-4 text-emerald-500"/></div>
                    <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Total Terbayar</span>
                  </div>
                  <div className="text-base sm:text-2xl font-black text-emerald-600 tabular-nums leading-tight">
                    {money(billingInfo.pembayaran.filter(p => p.status === 'confirmed').reduce((sum, p) => sum + p.nominal, 0))}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1.5">Koleksi terkonfirmasi</div>
                </div>
              </div>

              {/* Tagihan List */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                <h3 className="font-black text-text-main text-xs sm:text-sm flex items-center gap-2 uppercase tracking-wide">
                  <Receipt className="w-4 h-4 text-slate-400"/> Tagihan Aktif Belum Lunas
                </h3>
                {billingInfo.tagihan.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-6 font-semibold bg-slate-50/50 rounded-xl">Semua tagihan lunas. Terima kasih atas kerja sama Anda!</div>
                ) : (
                  <div className="space-y-3">
                    {billingInfo.tagihan.map(t => {
                      const sisa = Math.max(0, t.nominal_final - t.paid_amount);
                      return (
                        <div key={t.id} className="p-3.5 bg-slate-50/50 border border-slate-100 rounded-xl flex justify-between items-center text-xs">
                          <div>
                            <div className="font-bold text-slate-700">{t.nama}</div>
                            <div className="text-[10px] text-slate-400 mt-1">Periode: {t.periode || '-'} | Jenis: <span className="uppercase font-black text-slate-500">{t.jenis}</span></div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-slate-800 tabular-nums">{money(sisa)}</div>
                            {t.paid_amount > 0 && <div className="text-[9px] text-emerald-500 font-bold mt-0.5">Sudah dibayar: <span className="tabular-nums font-extrabold">{money(t.paid_amount)}</span></div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Invoices List */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                <h3 className="font-black text-text-main text-xs sm:text-sm flex items-center gap-2 uppercase tracking-wide">
                  <FileText className="w-4 h-4 text-slate-400"/> Dokumen Invoice Resmi
                </h3>
                {billingInfo.invoices.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-6 font-semibold bg-slate-50/50 rounded-xl">Belum ada dokumen invoice yang diterbitkan.</div>
                ) : (
                  <div className="space-y-3">
                    {billingInfo.invoices.map(inv => (
                      <div key={inv.id} className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold font-mono text-slate-700">{inv.invoice_no}</div>
                          <div className="text-[10px] text-slate-400 mt-1">Tahun Ajaran: {inv.tahun_ajaran} | Total: <span className="font-black tabular-nums">{money(inv.total)}</span></div>
                        </div>
                        <ActionButton
                          icon={Download}
                          onClick={() => {
                            window.open(`/api/billing/public/invoice/${inv.id}/pdf?key=${inv.public_key}`, '_blank');
                          }}
                          variant="ghost"
                          className="px-2.5 h-8 text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600"
                        >
                          Unduh PDF
                        </ActionButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payments List */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                <h3 className="font-black text-text-main text-xs sm:text-sm flex items-center gap-2 uppercase tracking-wide">
                  <CreditCard className="w-4 h-4 text-slate-400"/> Riwayat Pembayaran
                </h3>
                {billingInfo.pembayaran.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-6 font-semibold bg-slate-50/50 rounded-xl">Belum ada riwayat pembayaran tercatat.</div>
                ) : (
                  <div className="space-y-3">
                    {billingInfo.pembayaran.map(p => (
                      <div key={p.id} className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold font-mono text-slate-700">{p.receipt_no || 'Menunggu Verifikasi'}</div>
                          <div className="text-[10px] text-slate-400 mt-1">Tanggal: {p.tanggal_bayar} | Metode: <span className="uppercase">{p.metode}</span></div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="font-black text-slate-800 tabular-nums">{money(p.nominal)}</div>
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase mt-0.5 border ${
                              p.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                            }`}>
                              {p.status === 'confirmed' ? 'Dikonfirmasi' : 'Verifikasi'}
                            </span>
                          </div>
                          {p.status === 'confirmed' && (
                            <ActionButton
                              icon={Download}
                              onClick={() => {
                                window.open(`/api/billing/public/pembayaran/${p.id}/pdf?key=${p.public_key}`, '_blank');
                              }}
                              variant="ghost"
                              className="px-2.5 h-8 text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-650"
                            >
                              Kuitansi
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
    {notif.length>0&&<section className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3"><h2 className="font-black text-text-main">Notifikasi</h2><span className="text-xs text-slate-400">{unreadCount} belum dibaca dari {notif.length}</span></div>
      <div className="space-y-2">{notif.slice(0,15).map(n=><button key={n.id} onClick={()=>openFromNotif(n)} className={`w-full text-left rounded-xl p-3 border transition-colors duration-200 ${n.read_at?'bg-slate-50 border-slate-200 hover:bg-slate-100':'bg-primary-container border-primary/20 hover:border-primary/30'}`}><div className="flex items-start justify-between gap-2"><div className="font-bold text-text-main text-sm">{n.title}{!n.read_at&&<span className="ml-2 inline-block w-2 h-2 bg-primary rounded-full align-middle"/>}</div><span className="text-[11px] text-slate-400 whitespace-nowrap">{fmtNotifTime(n.created_at)}</span></div><div className="text-xs text-slate-500 mt-1">{n.body||n.tipe}</div></button>)}</div>
    </section>}
  </div>;
}

function Record({detail,comment,setComment,send,onBack}){
  const tidur=detail.tidur===1?'Ya':detail.tidur===0?'Tidak':'-';
  return <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
    {onBack && (
      <ActionButton icon={ArrowLeft} onClick={onBack} variant="ghost" className="md:hidden mb-2 px-3 h-8 text-xs font-semibold">
        Kembali
      </ActionButton>
    )}
    <div><div className="text-lg font-black text-text-main">{detail.siswa_nama}</div><div className="text-sm text-slate-500">{detail.tanggal} - {detail.rombel_nama}</div></div>
    {(detail.focus_theme_title||detail.modul_ajar_title)&&<div className="bg-white border border-primary/20 bg-primary-container/20 rounded-xl p-3">
      <div className="label">Focus Theme</div>
      <div className="font-black text-text-main">{detail.focus_theme_title||'-'}</div>
      {detail.modul_ajar_title&&<div className="text-xs text-slate-500 mt-1">Modul: {detail.modul_ajar_title}</div>}
      {detail.focus_theme_activity_summary&&<div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{detail.focus_theme_activity_summary}</div>}
    </div>}
    <div className="grid sm:grid-cols-3 gap-2">
      <Info label="Mood" value={detail.mood||'-'}/>
      <Info label="Makan" value={detail.makan ? `${detail.makan.toUpperCase()} ${detail.focus_theme_menu_makanan ? `(${detail.focus_theme_menu_makanan})` : ''}` : '-'}/>
      <Info label="Tidur" value={tidur}/>
    </div>
    {(detail.observation_domain||detail.observation_note)&&<div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="label">Observasi Guru</div>
      {detail.observation_domain&&<div className="text-xs font-black text-primary-active uppercase mb-1">{detail.observation_domain}</div>}
      <div className="text-sm text-text-main whitespace-pre-wrap">{detail.observation_note||'-'}</div>
    </div>}
    {detail.structured_observation && (detail.structured_observation.activities || detail.structured_observation.pillars) && (
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Capaian Perkembangan</div>
        
        {detail.structured_observation.activities && Object.keys(detail.structured_observation.activities).length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-text-main">Rencana Kegiatan</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(detail.structured_observation.activities).map(([act, rating]) => (
                <div key={act} className="flex justify-between items-center gap-3 p-2 bg-slate-50 rounded-lg text-xs border border-slate-100">
                  <span className="text-slate-700 font-medium">{act}</span>
                  <span className={`px-2.5 py-0.5 rounded font-black text-[10px] border ${
                    rating === 'BSB' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    rating === 'BSH' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    rating === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
                  }`}>{rating}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.structured_observation.pillars && Object.keys(detail.structured_observation.pillars).length > 0 && (
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <div className="text-xs font-bold text-text-main">Pilar Karakter & Tilawati</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(detail.structured_observation.pillars).map(([pillar, rating]) => {
                const labelMap = { iqra: 'Tilawati', akhlak: 'Akhlak', aktif_mandiri: 'Aktif & Mandiri', disiplin_tertib: 'Disiplin & Tertib' };
                return (
                  <div key={pillar} className="text-center p-2 bg-slate-50 rounded-lg text-xs border border-slate-100">
                    <div className="text-[10px] text-slate-400 font-semibold mb-1 truncate">{labelMap[pillar] || pillar}</div>
                    <span className={`inline-block px-2.5 py-0.5 rounded font-black text-[10px] border ${
                      rating === 'BSB' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      rating === 'BSH' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      rating === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
                    }`}>{rating}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    )}
    <div><div className="label">Aktivitas</div><div className="text-sm text-text-main">{(detail.aktivitas||[]).join(', ')||'-'}</div></div>
    <div><div className="label">Catatan</div><div className="text-sm text-text-main whitespace-pre-wrap">{detail.catatan||'-'}</div></div>
    {detail.parent_note&&<div><div className="label">Catatan untuk Wali</div><div className="text-sm text-text-main whitespace-pre-wrap">{detail.parent_note}</div></div>}
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{(detail.attachments||[]).map(a=><img key={a.id} src={a.url} className="aspect-square object-cover rounded-xl border border-slate-200" alt="foto daily record"/>)}</div>
    <div className="border-t border-slate-200 pt-4">
      <h3 className="font-black text-text-main mb-2">Komentar</h3>
      <div className="space-y-2 mb-3">{(detail.comments||[]).map(c=><div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3"><div className="text-xs font-black text-slate-500">{c.author_name}</div><div className="text-sm text-text-main">{c.body}</div></div>)}</div>
      <div className="flex gap-2"><input value={comment} onChange={e=>setComment(e.target.value)} className="input flex-1" placeholder="Tulis feedback"/><IconButton icon={Send} label="Kirim" onClick={send} variant="primary"/></div>
    </div>
  </div>;
}
function Info({label,value}){return <div className="bg-white border border-slate-200 rounded-xl p-3"><div className="label">{label}</div><div className="font-black text-text-main">{value}</div></div>;}
function fmtNotifTime(v){try{return new Intl.DateTimeFormat('id-ID',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(v));}catch{return v;}}
