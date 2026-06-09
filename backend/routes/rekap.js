const router=require('express').Router(),db=require('../db'),auth=require('../middleware/auth'),path=require('path'),fs=require('fs');
const {todayWIB,holidayDatesInMonth,siswaScopeSql,isSchoolDay,canAccessSiswa}=require('../utils/workflow');
const PDFDocument = require('pdfkit');
router.get('/dashboard',auth(),(req,res)=>{
  const tgl=todayWIB();
  const cabangId=req.query.cabang_id || (req.user.role!=='admin'?req.user.cabang_id:null);
  const scope=siswaScopeSql(req.user,'s',req.query.cabang_id);
  const libur=cabangId? !isSchoolDay(tgl,cabangId):false;
  const earlyWhere=[
    'er.tanggal=?',
    req.user.role==='admin'&&req.query.cabang_id?'er.cabang_id=?':null,
    ['admin_cabang','kepsek','gerbang'].includes(req.user.role)?'er.cabang_id=?':null,
    req.user.role==='guru'?'EXISTS (SELECT 1 FROM guru_rombel gr WHERE gr.rombel_id=se.rombel_id AND gr.pengguna_id=?)':null,
    req.user.role==='wali'?'EXISTS (SELECT 1 FROM wali_siswa ws WHERE ws.siswa_id=er.siswa_id AND ws.wali_pengguna_id=? AND ws.aktif=1)':null
  ].filter(Boolean);
  const earlyParams=[
    tgl,
    ...(req.user.role==='admin'&&req.query.cabang_id?[req.query.cabang_id]:[]),
    ...(['admin_cabang','kepsek','gerbang'].includes(req.user.role)?[req.user.cabang_id]:[]),
    ...(req.user.role==='guru'?[req.user.id]:[]),
    ...(req.user.role==='wali'?[req.user.id]:[])
  ];
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
    statusRows:libur?[]:db.prepare(`
      SELECT DISTINCT s.id,s.nama,s.foto,r.nama AS kelas,r.id AS rombel_id,c.nama AS cabang,
        COALESCE(a.status,'Belum') AS status,a.jam_masuk,a.jam_tunggu,a.jam_pulang,a.manual,a.catatan,p.nama AS nama_penjemput
      FROM siswa s
      ${scope.join}
      JOIN rombel r ON r.id=se_scope.rombel_id
      JOIN cabang c ON c.id=se_scope.cabang_id
      LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=?
      LEFT JOIN penjemput p ON p.id=a.penjemput_id
      WHERE ${scope.where} AND s.status='aktif'
      ORDER BY c.nama,r.nama,s.nama
    `).all(tgl,...scope.params),
    statusCounts:libur?{hadir:0,terlambat:0,menunggu:0,pulang:0,izin:0,sakit:0,absen:0,belum:0}:db.prepare(`
      SELECT
        COUNT(DISTINCT CASE WHEN a.status='Hadir' THEN a.siswa_id END) AS hadir,
        COUNT(DISTINCT CASE WHEN a.status='Terlambat' THEN a.siswa_id END) AS terlambat,
        COUNT(DISTINCT CASE WHEN a.status='Menunggu' THEN a.siswa_id END) AS menunggu,
        COUNT(DISTINCT CASE WHEN a.status='Pulang' THEN a.siswa_id END) AS pulang,
        COUNT(DISTINCT CASE WHEN a.status='Izin' THEN a.siswa_id END) AS izin,
        COUNT(DISTINCT CASE WHEN a.status='Sakit' THEN a.siswa_id END) AS sakit,
        COUNT(DISTINCT CASE WHEN a.status='Absen' THEN a.siswa_id END) AS absen,
        COUNT(DISTINCT CASE WHEN COALESCE(a.status,'Belum')='Belum' THEN s.id END) AS belum
      FROM siswa s
      ${scope.join}
      LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=?
      WHERE ${scope.where} AND s.status='aktif'
    `).get(tgl,...scope.params),
    earlyReleases:db.prepare(`
      SELECT er.*,s.nama AS siswa_nama,c.nama AS cabang_nama,r.nama AS rombel_nama,p.display_name AS created_by_name
      FROM early_release er
      JOIN siswa s ON s.id=er.siswa_id
      JOIN cabang c ON c.id=er.cabang_id
      LEFT JOIN siswa_enrollment se ON se.siswa_id=er.siswa_id AND se.cabang_id=er.cabang_id AND se.tanggal_mulai<=er.tanggal AND (se.tanggal_selesai IS NULL OR se.tanggal_selesai>=er.tanggal)
      LEFT JOIN rombel r ON r.id=se.rombel_id
      LEFT JOIN pengguna p ON p.id=er.created_by
      WHERE ${earlyWhere.join(' AND ')}
      ORDER BY er.created_at DESC
    `).all(...earlyParams),
    dayCloseStatus:cabangId?{closed:!!db.prepare('SELECT 1 FROM tutup_hari WHERE cabang_id=? AND tanggal=?').get(cabangId,tgl)}:{closed:false},
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
router.get('/completeness',auth(['admin','kepsek']),(req,res)=>{
  const cabangId=req.user.role==='admin'?req.query.cabang_id:req.user.cabang_id;
  const cabangWhere=cabangId?' AND se.cabang_id=?':'';
  const cabangParams=cabangId?[cabangId]:[];
  const today=todayWIB();
  res.json({
    siswaTanpaFoto:db.prepare(`
      SELECT DISTINCT s.id,s.nama,r.nama kelas_nama,c.nama cabang_nama
      FROM siswa s
      JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
      JOIN rombel r ON r.id=se.rombel_id
      JOIN cabang c ON c.id=se.cabang_id
      WHERE s.status='aktif'${cabangWhere} AND (s.foto IS NULL OR s.foto='')
      ORDER BY c.nama,r.nama,s.nama LIMIT 50
    `).all(...cabangParams),
    siswaTanpaPenjemput:db.prepare(`
      SELECT DISTINCT s.id,s.nama,r.nama kelas_nama,c.nama cabang_nama
      FROM siswa s
      JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
      JOIN rombel r ON r.id=se.rombel_id
      JOIN cabang c ON c.id=se.cabang_id
      WHERE s.status='aktif'${cabangWhere}
        AND NOT EXISTS(SELECT 1 FROM penjemput p WHERE p.siswa_id=s.id AND p.aktif=1)
      ORDER BY c.nama,r.nama,s.nama LIMIT 50
    `).all(...cabangParams),
    guruTanpaKelas:db.prepare(`
      SELECT p.id,p.display_name nama,p.role,c.nama cabang_nama
      FROM pengguna p
      LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
      LEFT JOIN cabang c ON c.id=sp.cabang_id
      WHERE p.status='aktif' AND p.role='guru'${cabangId?' AND sp.cabang_id=?':''}
        AND NOT EXISTS(SELECT 1 FROM guru_rombel gr WHERE gr.pengguna_id=p.id)
      ORDER BY c.nama,p.display_name LIMIT 50
    `).all(...cabangParams),
    qrBelumDicetak:db.prepare(`
      SELECT DISTINCT s.id,s.nama,r.nama kelas_nama,c.nama cabang_nama,s.status_kartu
      FROM siswa s
      JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
      JOIN rombel r ON r.id=se.rombel_id
      JOIN cabang c ON c.id=se.cabang_id
      WHERE s.status='aktif'${cabangWhere} AND s.status_kartu='cetak'
      ORDER BY c.nama,r.nama,s.nama LIMIT 50
    `).all(...cabangParams),
    duplicateNis:db.prepare("SELECT nis,COUNT(*) count,GROUP_CONCAT(nama, ', ') nama FROM siswa WHERE nis IS NOT NULL AND nis!='' GROUP BY nis HAVING COUNT(*)>1 ORDER BY nis LIMIT 50").all(),
    importHistory:[],
    openDayStatus:{
      tanggal:today,
      closed:cabangId?!!db.prepare('SELECT 1 FROM tutup_hari WHERE cabang_id=? AND tanggal=?').get(cabangId,today):false,
      unresolvedBelum:db.prepare(`
        SELECT COUNT(DISTINCT s.id) c
        FROM siswa s
        JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
        LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=?
        WHERE s.status='aktif'${cabangWhere} AND COALESCE(a.status,'Belum')='Belum'
      `).get(today,...cabangParams).c,
      unresolvedMenunggu:db.prepare(`
        SELECT COUNT(DISTINCT s.id) c
        FROM siswa s
        JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
        JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=?
        WHERE s.status='aktif'${cabangWhere} AND a.status='Menunggu'
      `).get(today,...cabangParams).c,
      missingLaporan:db.prepare(`
        SELECT COUNT(DISTINCT s.id) c
        FROM siswa s
        JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
        LEFT JOIN laporan_harian l ON l.siswa_id=s.id AND l.tanggal=?
        WHERE s.status='aktif'${cabangWhere}
          AND (l.id IS NULL OR l.focus_theme_id IS NULL OR l.mood IS NULL OR l.makan IS NULL OR l.tidur IS NULL OR l.observation_domain IS NULL OR TRIM(COALESCE(l.observation_note,''))='')
      `).get(today,...cabangParams).c,
      rejectedQr:db.prepare(`
        SELECT COUNT(*) c FROM nfc_scan_log
        WHERE status='failed' AND action='qr' AND created_at LIKE ?${cabangId?' AND cabang_id=?':''}
      `).get(today+'%',...cabangParams).c
    }
  });
});
router.get('/activity',auth(['admin','kepsek']),(req,res)=>{
  const limit=Math.min(parseInt(req.query.limit,10)||80,200);
  const cabangId=req.user.role==='admin'?req.query.cabang_id:req.user.cabang_id;
  const rows=db.prepare(`
    SELECT tipe,waktu,siswa,kelas,penjemput,pelaku,detail FROM (
      SELECT 'serah_terima' tipe,pl.created_at waktu,s.nama siswa,r.nama kelas,p.nama penjemput,u.display_name pelaku,('Scan '||COALESCE(pl.jam_scan,'-')||' lalu pulang '||COALESCE(pl.jam_pulang,'-')) detail
      FROM penjemputan_log pl
      LEFT JOIN siswa s ON s.id=pl.siswa_id
      LEFT JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
      LEFT JOIN rombel r ON r.id=se.rombel_id
      LEFT JOIN penjemput p ON p.id=pl.penjemput_id
      LEFT JOIN pengguna u ON u.id=pl.guru_id
      WHERE (? IS NULL OR pl.cabang_id=?)
      UNION ALL
      SELECT 'qr_reissue' tipe,q.created_at waktu,s.nama siswa,r.nama kelas,p.nama penjemput,u.display_name pelaku,('QR diganti: '||COALESCE(q.reason,'tanpa alasan')) detail
      FROM qr_reissue_log q
      LEFT JOIN siswa s ON s.id=q.siswa_id
      LEFT JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
      LEFT JOIN rombel r ON r.id=se.rombel_id
      LEFT JOIN penjemput p ON p.id=q.penjemput_id
      LEFT JOIN pengguna u ON u.id=q.admin_id
      WHERE (? IS NULL OR q.cabang_id=?)
      UNION ALL
      SELECT n.tipe,n.created_at waktu,NULL siswa,NULL kelas,NULL penjemput,NULL pelaku,COALESCE(n.body,n.title) detail
      FROM notifikasi n
      WHERE (? IS NULL OR n.cabang_id=?)
    ) ORDER BY waktu DESC LIMIT ?
  `).all(cabangId||null,cabangId||null,cabangId||null,cabangId||null,cabangId||null,cabangId||null,limit);
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

router.get('/export', auth(), (req, res) => {
  const format = req.query.format || 'pdf';
  const rombel_id = req.query.rombel_id ? Number(req.query.rombel_id) : null;
  const siswa_id = req.query.siswa_id ? Number(req.query.siswa_id) : null;
  const start_date = req.query.start_date || todayWIB().slice(0, 8) + '01';
  const end_date = req.query.end_date || todayWIB();
  const start = parseDateOnly(start_date);
  const end = parseDateOnly(end_date);

  if (!rombel_id && !siswa_id) {
    return res.status(400).json({ error: 'Rombel atau Siswa wajib ditentukan' });
  }
  if (!start || !end || start > end) {
    return res.status(400).json({ error: 'Rentang tanggal tidak valid' });
  }
  if ((end - start) / (24 * 60 * 60 * 1000) > 370) {
    return res.status(400).json({ error: 'Rentang export maksimal 370 hari' });
  }

  // 1. Authorization checks
  let isIndividual = !!siswa_id;
  let targetCabangId = null;

  if (isIndividual) {
    const access = canAccessSiswa(req.user, siswa_id, { tanggal: start_date });
    if (access === false) return res.status(403).json({ error: 'Akses siswa ditolak' });
    if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    targetCabangId = access.enrollment.cabang_id;
  } else {
    // Check rombel assignment/access
    const rombel = db.prepare('SELECT * FROM rombel WHERE id=?').get(rombel_id);
    if (!rombel) return res.status(404).json({ error: 'Rombel tidak ditemukan' });
    targetCabangId = rombel.cabang_id;

    if (req.user.role === 'wali') {
      return res.status(403).json({ error: 'Wali hanya dapat export per siswa' });
    } else if (req.user.role === 'guru') {
      const assigned = db.prepare('SELECT 1 FROM guru_rombel WHERE pengguna_id=? AND rombel_id=?').get(req.user.id, rombel_id);
      if (!assigned) return res.status(403).json({ error: 'Akses rombel ditolak' });
    } else if (['admin_cabang', 'kepsek'].includes(req.user.role)) {
      if (Number(req.user.cabang_id) !== Number(rombel.cabang_id)) {
        return res.status(403).json({ error: 'Akses rombel cabang lain ditolak' });
      }
    }
  }

  // 2. Fetch data
  const schoolDays = [];
  let curr = new Date(start);
  const limit = new Date(end);
  while (curr <= limit) {
      const yyyymmdd = formatDateOnly(curr);
    if (isSchoolDay(yyyymmdd, targetCabangId)) {
      schoolDays.push(yyyymmdd);
    }
    curr.setDate(curr.getDate() + 1);
  }

  let students = [];
  let attendanceRows = [];
  let rombelInfo = null;
  let studentInfo = null;

  if (isIndividual) {
    studentInfo = db.prepare(`
      SELECT s.*, c.nama AS cabang_nama, r.nama AS rombel_nama, r.id AS rombel_id
      FROM siswa s
      JOIN siswa_enrollment se ON se.siswa_id = s.id AND se.status = 'aktif'
      JOIN rombel r ON r.id = se.rombel_id
      JOIN cabang c ON c.id = r.cabang_id
      WHERE s.id = ?
    `).get(siswa_id);
    students = [studentInfo];

    attendanceRows = db.prepare(`
      SELECT * FROM absensi
      WHERE siswa_id = ? AND tanggal >= ? AND tanggal <= ?
    `).all(siswa_id, start_date, end_date);
  } else {
    rombelInfo = db.prepare(`
      SELECT r.*, c.nama AS cabang_nama
      FROM rombel r
      JOIN cabang c ON c.id = r.cabang_id
      WHERE r.id = ?
    `).get(rombel_id);

    students = db.prepare(`
      SELECT DISTINCT s.id, s.nama, s.nis
      FROM siswa s
      JOIN siswa_enrollment se ON se.siswa_id = s.id
      WHERE se.rombel_id = ? AND s.status = 'aktif' AND se.status = 'aktif'
      ORDER BY s.nama
    `).all(rombel_id);

    attendanceRows = db.prepare(`
      SELECT * FROM absensi
      WHERE rombel_id = ? AND tanggal >= ? AND tanggal <= ?
    `).all(rombel_id, start_date, end_date);
  }

  const attMap = {};
  attendanceRows.forEach(row => {
    attMap[`${row.siswa_id}_${row.tanggal}`] = row;
  });

  // 3. Format output
  if (format === 'excel') {
    const lines = [];
    if (isIndividual) {
      lines.push(['Laporan Kehadiran Perorangan']);
      lines.push(['Nama Siswa', studentInfo.nama]);
      lines.push(['NIS', studentInfo.nis || '-']);
      lines.push(['Rombel/Kelas', studentInfo.rombel_nama]);
      lines.push(['Cabang', studentInfo.cabang_nama]);
      lines.push(['Rentang Tanggal', `${start_date} s/d ${end_date}`]);
      lines.push([]);
      lines.push(['No', 'Hari', 'Tanggal', 'Status', 'Jam Masuk', 'Jam Pulang', 'Catatan/Keterangan']);

      const daysOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      schoolDays.forEach((day, idx) => {
        const dateObj = new Date(day + 'T00:00:00');
        const dayName = daysOfWeek[dateObj.getDay()];
        const att = attMap[`${siswa_id}_${day}`];
        lines.push([
          idx + 1,
          dayName,
          day,
          att ? att.status : 'Belum',
          att ? (att.jam_masuk || '-') : '-',
          att ? (att.jam_pulang || '-') : '-',
          att ? (att.catatan || '-') : '-'
        ]);
      });
    } else {
      lines.push(['Laporan Kehadiran Kelas (Rombel)']);
      lines.push(['Kelas/Rombel', rombelInfo.nama]);
      lines.push(['Cabang', rombelInfo.cabang_nama]);
      lines.push(['Rentang Tanggal', `${start_date} s/d ${end_date}`]);
      lines.push([]);
      
      const dateHeaders = schoolDays.map(d => d.slice(8, 10) + '/' + d.slice(5, 7));
      lines.push(['No', 'NIS', 'Nama Siswa', ...dateHeaders, 'Hadir', 'Terlambat', 'Izin', 'Sakit', 'Absen', 'Belum', 'Persentase Kehadiran (%)']);

      students.forEach((s, idx) => {
        const rowData = [idx + 1, s.nis || '-', s.nama];
        let H = 0, T = 0, I = 0, S = 0, A = 0, B = 0;
        schoolDays.forEach(day => {
          const att = attMap[`${s.id}_${day}`];
          const status = att ? att.status : 'Belum';
          let code = '-';
          if (status === 'Hadir' || status === 'Menunggu' || status === 'Pulang') { H++; code = 'H'; }
          else if (status === 'Terlambat') { T++; code = 'T'; }
          else if (status === 'Izin') { I++; code = 'I'; }
          else if (status === 'Sakit') { S++; code = 'S'; }
          else if (status === 'Absen') { A++; code = 'A'; }
          else { B++; code = 'B'; }
          rowData.push(code);
        });
        const totalPresent = H + T;
        const totalEff = schoolDays.length;
        const pct = totalEff > 0 ? Math.round((totalPresent / totalEff) * 100) : 0;
        rowData.push(H, T, I, S, A, B, `${pct}%`);
        lines.push(rowData);
      });
    }

    const csvContent = lines.map(row => row.map(cell => {
      const str = String(cell || '').replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')).join('\n');
    const bom = '\uFEFF';
    const sep = 'sep=,\n';
    const finalCsv = bom + sep + csvContent;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rekap_absensi_${start_date}_to_${end_date}.csv"`);
    return res.send(finalCsv);

  } else {
    // Generate PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rekap_absensi_${start_date}_to_${end_date}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', info: { Title: 'Rekap Absensi SIAGA' } });
    doc.pipe(res);

    // Header Logo (if exists)
    const logoPath = path.join(__dirname, '../../frontend/public/tp_logo.png');
    const hasLogo = fs.existsSync(logoPath);
    let headerX = 40;
    if (hasLogo) {
      try {
        doc.image(logoPath, 40, 35, { width: 110 });
        headerX = 160;
      } catch (e) {}
    }

    // Header text
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1e3a8a').text('Yayasan Taruna Prima', headerX, 35);
    const cabangName = isIndividual ? studentInfo.cabang_nama : rombelInfo.cabang_nama;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(`Cabang ${cabangName}`, headerX, 50);
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Sistem Informasi Akademik & Gerbang Absensi (SIAGA)', headerX, 62);

    doc.moveTo(40, 85).lineTo(555, 85).strokeColor('#cbd5e1').stroke();

    let titleText = isIndividual ? 'LAPORAN KEHADIRAN SISWA' : 'REKAPITULASI ABSENSI KELAS';
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(titleText, 40, 95);
    
    // Metadata card
    doc.roundedRect(40, 115, 515, 45, 6).fillColor('#f8fafc').fill().strokeColor('#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor('#475569');
    
    if (isIndividual) {
      doc.text(`Nama Siswa : ${studentInfo.nama}`, 50, 123);
      doc.text(`NIS        : ${studentInfo.nis || '-'}`, 50, 137);
      doc.text(`Kelas      : ${studentInfo.rombel_nama}`, 300, 123);
      doc.text(`Periode    : ${start_date} s/d ${end_date}`, 300, 137);
    } else {
      doc.text(`Kelas/Rombel : ${rombelInfo.nama}`, 50, 123);
      doc.text(`Total Siswa  : ${students.length} anak`, 50, 137);
      doc.text(`Periode      : ${start_date} s/d ${end_date}`, 300, 123);
      doc.text(`Hari Efektif : ${schoolDays.length} hari`, 300, 137);
    }

    const drawHeaders = (y) => {
      doc.rect(40, y, 515, 20).fillColor('#1e3a8a').fill();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
      if (isIndividual) {
        doc.text('No', 48, y + 6, { width: 25 });
        doc.text('Hari / Tanggal', 80, y + 6, { width: 110 });
        doc.text('Status', 200, y + 6, { width: 70 });
        doc.text('Masuk', 280, y + 6, { width: 50 });
        doc.text('Pulang', 340, y + 6, { width: 50 });
        doc.text('Catatan / Keterangan', 400, y + 6, { width: 145 });
      } else {
        doc.text('No', 48, y + 6, { width: 25 });
        doc.text('Nama Siswa', 80, y + 6, { width: 200 });
        doc.text('Hadir', 290, y + 6, { width: 35, align: 'center' });
        doc.text('Tmb', 330, y + 6, { width: 30, align: 'center' });
        doc.text('Izin', 365, y + 6, { width: 30, align: 'center' });
        doc.text('Sakit', 400, y + 6, { width: 30, align: 'center' });
        doc.text('Abs', 435, y + 6, { width: 30, align: 'center' });
        doc.text('Blm', 470, y + 6, { width: 30, align: 'center' });
        doc.text('% Hadir', 505, y + 6, { width: 45, align: 'right' });
      }
    };

    let tableTop = 175;
    drawHeaders(tableTop);

    let currentY = tableTop + 20;
    
    if (isIndividual) {
      const daysOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      schoolDays.forEach((day, idx) => {
        if (currentY > 730) {
          doc.addPage();
          drawHeaders(40);
          currentY = 60;
        }

        if (idx % 2 === 1) {
          doc.rect(40, currentY, 515, 20).fillColor('#f8fafc').fill();
        }

        const dateObj = new Date(day + 'T00:00:00');
        const dayName = daysOfWeek[dateObj.getDay()];
        const att = attMap[`${siswa_id}_${day}`];
        const status = att ? att.status : 'Belum';

        let statusColor = '#475569';
        if (['Hadir', 'Menunggu', 'Pulang'].includes(status)) statusColor = '#047857';
        else if (status === 'Terlambat') statusColor = '#b45309';
        else if (['Izin', 'Sakit'].includes(status)) statusColor = '#2563eb';
        else if (status === 'Absen') statusColor = '#b91c1c';

        doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
        doc.text(String(idx + 1), 48, currentY + 6, { width: 25 });
        doc.text(`${dayName}, ${day}`, 80, currentY + 6, { width: 110 });
        doc.font('Helvetica-Bold').fillColor(statusColor).text(status, 200, currentY + 6, { width: 70 });
        doc.font('Helvetica').fillColor('#334155');
        doc.text(att && att.jam_masuk ? att.jam_masuk : '-', 280, currentY + 6, { width: 50 });
        doc.text(att && att.jam_pulang ? att.jam_pulang : '-', 340, currentY + 6, { width: 50 });
        doc.text(att && att.catatan ? att.catatan : '-', 400, currentY + 6, { width: 145, height: 12, ellipsis: true });

        doc.moveTo(40, currentY + 20).lineTo(555, currentY + 20).strokeColor('#f1f5f9').stroke();
        currentY += 20;
      });
    } else {
      students.forEach((s, idx) => {
        if (currentY > 730) {
          doc.addPage();
          drawHeaders(40);
          currentY = 60;
        }

        if (idx % 2 === 1) {
          doc.rect(40, currentY, 515, 20).fillColor('#f8fafc').fill();
        }

        let H = 0, T = 0, I = 0, S = 0, A = 0, B = 0;
        schoolDays.forEach(day => {
          const att = attMap[`${s.id}_${day}`];
          const status = att ? att.status : 'Belum';
          if (status === 'Hadir' || status === 'Menunggu' || status === 'Pulang') H++;
          else if (status === 'Terlambat') T++;
          else if (status === 'Izin') I++;
          else if (status === 'Sakit') S++;
          else if (status === 'Absen') A++;
          else B++;
        });

        const totalPresent = H + T;
        const totalEff = schoolDays.length;
        const pct = totalEff > 0 ? Math.round((totalPresent / totalEff) * 100) : 0;

        doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
        doc.text(String(idx + 1), 48, currentY + 6, { width: 25 });
        doc.font('Helvetica-Bold').text(s.nama, 80, currentY + 6, { width: 200, height: 12, ellipsis: true });
        
        doc.font('Helvetica').text(String(H), 290, currentY + 6, { width: 35, align: 'center' });
        doc.text(String(T), 330, currentY + 6, { width: 30, align: 'center' });
        doc.text(String(I), 365, currentY + 6, { width: 30, align: 'center' });
        doc.text(String(S), 400, currentY + 6, { width: 30, align: 'center' });
        doc.text(String(A), 435, currentY + 6, { width: 30, align: 'center' });
        doc.text(String(B), 470, currentY + 6, { width: 30, align: 'center' });

        let pctColor = pct >= 90 ? '#047857' : pct >= 75 ? '#d97706' : '#b91c1c';
        doc.font('Helvetica-Bold').fillColor(pctColor).text(`${pct}%`, 505, currentY + 6, { width: 45, align: 'right' });

        doc.moveTo(40, currentY + 20).lineTo(555, currentY + 20).strokeColor('#f1f5f9').stroke();
        currentY += 20;
      });
    }

    // Signature Block
    currentY += 40;
    if (currentY > 670) {
      doc.addPage();
      currentY = 40;
    }

    const sigY = currentY;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${cabangName}, ${formatDate(todayWIB())}`, 360, sigY, { width: 180, align: 'center' });
    doc.text('Kepala Sekolah / Wali Kelas', 360, sigY + 12, { width: 180, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(req.user.display_name || 'Petugas Sekolah', 360, sigY + 68, { width: 180, align: 'center' });
    doc.moveTo(375, sigY + 79).lineTo(525, sigY + 79).strokeColor('#cbd5e1').stroke();

    // Footer note
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text('Laporan absensi ini diunduh secara resmi melalui sistem SIAGA Taruna Prima.', 40, 765, { align: 'center', width: 515 });

    doc.end();
  }
});

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return isoStr.slice(0, 10);
  }
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

module.exports=router;
