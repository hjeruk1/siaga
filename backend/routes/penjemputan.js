const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth');
const today=()=>new Date().toISOString().split('T')[0];
const nowTime=()=>new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
router.post('/scan',auth(['gerbang','admin']),(req,res)=>{
  const{qr_code}=req.body;
  if(!qr_code)return res.status(400).json({error:'qr_code wajib'});
  const pj=db.prepare('SELECT p.*,s.nama as nama_siswa,s.id as siswa_id,s.kelas_id,k.nama as kelas_nama,k.guru_id FROM penjemput p JOIN siswa s ON p.siswa_id=s.id JOIN kelas k ON s.kelas_id=k.id WHERE p.qr_code=?').get(qr_code);
  if(!pj){db.prepare("INSERT INTO notif_log(tipe,pesan,jam)VALUES(?,?,?)").run('alert_gerbang','QR tidak dikenal: '+qr_code,nowTime());return res.status(404).json({error:'Penjemput tidak terdaftar',code:'UNKNOWN_QR'});}
  const tgl=today(),jam=nowTime();
  const absen=db.prepare('SELECT * FROM absensi WHERE siswa_id=? AND tanggal=?').get(pj.siswa_id,tgl);
  if(!absen||absen.status==='Absen'||absen.status==='Belum')return res.status(400).json({error:'Siswa belum check-in hari ini',code:'NOT_CHECKED_IN'});
  if(absen.status==='Pulang')return res.status(400).json({error:'Siswa sudah pulang',code:'ALREADY_LEFT'});
  db.prepare("UPDATE absensi SET status='Menunggu',penjemput_id=?,jam_tunggu=? WHERE id=?").run(pj.id,jam,absen.id);
  const guru=db.prepare('SELECT * FROM guru WHERE id=?').get(pj.guru_id);
  db.prepare('INSERT INTO notif_log(siswa_id,guru_id,tipe,pesan,jam)VALUES(?,?,?,?,?)').run(pj.siswa_id,pj.guru_id,'penjemputan',pj.nama_siswa+' ('+pj.kelas_nama+') dijemput oleh '+pj.nama,jam);
  if(guru)console.log('[WA Mock] -> Guru',guru.nama,':',pj.nama_siswa,'siap dijemput oleh',pj.nama);
  res.json({success:true,siswa:{id:pj.siswa_id,nama:pj.nama_siswa,kelas:pj.kelas_nama},penjemput:{nama:pj.nama,relasi:pj.relasi},jam_tunggu:jam});
});
router.post('/pulang',auth(['guru','admin']),(req,res)=>{
  const{siswa_ids}=req.body;
  if(!Array.isArray(siswa_ids)||!siswa_ids.length)return res.status(400).json({error:'siswa_ids harus array'});
  const tgl=today(),jam=nowTime();
  for(const id of siswa_ids){
    db.prepare("UPDATE absensi SET status='Pulang',jam_pulang=? WHERE siswa_id=? AND tanggal=?").run(jam,id,tgl);
    const s=db.prepare('SELECT nama FROM siswa WHERE id=?').get(id);
    if(s){db.prepare('INSERT INTO notif_log(siswa_id,tipe,pesan,jam)VALUES(?,?,?,?)').run(id,'pulang',s.nama+' telah pulang pukul '+jam,jam);console.log('[WA Mock] -> Ortu:',s.nama,'pulang',jam);}
  }
  res.json({success:true,count:siswa_ids.length,jam_pulang:jam});
});
module.exports=router;