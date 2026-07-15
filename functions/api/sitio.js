// ============================================================
// /api/sitio — Diagnóstico de sitio
// Fetches the URL server-side, parses <head>, checks meta tags,
// mobile viewport, HTTPS, redirects, page weight, structured
// data. Returns a plain-Spanish summary.
// ============================================================

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  let url = (body.url || '').trim();
  if (!url) return json({ error: 'Falta la URL' }, 400);

  // normalize: add https:// if no protocol
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return json({ error: 'URL no válida' }, 400);
  }

  const result = {
    url: parsed.href,
    finalUrl: null,
    https: parsed.protocol === 'https:',
    redirected: false,
    status: null,
    bytes: null,
    loadMs: null,
    title: null,
    description: null,
    viewport: null,
    ogImage: null,
    lang: null,
    structuredData: false,
    checks: [],
    summary: '',
  };

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(parsed.href, {
      redirect: 'follow',
      headers: { 'user-agent': 'ImpulsoDigital-Checker/1.0 (+https://impuslodigital.com)' },
    });
    result.loadMs = Date.now() - t0;
  } catch (err) {
    return json({ error: `No pude cargar el sitio. ¿Existe? ¿Está caído? (${String(err.message).slice(0, 80)})` }, 502);
  }

  result.status = res.status;
  result.finalUrl = res.url;
  result.redirected = res.url !== parsed.href;
  result.https = res.url.startsWith('https://');

  const html = await res.text();
  result.bytes = new TextEncoder().encode(html).length;

  // parse head
  result.title = extract(html, /<title[^>]*>([^<]*)<\/title>/i);
  result.description = extractMeta(html, 'description');
  result.viewport = extractMeta(html, 'viewport');
  result.ogImage = extractMetaProperty(html, 'og:image');
  result.lang = extract(html, /<html[^>]*\blang=["']([^"']+)["']/i);
  result.structuredData = /application\/ld\+json/i.test(html);

  // checks
  if (result.https) {
    result.checks.push({ ok: true, label: 'HTTPS', detail: 'Cifrado activo — el sitio se carga de forma segura.' });
  } else {
    result.checks.push({ ok: false, label: 'HTTPS', detail: 'Sin HTTPS — los navegadores marcan tu sitio como "no seguro".' });
  }

  if (result.title) {
    const tlen = result.title.length;
    if (tlen >= 30 && tlen <= 60) {
      result.checks.push({ ok: true, label: 'Título', detail: `"${result.title}" (${tlen} caracteres — buen tamaño).` });
    } else if (tlen < 30) {
      result.checks.push({ ok: false, label: 'Título', detail: `"${result.title}" — muy corto (${tlen} caracteres). Google corta títulos ~60.` });
    } else {
      result.checks.push({ ok: false, label: 'Título', detail: `"${result.title.slice(0, 60)}…" — muy largo (${tlen} caracteres). Google lo corta.` });
    }
  } else {
    result.checks.push({ ok: false, label: 'Título', detail: 'Sin <title> — el navegador y Google no saben cómo titular tu pestaña.' });
  }

  if (result.description) {
    const dlen = result.description.length;
    if (dlen >= 70 && dlen <= 160) {
      result.checks.push({ ok: true, label: 'Descripción', detail: `${dlen} caracteres — buena longitud.` });
    } else {
      result.checks.push({ ok: false, label: 'Descripción', detail: `${dlen} caracteres — ideal entre 70 y 160.` });
    }
  } else {
    result.checks.push({ ok: false, label: 'Descripción', detail: 'Sin meta description — Google inventa el snippet de los resultados de búsqueda.' });
  }

  if (result.viewport && /width=device-width/i.test(result.viewport)) {
    result.checks.push({ ok: true, label: 'Mobile', detail: 'Viewport configurado — el sitio se adapta a celular.' });
  } else {
    result.checks.push({ ok: false, label: 'Mobile', detail: 'Sin viewport mobile — el sitio se ve miniatura en celular. Más de la mitad de tus visitas son mobile.' });
  }

  if (result.structuredData) {
    result.checks.push({ ok: true, label: 'Datos estructurados', detail: 'Schema.org detectado — Google entiende qué tipo de cosa es tu sitio.' });
  } else {
    result.checks.push({ ok: false, label: 'Datos estructurados', detail: 'Sin structured data — Google no sabe si eres negocio local, producto, artículo, etc.' });
  }

  // page weight
  const kb = Math.round(result.bytes / 1024);
  if (kb < 500) {
    result.checks.push({ ok: true, label: 'Peso', detail: `${kb} KB — ligero, carga rápido.` });
  } else if (kb < 2000) {
    result.checks.push({ ok: null, label: 'Peso', detail: `${kb} KB — aceptable, pero podría ser más rápido.` });
  } else {
    result.checks.push({ ok: false, label: 'Peso', detail: `${kb} KB — pesado. En celular con datos, tarda en cargar.` });
  }

  // summary
  const fails = result.checks.filter(c => c.ok === false).length;
  const oks = result.checks.filter(c => c.ok === true).length;
  if (fails === 0) {
    result.summary = `✓ Tu sitio está bien armado. ${oks}/${result.checks.length} checks en regla. Esto es trabajo de calidad.`;
  } else if (fails <= 2) {
    result.summary = `⚠ Tu sitio funciona pero le faltan ${fails} cosa(s). Cosas chicas que cuestan clientes.`;
  } else {
    result.summary = `✗ Tu sitio tiene ${fails} problemas de ${result.checks.length}. Probablemente está perdiendo visitantes que llegan y se van.`;
  }

  return json(result);
}

function extract(html, regex) {
  const m = html.match(regex);
  return m ? m[1].trim() : null;
}
function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta[^>]*\\bname=["']${name}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]*\\bcontent=["']([^"']*)["'][^>]*\\bname=["']${name}["']`, 'i'));
  return m ? m[1].trim() : null;
}
function extractMetaProperty(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]*\\bproperty=["']${prop}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]*\\bcontent=["']([^"']*)["'][^>]*\\bproperty=["']${prop}["']`, 'i'));
  return m ? m[1].trim() : null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
}
