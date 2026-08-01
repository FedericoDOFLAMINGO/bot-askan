// ============================================================
// Bot ASKÁN — versión widget_request (Salesbot)
// Kommo manda POST con { token, data, return_url }.
// 1) Respondemos 200 de inmediato (confirmación).
// 2) Le preguntamos a Claude en segundo plano.
// 3) Mandamos el resultado al return_url que Kommo nos dio.
// ============================================================

const express = require('express');
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KOMMO_API_TOKEN   = process.env.KOMMO_API_TOKEN;

const SYSTEM_PROMPT = `
Eres ASKÁN, asistente de ventas de ASAI Internacional. Ayudas a elegir
mangueras hidráulicas, conexiones y adaptadores. Sé amistoso, claro y conciso.
`.trim();

const PALABRAS_HANDOFF = ['comprar', 'cotización', 'cotizacion', 'pedido', 'quiero ordenar', 'apartar'];

app.post('/webhook', (req, res) => {
  // 1. Confirmar de inmediato (Kommo exige respuesta en <2s)
  res.sendStatus(200);

  // 2. Procesar en segundo plano
  procesarMensaje(req.body).catch(err => console.error('Error procesando:', err));
});

async function procesarMensaje(body) {
  const mensajeCliente = body?.data?.message || '';
  const returnUrl = body?.return_url;

  if (!returnUrl) {
    console.error('No vino return_url en el payload:', JSON.stringify(body));
    return;
  }

  let reply, handoff;

  const quiereComprar = PALABRAS_HANDOFF.some(p => mensajeCliente.toLowerCase().includes(p));
  if (quiereComprar) {
    reply = 'Perfecto, en un momento un asesor continúa contigo. 🙌';
    handoff = true;
  } else {
    reply = await preguntarClaude(mensajeCliente);
    handoff = false;
  }

  // 3. Mandar el resultado de vuelta a Kommo
  await fetch(returnUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KOMMO_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: { reply, handoff }
    })
  });
}

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
