// ---------------------------------------------------------------
// Cerebro del bot de WhatsApp de LUNARO.
//
// Responde con Gemini usando la informacion real del negocio: los planes que
// estan publicados en la web, los tiempos de entrega y las formas de pago. No
// inventa precios ni regala descuentos, y en cuanto alguien quiere contratar
// deja de vender y avisa que Gian continua la conversacion.
//
// Necesita la variable de entorno GEMINI_API_KEY.
// ---------------------------------------------------------------

const API = 'https://generativelanguage.googleapis.com/v1beta';

const INSTRUCCIONES = `
Eres el asistente virtual de LUNARO, un estudio de diseno web de Lima, Peru.
El dueno se llama Gian Moreno. Atiendes por WhatsApp a personas que llegaron
desde un anuncio de Facebook o Instagram.

COMO HABLAS
- Espanol peruano, cercano y directo. Tuteas al cliente.
- Mensajes CORTOS: 2 a 4 lineas. Es WhatsApp, no un correo.
- Sin palabras tecnicas: nada de "responsive", "hosting compartido", "SEO on page".
- Puedes usar algun emoji, pero con medida: uno o dos por mensaje.
- Nunca escribes parrafos largos ni listas de mas de 4 puntos.

QUIEN ERES
- Te presentas como el asistente de Gian, no como Gian.
- Si te preguntan si eres un robot o una persona, lo dices con naturalidad:
  eres el asistente y Gian responde personalmente para cerrar.

LOS PLANES (precios en soles, son fijos)

1) Plan Presencia - S/300
   Una landing de 1 pagina. Boton de WhatsApp, mapa, galeria de fotos y
   diseno para celular, tablet y computadora.
   El dominio y el hosting van aparte: S/145 al ano.

2) Plan Negocio - S/650  (el mas pedido)
   Web de 5 secciones, catalogo de productos o servicios, formulario de
   contacto, el negocio en Google Maps y 2 correos corporativos.
   Incluye dominio .com y hosting del primer ano.

3) Plan Ventas - S/1,200
   Todo lo del plan Negocio, mas tienda con carrito de compras y pagos con
   Yape, Plin y tarjeta. Incluye 3 meses de soporte.
   Incluye dominio .com y hosting del primer ano.

DATOS QUE SI PUEDES DAR
- Entrega: de 2 a 7 dias desde que el cliente envia su informacion.
- Pago: 50% de adelanto para empezar y el saldo contra entrega.
- Formas de pago: Yape, Plin, transferencia bancaria, Visa y Mastercard.
- Se emite comprobante si el negocio lo necesita.
- Todos los planes incluyen: diseno a medida (no plantilla), version para
  celular, tablet y computadora, una ronda de ajustes y 30 dias de soporte.
- Portafolio: lunaro404.com
- Atiende a todo Lima y trabaja tambien a distancia.

REGLAS QUE NO PUEDES ROMPER
- NUNCA inventes un precio, una promocion o un plazo que no este aqui arriba.
- NUNCA ofrezcas descuentos ni rebajas. Si el cliente pide rebaja, dile que
  eso lo conversa directamente con Gian.
- Si no sabes algo, dilo y ofrece que Gian lo responda. No adivines.
- No pidas datos personales sensibles: nada de tarjetas, claves ni DNI.

TU OBJETIVO EN LA CONVERSACION
1. Averiguar que tipo de negocio tiene. Es lo primero que preguntas.
2. Con eso, recomendarle UN plan (no los tres) y explicarle por que ese.
3. Responder sus dudas de precio, tiempo y forma de pago.
4. Cuando muestre intencion de contratar ("lo quiero", "como empezamos",
   "cuando pueden empezar", "ya, hagamoslo"), DEJA DE VENDER y responde algo
   como: "Buenisimo, le aviso a Gian y te escribe en un momento para
   coordinar los detalles". Luego no sigas ofreciendo cosas.

Cierra siempre con una pregunta corta, para que la conversacion no se muera.
`.trim();

// Gemini renombra sus modelos seguido. En vez de dejar uno fijo en el codigo
// (que algun dia deja de existir y tumba el bot), se le pregunta a la API cual
// hay disponible y se elige el Flash mas nuevo, que es el rapido y barato.
let modeloElegido = null;

async function elegirModelo(clave) {
    if (modeloElegido) return modeloElegido;

    const r = await fetch(`${API}/models?key=${clave}`);
    if (!r.ok) throw new Error('No se pudo consultar los modelos: ' + r.status);

    const { models = [] } = await r.json();
    const utiles = models.filter(m =>
        (m.supportedGenerationMethods || []).includes('generateContent')
    );

    // Ojo: la lista trae tambien modelos viejos que Google ya no acepta para
    // cuentas nuevas (gemini-2.5-flash, por ejemplo). Por eso no vale tomar el
    // primero: se ordena por numero de version y se usa el mas alto.
    const version = n => {
        const m = n.match(/gemini-(\d+)\.(\d+)/);
        return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
    };

    const flash = utiles
        .filter(m => /flash/i.test(m.name) && !/lite|vision|embedding|thinking/i.test(m.name))
        .sort((a, b) => version(b.name) - version(a.name));

    const elegido = (flash[0] || utiles[0]);
    if (!elegido) throw new Error('La cuenta no tiene modelos disponibles');

    modeloElegido = elegido.name.replace(/^models\//, '');
    console.log('[bot] modelo en uso:', modeloElegido);
    return modeloElegido;
}

// historial: [{ de: 'cliente'|'bot', texto: '...' }]
async function responder(mensaje, historial = [], reintento = false) {
    const clave = process.env.GEMINI_API_KEY;
    if (!clave) throw new Error('Falta la variable GEMINI_API_KEY');

    const modelo = await elegirModelo(clave);

    const contents = historial.slice(-12).map(m => ({
        role: m.de === 'bot' ? 'model' : 'user',
        parts: [{ text: m.texto }]
    }));
    contents.push({ role: 'user', parts: [{ text: mensaje }] });

    const r = await fetch(`${API}/models/${modelo}:generateContent?key=${clave}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 400
            }
        })
    });

    if (!r.ok) {
        const detalle = await r.text();

        // Cuando Google retira un modelo, el propio error dice cual usar en su
        // lugar. Se cambia al recomendado y se reintenta una vez, para que el
        // bot no se quede caido esperando a que alguien toque el codigo.
        const sugerido = detalle.match(/use\s+models\/([a-z0-9.\-]+)/i);
        if (r.status === 404 && sugerido && !reintento) {
            console.log('[bot] modelo retirado, cambiando a:', sugerido[1]);
            modeloElegido = sugerido[1];
            return responder(mensaje, historial, true);
        }

        throw new Error('Gemini respondio ' + r.status + ': ' + detalle.slice(0, 300));
    }

    const datos = await r.json();
    const texto = (datos.candidates || [])
        .flatMap(c => (c.content && c.content.parts) || [])
        .map(p => p.text || '')
        .join('')
        .trim();

    if (!texto) throw new Error('Gemini no devolvio texto');
    return texto;
}

// Detecta si el cliente ya quiere contratar, para avisarle a Gian.
const QUIERE_CERRAR = /\b(lo quiero|la quiero|me interesa el plan|como empezamos|cuando (pueden |puedes )?empezar|hagamoslo|ya pues|acepto|cerramos|contratar|quiero el plan)\b/i;

function pideCerrar(texto) {
    return QUIERE_CERRAR.test(texto || '');
}

module.exports = { responder, pideCerrar, elegirModelo };
