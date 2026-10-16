// Unduh kartu QR penjemput sebagai PNG. Murni DOM + canvas: tidak menyentuh
// React, state, maupun api, sehingga berdiri sendiri di luar komponen.
// Dipisah dari SiswaTab.jsx agar bisa dibaca tanpa menelusuri komponen 1900 baris.

export async function downloadQrCard({ siswa, pickup }) {
  const qr = document.getElementById(`pickup-qr-${pickup.id}`);
  if (!qr) throw new Error('Buka QR dulu sebelum download');
  const qrInner = qr.innerHTML;

  // Calculate scale factor from viewBox to prevent nested SVG scaling bugs when rendering to canvas
  const viewBoxAttr = qr.getAttribute('viewBox') || '0 0 25 25';
  const parts = viewBoxAttr.trim().split(/\s+/);
  const v = parseFloat(parts[3]) || 25;
  const qrScale = (240 / v).toFixed(4);

  // Fetch logo as Data URL to embed directly and prevent canvas tainting
  let logoDataUrl = '';
  try {
    const res = await fetch('/tp_logo.png');
    const blob = await res.blob();
    logoDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Failed to inline school logo:', e);
  }

  const logoHtml = logoDataUrl
    ? `<clipPath id="logo-clip"><rect x="54" y="80" width="180" height="58" rx="10" /></clipPath>
       <g clip-path="url(#logo-clip)">
         <rect x="54" y="80" width="180" height="58" fill="#ffffff"/>
         <image href="${logoDataUrl}" x="54" y="80" width="180" height="58" />
       </g>`
    : `<rect x="54" y="80" width="70" height="58" rx="10" fill="#f59e0b"/>
       <text x="89" y="117" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#ffffff">TP</text>`;

  const textX = logoDataUrl ? 254 : 144;

  const esc = (v) =>
    String(v || '-').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]
    );
  const safeName =
    String(`${siswa.nama || 'siswa'}-${pickup.nama || 'penjemput'}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'kartu-penjemput';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="920" viewBox="0 0 640 920">
  <rect width="640" height="920" rx="36" fill="#f8fafc"/>
  <rect x="34" y="34" width="572" height="852" rx="30" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <rect x="34" y="34" width="572" height="150" rx="30" fill="#0f172a"/>
  ${logoHtml}
  <text x="${textX}" y="96" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#fde68a" letter-spacing="2">TARUNA PRIMA</text>
  <text x="${textX}" y="132" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff">Kartu Penjemput</text>
  <text x="320" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#94a3b8" letter-spacing="2">SISWA</text>
  <text x="320" y="276" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="900" fill="#0f172a">${esc(siswa.nama)}</text>
  <text x="320" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#64748b">${esc(siswa.enrollment?.rombel_nama)}</text>
  <rect x="170" y="346" width="300" height="300" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="3"/>
  <g transform="translate(200 376) scale(${qrScale})">
    ${qrInner}
  </g>
  <text x="320" y="710" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#94a3b8" letter-spacing="2">PENJEMPUT</text>
  <text x="320" y="746" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#0f172a">${esc(pickup.nama)}</text>
  <text x="320" y="780" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#64748b">${esc(pickup.relasi)}${pickup.no_wa ? ` - ${esc(pickup.no_wa)}` : ''}</text>
  <rect x="94" y="816" width="452" height="42" rx="12" fill="#f1f5f9"/>
  <text x="320" y="843" text-anchor="middle" font-family="Consolas, monospace" font-size="17" fill="#475569">${esc(pickup.qr_code)}</text>
</svg>`;
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  const img = new Image();
  const loaded = new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Gagal membuat PNG kartu QR'));
  });
  img.src = svgUrl;
  await loaded;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = 640 * scale;
  canvas.height = 920 * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, 640, 920);
  URL.revokeObjectURL(svgUrl);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Gagal membuat PNG kartu QR');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}-qr.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
