// ============================================================
// Bot ASKÁN — versión mínima
// Recibe mensajes de Kommo -> responde con Claude -> si el
// cliente quiere comprar, reasigna el lead al vendedor.
// ============================================================

const express = require('express');
const app = express();

// Kommo manda los webhooks como formulario, no JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ------------------------------------------------------------
// CONFIGURACIÓN — pon tus valores reales aquí o en variables
// de entorno (recomendado para no subir claves a github)
// ------------------------------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KOMMO_SUBDOMAIN   = process.env.KOMMO_SUBDOMAIN;   // ej: 'asaiintmkt'
const KOMMO_API_TOKEN   = process.env.KOMMO_API_TOKEN;   // token largo de tu integración
const VENDEDOR_USER_ID  = process.env.VENDEDOR_USER_ID;  // id del usuario vendedor en Kommo

// Pega aquí el mismo texto que ya tienes en "Rol y personalidad" + "Pautas" en Kommo
const SYSTEM_PROMPT = `
Eres ASKÁN, asistente de ventas de ASAI Internacional. Ayudas a elegir
mangueras hidráulicas, conexiones y adaptadores. Sé amistoso, claro y conciso.
Si el cliente pregunta precio o dice que quiere comprar, avísale que un
asesor va a tomar la conversación enseguida.
`.trim();

// Palabras que indican que ya hay que pasarlo a un vendedor humano
const PALABRAS_HANDOFF = ['comprar', 'cotización', 'cotizacion', 'pedido', 'quiero ordenar', 'apartar'];

// ------------------------------------------------------------
// 1. Webhook que Kommo llama cuando llega un mensaje nuevo
// ------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responder rápido a Kommo, procesar después

  try {
    const body = req.body;

    // La forma exacta de este payload depende de tu integración de canal
    // en Kommo (WhatsApp/Instagram/etc). Estos son los campos típicos:
    const mensajeTexto = extraerTexto(body);
    const leadId       = extraerLeadId(body);
    const chatId       = extraerChatId(body);

    if (!mensajeTexto || !leadId) return;

    // ¿Ya quiere comprar? -> reasignar y no contestar como bot
    const quiereComprar = PALABRAS_HANDOFF.some(p => mensajeTexto.toLowerCase().includes(p));
    if (quiereComprar) {
      await reasignarAVendedor(leadId);
      await enviarMensajeKommo(chatId, 'Perfecto, en un momento un asesor continúa contigo. 🙌');
      return;
    }

    // Si no, que responda Claude
    const respuesta = await preguntarClaude(mensajeTexto);
    await enviarMensajeKommo(chatId, respuesta);

  } catch (err) {
    console.error('Error procesando webhook:', err);
  }
});

// ------------------------------------------------------------
// 2. Llamar a Claude
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// 3. Mandar mensaje de vuelta al chat en Kommo
// NOTA: el endpoint exacto depende de tu canal (chats API de
// Kommo). Este es el patrón general — puede necesitar ajuste
// fino una vez que veas el payload real de tu integración.
// ------------------------------------------------------------
async function enviarMensajeKommo(chatId, texto) {
  await fetch(`https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KOMMO_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: { text: texto } })
  });
}

// ------------------------------------------------------------
// 4. Reasignar el lead a un vendedor humano
// ------------------------------------------------------------
async function reasignarAVendedor(leadId) {
  await fetch(`https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${KOMMO_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ responsible_user_id: Number(VENDEDOR_USER_ID) })
  });
}

// ------------------------------------------------------------
// Helpers para leer el payload de Kommo (ajustar según lo que
// realmente llegue — imprime req.body la primera vez para verlo)
// ------------------------------------------------------------
function extraerTexto(body) {
  return body?.message?.add?.[0]?.text || null;
}
function extraerLeadId(body) {
  return body?.message?.add?.[0]?.entity_id || null;
}
function extraerChatId(body) {
  return body?.message?.add?.[0]?.chat_id || null;
}

// ------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot escuchando en puerto ${PORT}`));
