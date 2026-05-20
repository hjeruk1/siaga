const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth');

// Helper: get all gurus assigned to a class
function getGurusForKelas(kelas_id){
  return db.prepare(
    'SELECT g.id,g.nama,g.no_wa,gk.role FROM guru_kelas gk JOIN guru g ON gk.guru_id=g.id WHERE gk.kelas_id=? ORDER BY gk.role DESC,g.nama'
  ).all(kelas_id);
}

// GET /api/kelas — returns every class with its full guru list
router.get('/',auth(),(req,res)=>{
  const kelas=db.prepare('SELECT k.* FROM kelas k ORDER BY k.nama').all();
  res.json(kelas.map(k=>{
    const gurus=getGurusForKelas(k.id);
    const utama=gurus.find(g=>g.role==='utama');
    return{...k,guru_id:utama?.id||null,guru_nama:utama?.nama||null,guru_wa:utama?.no_wa||null,gurus};
  }));
});

// PUT /api/kelas/:id — set the UTAMA guru (backward-compat, used by legacy assign)
router.put('/:id',auth(['admin','kepsek']),(req,res)=>{
  const{guru_id}=req.body;
  if(guru_id){
    // Demote any existing utama to bantu
    db.prepare('UPDATE guru_kelas SET role=? WHERE kelas_id=? AND role=?').run('bantu',req.params.id,'utama');
    // Upsert the new utama
    db.prepare('INSERT OR IGNORE INTO guru_kelas(guru_id,kelas_id,role) VALUES(?,?,?)').run(guru_id,req.params.id,'utama');
    db.prepare('UPDATE guru_kelas SET role=? WHERE guru_id=? AND kelas_id=?').run('utama',guru_id,req.params.id);
    db.prepare('UPDATE kelas SET guru_id=? WHERE id=?').run(guru_id,req.params.id);
  } else {
    // Unassign all — clear utama
    db.prepare('UPDATE guru_kelas SET role=? WHERE kelas_id=? AND role=?').run('bantu',req.params.id,'utama');
    db.prepare('UPDATE kelas SET guru_id=NULL WHERE id=?').run(req.params.id);
  }
  res.json({success:true});
});

// POST /api/kelas/:id/guru — add a guru to a class
router.post('/:id/guru',auth(['admin','kepsek']),(req,res)=>{
  const{guru_id,role='bantu'}=req.body;
  if(!guru_id)return res.status(400).json({error:'guru_id wajib'});
  // If assigning as utama, demote current utama first
  if(role==='utama'){
    db.prepare('UPDATE guru_kelas SET role=? WHERE kelas_id=? AND role=?').run('bantu',req.params.id,'utama');
    db.prepare('UPDATE kelas SET guru_id=? WHERE id=?').run(guru_id,req.params.id);
  }
  db.prepare('INSERT INTO guru_kelas(guru_id,kelas_id,role) VALUES(?,?,?) ON CONFLICT(guru_id,kelas_id) DO UPDATE SET role=excluded.role').run(guru_id,req.params.id,role);
  res.json({success:true});
});

// DELETE /api/kelas/:id/guru/:guru_id — remove a guru from a class
router.delete('/:id/guru/:guru_id',auth(['admin','kepsek']),(req,res)=>{
  const wasUtama=db.prepare('SELECT role FROM guru_kelas WHERE kelas_id=? AND guru_id=?').get(req.params.id,req.params.guru_id);
  db.prepare('DELETE FROM guru_kelas WHERE kelas_id=? AND guru_id=?').run(req.params.id,req.params.guru_id);
  // If removed was utama, clear kelas.guru_id
  if(wasUtama?.role==='utama'){
    db.prepare('UPDATE kelas SET guru_id=NULL WHERE id=?').run(req.params.id);
    // Promote first remaining bantu to utama if any
    const next=db.prepare('SELECT guru_id FROM guru_kelas WHERE kelas_id=? ORDER BY id LIMIT 1').get(req.params.id);
    if(next){
      db.prepare('UPDATE guru_kelas SET role=? WHERE guru_id=? AND kelas_id=?').run('utama',next.guru_id,req.params.id);
      db.prepare('UPDATE kelas SET guru_id=? WHERE id=?').run(next.guru_id,req.params.id);
    }
  }
  res.json({success:true});
});

module.exports=router;