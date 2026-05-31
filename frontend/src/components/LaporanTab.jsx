import{useState,useEffect,useCallback}from'react';
import{api}from'../api';
import{todayWIB}from'../components/Shared';

const AKTIVITAS=['Mewarnai','Bernyanyi & Menari','Bermain Bebas','Membaca & Menulis',
  'Motorik Halus','Motorik Kasar','Ibadah / Doa','Seni & Kerajinan','Bercerita','Bermain Peran'];

const MOOD_OPT=[{v:'ceria',l:'😊 Ceria',c:'bg-emerald-500'},{v:'biasa',l:'😐 Biasa',c:'bg-primary'},{v:'rewel',l:'😢 Rewel',c:'bg-red-500'}];
const MAKAN_OPT=[{v:'habis',l:'🍽️ Habis',c:'bg-emerald-500'},{v:'setengah',l:'🍱 Setengah',c:'bg-primary'},{v:'tidak',l:'❌ Tidak Dimakan',c:'bg-red-500'}];
const TIDUR_OPT=[{v:1,l:'💤 Ya',c:'bg-blue-500'},{v:0,l:'🙅 Tidak',c:'bg-slate-500'}];

function formalText(l,nama){
  if(!l||(!l.mood&&!l.makan&&(l.tidur===null||l.tidur===undefined)&&!(l.aktivitas?.length)&&!l.catatan))return null;
  const moodMap={ceria:'terlihat ceria dan bersemangat',biasa:'terlihat biasa saja',rewel:'terlihat sedikit rewel'};
  const makanMap={habis:'Makan siang habis dengan porsi penuh.',setengah:'Makan siang hanya setengah porsi.',tidak:'Anak tidak mau makan siang.'};
  const tidurText=l.tidur===1?'Anak tidur siang dengan baik.':'Anak tidak tidur siang hari ini.';
  const aktList=(l.aktivitas||[]).length>0?'Aktivitas yang dilakukan: '+(l.aktivitas||[]).join(', ')+'.':'';
  const catatan=l.catatan?'Catatan: '+l.catatan:'';
  return[
    l.mood?nama+' hari ini '+moodMap[l.mood]+'.':'',
    l.makan?makanMap[l.makan]:'',
    l.tidur!==null&&l.tidur!==undefined?tidurText:'',
    aktList,catatan
  ].filter(Boolean).join(' ');
}

function completeness(l){
  if(!l)return 0;
  let s=0,t=5;
  if(l.mood)s++;if(l.makan)s++;if(l.tidur!==null&&l.tidur!==undefined)s++;
  if((l.aktivitas||[]).length>0)s++;if(l.catatan)s++;
  return Math.round(s/t*100);
}

function CompleteBadge({pct}){
  if(pct===0)return<span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Belum diisi</span>;
  if(pct<100)return<span className="text-xs px-2 py-0.5 rounded-full bg-primary-container text-primary-active font-bold border border-primary/20">Sebagian {pct}%</span>;
  return<span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">✓ Lengkap</span>;
}

function StudentAvatar({siswa,size='lg'}){
  const s=size==='lg'?'w-16 h-16 text-xl':'w-10 h-10 text-sm';
  if(siswa.foto)return<img src={siswa.foto} alt={siswa.nama} className={`${s} rounded-2xl object-cover flex-shrink-0 border-2 border-white`}/>;
  return<div className={`${s} rounded-2xl bg-primary flex items-center justify-center text-white font-black flex-shrink-0`}>{siswa.nama[0]}</div>;
}

function EditLog({laporanId}){
  const[logs,setLogs]=useState(null);
  useEffect(()=>{if(laporanId)api.dailyEdits(laporanId).then(setLogs).catch(()=>setLogs([]));},[laporanId]);
  if(!logs?.length)return null;
  return(
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-bold text-slate-400 mb-2">RIWAYAT PERUBAHAN</p>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {logs.map((l,i)=>(
          <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0"/>
            <span>{l.created_at?.slice(0,16).replace('T',' ')} — {l.guru_nama||'Sistem'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryModal({siswa,onClose}){
  const[rows,setRows]=useState([]);const[loading,setLoading]=useState(true);
  const MOOD={ceria:'😊',biasa:'😐',rewel:'😢'};
  const MAKAN={habis:'Habis',setengah:'Setengah',tidak:'Tidak'};
  useEffect(()=>{api.getLaporanHistory(siswa.id,60).then(d=>{setRows(d);setLoading(false);});},[siswa.id]);
  return(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-h-[80vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-black text-text-main">Riwayat Laporan</div>
            <div className="text-xs text-slate-400">{siswa.nama} · {siswa.rombel_nama}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 text-xl">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading?<div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"/></div>:
          rows.length===0?<div className="text-center py-10 text-slate-400">Belum ada laporan tersimpan.</div>:
          <div className="space-y-3">{rows.map((l,i)=>(
            <div key={i} className="bg-slate-50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-slate-700">{l.tanggal}</div>
                <div className="text-xs text-slate-400">{l.updated_at?.slice(0,16).replace('T',' ')}</div>
              </div>
              <div className="flex gap-3 flex-wrap text-sm">
                {l.mood&&<span className="px-2 py-1 bg-white rounded-lg border border-slate-200">{MOOD[l.mood]} {l.mood}</span>}
                {l.makan&&<span className="px-2 py-1 bg-white rounded-lg border border-slate-200">{MAKAN[l.makan]}</span>}
                {l.tidur===1&&<span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">💤 Tidur</span>}
                {l.tidur===0&&<span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg border border-slate-200">🙅 Tdk tidur</span>}
              </div>
              {l.aktivitas?.length>0&&<div className="text-xs text-slate-500 mt-2">{Array.isArray(l.aktivitas)?l.aktivitas.join(' · '):l.aktivitas}</div>}
              {l.catatan&&<div className="text-xs text-slate-600 mt-2 italic">"{l.catatan}"</div>}
            </div>
          ))}</div>}
        </div>
      </div>
    </div>
  );
}

function ReportPanel({siswa,tanggal,onSaved,addToast}){
  const[laporan,setLaporan]=useState(null);
  const[saving,setSaving]=useState(false);
  const[catatan,setCatatan]=useState('');

  async function load(){
    const d=await api.getLaporan(siswa.id,tanggal);
    setLaporan(d||{siswa_id:siswa.id,tanggal,mood:null,makan:null,tidur:null,aktivitas:[],catatan:'',id:null});
    setCatatan(d?.catatan||'');
  }
  useEffect(()=>{load();},[siswa.id,tanggal]);

  async function tap(field,value){
    setSaving(true);
    try{
      const payload={siswa_id:siswa.id,tanggal,[field]:value};
      if(laporan?.id)payload.id=laporan.id;
      if(laporan?.mood!==undefined&&field!=='mood')payload.mood=laporan.mood;
      if(laporan?.makan!==undefined&&field!=='makan')payload.makan=laporan.makan;
      if(laporan?.tidur!==undefined&&field!=='tidur')payload.tidur=laporan.tidur;
      if(laporan?.aktivitas!==undefined&&field!=='aktivitas')payload.aktivitas=laporan.aktivitas;
      if(laporan?.catatan!==undefined&&field!=='catatan')payload.catatan=laporan.catatan;
      await api.saveDaily(payload);
      await load();
      onSaved&&onSaved();
    }catch(e){addToast('err',e.message);}
    finally{setSaving(false);}
  }

  async function tapAktivitas(a){
    const curr=laporan?.aktivitas||[];
    const next=curr.includes(a)?curr.filter(x=>x!==a):[...curr,a];
    await tap('aktivitas',next);
  }

  async function saveCatatan(){
    await tap('catatan',catatan);
    addToast('ok','Catatan disimpan');
  }
  async function copyFormal(){
    if(!formal)return;
    try{await navigator.clipboard.writeText(formal);addToast('ok','Laporan disalin');}
    catch{addToast('err','Gagal menyalin laporan');}
  }

  if(!laporan)return<div className="p-6 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"/></div>;

  const pct=completeness(laporan);
  const formal=formalText(laporan,siswa.nama);

  return(
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <StudentAvatar siswa={siswa}/>
        <div className="flex-1">
          <div className="font-black text-text-main">{siswa.nama}</div>
          <div className="text-xs text-slate-400">{siswa.rombel_nama} · {tanggal}</div>
          <CompleteBadge pct={pct}/>
        </div>
        {saving&&<div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"/>}
      </div>

      <div>
        <p className="text-xs font-black text-slate-500 mb-2">😊 MOOD HARI INI</p>
        <div className="grid grid-cols-3 gap-2">
          {MOOD_OPT.map(o=>(
            <button key={o.v} onClick={()=>tap('mood',o.v)}
              className={`py-2 px-1 rounded-lg font-bold text-[10px] min-[340px]:text-xs sm:text-sm border-2 transition-all duration-200 active:scale-95 ${laporan.mood===o.v?o.c+' text-white border-transparent':'border-slate-200 text-slate-600 hover:border-primary/40'}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-black text-slate-500 mb-2">🍽️ MAKAN SIANG</p>
        <div className="grid grid-cols-1 min-[340px]:grid-cols-3 gap-2">
          {MAKAN_OPT.map(o=>(
            <button key={o.v} onClick={()=>tap('makan',o.v)}
              className={`py-2 px-1 rounded-lg font-bold text-[10px] min-[340px]:text-xs sm:text-sm border-2 transition-all duration-200 active:scale-95 ${laporan.makan===o.v?o.c+' text-white border-transparent':'border-slate-200 text-slate-600 hover:border-primary/40'}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-black text-slate-500 mb-2">💤 TIDUR SIANG</p>
        <div className="grid grid-cols-2 gap-2 max-w-[240px]">
          {TIDUR_OPT.map(o=>(
            <button key={o.v} onClick={()=>tap('tidur',o.v)}
              className={`py-2 px-1 rounded-lg font-bold text-[10px] min-[340px]:text-xs sm:text-sm border-2 transition-all duration-200 active:scale-95 ${laporan.tidur===o.v?o.c+' text-white border-transparent':'border-slate-200 text-slate-600 hover:border-primary/40'}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-black text-slate-500 mb-2">🎨 AKTIVITAS</p>
        <div className="flex flex-wrap gap-2">
          {AKTIVITAS.map(a=>{
            const on=(laporan.aktivitas||[]).includes(a);
            return(
              <button key={a} onClick={()=>tapAktivitas(a)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all duration-200 active:scale-95 ${on?'bg-primary text-white border-primary':'border-slate-200 text-slate-600 hover:border-primary/40'}`}>
                {a}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-black text-slate-500 mb-2">📝 CATATAN GURU</p>
        <textarea value={catatan} onChange={e=>setCatatan(e.target.value)} rows={3}
          placeholder="Tambahkan catatan khusus untuk hari ini..."
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"/>
        <button onClick={saveCatatan} className="mt-2 w-full h-9 bg-primary text-white font-medium rounded-lg text-sm hover:bg-primary-hover active:bg-primary-active active:scale-[0.98] transition-all duration-200">
          Simpan Catatan
        </button>
      </div>

      {formal&&(
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-black text-blue-600 mb-2">📄 PREVIEW LAPORAN FORMAL</p>
          <p className="text-sm text-blue-800 leading-relaxed">{formal}</p>
          <button onClick={copyFormal} className="mt-3 w-full h-9 bg-blue-600 text-white font-medium rounded-lg text-sm">Copy Laporan</button>
        </div>
      )}

      <EditLog laporanId={laporan.id}/>
    </div>
  );
}

export default function LaporanTab({rombelId,addToast}){
  const[siswaList,setSiswaList]=useState([]);
  const[selected,setSelected]=useState(null);
  const[historyFor,setHistoryFor]=useState(null);
  const[tanggal,setTanggal]=useState(todayWIB());
  const[laporanMap,setLaporanMap]=useState({});
  const[reminder,setReminder]=useState(null);
  const[loading,setLoading]=useState(false);
  const[refreshKey,setRefreshKey]=useState(0);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const[todayData,rc]=await Promise.all([
        api.getLaporanToday(rombelId,tanggal),
        api.getReminderConfig()
      ]);
      const dataRows=todayData.rows||todayData;
      const map={};
      dataRows.forEach(s=>{map[s.siswa_id]={mood:s.mood,makan:s.makan,tidur:s.tidur,aktivitas:s.aktivitas,catatan:s.catatan,id:s.laporan_id};});
      setSiswaList(dataRows);
      setLaporanMap(map);
      setReminder(rc);
    }catch(e){addToast('err',e.message);}
    finally{setLoading(false);}
  },[rombelId,tanggal]);

  useEffect(()=>{load();},[load,refreshKey]);

  const showReminder=reminder?.aktif&&(()=>{
    const now=new Date();
    const[h,m]=reminder.jam.split(':').map(Number);
    const target=new Date();target.setHours(h,m,0,0);
    const isToday=tanggal===todayWIB();
    const incomplete=siswaList.filter(s=>completeness(laporanMap[s.siswa_id])<100).length;
    return isToday&&now>=target&&incomplete>0;
  })();

  const incomplete=siswaList.filter(s=>completeness(laporanMap[s.siswa_id])<100).length;
  const done=siswaList.length-incomplete;

  return(
    <div className="pb-10">
      <div className="px-4 sm:px-5 pt-4 pb-2">
        {showReminder&&(
          <div className="mb-3 bg-primary-container border-2 border-primary rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">⏰</span>
            <div className="flex-1">
              <p className="font-black text-primary-active text-sm">Pengingat Laporan Harian</p>
              <p className="text-primary-active opacity-90 text-xs">{incomplete} siswa belum dilaporkan — selesaikan sebelum akhir hari.</p>
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <input type="date" value={tanggal} onChange={e=>{setTanggal(e.target.value);setSelected(null);}}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"/>
          <div className="w-full sm:flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{width:siswaList.length?(done/siswaList.length*100)+'%':'0%'}}/>
          </div>
          <span className="text-xs font-bold text-slate-500 whitespace-nowrap">{done}/{siswaList.length}</span>
        </div>
      </div>

      {loading?<div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-primary-container border-t-primary rounded-full animate-spin"/></div>:(
        <div className="px-4 sm:px-5 grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
          {siswaList.map(s=>{
            const lap=laporanMap[s.siswa_id];
            const pct=completeness(lap);
            const isOpen=selected===s.siswa_id;
            return(
              <div key={s.siswa_id} className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${isOpen?'border-primary xl:col-span-2 2xl:col-span-3':'border-slate-100'}`}>
                <button onClick={()=>setSelected(isOpen?null:s.siswa_id)}
                  className="w-full flex items-center gap-3 p-3 text-left">
                  <StudentAvatar siswa={s} size="sm"/>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-text-main text-sm">{s.nama}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {lap?.mood&&<span className="text-sm">{MOOD_OPT.find(x=>x.v===lap.mood)?.l.split(' ')[0]}</span>}
                      {lap?.makan&&<span className="text-xs text-slate-500">{lap.makan}</span>}
                      {lap?.tidur!==null&&lap?.tidur!==undefined&&<span className="text-xs text-slate-500">{lap.tidur?'tidur':'tdk tidur'}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <CompleteBadge pct={pct}/>
                    <button onClick={e=>{e.stopPropagation();setHistoryFor(s);}} className="text-xs px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">📖</button>
                    <span className={`text-slate-400 transition-transform ${isOpen?'rotate-180':''}`}>▾</span>
                  </div>
                </button>
                {isOpen&&(
                  <div className="border-t border-slate-100">
                    <ReportPanel siswa={s} tanggal={tanggal} addToast={addToast}
                      onSaved={()=>setRefreshKey(k=>k+1)}/>
                  </div>
                )}
              </div>
            );
          })}
          {siswaList.length===0&&(
            <div className="text-center py-16 text-slate-400">
              <div className="text-4xl mb-3">📝</div>
              <p className="font-bold">Tidak ada siswa di rombel ini</p>
            </div>
          )}
        </div>
      )}
    {historyFor&&<HistoryModal siswa={historyFor} onClose={()=>setHistoryFor(null)}/>}
  </div>
  );
}