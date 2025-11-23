import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";
import { supabase } from "./supabaseClient.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --------------------------
// FUNCIONES
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
// RUTAS
// --------------------------
app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente 🚀");
});

app.post("/whatsapp", async (req, res) => {
  try {
    const { from, message } = req.body;

    // Guardar o actualizar cliente
    const { data: cliente } = await supabase
      .from("clientes")
      .select("*")
      .eq("whatsapp", from)
      .maybeSingle();

    if (!cliente) {
      await supabase.from("clientes").insert({ whatsapp: from });
    }

    // Obtener catálogo
    const catalogo = await obtenerCatalogo();

    // Prompt para GPT
    const sistema = `
Eres *Luna*, asistente virtual de *Delicias Monte Luna*.
Tu misión es guiar paso a paso al cliente, cerrar ventas y tomar pedidos completos.

Reglas:
1. Enviar catálogo como primer mensaje.
2. Preguntar comuna y validar cobertura.
3. Si no hay cobertura, ofrecer retiro en dirección: Chacabuco 1120, Santiago Centro.
4. Si hay cobertura, preguntar pedido, dirección, nombre y teléfono adicional.
5. Calcular despacho gratis si aplica.
6. Enviar resumen final con ✅ si se confirma el pedido.
7. Guardar todo en la base de datos.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: message || "" }
      ]
    });

    const respuesta = completion.choices[0].message.content;

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
// INICIAR SERVIDOR
// --------------------------
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
