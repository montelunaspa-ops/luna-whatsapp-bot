import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generarRespuestaLuna(historial, mensajeCliente) {
  const prompt = `
Eres Luna, vendedora de Delicias Monte Luna.
Responde cordial y profesional.
Historial: ${historial.join("\n")}
Mensaje del cliente: ${mensajeCliente}
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });

  return response.choices[0].message.content;
}
