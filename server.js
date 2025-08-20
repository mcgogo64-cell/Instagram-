import express from "express";
import morgan from "morgan";
import cors from "cors";
import { URL } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(morgan("dev"));
app.use(express.static("public"));

/** Basit güvenlik: Sadece bu alan adlarına istek atılır */
const ALLOW_HOSTS = [
  "instagram.com",
  "www.instagram.com",
  "scontent.cdninstagram.com",
  // bazı bölgelerde fbcdn kullanılıyor
  "fbcdn.net"
];

function hostAllowed(u) {
  try {
    const url = new URL(u);
    const h = url.hostname.toLowerCase();
    if (h === "instagram.com" || h === "www.instagram.com") return true;
    // *.cdninstagram.com veya *.fbcdn.net
    return h.endsWith(".cdninstagram.com") || h.endsWith(".fbcdn.net");
  } catch {
    return false;
  }
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8,tr;q=0.7",
      ...(opts.headers || {})
    },
    method: opts.method || "GET"
  });
  const ct = res.headers.get("content-type") || "";
  const text = ct.startsWith("text/") || ct.includes("json")
    ? await res.text()
    : "";
  return { status: res.status, headers: Object.fromEntries(res.headers), ct, body: text };
}

function previewBody(s, max = 800) {
  if (!s) return "";
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + "... [truncated]" : t;
}

function analyzeJson(text) {
  const out = { is_json: false, keys: [], has_media_fields: false, error_like: false };
  try {
    const j = JSON.parse(text);
    out.is_json = true;
    if (j && typeof j === "object" && !Array.isArray(j)) {
      out.keys = Object.keys(j).slice(0, 20);
      const mediaKeys = new Set(["thumbnail_url", "video_url", "display_url", "graphql", "items", "html", "author_name"]);
      const errorKeys = new Set(["error", "error_message", "error_type", "errorSummary"]);
      out.has_media_fields = [...mediaKeys].some(k => k in j);
      out.error_like = [...errorKeys].some(k => k in j);
    }
  } catch { /* noop */ }
  return out;
}

/** Public page test (login duvarı) */
app.get("/api/test/public", async (req, res) => {
  const { url } = req.query;
  if (!url || !hostAllowed(url)) return res.status(400).json({ error: "Invalid or disallowed URL" });
  try {
    const r = await fetchText(url);
    let verdict = "OK";
    let detail = "Girişsiz sayfa beklenen login duvarını gösteriyor.";
    if (r.status === 200 && r.body && !/Log in|Anmelden|Sorry, this page isn’t available|Diese Seite ist leider nicht verfügbar/i.test(r.body)) {
      verdict = "REVIEW";
      detail = "200/HTML döndü; login duvarı sinyali görünmüyor. İnceleyin.";
    }
    res.json({
      name: "Public Page (login-wall)",
      url,
      status: r.status,
      content_type: r.ct,
      body_preview: previewBody(r.body),
      verdict,
      detail
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** ?__a=1 ve ?__a=1&__d=dis testleri */
app.get("/api/test/a1", async (req, res) => {
  const { url, dis } = req.query;
  if (!url || !hostAllowed(url)) return res.status(400).json({ error: "Invalid or disallowed URL" });
  try {
    const u = new URL(url);
    u.searchParams.set("__a", "1");
    if (dis === "true") u.searchParams.set("__d", "dis");
    const r = await fetchText(u.toString(), { headers: { Accept: "application/json" } });
    const meta = analyzeJson(r.body);
    let verdict = "OK";
    let detail = "Private içerikte JSON dönmedi veya sadece hata gövdesi döndü.";
    if (meta.is_json && meta.has_media_fields && !meta.error_like) {
      verdict = "HIGH";
      detail = "JSON içinde media alanları döndü (girişsiz).";
    } else if (r.status === 200 && !meta.is_json) {
      verdict = "REVIEW";
      detail = "200 döndü ama JSON değil; beklenmeyen içerik.";
    }
    res.json({
      name: `?__a=1${dis === "true" ? "&__d=dis" : ""}`,
      url: u.toString(),
      status: r.status,
      content_type: r.ct,
      body_preview: previewBody(r.body),
      json_meta: meta,
      verdict,
      detail
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** oEmbed testi: /api/test/oembed?shortcode=XXXX */
app.get("/api/test/oembed", async (req, res) => {
  const { shortcode } = req.query;
  if (!shortcode || !/^[A-Za-z0-9\-_]+$/.test(shortcode))
    return res.status(400).json({ error: "Invalid shortcode" });
  const reelUrl = `https://www.instagram.com/reel/${shortcode}/`;
  const oembed = `https://www.instagram.com/api/oembed/?url=${encodeURIComponent(reelUrl)}`;
  if (!hostAllowed(oembed)) return res.status(400).json({ error: "Disallowed URL" });
  try {
    const r = await fetchText(oembed, { headers: { Accept: "application/json" } });
    const meta = analyzeJson(r.body);
    let verdict = "OK";
    let detail = "oEmbed login'siz meta/thumbnail vermedi (beklenen).";
    if (meta.is_json && meta.has_media_fields && !meta.error_like) {
      verdict = "HIGH";
      detail = "oEmbed login'siz meta/thumbnail verdi (thumbnail_url/html/author_name).";
    } else if (r.status === 200 && !meta.is_json) {
      verdict = "REVIEW";
      detail = "200 döndü ama JSON değil; beklenmeyen içerik.";
    }
    res.json({
      name: "oEmbed",
      url: oembed,
      status: r.status,
      content_type: r.ct,
      body_preview: previewBody(r.body),
      json_meta: meta,
      verdict,
      detail
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** view-source benzeri: sayfa HTML analiz */
app.get("/api/test/viewsource", async (req, res) => {
  const { url } = req.query;
  if (!url || !hostAllowed(url)) return res.status(400).json({ error: "Invalid or disallowed URL" });
  try {
    const r = await fetchText(url);
    const hasLeakyWords = /shortcode|video_url|display_url|graphql|media_id/i.test(r.body || "");
    res.json({
      name: "View-Source HTML scan",
      url,
      status: r.status,
      content_type: r.ct,
      body_preview: previewBody(r.body),
      verdict: hasLeakyWords ? "REVIEW" : "OK",
      detail: hasLeakyWords
        ? "HTML içinde potansiyel anahtar kelimeler görüldü (login'siz). Detaylı doğrulama önerilir."
        : "HTML içinde hassas anahtar kelime izi yok (login'siz)."
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** CDN medya linki testi (yalnızca kendi içeriğiniz) */
app.post("/api/test/cdn", async (req, res) => {
  const { url } = req.body || {};
  if (!url || !hostAllowed(url)) return res.status(400).json({ error: "Invalid or disallowed CDN URL" });
  try {
    // Önce HEAD dene
    let r;
    try {
      r = await fetch(url, { method: "HEAD", redirect: "follow" });
    } catch {
      r = null;
    }
    // HEAD çalışmazsa küçük bir aralıkla GET
    if (!r || !r.ok) {
      r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-2047" }, redirect: "follow" });
    }
    const ct = r.headers.get("content-type") || "";
    const verdict = (r.status === 200 || r.status === 206) && (ct.startsWith("video/") || ct.startsWith("image/"))
      ? "HIGH" : "OK";
    const detail = verdict === "HIGH"
      ? "CDN linki login'siz 200/206 + video/image döndü (potansiyel sızıntı)."
      : "CDN erişimi engellenmiş görünüyor (beklenen).";
    res.json({
      name: "CDN media URL",
      url,
      status: r.status,
      content_type: ct,
      verdict,
      detail
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Existence-oracle: verilen kısa kod listesiyle oEmbed davranış farkı */
app.post("/api/test/existence", async (req, res) => {
  const { shortcodes } = req.body || {};
  if (!Array.isArray(shortcodes) || shortcodes.length === 0)
    return res.status(400).json({ error: "shortcodes array required" });

  const out = [];
  for (const sc of shortcodes) {
    if (!/^[A-Za-z0-9\-_]+$/.test(sc)) {
      out.push({ shortcode: sc, error: "invalid_shortcode" });
      continue;
    }
    const reelUrl = `https://www.instagram.com/reel/${sc}/`;
    const oembed = `https://www.instagram.com/api/oembed/?url=${encodeURIComponent(reelUrl)}`;
    try {
      const r = await fetchText(oembed, { headers: { Accept: "application/json" } });
      const meta = analyzeJson(r.body);
      out.push({
        shortcode: sc,
        status: r.status,
        verdict: meta.is_json && meta.has_media_fields && !meta.error_like ? "LEAKY_META" :
                 r.status === 404 ? "NOT_FOUND" :
                 r.status === 200 ? "OK_JSON_OR_EMPTY" : "OTHER",
        body_preview: previewBody(r.body)
      });
      // nazik hız
      await new Promise(ok => setTimeout(ok, 600));
    } catch (e) {
      out.push({ shortcode: sc, error: String(e) });
    }
  }
  res.json({ name: "Existence Oracle via oEmbed", results: out });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
