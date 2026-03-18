const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth');
const today=()=>new Date().toISOString().split('T')[0];
router.get('/dashboard',auth(),(req,res)=>{
  const tgl=today();
  res.json({
    byKelas:db.prepare("SELECT k.id,k.nama as kelas,g.nama as guru,COUNT(s.id) as total,SUM(CASE WHEN a.status IN ('Hadir','Terlambat') THEN 1 ELSE 0 END) as hadir,SUM(CASE WHEN a.status='Menunggu' THEN 1 ELSE 0 END) as menunggu,SUM(CASE WHEN a.status='Pulang' THEN 1 ELSE 0 END) as pulang,SUM(CASE WHEN a.status='Terlambat' THEN 1 ELSE 0 END) as terlambat FROM kelas k LEFT JOIN guru g ON k.guru_id=g.id LEFT JOIN siswa s ON s.kelas_id=k.id LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=? GROUP BY k.id ORDER BY k.nama").all(tgl),
    siswaAktif:db.prepare("SELECT s.id,s.nama,k.nama as kelas,s.kelas_id,k.guru_id,COALESCE(a.status,'Belum') as status,a.jam_masuk,a.jam_tunggu,a.manual,pj.nama as nama_penjemput FROM siswa s LEFT JOIN kelas k ON s.kelas_id=k.id LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=? LEFT JOIN penjemput pj ON a.penjemput_id=pj.id WHERE COALESCE(a.status,'Belum') NOT IN ('Pulang','Absen') ORDER BY k.nama,s.nama").all(tgl),
    tanggal:tgl
  });
});
router.get('/',auth(),(req,res)=>{
  const y=req.query.tahun||new Date().getFullYear(),m=String(req.query.bulan||new Date().getMonth()+1).padStart(2,'0'),{kelas_id}=req.query;
  const list=db.prepare('SELECT s.id,s.nama,k.nama as kelas_nama FROM siswa s LEFT JOIN kelas k ON s.kelas_id=k.id '+(kelas_id?'WHERE s.kelas_id=? ':'')+' ORDER BY k.nama,s.nama').all(...(kelas_id?[kelas_id]:[]));
  res.json({bulan:parseInt(m),tahun:parseInt(y),data:list.map(s=>{
    const rows=db.prepare("SELECT tanggal,status FROM absensi WHERE siswa_id=? AND tanggal LIKE ?").all(s.id,y+'-'+m+'%');
    const byDate={};rows.forEach(r=>{byDate[r.tanggal.slice(-2)]=r.status;});
    const c={H:0,T:0,I:0,S:0,A:0};
    Object.values(byDate).forEach(st=>{if(st==='Hadir')c.H++;else if(st==='Terlambat')c.T++;else if(st==='Izin')c.I++;else if(st==='Sakit')c.S++;else if(st==='Absen')c.A++;});
    return{...s,absensi:byDate,counts:c};
  })});
});
module.exports=router;