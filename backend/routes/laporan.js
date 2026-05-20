const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth');
const {todayWIB,nowWIB,getSiswaForUser,siswaScopeWhere,isDayClosed}=require('../utils/workflow');

// Fix #3 — WIB-safe date (UTC+7 offset, no locale dependency)
const today=todayWIB;

// Fix #8 — WIB-safe timestamp

function logEdit(laporan_id,guru_id,perubahan){
  db.prepare('INSERT INTO laporan_edit_log(laporan_id,guru_id,perubahan) VALUES(?,?,?)')
    .run(laporan_id,guru_id,JSON.stringify(perubahan));
}

// ── Fix #1: /today and /config BEFORE /:siswa_id to avoid shadowing ──────

// GET /api/laporan/today?kelas_id=&tanggal=  (Fix #5: accepts optional tanggal)
router.get('/today',auth(),(req,res)=>{
  const {kelas_id,tanggal}=req.query;
  const tgl=tanggal||today();
  const scope=siswaScopeWhere(req.user,kelas_id);
  const siswaList=db.prepare(
    'SELECT s.id,s.nama,s.foto,s.kelas_id,k.nama as kelas_nama FROM siswa s LEFT JOIN kelas k ON s.kelas_id=k.id '+
    (scope.where?scope.where+' AND ':'WHERE ')+'COALESCE(s.aktif,1)=1 '+
    'ORDER BY k.nama,s.nama'
  ).all(...scope.params);
  const result=siswaList.map(s=>{
    const l=db.prepare('SELECT * FROM laporan_harian WHERE siswa_id=? AND tanggal=?').get(s.id,tgl);
    if(l)l.aktivitas=JSON.parse(l.aktivitas||'[]');
    const lastLog=l?db.prepare(
      'SELECT el.*,g.nama as guru_nama FROM laporan_edit_log el LEFT JOIN guru g ON el.guru_id=g.id WHERE el.laporan_id=? ORDER BY el.id DESC LIMIT 1'
    ).get(l.id):null;
    return{...s,laporan:l||null,last_edit:lastLog||null};
  });
  res.json(result);
});

// GET /api/laporan/config/reminder
router.get('/config/reminder',auth(),(req,res)=>{
  res.json(db.prepare('SELECT * FROM reminder_config WHERE id=1').get());
});

// PUT /api/laporan/config/reminder
router.put('/config/reminder',auth(['admin','kepsek']),(req,res)=>{
  const{aktif,jam}=req.body;
  db.prepare('UPDATE reminder_config SET aktif=?,jam=? WHERE id=1').run(aktif?1:0,jam||'14:00');
  res.json({success:true});
});

// GET /api/laporan/history/:siswa_id  — MUST be before /:siswa_id (Fix #1)
router.get('/history/:siswa_id',auth(),(req,res)=>{
  const{limit=30,offset=0}=req.query;
  const siswa=getSiswaForUser(req.user,req.params.siswa_id);
  if(siswa===false)return res.status(403).json({error:'Siswa di luar kelas Anda'});
  if(!siswa)return res.status(404).json({error:'Siswa tidak ditemukan'});
  const rows=db.prepare(
    'SELECT l.*,g.nama as guru_nama FROM laporan_harian l LEFT JOIN guru g ON l.guru_id=g.id WHERE l.siswa_id=? ORDER BY l.tanggal DESC LIMIT ? OFFSET ?'
  ).all(req.params.siswa_id,parseInt(limit),parseInt(offset));
  const withLogs=rows.map(l=>{
    const logs=db.prepare(
      'SELECT el.*,g.nama as guru_nama FROM laporan_edit_log el LEFT JOIN guru g ON el.guru_id=g.id WHERE el.laporan_id=? ORDER BY el.id DESC'
    ).all(l.id);
    return{...l,aktivitas:JSON.parse(l.aktivitas||'[]'),edit_log:logs};
  });
  res.json(withLogs);
});

// GET /api/laporan/:siswa_id?tanggal=
router.get('/:siswa_id',auth(),(req,res)=>{
  const siswa=getSiswaForUser(req.user,req.params.siswa_id);
  if(siswa===false)return res.status(403).json({error:'Siswa di luar kelas Anda'});
  if(!siswa)return res.status(404).json({error:'Siswa tidak ditemukan'});
  const tgl=req.query.tanggal||today();
  const l=db.prepare('SELECT * FROM laporan_harian WHERE siswa_id=? AND tanggal=?').get(req.params.siswa_id,tgl);
  if(!l)return res.json(null);
  const logs=db.prepare(
    'SELECT el.*,g.nama as guru_nama FROM laporan_edit_log el LEFT JOIN guru g ON el.guru_id=g.id WHERE el.laporan_id=? ORDER BY el.id DESC'
  ).all(l.id);
  res.json({...l,aktivitas:JSON.parse(l.aktivitas||'[]'),edit_log:logs});
});

// POST /api/laporan — upsert + edit log
router.post('/',auth(['guru','admin','kepsek']),(req,res)=>{
  const{siswa_id,tanggal,mood,makan,tidur,aktivitas,catatan}=req.body;
  if(!siswa_id)return res.status(400).json({error:'siswa_id wajib'});
  const siswa=getSiswaForUser(req.user,siswa_id);
  if(siswa===false)return res.status(403).json({error:'Siswa di luar kelas Anda'});
  if(!siswa)return res.status(404).json({error:'Siswa tidak ditemukan'});
  const tgl=tanggal||today();
  if(isDayClosed(tgl))return res.status(400).json({error:'Hari sudah ditutup. Gunakan koreksi admin bila perlu.',code:'DAY_CLOSED'});
  const guruId=req.user?.id;
  const aktStr=JSON.stringify(Array.isArray(aktivitas)?aktivitas:[]);
  const now=nowWIB(); // Fix #8

  const existing=db.prepare('SELECT * FROM laporan_harian WHERE siswa_id=? AND tanggal=?').get(siswa_id,tgl);
  if(existing){
    const changed={};
    if(mood!==undefined&&mood!==existing.mood)changed.mood={from:existing.mood,to:mood};
    if(makan!==undefined&&makan!==existing.makan)changed.makan={from:existing.makan,to:makan};
    // Fix #2: allow tidur=null explicitly to clear it back to NULL
    if(tidur!==undefined&&tidur!==existing.tidur)changed.tidur={from:existing.tidur,to:tidur};
    if(catatan!==undefined&&catatan!==existing.catatan)changed.catatan={from:existing.catatan,to:catatan};
    if(aktStr!==existing.aktivitas)changed.aktivitas={from:JSON.parse(existing.aktivitas||'[]'),to:JSON.parse(aktStr)};

    db.prepare(`UPDATE laporan_harian SET
      mood=CASE WHEN ? IS NOT NULL THEN ? ELSE mood END,
      makan=CASE WHEN ? IS NOT NULL THEN ? ELSE makan END,
      tidur=CASE WHEN ? THEN ? ELSE tidur END,
      aktivitas=CASE WHEN ? IS NOT NULL THEN ? ELSE aktivitas END,
      catatan=CASE WHEN ? IS NOT NULL THEN ? ELSE catatan END,
      guru_id=?,updated_at=? WHERE id=?`
    ).run(
      mood||null, mood||null,
      makan||null, makan||null,
      tidur!==undefined?1:0, tidur!==undefined?(tidur===null?null:(tidur?1:0)):null,
      aktivitas!==undefined?aktStr:null, aktivitas!==undefined?aktStr:null,
      catatan!==undefined?catatan:null, catatan!==undefined?catatan:null,
      guruId,now,existing.id
    );
    if(Object.keys(changed).length)logEdit(existing.id,guruId,changed);
    return res.json({success:true,id:existing.id,action:'updated'});
  }

  const r=db.prepare(
    'INSERT INTO laporan_harian(siswa_id,tanggal,guru_id,mood,makan,tidur,aktivitas,catatan,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(siswa_id,tgl,guruId,mood||null,makan||null,tidur!==undefined?(tidur===null?null:(tidur?1:0)):null,aktStr,catatan||null,now,now);
  logEdit(r.lastInsertRowid,guruId,{action:'created'});
  res.json({success:true,id:r.lastInsertRowid,action:'created'});
});

module.exports=router;
