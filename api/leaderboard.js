export default async function handler(req, res) {
  try {
    const month = (req.query.month || "").toString();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ ok: false, error: "month harus YYYY-MM" });
      return;
    }

    const CLOSED_API_KEY = process.env.CLOSED_API_KEY; // disimpan di Vercel Env
    if (!CLOSED_API_KEY) {
      res.status(500).json({ ok: false, error: "CLOSED_API_KEY belum diset di Environment Variables" });
      return;
    }

    const BASE = "https://bukaolshop.net/api/v1";

    // range bulan
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0));

    async function apiGet(path) {
      const r = await fetch(BASE + path, {
        headers: { Authorization: `Bearer ${CLOSED_API_KEY}` },
      });
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt}`);
      return JSON.parse(txt);
    }

    // loop transaksi per page (10/page)
    const counts = new Map();
    const maxPages = 600; // sesuai batas doc (page <= 600) 2
    for (let page = 1; page <= maxPages; page++) {
      const j = await apiGet(`/transaksi/list?page=${page}&filter_status=lunas`);
      const data = Array.isArray(j.data) ? j.data : [];
      if (!data.length) break;

      let shouldStop = false;

      for (const tx of data) {
        const tgl = tx.tanggal;      // biasanya "YYYY-MM-DD HH:mm:ss"
        const idu = tx.id_user;
        const st  = (tx.status_bayar || "").toLowerCase();

        if (!tgl || !idu) continue;

        const ts = new Date(tgl.replace(" ", "T") + "Z"); // best-effort
        if (ts < start) { shouldStop = true; break; }
        if (ts >= end) continue;
        if (st !== "lunas") continue;

        counts.set(idu, (counts.get(idu) || 0) + 1);
      }

      if (shouldStop) break;
    }

    // top10
    const top = [...counts.entries()]
      .sort((a,b) => b[1] - a[1])
      .slice(0,10);

    // ambil nama member
    const items = [];
    for (const [id_user, trx] of top) {
      let nama_user = `Member #${id_user}`;
      try {
        const mj = await apiGet(`/member/id?id_user=${encodeURIComponent(id_user)}`);
        const d0 = Array.isArray(mj.data) ? mj.data[0] : mj.data;
        if (d0 && d0.nama_user) nama_user = d0.nama_user;
      } catch {}
      items.push({ id_user, nama_user, trx });
    }

    res.status(200).json({ ok: true, month, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
