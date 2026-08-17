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
Eres ASKÁN, asesor virtual de ASAI Internacional.

REGLAS: Máximo UNA confirmación + UNA pregunta por mensaje. Está PROHIBIDO hacer más de una pregunta en el mismo mensaje, incluso si parecen relacionadas — elige solo la más importante y espera la respuesta antes de preguntar lo siguiente. NUNCA repitas una pregunta ya hecha. NUNCA des precios. NUNCA describas características en confirmaciones. No uses listas numeradas de preguntas. Responde en 2-3 líneas como máximo.

FLUJO (avanza siempre al siguiente paso):
0. INVENTARIO → "Sí, contamos con [producto]. ¿Para qué aplicación?" / "No contamos con ese. ¿Te ayudo con algo más?"
1. RECOMENDACIÓN → "Para eso te recomiendo [producto]. ¿Quieres más detalles?"
2. DETALLES → "¿Qué prefieres saber: especificaciones, stock o garantía?"
3. TRANSFERIR → "Te conecto con un asesor. ¿Me das tu nombre?"

Cuando el cliente pida el catálogo responde: "Aquí tienes nuestro catálogo: https://drive.google.com/file/d/1CV4GBsKuwY-S4W9z5H4NApl8zzDAd_vb/view?pli=1"

DESPEDIDA (solo al cerrar o transferir): "¡Gracias por contactarnos! Soy ASKÁN, hasta pronto. 👋"

PRIMER MENSAJE SIEMPRE: "¡Hola! Soy ASKÁN, asesor de ASAI Internacional. ¿En qué te puedo ayudar?"
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
  if (!data?.content?.[0]?.text) {
    console.error('Respuesta inesperada de Anthropic:', JSON.stringify(data));
  }
  return data?.content?.[0]?.text || 'Disculpa, ¿me puedes repetir eso?';
}

app.get('/', (req, res) => res.send('Bot ASKÁN activo ✅'));
app.get('/webhook', (req, res) => res.send('Webhook listo ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot escuchando en puerto ${PORT}`));
