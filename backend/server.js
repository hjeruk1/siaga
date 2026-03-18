require('dotenv').config();
const express=require('express'),cors=require('cors'),path=require('path'),app=express();
app.use(cors({origin:process.env.NODE_ENV==='production'?(process.env.FRONTEND_URL||'*'):'*'}));
app.use(express.json());
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/guru',        require('./routes/guru'));
app.use('/api/kelas',       require('./routes/kelas'));
app.use('/api/siswa',       require('./routes/siswa'));
app.use('/api/absensi',     require('./routes/absensi'));
app.use('/api/penjemputan', require('./routes/penjemputan'));
app.use('/api/notifikasi',  require('./routes/notifikasi'));
app.use('/api/rekap',       require('./routes/rekap'));
if(process.env.NODE_ENV==='production'){
  const DIST=path.join(__dirname,'../frontend/dist');
  app.use(express.static(DIST));
  app.get('*',(req,res)=>res.sendFile(path.join(DIST,'index.html')));
}
app.use((err,req,res,_n)=>{console.error(err.stack);res.status(500).json({error:'Internal server error'});});
app.listen(process.env.PORT||3001,'0.0.0.0',()=>console.log('\nSIAGA Backend -> http://localhost:'+(process.env.PORT||3001)+' ['+( process.env.NODE_ENV||'development')+']\n'));