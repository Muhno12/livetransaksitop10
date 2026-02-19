export default async function handler(req, res) {
  try {
    const id_user = (req.query.id_user || "").toString();
    if (!id_user) return res.status(400).json({ ok:false, error:"id_user wajib" });

    const key = process.env.CLOSED_API_KEY;
    if (!key) return res.status(500).json({ ok:false, error:"CLOSED_API_KEY belum diset" });

    const url = "https://bukaolshop.net/api/v1/member/id?id_user=" + encodeURIComponent(id_user);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }});
    const txt = await r.text();

    // balikin mentah biar kita lihat field-nya apa
    res.status(r.status).send(txt);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e.message || e) });
  }
}
