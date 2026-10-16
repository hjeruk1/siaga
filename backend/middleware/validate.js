// Gerbang validasi input berbasis Zod.
//
// Sengaja TIDAK mengganti req.body/req.query dengan hasil parse: handler tetap
// menerima payload asli sehingga tidak ada perilaku yang berubah untuk input yang
// valid. Tujuannya menolak input yang jelas tidak valid lebih awal dengan pesan
// yang bisa dibaca, bukan mentransformasi data.

function formatIssue(issue) {
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

function reject(res, error) {
  const issues = error.issues.map(formatIssue);
  return res.status(400).json({
    error: issues[0] || 'Input tidak valid',
    code: 'VALIDATION_ERROR',
    issues
  });
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return reject(res, result.error);
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) return reject(res, result.error);
    next();
  };
}

module.exports = { validateBody, validateQuery };
