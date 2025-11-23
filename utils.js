export const comunasCubiertas = {
  "Cerro Navia": "11–13 hrs",
  "Cerrillos": "11–13 hrs",
  "Conchalí": "12–14 hrs"
  // Agrega el resto de comunas
};

export function comunaValida(comuna) {
  return Object.keys(comunasCubiertas).includes(comuna);
}

export function calcularTotal(productos) {
  let subtotal = productos.reduce((sum, p) => sum + p.precio * p.cantidad, 0);
  let despacho = subtotal >= 14990 ? 0 : 2400;
  return { subtotal, despacho, total: subtotal + despacho };
}
