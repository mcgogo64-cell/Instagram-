const $ = sel => document.querySelector(sel);
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function addResult(obj) {
  results.push(obj);
  const box = $("#results");
  const el = document.createElement("div");
  el.className = "result";
  el.innerHTML = `
    <div><strong>${obj.name}</strong>
      <span class="badge ${obj.verdict}">${obj.verdict}</span>
    </div>
    <div class="kv">URL: <code>${obj.url || "-"}</code></div>
    <div class="kv">HTTP: ${obj.status || "-"} | Content-Type: ${obj.content_type || "-"}</div>
    ${obj.detail ? `<div class="kv">Detay: ${obj.detail}</div>` : ""}
    ${obj.json_meta ? `<div class="kv">JSON meta: <code>${escapeHtml(JSON.stringify(obj.json_meta))}</code></div>` : ""}
    ${obj.body_preview ? `<details><summary>Body Preview</summary><pre>${escapeHtml(obj.body_preview)}</pre></details>` : ""}
  `;
  box.prepend(el);
}

function clearResults() {
  results.length = 0;
  $("#results").innerHTML = "";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    if (!/^(instagram\.com|www\.instagram\.com)$/.test(url.hostname)) return null;
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    url.search = ""; url.hash = "";
    return url.toString();
  } catch { return null; }
}

async function runCoreTests() {
  const target = normalizeUrl($("#target").value.trim());
  if (!target) return alert("Geçerli bir Instagram reel/post URL'si girin (instagram.com alan adı).");

  clearResults();

  // 1) public page
  const pub = await fetch(`/api/test/public?` + new URLSearchParams({ url: target })).then(r=>r.json());
  addResult(pub);
  await sleep(600);

  // 2) ?__a=1
  const a1 = await fetch(`/api/test/a1?` + new URLSearchParams({ url: target, dis: "false" })).then(r=>r.json());
  addResult(a1);
  await sleep(600);

  // 3) ?__a=1&__d=dis
  const a1dis = await fetch(`/api/test/a1?` + new URLSearchParams({ url: target, dis: "true" })).then(r=>r.json());
  addResult(a1dis);
  await sleep(600);

  // 4) oEmbed (shortcode çıkar)
  const m = target.match(/\/(reel|p)\/([A-Za-z0-9\-_]+)\//);
  if (m) {
    const sc = m[2];
    const oe = await fetch(`/api/test/oembed?` + new URLSearchParams({ shortcode: sc })).then(r=>r.json());
    addResult(oe);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function runOptional() {
  const cdn = $("#cdn").value.trim();
  if (cdn) {
    try {
      const r = await fetch("/api/test/cdn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cdn })
      }).then(r=>r.json());
      addResult(r);
      await sleep(600);
    } catch (e) {
      addResult({ name: "CDN media URL", verdict: "REVIEW", detail: String(e) });
    }
  }

  const list = ($("#shortcodes").value || "").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (list.length) {
    const r = await fetch("/api/test/existence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcodes: list })
    }).then(r=>r.json());
    addResult({ name: r.name, verdict: "OK", detail: `Toplam ${r.results.length} oEmbed denemesi yapıldı.` });
    // alt detay
    const table = document.createElement("div");
    table.className = "result";
    table.innerHTML = `<pre>${escapeHtml(JSON.stringify(r.results, null, 2))}</pre>`;
    $("#results").prepend(table);
  }
}

function download(filename, content, type="text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function asMarkdown(results) {
  const lines = [];
  lines.push("# Instagram Private Audit – Rapor\n");
  lines.push(`- Tarih: ${new Date().toISOString()}\n`);
  for (const r of results.slice().reverse()) {
    lines.push(`## ${r.name}  **[${r.verdict}]**\n`);
    if (r.url) lines.push(`- URL: \`${r.url}\``);
    lines.push(`- HTTP: \`${r.status || "-"}\`  |  Content-Type: \`${r.content_type || "-"}\``);
    if (r.detail) lines.push(`- Detay: ${r.detail}`);
    if (r.json_meta) lines.push(`- JSON meta: \`${JSON.stringify(r.json_meta)}\``);
    if (r.body_preview) {
      lines.push(`<details><summary>Body Preview</summary>\n\n`);
      lines.push("```\n" + r.body_preview + "\n```\n");
      lines.push("</details>\n");
    }
    lines.push("");
  }
  lines.push("\n---\nBu rapor yalnızca **girişsiz (anon)** isteklerle elde edilmiştir. Sadece kendi içeriğiniz/izinli hedeflerde kullanınız.\n");
  return lines.join("\n");
}

$("#runAll").addEventListener("click", runCoreTests);
$("#runOptional").addEventListener("click", runOptional);
$("#clear").addEventListener("click", clearResults);
$("#saveMd").addEventListener("click", () => download("report.md", asMarkdown(results), "text/markdown"));
$("#saveJson").addEventListener("click", () => download("report.json", JSON.stringify(results, null, 2), "application/json"));
