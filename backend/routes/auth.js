require('dotenv').config();
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const SECRET = process.env.JWT_SECRET || 'siaga-dev';
router.post('/login', (req,res) => {
  const {username,password} = req.body;
  if (!username||!password) return res.status(400).json({error:'Isi username dan password'});
  const u = db.prepare('SELECT * FROM guru WHERE username=?').get(username);
  if (!u||!bcrypt.compareSync(password,u.password_hash)) return res.status(401).json({error:'Username atau password salah'});
  const token = jwt.sign({id:u.id,username:u.username,nama:u.nama,role:u.role},SECRET,{expiresIn:'12h'});
  res.json({token,user:{id:u.id,nama:u.nama,role:u.role}});
});
router.get('/me', (req,res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({error:'No token'});
  try { res.json(jwt.verify(token,SECRET)); } catch { res.status(401).json({error:'Token tidak valid'}); }
});
module.exports = router;