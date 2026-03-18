const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth');
router.get('/',auth(),(req,res)=>res.json(db.prepare('SELECT k.*,g.nama as guru_nama,g.no_wa as guru_wa FROM kelas k LEFT JOIN guru g ON k.guru_id=g.id ORDER BY k.nama').all()));
router.put('/:id',auth(['admin','kepsek']),(req,res)=>{db.prepare('UPDATE kelas SET guru_id=? WHERE id=?').run(req.body.guru_id||null,req.params.id);res.json({success:true});});
module.exports=router;