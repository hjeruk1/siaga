const router=require('express').Router(),bcrypt=require('bcryptjs'),db=require('../db'),auth=require('../middleware/auth');
const path=require('path'),fs=require('fs');
const {uploadImage,saveSquareJpeg,ensureDir}=require('../utils/imageUpload');
const UPLOAD_DIR=path.join(__dirname,'../uploads/guru');
ensureDir(UPLOAD_DIR);

router.get('/',auth(),(req,res)=>{
  const rows=db.prepare('SELECT id,nama,no_wa,username,role,foto,COALESCE(aktif,1) as aktif FROM guru ORDER BY COALESCE(aktif,1) DESC,nama').all();
  const kelasStmt=db.prepare('SELECT k.id,k.nama,gk.role FROM guru_kelas gk JOIN kelas k ON k.id=gk.kelas_id WHERE gk.guru_id=? ORDER BY k.nama');
  res.json(rows.map(g=>({...g,kelas:kelasStmt.all(g.id)})));
});
router.post('/',auth(['admin']),(req,res)=>{
  const{nama,no_wa,username,password,role='guru',aktif=1}=req.body;
  if(!nama||!username||!password)return res.status(400).json({error:'Lengkapi kolom'});
  try{const r=db.prepare('INSERT INTO guru(nama,no_wa,username,password_hash,role,aktif)VALUES(?,?,?,?,?,?)').run(nama,no_wa,username,bcrypt.hashSync(password,10),role,aktif?1:0);res.json({id:r.lastInsertRowid});}
  catch{res.status(400).json({error:'Username sudah digunakan'});}
});
router.put('/:id',auth(['admin']),(req,res)=>{
  const{nama,no_wa,role,password,aktif=1}=req.body;
  if(parseInt(req.params.id)===req.user.id&&aktif===0)return res.status(400).json({error:'Tidak bisa menonaktifkan akun sendiri'});
  if(password)db.prepare('UPDATE guru SET nama=?,no_wa=?,role=?,aktif=?,password_hash=? WHERE id=?').run(nama,no_wa,role,aktif?1:0,bcrypt.hashSync(password,10),req.params.id);
  else db.prepare('UPDATE guru SET nama=?,no_wa=?,role=?,aktif=? WHERE id=?').run(nama,no_wa,role,aktif?1:0,req.params.id);
  res.json({success:true});
});
router.delete('/:id',auth(['admin']),(req,res)=>{
  if(parseInt(req.params.id)===req.user.id)
    return res.status(400).json({error:'Tidak bisa menghapus akun sendiri'});
  const refs=[
    db.prepare('SELECT 1 FROM laporan_harian WHERE guru_id=? LIMIT 1').get(req.params.id),
    db.prepare('SELECT 1 FROM laporan_edit_log WHERE guru_id=? LIMIT 1').get(req.params.id),
    db.prepare('SELECT 1 FROM notif_log WHERE guru_id=? LIMIT 1').get(req.params.id),
    db.prepare('SELECT 1 FROM penjemputan_log WHERE guru_id=? LIMIT 1').get(req.params.id),
    db.prepare('SELECT 1 FROM qr_reissue_log WHERE admin_id=? LIMIT 1').get(req.params.id)
  ].some(Boolean);
  if(refs){
    db.prepare('UPDATE guru SET aktif=0 WHERE id=?').run(req.params.id);
    return res.json({success:true,archived:true});
  }
  const filePath=path.join(UPLOAD_DIR,req.params.id+'.jpg');
  if(fs.existsSync(filePath))fs.unlinkSync(filePath);
  db.prepare('DELETE FROM guru WHERE id=?').run(req.params.id);
  res.json({success:true,deleted:true});
});
router.post('/:id/foto',auth(['admin']),uploadImage.single('foto'),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'File tidak valid'});
    const guru=db.prepare('SELECT id FROM guru WHERE id=?').get(req.params.id);
    if(!guru)return res.status(404).json({error:'Guru tidak ditemukan'});
    const filename=req.params.id+'.jpg';
    const outPath=path.join(UPLOAD_DIR,filename);
    await saveSquareJpeg(req.file.buffer,outPath);
    const fotoUrl='/uploads/guru/'+filename+'?v='+Date.now();
    db.prepare('UPDATE guru SET foto=? WHERE id=?').run(fotoUrl,req.params.id);
    res.json({success:true,foto:fotoUrl});
  }catch(e){
    console.error('Guru photo upload error:',e);
    res.status(500).json({error:'Gagal memproses foto guru'});
  }
});
router.delete('/:id/foto',auth(['admin']),(req,res)=>{
  const filePath=path.join(UPLOAD_DIR,req.params.id+'.jpg');
  if(fs.existsSync(filePath))fs.unlinkSync(filePath);
  db.prepare('UPDATE guru SET foto=NULL WHERE id=?').run(req.params.id);
  res.json({success:true});
});
module.exports=router;
