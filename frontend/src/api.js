let tokenCache = null;
function token(){
  if(tokenCache === null){
    tokenCache = (typeof localStorage !== 'undefined' ? localStorage.getItem('siaga_token') : null) || '';
  }
  return tokenCache || null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'siaga_token') {
      tokenCache = e.newValue || '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tokenCache = null;
    }
  });
}

async function req(method,url,body){
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.error||'Server error');Object.assign(e,d);throw e;}
  return d;
}

async function upload(url,formData){
  const r=await fetch(url,{method:'POST',headers:{...(token()?{Authorization:'Bearer '+token()}:{})},body:formData});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.error||'Upload error');Object.assign(e,d);throw e;}
  return d;
}

async function blob(url){
  const r=await fetch(url,{headers:{...(token()?{Authorization:'Bearer '+token()}:{})}});
  if(!r.ok){let msg='Download error';try{msg=(await r.json()).error||msg;}catch{}throw new Error(msg);}
  return r.blob();
}

export const api={
  setToken:t=>{
    if(typeof localStorage !== 'undefined') localStorage.setItem('siaga_token',t);
    tokenCache=t;
  },
  clearToken:()=>{
    if(typeof localStorage !== 'undefined') localStorage.removeItem('siaga_token');
    tokenCache='';
  },
  login:d=>req('POST','/api/auth/login',d),
  me:()=>req('GET','/api/auth/me'),
  changePassword:d=>req('POST','/api/auth/change-password',d),
  cabang:()=>req('GET','/api/master/cabang'),
  createCabang:d=>req('POST','/api/master/cabang',d),
  updateCabang:(id,d)=>req('PUT','/api/master/cabang/'+id,d),
  jenjang:()=>req('GET','/api/master/jenjang'),
  rombel:cabangId=>req('GET','/api/master/rombel'+(cabangId?'?cabang_id='+cabangId:'')),
  createRombel:d=>req('POST','/api/master/rombel',d),
  updateRombel:(id,d)=>req('PUT','/api/master/rombel/'+id,d),
  deleteRombel:id=>req('DELETE','/api/master/rombel/'+id),
  assignGuruRombel:(rombelId,d)=>req('POST','/api/master/rombel/'+rombelId+'/guru',d),
  removeGuruRombel:(rombelId,guruId)=>req('DELETE','/api/master/rombel/'+rombelId+'/guru/'+guruId),
  operasionalConfig:cabangId=>req('GET','/api/master/operasional-config'+(cabangId?'?cabang_id='+cabangId:'')),
  updateOperasionalConfig:(id,d)=>req('PUT','/api/master/operasional-config/'+id,d),
  auditLog:p=>req('GET','/api/master/audit-log'+qs(p||{})),
  organisasi:()=>req('GET','/api/master/organisasi'),
  updateOrganisasi:d=>req('PUT','/api/master/organisasi',d),
  kalender:p=>req('GET','/api/master/kalender'+qs(p||{})),
  createKalender:d=>req('POST','/api/master/kalender',d),
  updateKalender:(id,d)=>req('PUT','/api/master/kalender/'+id,d),
  deleteKalender:id=>req('DELETE','/api/master/kalender/'+id),
  staff:cabangId=>req('GET','/api/pengguna'+(cabangId?'?cabang_id='+cabangId:'')),
  createStaff:d=>req('POST','/api/pengguna/staff',d),
  updateStaff:(id,d)=>req('PUT','/api/pengguna/staff/'+id,d),
  deleteStaff:id=>req('DELETE','/api/pengguna/staff/'+id),
  resetPassword:id=>req('POST','/api/pengguna/'+id+'/reset-password',{}),
  uploadStaffFoto:(id,file)=>{const f=new FormData();f.append('foto',file);return upload('/api/pengguna/staff/'+id+'/foto',f);},
  deleteStaffFoto:id=>req('DELETE','/api/pengguna/staff/'+id+'/foto'),
  wali:cabangId=>req('GET','/api/pengguna/wali'+(cabangId?'?cabang_id='+cabangId:'')),
  createWali:d=>req('POST','/api/pengguna/wali',d),
  updateWali:(id,d)=>req('PUT','/api/pengguna/wali/'+id,d),
  siswa:(params={})=>req('GET','/api/siswa'+qs(params)),
  waliChildren:()=>req('GET','/api/siswa/wali/children'),
  siswaDetail:id=>req('GET','/api/siswa/'+id),
  createSiswa:d=>req('POST','/api/siswa',d),
  updateSiswa:(id,d)=>req('PUT','/api/siswa/'+id,d),
  moveSiswa:(id,d)=>req('POST','/api/siswa/'+id+'/enrollment',d),
  reissueNfc:id=>req('POST','/api/siswa/'+id+'/nfc/reissue',{}),
  uploadSiswaFoto:(id,file)=>{const f=new FormData();f.append('foto',file);return upload('/api/siswa/'+id+'/foto',f);},
  deleteSiswaFoto:id=>req('DELETE','/api/siswa/'+id+'/foto'),
  addPenjemput:(id,d)=>req('POST','/api/siswa/'+id+'/penjemput',d),
  updatePenjemput:(id,d)=>req('PUT','/api/siswa/penjemput/'+id,d),
  reissuePenjemputQr:(id,reason)=>req('POST','/api/siswa/penjemput/'+id+'/qr/reissue',{reason}),
  kenaikanPreview:d=>req('POST','/api/siswa/kenaikan/preview',d),
  kenaikan:d=>req('POST','/api/siswa/kenaikan',d),
  absensiToday:(p={})=>req('GET','/api/absensi/today'+qs(p)),
  checkin:d=>req('POST','/api/absensi/checkin',d),
  nfcScan:d=>req('POST','/api/absensi/nfc-scan',d),
  setKeterangan:d=>req('POST','/api/absensi/keterangan',d),
  earlyRelease:p=>req('GET','/api/absensi/early-release'+qs(p||{})),
  createEarlyRelease:d=>req('POST','/api/absensi/early-release',d),
  deleteEarlyRelease:id=>req('DELETE','/api/absensi/early-release/'+id),
  tutupHari:d=>req('POST','/api/absensi/tutup-hari',d),
  tutupHariStatus:p=>req('GET','/api/absensi/tutup-hari/status'+qs(p||{})),
  scanPenjemput:qr=>req('POST','/api/penjemputan/scan',{qr_code:qr}),
  pulangkan:ids=>req('POST','/api/penjemputan/pulang',{siswa_ids:ids}),
  dailyToday:(params={})=>req('GET','/api/daily-record/today'+qs(params)),
  dailyAdminHistory:(params={})=>req('GET','/api/daily-record/admin/history'+qs(params)),
  dailyHistory:(sid,limit=30)=>req('GET','/api/daily-record/history/'+sid+'?limit='+limit),
  dailyDetail:id=>req('GET','/api/daily-record/'+id),
  dailyEdits:id=>req('GET','/api/daily-record/'+id+'/edits'),
  saveDaily:d=>req('POST','/api/daily-record',d),
  publishDaily:id=>req('POST','/api/daily-record/'+id+'/publish',{}),
  commentDaily:(id,body)=>req('POST','/api/daily-record/'+id+'/comment',{body}),
  uploadDailyPhoto:(id,file)=>{const f=new FormData();f.append('foto',file);return upload('/api/daily-record/'+id+'/attachments',f);},
  deleteDailyPhoto:(laporanId,attachmentId)=>req('DELETE','/api/daily-record/'+laporanId+'/attachments/'+attachmentId),
  modulAjar:(params={})=>req('GET','/api/modul-ajar'+qs(params)),
  createModulAjar:d=>req('POST','/api/modul-ajar',d),
  updateModulAjar:(id,d)=>req('PUT','/api/modul-ajar/'+id,d),
  focusTheme:(params={})=>req('GET','/api/modul-ajar/focus-theme'+qs(params)),
  saveFocusTheme:d=>req('POST','/api/modul-ajar/focus-theme',d),
  parseModulAjar:file=>{const f=new FormData();f.append('file',file);return upload('/api/modul-ajar/parse-file',f);},
  notifikasi:()=>req('GET','/api/notifikasi'),
  readNotif:id=>req('PUT','/api/notifikasi/'+id+'/read'),
  readAllNotif:()=>req('PUT','/api/notifikasi/read-all'),
  tarif:p=>req('GET','/api/billing/tarif'+qs(p||{})),
  createTarif:d=>req('POST','/api/billing/tarif',d),
  updateTarif:(id,d)=>req('PUT','/api/billing/tarif/'+id,d),
  diskon:p=>req('GET','/api/billing/diskon'+qs(p||{})),
  createDiskon:d=>req('POST','/api/billing/diskon',d),
  updateDiskon:(id,d)=>req('PUT','/api/billing/diskon/'+id,d),
  generateBulanan:d=>req('POST','/api/billing/generate-bulanan',d),
  generateBulananPreview:d=>req('POST','/api/billing/generate-bulanan/preview',d),
  generateKegiatan:d=>req('POST','/api/billing/generate-kegiatan',d),
  generateKegiatanPreview:d=>req('POST','/api/billing/generate-kegiatan/preview',d),
  tagihan:p=>req('GET','/api/billing/tagihan'+qs(p||{})),
  correctTagihan:(id,d)=>req('PUT','/api/billing/tagihan/'+id+'/koreksi',d),
  voidTagihan:(id,reason)=>req('POST','/api/billing/tagihan/'+id+'/void',{reason}),
  pembayaran:p=>req('GET','/api/billing/pembayaran'+qs(p||{})),
  createPembayaran:d=>req('POST','/api/billing/pembayaran',d),
  alokasiPembayaran:id=>req('GET','/api/billing/pembayaran/'+id+'/alokasi'),
  previewAlokasi:p=>req('GET','/api/billing/pembayaran/preview-alokasi'+qs(p||{})),
  updateAlokasi:(id,d)=>req('PUT','/api/billing/pembayaran/'+id+'/alokasi',d),
  verifyPembayaran:id=>req('POST','/api/billing/pembayaran/'+id+'/verify',{}),
  rejectPembayaran:(id,reason)=>req('POST','/api/billing/pembayaran/'+id+'/reject',{reason}),
  voidPembayaran:(id,reason)=>req('POST','/api/billing/pembayaran/'+id+'/void',{reason}),
  createInvoice:ids=>req('POST','/api/billing/invoice',{tagihan_ids:ids}),
  invoice:p=>req('GET','/api/billing/invoice'+qs(p||{})),
  invoicePdf:id=>blob('/api/billing/invoice/'+id+'/pdf'),
  receiptPdf:id=>blob('/api/billing/pembayaran/'+id+'/pdf'),
  laporan:p=>req('GET','/api/billing/laporan'+qs(p||{})),
  dashboard:p=>req('GET','/api/rekap/dashboard'+qs(p||{})),
  waliBilling:siswaId=>req('GET','/api/billing/wali/siswa/'+siswaId),
  exportRekap:p=>blob('/api/rekap/export'+qs(p||{})),
};

function qs(params){
  const q=Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  return q?'?'+q:'';
}
