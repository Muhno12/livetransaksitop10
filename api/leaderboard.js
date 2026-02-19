// api/leaderboard.js
export default async function handler(req, res) {
  try {
    // ===== Input =====
    const month = (req.query.month || "").toString(); // format: YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok: false, error: "month harus format YYYY-MM" });
    }

    const CLOSED_API_KEY = process.env.CLOSED_API_KEY;
    if (!CLOSED_API_KEY) {
      return res.status(500).json({ ok: false, error: "CLOSED_API_KEY belum diset di Vercel Environment Variables" });
    }

    const BASE = "https://bukaolshop.net/api/v1";

    // ===== Month range (UTC) =====
    const start = new Date(Date.UTC(
      parseInt(month.slice(0, 4), 10),
      parseInt(month.slice(5, 7), 10) - 1,
      1, 0, 0, 0
    ));
    const end = new Date(Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      1, 0, 0, 0
    ));

    // ===== Closed API GET helper =====
    async function apiGet(path) {
      const r = await fetch(BASE + path, {
        headers: { Authorization: `Bearer ${CLOSED_API_KEY}` },
      });
      const txt = await r.text();
      if (!r.ok) {
        // balikin error mentah (biar kamu gampang debug)
        throw new Error(`HTTP ${r.status}: ${txt}`);
      }
      return JSON.parse(txt);
    }

    // ===== Parse tanggal "YYYY-MM-DD HH:mm:ss" -> Date UTC best-effort =====
    function parseBukaDate(s) {
      if (!s || typeof s !== "string") return null;
      // "2025-07-04 08:32:49" -> "2025-07-04T08:32:49Z"
      const iso = s.replace(" ", "T") + "Z";
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d;
    }

    // ===== 1) Ambil transaksi lunas per page, hitung trx per id_user =====
    const counts = new Map(); // id_user => trx_count
    const maxPages = 600;     // sesuai batas dokumentasi closed api
    for (let page = 1; page <= maxPages; page++) {
      const j = await apiGet(`/transaksi/list?page=${page}&filter_status=lunas`);
      const data = Array.isArray(j.data) ? j.data : [];

      if (!data.length) break;

      let shouldStop = false;

      for (const tx of data) {
        const id_user = tx.id_user;
        const status_bayar = (tx.status_bayar || "").toString().toLowerCase();
        const tanggal = tx.tanggal; // "YYYY-MM-DD HH:mm:ss"

        if (!id_user || !tanggal) continue;
        if (status_bayar !== "lunas") continue;

        const dt = parseBukaDate(tanggal);
        if (!dt) continue;

        // stop cepat kalau sudah lewat bulan (data biasanya urut terbaru)
        if (dt < start) {
          shouldStop = true;
          break;
        }

        // hanya transaksi di bulan terpilih
        if (dt >= start && dt < end) {
          counts.set(id_user, (counts.get(id_user) || 0) + 1);
        }
      }

      if (shouldStop) break;
    }

    // Kalau kosong
    if (counts.size === 0) {
      return res.status(200).json({ ok: true, month, items: [] });
    }

    // ===== 2) Sort Top 10 =====
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // [ [id_user, trx], ... ]

    // ===== 3) Ambil nama member via /member/id?id_user=... =====
    const items = [];
    for (const [id_user, trx] of top) {
      let nama_user = `Member #${id_user}`;

      try {
        const mj = await apiGet(`/member/id?id_user=${encodeURIComponent(id_user)}`);

        // Format yang kamu kirim:
        // { code:200, status:"ok", id_user:"S73b", nama_user:"M DZULFIKRI ..." , ... }
        if (mj && mj.nama_user) {
          nama_user = mj.nama_user;
        }
        // jaga-jaga kalau ada akun lain formatnya beda:
        else if (mj && Array.isArray(mj.data) && mj.data[0] && mj.data[0].nama_user) {
          nama_user = mj.data[0].nama_user;
        }
      } catch (e) {
        // kalau gagal ambil nama, tetap tampil Member #id_user (jangan bikin request gagal total)
      }

      items.push({ id_user, nama_user, trx });
    }

    return res.status(200).json({ ok: true, month, items });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e.message || e),
    });
  }
}
