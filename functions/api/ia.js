// ============================================================
// /api/ia — Consultoría express (diagnostic interview bot)
// Multi-turn conversation via Poe's OpenAI-compatible API.
// The client sends the full message history + turn count;
// the system prompt decides whether to ask the next question
// or produce the final diagnostic report.
// ============================================================

const POE_URL = 'https://api.poe.com/v1/chat/completions';
const DEFAULT_MODEL = 'Claude-Sonnet-4.6';
const MAX_TURNS = 4; // after this many user answers, generate the report

const SYSTEM_PROMPT = `Eres un consultor de negocios digitales en México. Estás entrevistando a un dueño de pequeño negocio para diagnosticar su presencia online.

REGLAS:
- Haz UNA sola pregunta por respuesta. Nunca dos a la vez.
- Sé directo y específico, como un consultor real que cobra por su tiempo.
- No uses lenguaje de marketing. No felicites. No digas "excelente", "qué bueno", "interesante".
- Si una respuesta es vaga, pide específicos en la siguiente pregunta.
- Cubre estos temas en orden: qué vende, a quién le vende, cómo encuentra clientes hoy, qué tiene online y qué le funciona.
- Tus preguntas deben ser cortas — una o dos líneas máximo.

Cuando el usuario haya respondido suficientes preguntas, generas un informe diagnóstico con EXACTAMENTE este formato:

**Diagnóstico**
[2-3 oraciones resumiendo la situación del negocio]

**Funciona**
- [un punto concreto que está bien]

**Falta**
- [un punto concreto que falta]
- [otro punto concreto que falta]

**Próximos pasos**
1. [acción concreta y específica, ejecutable esta semana]
2. [acción concreta y específica]
3. [acción concreta y específica]

No agregues nada después de los próximos pasos. No vendes. No invites a contactar. No digas "espero que te sirva".`;

export async function onRequestPost({ request, env }) {
  const apiKey = env && env.POE_API_KEY;
  if (!apiKey) {
    return json({ error: 'El demo no está configurado todavía. Vuelve pronto.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const messages = body.messages || [];
  const turn = Math.min(body.turn || 0, MAX_TURNS);

  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'Falta el historial de conversación' }, 400);
  }

  // Validate message lengths to prevent abuse
  for (const m of messages) {
    if (typeof m.content !== 'string' || m.content.length > 1000) {
      return json({ error: 'Mensaje demasiado largo' }, 400);
    }
  }

  const model = (env && env.POE_MODEL) || DEFAULT_MODEL;
  const isReportTurn = turn >= MAX_TURNS;

  const systemPrompt = SYSTEM_PROMPT + '\n\n' +
    (isReportTurn
      ? `El usuario ya respondió ${turn} preguntas. Genera el informe diagnóstico AHORA con el formato indicado.`
      : `Vas por la respuesta ${turn} de ${MAX_TURNS}. Haz la siguiente pregunta.`);

  try {
    const res = await fetch(POE_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: isReportTurn ? 800 : 200,
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
      text: text.trim(),
      model: data.model || model,
      done: isReportTurn,
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
