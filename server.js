import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { supabase } from "./supabase.js";
import { catalogo } from "./catalogo.js";
import { comunaValida, calcularTotal } from "./utils.js";
import { generarRespuestaLuna } from "./lunaAI.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// Simulamos base de estados de conversación
const conversaciones = {}; 

app.post("/whatsapp", async (req, res) => {
  const { from, message } = req.body;

  // Obtener o crear cliente
  let { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("whatsapp", from)
    .single();

  if (!cliente) {
    const { data } = await supabase
      .from("clientes")
      .insert([{ whatsapp: from }])
      .select()
      .single();
    cliente = data;
  }

  // Inicializar conversación si no existe
  if (!conversaciones[from]) {
    conversaciones[from] = {
      estado: "inicio",
      pedido: [],
      datosDespacho: {}
    };
  }

  const conv = conversaciones[from];

  // Flujo de estados
  let respuesta = "";

  switch (conv.estado) {
    case "inicio":
      respuesta = `¡Hola! Soy Luna 🤖. Te muestro nuestro catálogo:\n${catalogo}\n\nPara iniciar tu pedido, por favor dime tu comuna para validar despacho.`;
      conv.estado = "validar_comuna";
      break;

    case "validar_comuna":
      if (comunaValida(message)) {
        conv.datosDespacho.comuna = message;
        respuesta = `Perfecto, tu comuna está dentro de nuestra cobertura.\nAhora dime qué productos quieres pedir (puedes escribir varios, separados por comas).`;
        conv.estado = "tomar_pedido";
      } else {
        respuesta = `Lo siento, no hacemos despacho a tu comuna. Puedes retirar tu pedido en Chacabuco 1120.`;
        conv.estado = "inicio"; 
      }
      break;

    case "tomar_pedido":
      // Ejemplo: parsear pedido simple
      // Aquí podemos mejorar para leer sabores, cantidades, porciones
      const items = message.split(",").map(i => i.trim());
      items.forEach(i => conv.pedido.push({ nombre: i, cantidad: 1, precio: 12000 })); // precio ejemplo
      respuesta = `Entendido. Tu pedido parcial: ${items.join(", ")}.\nPor favor proporciona tu nombre completo para el despacho.`;
      conv.estado = "datos_cliente";
      break;

    case "datos_cliente":
      conv.datosDespacho.nombreCompleto = message;
      respuesta = `Perfecto ${message}. Ahora dime tu dirección completa para despacho.`;
      conv.estado = "direccion";
      break;

    case "direccion":
      conv.datosDespacho.direccion = message;
      // Calcular total
      const totales = calcularTotal(conv.pedido);
      conv.datosDespacho.total = totales.total;
      respuesta = `Resumen de tu pedido:\nProductos: ${conv.pedido.map(p => p.nombre).join(", ")}\nTotal: $${totales.total}\nDirección: ${conv.datosDespacho.direccion}\nComuna: ${conv.datosDespacho.comuna}\n¿Todo correcto? (sí/no)`;
      conv.estado = "confirmar";
      break;

    case "confirmar":
      if (message.toLowerCase() === "sí" || message.toLowerCase() === "si") {
        // Guardar pedido en Supabase
        await supabase.from("pedidos").insert([{
          whatsapp_cliente: from,
          productos: conv.pedido,
          total: conv.datosDespacho.total,
          despacho: conv.datosDespacho.total >= 14990 ? 0 : 2400,
          estado: "pendiente"
        }]);
        respuesta = `✅ Pedido confirmado. ¡Gracias por tu compra!`;
      } else {
        respuesta = `Pedido cancelado. Puedes iniciar un nuevo pedido cuando quieras.`;
      }
      conv.estado = "inicio";
      conv.pedido = [];
      conv.datosDespacho = {};
      break;

    default:
      respuesta = "No entendí tu mensaje. Por favor empieza de nuevo.";
      conv.estado = "inicio";
  }

  // Guardar historial
  await supabase.from("historial").insert([
    { whatsapp_cliente: from, mensaje_cliente: message, respuesta_luna: respuesta }
  ]);

  console.log(`Responder a ${from}: ${respuesta}`);

  res.send({ status: "ok" });
});

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
