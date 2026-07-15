// ============================================================
// /api/correo — Verificador de correo / dominio
// Queries Cloudflare DNS-over-HTTPS (free, no key) for MX,
// SPF, DKIM, DMARC. Returns a plain-Spanish verdict.
// ============================================================

const DOH = 'https://cloudflare-dns.com/dns-query';

async function queryDns(name, type) {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: 'application/dns-json' } });
  if (!res.ok) throw new Error(`DNS query failed for ${name} ${type}: ${res.status}`);
  const data = await res.json();
  return data.Answer || [];
}

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  let domain = (body.domain || '').trim().toLowerCase();
  if (!domain) return json({ error: 'Falta el dominio' }, 400);

  // strip protocol, path, www
  domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  const verdict = {
    domain,
    mx: null,
    spf: null,
    dkim: null,
    dmarc: null,
    checks: [],
    canReceive: null,
    summary: '',
  };

  try {
    // MX
    const mx = await queryDns(domain, 'MX');
    verdict.mx = mx.map(r => r.data);
    if (mx.length > 0) {
      verdict.checks.push({ ok: true, label: 'MX', detail: `${mx.length} registro(s): ${mx.map(r => r.data.split(' ').slice(1).join(' ')).join(', ')}` });
    } else {
      verdict.checks.push({ ok: false, label: 'MX', detail: 'Sin registros MX — tu dominio no sabe a qué servidor entregar el correo.' });
    }

    // SPF (TXT)
    const txt = await queryDns(domain, 'TXT');
    const spf = txt.find(r => /v=spf1/i.test(r.data));
    verdict.spf = spf ? spf.data : null;
    if (spf) {
      verdict.checks.push({ ok: true, label: 'SPF', detail: 'Presente — autoriza qué servidores pueden enviar por ti.' });
    } else {
      verdict.checks.push({ ok: false, label: 'SPF', detail: 'Sin SPF — tus correos enviados pueden terminar en spam.' });
    }

    // DMARC (_dmarc.domain TXT)
    try {
      const dmarc = await queryDns(`_dmarc.${domain}`, 'TXT');
      const dmarcRec = dmarc.find(r => /v=dmarc1/i.test(r.data));
      verdict.dmarc = dmarcRec ? dmarcRec.data : null;
      if (dmarcRec) {
        verdict.checks.push({ ok: true, label: 'DMARC', detail: 'Presente — política de autenticación activa.' });
      } else {
        verdict.checks.push({ ok: false, label: 'DMARC', detail: 'Sin DMARC — sin política para reportar o rechazar correo falsificado.' });
      }
    } catch {
      verdict.checks.push({ ok: false, label: 'DMARC', detail: 'Sin DMARC.' });
    }

    // DKIM is selector-dependent; check a few common default selectors
    const selectors = ['default', 'google', 'selector1', 's1', 'mail'];
    let dkimFound = null;
    for (const sel of selectors) {
      try {
        const dkim = await queryDns(`${sel}._domainkey.${domain}`, 'TXT');
        if (dkim.length > 0) { dkimFound = `${sel}._domainkey`; break; }
      } catch { /* try next */ }
    }
    verdict.dkim = dkimFound;
    if (dkimFound) {
      verdict.checks.push({ ok: true, label: 'DKIM', detail: `Encontrado (${dkimFound}) — firma criptográfica en correos.` });
    } else {
      verdict.checks.push({ ok: null, label: 'DKIM', detail: 'No detectado en selectores comunes. Puede existir bajo otro selector — no es necesariamente un problema.' });
    }

    // Verdict
    const hasMx = verdict.mx.length > 0;
    const hasSpf = !!verdict.spf;
    verdict.canReceive = hasMx;
    if (hasMx && hasSpf) {
      verdict.summary = `✓ Tu correo SÍ puede recibir mensajes en @${domain}, y tienes SPF configurado.`;
    } else if (hasMx && !hasSpf) {
      verdict.summary = `⚠ Tu correo SÍ recibe en @${domain}, pero te falta SPF — los correos que ENVÍAS pueden caer en spam.`;
    } else {
      verdict.summary = `✗ Tu correo NO va a llegar en @${domain} — faltan registros MX. Esto fue exactamente el problema de PosadaReal: el dominio existía pero nadie configuró a dónde entregar el correo.`;
    }

    return json(verdict);
  } catch (err) {
    return json({ error: 'No pude consultar el DNS del dominio. ¿Lo escribiste bien?', detail: String(err.message) }, 502);
  }
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
