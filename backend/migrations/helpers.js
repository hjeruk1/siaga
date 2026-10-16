// Helper untuk migrasi. SQLite tidak mendukung "ADD COLUMN IF NOT EXISTS",
// jadi keberadaan kolom diperiksa lebih dulu lewat PRAGMA table_info.

function hasColumn(db, table, column) {
  return db.pragma(`table_info(${table})`).some((c) => c.name === column);
}

function hasTable(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

// Mengembalikan true bila kolom benar-benar ditambahkan.
function addColumnIfMissing(db, table, column, definition) {
  if (!hasTable(db, table) || hasColumn(db, table, column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

module.exports = { hasColumn, hasTable, addColumnIfMissing };
