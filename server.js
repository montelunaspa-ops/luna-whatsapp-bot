const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const { supabase } = require("./supabase");
const { catalogo } = require("./catalogo");
const { comunaValida, calcularTotal } = require("./utils");
const { generarRespuestaLuna } = require("./lunaAI");

const app = express();
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

const conversaciones = {}; // Manejo simple de estados

app.post("/whatsapp", async (req, res) => {
  const { from, message } = req.body;

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

  if (!conversaciones[from]) {
    conversaciones[from] = { estado: "inicio", pedido: [], datosDespacho: {} };
  }

  const conv = conversaciones[from];
  let respuesta = "";

  switch (conv.estado) {
    case "inicio":
      respuesta = `¡Hola! Soy Luna 🤖. Te muestro nuestro catálogo:\n${catalogo}\n\nPara iniciar tu pedido, dime tu comuna.`;
      conv.estado = "validar_comuna";
      break;

    case "validar_comuna":
      if (comunaValida(message)) {
        conv.datosDespacho.comuna = message;
        respuesta = `Perfecto, tu comuna está cubierta.\nAhora dime qué productos quieres pedir.`;
        conv.estado = "tomar_pedido";
      } else {
        respuesta = `Lo siento, no hacemos despacho a tu comuna. Puedes retirar en Chacabuco 1120.`;
        conv.estado = "inicio";
      }
      break;

    case "tomar_pedido":
      const items = message.split(",").map(i => i.trim());
      items.forEach(i => conv.pedido.push({ nombre: i, cantidad: 1, precio: 12000 }));
      respuesta = `Entendido. Pedido parcial: ${items.join(", ")}.\nPor favor dime tu nombre completo.`;
      conv.estado = "datos_cliente";
      break;

    case "datos_cliente":
      conv.datosDespacho.nombreCompleto = message;
      respuesta = `Perfecto ${message}. Ahora dime tu dirección completa.`;
      conv.estado = "direccion";
      break;

    case "direccion":
      conv.datosDespacho.direccion = message;
      const totales = calcularTotal(conv.pedido);
      conv.datosDespacho.total = totales.total;
      respuesta = `Resumen de tu pedido:\nProductos: ${conv.pedido.map(p => p.nombre).join(", ")}\nTotal: $${totales.total}\nDirección: ${conv.datosDespacho.direccion}\nComuna: ${conv.datosDespacho.comuna}\n¿Todo correcto? (sí/no)`;
      conv.estado = "confirmar";
      break;

    case "confirmar":
      if (["sí", "si"].includes(message.toLowerCase())) {
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

  await supabase.from("historial").insert([
    { whatsapp_cliente: from, mensaje_cliente: message, respuesta_luna: respuesta }
  ]);

  console.log(`Responder a ${from}: ${respuesta}`);

  res.send({ status: "ok" });
});

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
