const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth'),path=require('path'),fs=require('fs'),multer=require('multer'),Database=require('better-sqlite3');
const {todayWIB,holidayDatesInMonth,siswaScopeSql,isSchoolDay}=require('../utils/workflow');
const restoreUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024}});
router.get('/dashboard',auth(),(req,res)=>{
  const tgl=todayWIB();
  const cabangId=req.query.cabang_id || (req.user.role!=='admin'?req.user.cabang_id:null);
  const scope=siswaScopeSql(req.user,'s',req.query.cabang_id);
  const libur=cabangId? !isSchoolDay(tgl,cabangId):false;
  const rombelWhere=[
    req.user.role==='admin'&&req.query.cabang_id?'r.cabang_id=?':null,
    ['admin_cabang','kepsek','gerbang'].includes(req.user.role)?'r.cabang_id=?':null,
    req.user.role==='guru'?'EXISTS (SELECT 1 FROM guru_rombel gr WHERE gr.rombel_id=r.id AND gr.pengguna_id=?)':null,
    req.query.rombel_id?'r.id=?':null
  ].filter(Boolean);
  const rombelParams=[
    ...(req.user.role==='admin'&&req.query.cabang_id?[req.query.cabang_id]:[]),
    ...(['admin_cabang','kepsek','gerbang'].includes(req.user.role)?[req.user.cabang_id]:[]),
    ...(req.user.role==='guru'?[req.user.id]:[]),
    ...(req.query.rombel_id?[req.query.rombel_id]:[])
  ];
  const rombelClause=rombelWhere.length?'WHERE '+rombelWhere.join(' AND '):'';
  res.json({
    libur,
    hari_status:{tanggal:tgl,libur,nama:libur?'Libur':'Hari masuk'},
    byKelas:db.prepare(`
      SELECT r.id,r.nama AS kelas,c.nama AS cabang,
        COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN gr.role='utama' THEN p.display_name END),GROUP_CONCAT(DISTINCT p.display_name),'-') AS guru,
        COUNT(DISTINCT s.id) AS total,
        COUNT(DISTINCT CASE WHEN a.status IN ('Hadir','Terlambat') THEN s.id END) AS hadir,
        COUNT(DISTINCT CASE WHEN a.status='Menunggu' THEN s.id END) AS menunggu,
        COUNT(DISTINCT CASE WHEN a.status='Pulang' THEN s.id END) AS pulang,
        COUNT(DISTINCT CASE WHEN a.status='Terlambat' THEN s.id END) AS terlambat
      FROM rombel r
      JOIN cabang c ON c.id=r.cabang_id
      LEFT JOIN guru_rombel gr ON gr.rombel_id=r.id
      LEFT JOIN pengguna p ON p.id=gr.pengguna_id AND p.status='aktif'
      LEFT JOIN siswa_enrollment se ON se.rombel_id=r.id AND se.status='aktif'
      LEFT JOIN siswa s ON s.id=se.siswa_id AND s.status='aktif'
      LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=?
      ${rombelClause}
      GROUP BY r.id
      ORDER BY c.nama,r.nama
    `).all(tgl,...rombelParams),
    siswaAktif:libur?[]:db.prepare(`
      SELECT DISTINCT s.id,s.nama,s.foto,r.nama AS kelas,r.id AS rombel_id,c.nama AS cabang,
        COALESCE(a.status,'Belum') AS status,a.jam_masuk,a.jam_tunggu,a.manual,p.nama AS nama_penjemput
      FROM siswa s
      ${scope.join}
      JOIN rombel r ON r.id=se_scope.rombel_id
      JOIN cabang c ON c.id=se_scope.cabang_id
      LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=?
      LEFT JOIN penjemput p ON p.id=a.penjemput_id
      WHERE ${scope.where} AND s.status='aktif' AND COALESCE(a.status,'Belum') NOT IN ('Pulang','Absen')
      ORDER BY c.nama,r.nama,s.nama
    `).all(tgl,...scope.params),
    tanggal:tgl
  });
});
router.get('/backup',auth(['admin']),async(req,res)=>{
  const out=path.join(__dirname,'../siaga-backup-'+Date.now()+'.db');
  try{
    await db.backup(out);
    res.download(out,'siaga-backup-'+todayWIB()+'.db',()=>{try{fs.unlinkSync(out);}catch(_){}});
  }catch(e){
    try{fs.unlinkSync(out);}catch(_){}
    res.status(500).json({error:'Gagal membuat backup'});
  }
});
router.post('/restore',auth(['admin']),restoreUpload.single('backup'),(req,res)=>{
  if(!req.file)return res.status(400).json({error:'File backup wajib'});
  const dbPath=process.env.DB_PATH||path.join(__dirname,'../siaga.db');
  const tmp=path.join(__dirname,'../restore-upload-'+Date.now()+'.db');
  fs.writeFileSync(tmp,req.file.buffer);
  try{
    const check=new Database(tmp,{readonly:true});
    const integrity=check.pragma('integrity_check',{simple:true});
    const tables=check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('guru','kelas','siswa','penjemput','absensi')").all();
    check.close();
    if(integrity!=='ok'||tables.length<5){fs.unlinkSync(tmp);return res.status(400).json({error:'File backup tidak valid'});}
    const counts={};
    const countDb=new Database(tmp,{readonly:true});
    for(const t of ['guru','kelas','siswa','penjemput','absensi'])counts[t]=countDb.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    countDb.close();
    const currentBackup=dbPath+'.before-restore-'+Date.now();
    res.json({success:true,restart_required:true,counts,message:'Restore diterima. Jika server tidak restart otomatis, jalankan ulang npm run dev.'});
    setTimeout(()=>{
      try{
        db.close();
        if(fs.existsSync(dbPath))fs.copyFileSync(dbPath,currentBackup);
        fs.copyFileSync(tmp,dbPath);
        try{fs.unlinkSync(dbPath+'-wal');}catch(_){}
        try{fs.unlinkSync(dbPath+'-shm');}catch(_){}
        fs.unlinkSync(tmp);
      }catch(e){console.error('Restore failed:',e);}
      if(process.env.SIAGA_RESTORE_NO_EXIT!=='1')process.exit(0);
    },300);
  }catch(e){
    try{fs.unlinkSync(tmp);}catch(_){}
    res.status(400).json({error:'File backup tidak bisa dibaca'});
  }
});
router.get('/completeness',auth(['admin','kepsek']),(req,res)=>{
  res.json({
    siswaTanpaFoto:db.prepare("SELECT s.id,s.nama,k.nama kelas_nama FROM siswa s LEFT JOIN kelas k ON k.id=s.kelas_id WHERE COALESCE(s.aktif,1)=1 AND (s.foto IS NULL OR s.foto='') ORDER BY k.nama,s.nama LIMIT 50").all(),
    siswaTanpaPenjemput:db.prepare('SELECT s.id,s.nama,k.nama kelas_nama FROM siswa s LEFT JOIN kelas k ON k.id=s.kelas_id WHERE COALESCE(s.aktif,1)=1 AND NOT EXISTS(SELECT 1 FROM penjemput p WHERE p.siswa_id=s.id AND COALESCE(p.aktif,1)=1) ORDER BY k.nama,s.nama LIMIT 50').all(),
    guruTanpaKelas:db.prepare("SELECT g.id,g.nama,g.role FROM guru g WHERE COALESCE(g.aktif,1)=1 AND g.role='guru' AND NOT EXISTS(SELECT 1 FROM guru_kelas gk WHERE gk.guru_id=g.id) ORDER BY g.nama LIMIT 50").all(),
    qrBelumDicetak:db.prepare("SELECT s.id,s.nama,k.nama kelas_nama,s.status_kartu FROM siswa s LEFT JOIN kelas k ON k.id=s.kelas_id WHERE COALESCE(s.aktif,1)=1 AND s.status_kartu='cetak' ORDER BY k.nama,s.nama LIMIT 50").all(),
    duplicateNis:db.prepare("SELECT nis,COUNT(*) count,GROUP_CONCAT(nama, ', ') nama FROM siswa WHERE nis IS NOT NULL AND nis!='' GROUP BY nis HAVING COUNT(*)>1 ORDER BY nis LIMIT 50").all(),
    importHistory:db.prepare("SELECT ih.*,g.nama user_nama FROM import_history ih LEFT JOIN guru g ON g.id=ih.user_id ORDER BY ih.id DESC LIMIT 10").all(),
    openDayStatus:{
      tanggal:todayWIB(),
      closed:!!db.prepare('SELECT 1 FROM day_closure WHERE tanggal=?').get(todayWIB()),
      unresolvedBelum:db.prepare("SELECT COUNT(*) c FROM siswa s LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=? WHERE COALESCE(s.aktif,1)=1 AND COALESCE(a.status,'Belum')='Belum'").get(todayWIB()).c,
      unresolvedMenunggu:db.prepare("SELECT COUNT(*) c FROM siswa s JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=? WHERE COALESCE(s.aktif,1)=1 AND a.status='Menunggu'").get(todayWIB()).c,
      missingLaporan:db.prepare("SELECT COUNT(*) c FROM siswa s LEFT JOIN laporan_harian l ON l.siswa_id=s.id AND l.tanggal=? WHERE COALESCE(s.aktif,1)=1 AND (l.id IS NULL OR (l.mood IS NULL AND l.makan IS NULL AND l.tidur IS NULL AND (l.aktivitas IS NULL OR l.aktivitas='[]') AND (l.catatan IS NULL OR l.catatan='')))").get(todayWIB()).c,
      rejectedQr:db.prepare("SELECT COUNT(*) c FROM notif_log WHERE tipe='alert_gerbang' AND created_at LIKE ?").get(todayWIB()+'%').c
    }
  });
});
router.get('/activity',auth(['admin','kepsek']),(req,res)=>{
  const limit=Math.min(parseInt(req.query.limit,10)||80,200);
  const rows=db.prepare(`
    SELECT tipe,waktu,siswa,kelas,penjemput,pelaku,detail FROM (
      SELECT 'serah_terima' tipe,pl.created_at waktu,s.nama siswa,k.nama kelas,p.nama penjemput,g.nama pelaku,('Scan '||COALESCE(pl.jam_scan,'-')||' lalu pulang '||COALESCE(pl.jam_pulang,'-')) detail FROM penjemputan_log pl LEFT JOIN siswa s ON s.id=pl.siswa_id LEFT JOIN kelas k ON k.id=s.kelas_id LEFT JOIN penjemput p ON p.id=pl.penjemput_id LEFT JOIN guru g ON g.id=pl.guru_id
      UNION ALL
      SELECT 'qr_reissue' tipe,q.created_at waktu,s.nama siswa,k.nama kelas,p.nama penjemput,g.nama pelaku,('QR diganti: '||COALESCE(q.reason,'tanpa alasan')) detail FROM qr_reissue_log q LEFT JOIN siswa s ON s.id=q.siswa_id LEFT JOIN kelas k ON k.id=s.kelas_id LEFT JOIN penjemput p ON p.id=q.penjemput_id LEFT JOIN guru g ON g.id=q.admin_id
      UNION ALL
      SELECT n.tipe,n.created_at waktu,s.nama siswa,k.nama kelas,NULL penjemput,g.nama pelaku,n.pesan detail FROM notif_log n LEFT JOIN siswa s ON s.id=n.siswa_id LEFT JOIN kelas k ON k.id=s.kelas_id LEFT JOIN guru g ON g.id=n.guru_id
    ) ORDER BY waktu DESC LIMIT ?
  `).all(limit);
  res.json(rows);
});
router.get('/',auth(),(req,res)=>{
  const y=req.query.tahun||new Date().getFullYear(),m=String(req.query.bulan||new Date().getMonth()+1).padStart(2,'0'),{rombel_id}=req.query;
  const scope=siswaScopeSql(req.user,'s',req.query.cabang_id);
  const liburBulan=holidayDatesInMonth(y,m).map(d=>d.slice(-2));
  const rombelFilter=rombel_id?' AND se_scope.rombel_id=?':'';
  const list=db.prepare(`
    SELECT DISTINCT s.id,s.nama,s.foto,r.nama AS kelas_nama
    FROM siswa s
    ${scope.join}
    JOIN rombel r ON r.id=se_scope.rombel_id
    WHERE ${scope.where} AND s.status='aktif'${rombelFilter}
    ORDER BY r.nama,s.nama
  `).all(...scope.params,...(rombel_id?[rombel_id]:[]));
  res.json({bulan:parseInt(m),tahun:parseInt(y),data:list.map(s=>{
    const rows=db.prepare("SELECT tanggal,status FROM absensi WHERE siswa_id=? AND tanggal LIKE ?").all(s.id,y+'-'+m+'%');
    const byDate={};rows.forEach(r=>{byDate[r.tanggal.slice(-2)]=r.status;});
    liburBulan.forEach(d=>{if(!byDate[d])byDate[d]='Libur';});
    const c={H:0,T:0,I:0,S:0,A:0,L:0};
    Object.values(byDate).forEach(st=>{if(st==='Hadir')c.H++;else if(st==='Terlambat')c.T++;else if(st==='Izin')c.I++;else if(st==='Sakit')c.S++;else if(st==='Absen')c.A++;else if(st==='Libur')c.L++;});
    return{...s,absensi:byDate,counts:c};
  })});
});
module.exports=router;
