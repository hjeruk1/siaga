const router=require('express').Router(),crypto=require('crypto'),db=require('../db'),auth=require('../middleware/auth');
router.get('/',auth(),(req,res)=>{
  const{kelas_id}=req.query;
  res.json(db.prepare('SELECT s.*,k.nama as kelas_nama,(SELECT COUNT(*) FROM penjemput p WHERE p.siswa_id=s.id) as jumlah_penjemput FROM siswa s LEFT JOIN kelas k ON s.kelas_id=k.id '+(kelas_id?'WHERE s.kelas_id=? ':'')+' ORDER BY k.nama,s.nama').all(...(kelas_id?[kelas_id]:[])));
});
router.get('/:id',auth(),(req,res)=>{
  const s=db.prepare('SELECT s.*,k.nama as kelas_nama FROM siswa s LEFT JOIN kelas k ON s.kelas_id=k.id WHERE s.id=?').get(req.params.id);
  if(!s)return res.status(404).json({error:'Tidak ditemukan'});
  s.penjemput=db.prepare('SELECT * FROM penjemput WHERE siswa_id=?').all(req.params.id);
  res.json(s);
});
router.post('/',auth(['admin','kepsek']),(req,res)=>{
  const{nama,kelas_id}=req.body;
  if(!nama||!kelas_id)return res.status(400).json({error:'nama & kelas_id wajib'});
  const r=db.prepare('INSERT INTO siswa(nama,kelas_id)VALUES(?,?)').run(nama,kelas_id);
  res.json({id:r.lastInsertRowid,nama,kelas_id});
});
router.put('/:id',auth(['admin','kepsek']),(req,res)=>{
  db.prepare('UPDATE siswa SET nama=?,kelas_id=?,status_kartu=? WHERE id=?').run(req.body.nama,req.body.kelas_id,req.body.status_kartu||'aktif',req.params.id);
  res.json({success:true});
});
router.delete('/:id',auth(['admin']),(req,res)=>{db.prepare('DELETE FROM siswa WHERE id=?').run(req.params.id);res.json({success:true});});
router.get('/:id/penjemput',auth(),(req,res)=>res.json(db.prepare('SELECT * FROM penjemput WHERE siswa_id=?').all(req.params.id)));
router.post('/:id/penjemput',auth(['admin','kepsek']),(req,res)=>{
  const{nama,no_wa,relasi}=req.body;
  if(db.prepare('SELECT COUNT(*) as c FROM penjemput WHERE siswa_id=?').get(req.params.id).c>=5)return res.status(400).json({error:'Maks. 5 penjemput'});
  const qr='QR-'+req.params.id+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();
  const r=db.prepare('INSERT INTO penjemput(siswa_id,nama,no_wa,relasi,qr_code)VALUES(?,?,?,?,?)').run(req.params.id,nama,no_wa,relasi,qr);
  console.log('[WA Mock] ->',no_wa,': QR =',qr);
  res.json({id:r.lastInsertRowid,qr_code:qr});
});
router.delete('/penjemput/:pid',auth(['admin','kepsek']),(req,res)=>{db.prepare('DELETE FROM penjemput WHERE id=?').run(req.params.pid);res.json({success:true});});
module.exports=router;