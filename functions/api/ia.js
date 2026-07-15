// ============================================================
// /api/ia — Descripciones de producto con IA
// Calls OpenRouter chat completions (server-side, key in env).
// Generates Spanish marketing copy from product name + spec.
// ============================================================

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Free text model on OpenRouter — good Spanish, no cost.
// Swappable to any model via the OPENROUTER_MODEL env var.
const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

export async function onRequestPost({ request, env }) {
  const apiKey = env && env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return json({ error: 'El demo de IA no está configurado todavía. Vuelve pronto.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const product = (body.product || '').trim();
  const spec = (body.spec || '').trim();
  const tone = (body.tone || 'cercano').trim();

  if (!product) return json({ error: 'Falta el nombre del producto' }, 400);
  if (product.length > 100) return json({ error: 'Nombre demasiado largo (máx 100 caracteres)' }, 400);
  if (spec.length > 300) return json({ error: 'Especificación demasiado larga (máx 300 caracteres)' }, 400);

  const model = (env && env.OPENROUTER_MODEL) || DEFAULT_MODEL;

  const systemPrompt = `Eres un copywriter mexicano que escribe descripciones de producto para tiendas online y redes sociales. Escribe en español de México, cercano y directo, sin clichés de marketing. No inventes características que no te dieron. Eres bueno escribiendo para WhatsApp e Instagram.`;

  const userPrompt = `Escribe 3 descripciones de producto diferentes para este producto:

PRODUCTO: ${product}
${spec ? `DETALLE: ${spec}` : '(sin detalle adicional)'}
TONO: ${tone}

Formato:
**Opción 1 — corta (para WhatsApp):**
[1-2 oraciones, máximo 200 caracteres]

**Opción 2 — mediana (para Instagram):**
[3-4 oraciones, con emojis sutiles si aplican]

**Opción 3 — larga (para ficha de producto web):**
[párrafo de 4-6 oraciones, más descriptiva]

No uses hashtags. No inventes precios. No inventes características. Si el detalle está vacío, enfócate en el nombre del producto.`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://impuslodigital.com',
        'X-Title': 'Impulso Digital — Demo IA',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 700,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ error: `El modelo no respondió (HTTP ${res.status}). Intenta de nuevo.`, detail: errText.slice(0, 200) }, 502);
    }

    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

    if (!text) {
      return json({ error: 'El modelo no generó texto. Intenta de nuevo.' }, 502);
    }

    return json({
      product,
      model: data.model || model,
      copy: text.trim(),
    });
  } catch (err) {
    return json({ error: 'No pude contactar el modelo. Intenta de nuevo.', detail: String(err.message).slice(0, 200) }, 502);
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
