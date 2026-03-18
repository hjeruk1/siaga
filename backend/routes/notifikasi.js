const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth');
router.get('/',auth(),(req,res)=>{
  const{guru_id}=req.query;
  res.json(db.prepare('SELECT n.*,s.nama as nama_siswa FROM notif_log n LEFT JOIN siswa s ON n.siswa_id=s.id WHERE n.dibaca=0 '+(guru_id?'AND (n.guru_id=? OR n.tipe="alert_gerbang") ':'')+' ORDER BY n.created_at DESC LIMIT 30').all(...(guru_id?[guru_id]:[])));
});
router.put('/:id/baca',auth(),(req,res)=>{db.prepare('UPDATE notif_log SET dibaca=1 WHERE id=?').run(req.params.id);res.json({success:true});});
router.put('/baca-semua',auth(),(req,res)=>{db.prepare('UPDATE notif_log SET dibaca=1 WHERE guru_id=? OR guru_id IS NULL').run(req.body.guru_id);res.json({success:true});});
module.exports=router;