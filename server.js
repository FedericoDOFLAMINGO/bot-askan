// ============================================================
// Bot ASKÁN — versión Salesbot-webhook
// Salesbot llama aquí con el mensaje del cliente, y nosotros
// regresamos la respuesta en JSON para que Salesbot la muestre.
// ============================================================

const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `
Eres ASKÁN, asistente de ventas de ASAI Internacional. Ayudas a elegir
mangueras hidráulicas, conexiones y adaptadores. Sé amistoso, claro y conciso.
`.trim();

const PALABRAS_HANDOFF = ['comprar', 'cotización', 'cotizacion', 'pedido', 'quiero ordenar', 'apartar'];

// ------------------------------------------------------------
// Salesbot va a llamar a esta URL con el mensaje del cliente.
// Tú defines en el paso "Webhook" de Salesbot qué campos manda
// (nosotros esperamos algo como { "mensaje": "texto del cliente" }).
// ------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  try {
    const mensajeCliente = req.body.mensaje || req.body.message || '';

    if (!mensajeCliente.trim()) {
      return res.json({ reply: '¿Me puedes contar un poco más sobre lo que buscas?', handoff: false });
    }

    const quiereComprar = PALABRAS_HANDOFF.some(p => mensajeCliente.toLowerCase().includes(p));

    if (quiereComprar) {
      return res.json({
        reply: 'Perfecto, en un momento un asesor continúa contigo. 🙌',
        handoff: true
      });
    }

    const respuesta = await preguntarClaude(mensajeCliente);
    return res.json({ reply: respuesta, handoff: false });

  } catch (err) {
    console.error('Error:', err);
    res.json({ reply: 'Disculpa, tuve un problema. ¿Puedes intentar de nuevo?', handoff: false });
  }
});

async function preguntarClaude(mensajeCliente) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: mensajeCliente }]
    })
  });
  const data = await resp.json();
  return data?.content?.[0]?.text || 'Disculpa, ¿me puedes repetir eso?';
}

app.get('/', (req, res) => res.send('Bot ASKÁN activo ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot escuchando en puerto ${PORT}`));
