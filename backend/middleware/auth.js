require('dotenv').config();
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'siaga-dev';
module.exports = (roles=[]) => (req,res,next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({error:'Token tidak ada'});
  try {
    const d = jwt.verify(auth.split(' ')[1], SECRET);
    if (roles.length && !roles.includes(d.role)) return res.status(403).json({error:'Akses ditolak'});
    req.user = d; next();
  } catch { res.status(401).json({error:'Token tidak valid'}); }
};