// src/server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// --------------------------
// Supabase client
// --------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Debes definir SUPABASE_URL y SUPABASE_KEY en .env");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// --------------------------
// OpenAI client
// --------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
// Rutas
// --------------------------
app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente 🚀");
});

app.post("/whatsapp", async (req, res) => {
  try {
    // Protección si req.body no tiene los campos esperados
    const body = req.body || {};
    const from = body.from || body.number;
    const message = body.message || body.text;

    if (!from || !message) {
      return res.status(400).send("No se recibió número o mensaje");
    }

    // --------------------------
    // Guardar o actualizar cliente
    // --------------------------
    let clienteExistente = null;
    try {
      const { data } = await supabase
        .from("clientes")
        .select("*")
        .eq("whatsapp", from)
        .single();
      clienteExistente = data;
    } catch {
      clienteExistente = null;
    }

    if (!clienteExistente) {
      await supabase.from("clientes").insert({ whatsapp: from });
    }

    // --------------------------
    // Obtener catálogo
    // --------------------------
    const catalogo = await obtenerCatalogo();

    // --------------------------
    // Prompt para GPT
    // --------------------------
    const sistema = `
Eres *Luna*, asistente virtual de *Delicias Monte Luna*.
Tu misión es guiar paso a paso al cliente, cerrar ventas y tomar pedidos completos.

Reglas de operación:
1. Siempre envía el catálogo como primer mensaje de bienvenida.
2. Pregunta la comuna del despacho y valida cobertura.
3. Si no hay cobertura, ofrece retiro en dirección: Chacabuco 1120, Santiago Centro.
4. Si hay cobertura, pregunta qué desea pedir y luego dirección, nombre, teléfono adicional.
5. Calcula si la compra alcanza despacho gratis y agrega costo si no.
6. Envía resumen final con total del pedido, despacho y datos del cliente.
7. Finaliza con ✅ si se confirma el pedido.
8. Responde solo en texto.

Catálogo completo:
${catalogo}
`;

    // --------------------------
    // Llamada a GPT
    // --------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: message }
      ]
    });

    const respuesta = completion.choices[0]?.message?.content || "No se pudo generar respuesta";

    // --------------------------
    // Guardar conversación en historial
    // --------------------------
    await supabase.from("historial").insert({
      whatsapp: from,
      mensaje_cliente: message,
      respuesta_luna: respuesta,
      fecha: new Date().toISOString()
    });

    // --------------------------
    // Responder
    // --------------------------
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
