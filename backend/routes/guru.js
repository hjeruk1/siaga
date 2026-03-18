const router=require('express').Router(),bcrypt=require('bcryptjs'),db=require('../db'),auth=require('../middleware/auth');
router.get('/',auth(),(req,res)=>res.json(db.prepare('SELECT id,nama,no_wa,username,role FROM guru ORDER BY nama').all()));
router.post('/',auth(['admin']),(req,res)=>{
  const{nama,no_wa,username,password,role='guru'}=req.body;
  if(!nama||!username||!password)return res.status(400).json({error:'Lengkapi kolom'});
  try{const r=db.prepare('INSERT INTO guru(nama,no_wa,username,password_hash,role)VALUES(?,?,?,?,?)').run(nama,no_wa,username,bcrypt.hashSync(password,10),role);res.json({id:r.lastInsertRowid});}
  catch{res.status(400).json({error:'Username sudah digunakan'});}
});
router.put('/:id',auth(['admin']),(req,res)=>{
  const{nama,no_wa,role,password}=req.body;
  if(password)db.prepare('UPDATE guru SET nama=?,no_wa=?,role=?,password_hash=? WHERE id=?').run(nama,no_wa,role,bcrypt.hashSync(password,10),req.params.id);
  else db.prepare('UPDATE guru SET nama=?,no_wa=?,role=? WHERE id=?').run(nama,no_wa,role,req.params.id);
  res.json({success:true});
});
router.delete('/:id',auth(['admin']),(req,res)=>{db.prepare('DELETE FROM guru WHERE id=?').run(req.params.id);res.json({success:true});});
module.exports=router;