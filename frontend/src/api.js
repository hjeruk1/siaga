function token(){return localStorage.getItem('siaga_token');}
async function req(method,url,body){
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},body:body!==undefined?JSON.stringify(body):undefined});
  const d=await r.json();if(!r.ok)throw new Error(d.error||'Server error');return d;
}
export const api={
  login:(u,p)=>req('POST','/api/auth/login',{username:u,password:p}),
  me:()=>req('GET','/api/auth/me'),
  getKelas:()=>req('GET','/api/kelas'),
  updateKelas:(id,d)=>req('PUT','/api/kelas/'+id,d),
  getGuru:()=>req('GET','/api/guru'),
  createGuru:d=>req('POST','/api/guru',d),
  updateGuru:(id,d)=>req('PUT','/api/guru/'+id,d),
  deleteGuru:id=>req('DELETE','/api/guru/'+id),
  getSiswa:kid=>req('GET','/api/siswa'+(kid?'?kelas_id='+kid:'')),
  getSiswaDetail:id=>req('GET','/api/siswa/'+id),
  createSiswa:d=>req('POST','/api/siswa',d),
  updateSiswa:(id,d)=>req('PUT','/api/siswa/'+id,d),
  deleteSiswa:id=>req('DELETE','/api/siswa/'+id),
  addPenjemput:(sid,d)=>req('POST','/api/siswa/'+sid+'/penjemput',d),
  deletePenjemput:pid=>req('DELETE','/api/siswa/penjemput/'+pid),
  getAbsensiToday:kid=>req('GET','/api/absensi/today'+(kid?'?kelas_id='+kid:'')),
  checkin:(id,m)=>req('POST','/api/absensi/checkin',{siswa_id:id,manual:m}),
  setKeterangan:(id,s,c)=>req('POST','/api/absensi/keterangan',{siswa_id:id,status:s,catatan:c}),
  scanQR:qr=>req('POST','/api/penjemputan/scan',{qr_code:qr}),
  pulangkan:ids=>req('POST','/api/penjemputan/pulang',{siswa_ids:ids}),
  getNotif:gid=>req('GET','/api/notifikasi'+(gid?'?guru_id='+gid:'')),
  bacaNotif:id=>req('PUT','/api/notifikasi/'+id+'/baca'),
  getDashboard:()=>req('GET','/api/rekap/dashboard'),
  getRekap:(b,y,kid)=>req('GET','/api/rekap?bulan='+b+'&tahun='+y+(kid?'&kelas_id='+kid:'')),
};