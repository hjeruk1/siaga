// Tes pemantau sesi WhatsApp.
//
// Yang dijaga: kanal yang putus harus KETAHUAN dan diberitahukan sekali, bukan
// diam-diam berhenti bekerja; kanal yang memang dimatikan (provider none) tidak
// boleh dianggap gangguan; dan pemulihan juga dikabarkan supaya admin tidak
// mengira masih rusak.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const monitor = require('../backend/utils/wa-monitor');

function resetStatus() {
  db.prepare(
    `UPDATE wa_monitor SET status='belum-dicek', provider=NULL, pesan=NULL, terakhir_cek=NULL,
       terakhir_ok=NULL, gagal_beruntun=0, terakhir_alert_at=NULL, terakhir_pulih_at=NULL WHERE id=1`
  ).run();
  db.prepare("DELETE FROM notifikasi WHERE tipe IN ('wa_terputus','wa_pulih')").run();
}

const hitungAlert = (tipe) => db.prepare('SELECT COUNT(*) c FROM notifikasi WHERE tipe=?').get(tipe).c;

describe('pemantau sesi WhatsApp', () => {
  beforeEach(resetStatus);

  it('klasifikasi menerjemahkan hasil cek dengan benar', () => {
    assert.equal(monitor.klasifikasi({ aktif: false, provider: 'none' }), 'mati');
    assert.equal(monitor.klasifikasi({ aktif: true, provider: 'log', reachable: true }), 'ok');
    assert.equal(monitor.klasifikasi({ aktif: true, provider: 'openwa', reachable: false }), 'down');
    assert.equal(monitor.klasifikasi({ aktif: true, provider: 'openwa', reachable: true, connected: false }), 'down');
    assert.equal(
      monitor.klasifikasi({ aktif: true, provider: 'openwa', reachable: true, connected: true, ready: false }),
      'down'
    );
    assert.equal(
      monitor.klasifikasi({ aktif: true, provider: 'openwa', reachable: true, connected: true, ready: true }),
      'ok'
    );
    // Gateway tidak punya konsep sesi; cukup terjangkau.
    assert.equal(monitor.klasifikasi({ aktif: true, provider: 'gateway', reachable: true }), 'ok');
  });

  it('kanal sehat mencatat status ok tanpa alarm', async () => {
    const hasil = await monitor.cekSekarang({
      checker: async () => ({ aktif: true, provider: 'openwa', reachable: true, connected: true, ready: true })
    });
    assert.equal(hasil.status, 'ok');
    assert.equal(hasil.alert, false);

    const row = monitor.baca();
    assert.equal(row.status, 'ok');
    assert.equal(row.gagal_beruntun, 0);
    assert.ok(row.terakhir_ok, 'waktu sehat terakhir harus tercatat');
    assert.equal(hitungAlert('wa_terputus'), 0);
  });

  it('kanal putus memberi tahu admin SEKALI, lalu diingatkan setelah jeda', async () => {
    const putus = async () => ({ aktif: true, provider: 'openwa', reachable: false, error: 'ECONNREFUSED' });

    const pertama = await monitor.cekSekarang({ checker: putus });
    assert.equal(pertama.status, 'down');
    assert.equal(pertama.alert, true);
    assert.ok(hitungAlert('wa_terputus') >= 1, 'admin harus menerima notifikasi');

    // Pemeriksaan berikutnya tidak boleh menambah notifikasi (cooldown 6 jam).
    await monitor.cekSekarang({ checker: putus });
    await monitor.cekSekarang({ checker: putus });
    assert.equal(hitungAlert('wa_terputus'), 1, 'alarm berulang akan diabaikan orang');
    assert.equal(monitor.baca().gagal_beruntun, 3);

    // Setelah jeda terlewati, pengingat dikirim lagi.
    db.prepare('UPDATE wa_monitor SET terakhir_alert_at=? WHERE id=1').run(
      new Date(Date.now() - monitor.ULANGI_ALERT_MS - 60_000).toISOString()
    );
    await monitor.cekSekarang({ checker: putus });
    assert.equal(hitungAlert('wa_terputus'), 2, 'pengingat berkala harus terkirim');
  });

  it('pemulihan dikabarkan sekali dan status kembali ok', async () => {
    await monitor.cekSekarang({
      checker: async () => ({ aktif: true, provider: 'openwa', reachable: false })
    });
    assert.equal(hitungAlert('wa_terputus'), 1);

    const pulih = await monitor.cekSekarang({
      checker: async () => ({ aktif: true, provider: 'openwa', reachable: true, connected: true, ready: true })
    });
    assert.equal(pulih.pulih, true);
    assert.equal(hitungAlert('wa_pulih'), 1);

    const row = monitor.baca();
    assert.equal(row.status, 'ok');
    assert.equal(row.gagal_beruntun, 0);
    assert.ok(row.terakhir_pulih_at);
  });

  it('kanal yang memang dimatikan bukan gangguan', async () => {
    const hasil = await monitor.cekSekarang({ checker: async () => ({ aktif: false, provider: 'none' }) });
    assert.equal(hasil.status, 'mati');
    assert.equal(hasil.alert, false);
    assert.equal(hitungAlert('wa_terputus'), 0);
  });

  it('checker yang melempar error diperlakukan sebagai putus, bukan crash', async () => {
    const hasil = await monitor.cekSekarang({
      checker: async () => {
        throw new Error('timeout');
      }
    });
    assert.equal(hasil.status, 'down');
    assert.equal(hitungAlert('wa_terputus'), 1);
  });

  it('status tersimpan bisa dibaca ulang oleh layar admin', async () => {
    await monitor.cekSekarang({ checker: async () => ({ aktif: true, provider: 'openwa', reachable: false }) });
    const row = monitor.baca();
    assert.equal(row.status, 'down');
    assert.match(row.pesan, /Easy API|terputus|siap/i);
    assert.ok(row.terakhir_cek);
  });
});
