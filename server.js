// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Inicializamos OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Inicializamos Supabase
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// --------------------------
// Función para obtener catálogo
// --------------------------
async function obtenerCatalogo() {
  const { data, error } = await supabase.from("catalogo").select("*");
  if (error) {
    console.log("Error obteniendo catálogo:", error);
    return "No se pudo cargar el catálogo.";
  }

  let texto = "📦 *Catálogo Delicias Monte Luna*\n\n";

  for (const item of data) {
    texto += `🍰 *${item.nombre}*\n${item.descripcion}\nPrecio: $${item.precio}\n\n`;
  }

  texto += `
📌 *Despacho gratis sobre $14.990*.  
Si no, tiene costo de $2.400.  
Las entregas se realizan al día siguiente (excepto domingos).

🚚 Comunas con despacho:
Cerro Navia, Cerrillos, Conchalí, Estación Central, Independencia, Lo Prado, Lo Espejo (hasta Vespucio), Maipú (antes de Vespucio), Pedro Aguirre Cerda, Pudahuel, Quinta Normal, Recoleta, Renca, Santiago, San Miguel, San Joaquín.

🏠 Dirección retiro: Chacabuco 1120, Santiago Centro (con agendamiento).
`;

  return texto;
}

// --------------------------
// Ruta principal
// --------------------------
app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente 🚀");
});

// --------------------------
// Ruta WhatsAuto
// --------------------------
app.post("/whatsapp", async (req, res) => {
  try {
    // WhatsAuto envía normalmente "sender" y "message" o "text"
    const from = req.body.sender || req.body.from;
    const message = req.body.message || req.body.text;

    if (!from || !message) {
      return res.json({ reply: "No se pudo leer el mensaje." });
    }

    // Verificar si el cliente ya existe
    const { data: clienteExistente } = await supabase
      .from("clientes")
      .select("*")
      .eq("whatsapp", from)
      .single()
      .catch(() => ({ data: null }));

    if (!clienteExistente) {
      await supabase.from("clientes").insert({ whatsapp: from });
    }

    // Obtener catálogo
    const catalogo = await obtenerCatalogo();

    // Crear prompt para GPT
    const sistema = `
Eres *Luna*, asistente virtual de *Delicias Monte Luna*.
Guía al cliente paso a paso para tomar pedidos completos.

Flujo:
1. Saluda y envía el catálogo completo como primer mensaje.
2. Pregunta la comuna de despacho y valida cobertura.
3. Si no hay cobertura, ofrece retiro en nuestra dirección.
4. Si hay cobertura, pide pedido, dirección, nombre y teléfono adicional.
5. Calcula despacho gratis o agrega costo según corresponda.
6. Envía resumen final con total y datos de cliente.
7. Finaliza con ✅ si el pedido se confirma.

Catálogo:
${catalogo}
`;

    // Llamada a GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: message }
      ]
    });

    const respuesta = completion.choices[0].message?.content || "Lo siento, hubo un error.";

    // Guardar historial
    await supabase.from("historial").insert({
      whatsapp: from,
      mensaje_cliente: message,
      respuesta_luna: respuesta,
      fecha: new Date().toISOString()
    });

    res.json({ reply: respuesta });

  } catch (error) {
    console.log("Error en /whatsapp:", error);
    res.status(500).send("Error en el servidor");
  }
});

// --------------------------
// Iniciar servidor
// --------------------------
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
