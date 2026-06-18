// Intermediario (proxy) que corre en el servidor de Vercel.
// Guarda la clave de Gemini escondida y se la agrega a cada pedido.
// El navegador NUNCA ve la clave: solo le habla a este archivo.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo se aceptan pedidos POST' });
  }

  try {
    const { system, contents, maxTokens, jsonMode } = req.body || {};

    const body = {
      contents: contents,
      generationConfig: {
        // El modelo gratuito "piensa" antes de responder y ese pensamiento consume
        // el presupuesto de salida; lo desactivamos para que use todo el espacio
        // en la respuesta real (si no, la devolución JSON sale cortada).
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: jsonMode ? 2048 : (maxTokens || 1024),
        temperature: 0.9,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {})
      }
    };
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify(body)
      }
    );

    const data = await r.json();

    if (!r.ok) {
      return res.status(500).json({ error: data?.error?.message || 'Error de la API de Gemini' });
    }

    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || [])
      .map(p => p.text || '')
      .join('')
      .trim();

    if (!text) {
      return res.status(500).json({ error: 'El modelo devolvió una respuesta vacía (' + (cand?.finishReason || 'sin motivo') + ')' });
    }

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
