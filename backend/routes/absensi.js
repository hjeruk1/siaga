const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth');
const today=()=>new Date().toISOString().split('T')[0];
const nowTime=()=>new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
router.get('/today',auth(),(req,res)=>{
  const{kelas_id}=req.query;
  res.json(db.prepare("SELECT s.id,s.nama,s.kelas_id,k.nama as kelas_nama,k.guru_id,COALESCE(a.status,'Belum') as status,a.id as absensi_id,a.jam_masuk,a.jam_pulang,a.jam_tunggu,a.manual,a.catatan,pj.nama as nama_penjemput FROM siswa s LEFT JOIN kelas k ON s.kelas_id=k.id LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=? LEFT JOIN penjemput pj ON a.penjemput_id=pj.id "+(kelas_id?'WHERE s.kelas_id=? ':'')+' ORDER BY k.nama,s.nama').all(...(kelas_id?[today(),kelas_id]:[today()])));
});
router.post('/checkin',auth(['guru','admin']),(req,res)=>{
  const{siswa_id,manual=false}=req.body;
  const tgl=today(),jam=nowTime(),status=new Date().getHours()>=8?'Terlambat':'Hadir';
  const ex=db.prepare('SELECT id FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswa_id,tgl);
  if(ex)db.prepare('UPDATE absensi SET status=?,jam_masuk=?,manual=? WHERE id=?').run(status,jam,manual?1:0,ex.id);
  else db.prepare('INSERT INTO absensi(siswa_id,tanggal,status,jam_masuk,manual)VALUES(?,?,?,?,?)').run(siswa_id,tgl,status,jam,manual?1:0);
  const s=db.prepare('SELECT s.nama,pj.no_wa FROM siswa s LEFT JOIN penjemput pj ON pj.siswa_id=s.id WHERE s.id=? LIMIT 1').get(siswa_id);
  if(s){db.prepare('INSERT INTO notif_log(siswa_id,tipe,pesan,jam)VALUES(?,?,?,?)').run(siswa_id,'checkin',s.nama+' tiba pukul '+jam,jam);console.log('[WA Mock] ->',s.no_wa,':',s.nama,'tiba',jam);}
  res.json({success:true,status,jam_masuk:jam});
});
router.post('/keterangan',auth(['guru','admin']),(req,res)=>{
  const{siswa_id,status,catatan}=req.body,tgl=today();
  const ex=db.prepare('SELECT id FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswa_id,tgl);
  if(ex)db.prepare('UPDATE absensi SET status=?,catatan=? WHERE id=?').run(status,catatan,ex.id);
  else db.prepare('INSERT INTO absensi(siswa_id,tanggal,status,catatan)VALUES(?,?,?,?)').run(siswa_id,tgl,status,catatan);
  res.json({success:true});
});
module.exports=router;