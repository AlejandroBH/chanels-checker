// Importar librerías
const fs = require("fs/promises");
const axios = require("axios");

const JSON_FILE = "canales.json";

/**
 * Comprueba si un URL de stream (m3u8) está activo haciendo una petición HEAD.
 * @param {string} url La URL del stream.
 * @returns {Promise<boolean>} Devuelve true si el canal está activo (código 2xx), false en caso contrario.
 */
async function checkStreamStatus(url) {
  // Si la URL es inválida, se considera inactiva
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    // Usamos el método HEAD para solo obtener los encabezados.
    const response = await axios.head(url, {
      timeout: 7000, // Aumentado a 7 segundos por si hay latencia
      // Para prevenir problemas de CORS, en Node.js esto no es un problema
      // pero si tuvieras que hacerlo desde un navegador, necesitarías un proxy.
    });

    // Los códigos de estado 2xx indican éxito (ej. 200 OK)
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    // Maneja errores de conexión, timeouts, o códigos de estado 4xx/5xx (Not Found, Server Error)
    return false;
  }
}

/**
 * Función principal para analizar y actualizar el estado de los canales.
 */
async function analizarCanales() {
  console.log(`Iniciando el análisis de canales en ${JSON_FILE}...`);
  let canales;
  try {
    const data = await fs.readFile(JSON_FILE, "utf8");
    canales = JSON.parse(data);
  } catch (error) {
    console.error("Error al leer o parsear el archivo JSON:", error.message);
    return;
  }

  const canalesActualizados = [];
  // Usamos Promise.all para ejecutar todas las comprobaciones en paralelo,
  // lo que acelera significativamente el proceso.
  const promesas = canales.map(async (canal) => {
    // La comprobación se hace sobre el campo 'url'
    const isActive = await checkStreamStatus(canal.url);

    // Creamos el objeto con el estado actualizado (usando 'active')
    const canalActualizado = { ...canal, active: isActive };
    canalesActualizados.push(canalActualizado);

    const statusText = isActive ? "ACTIVO (✓)" : "INACTIVO (✗)";
    console.log(`[${statusText}] ID ${canal.id}: ${canal.title}`);
  });

  // Esperamos a que todas las comprobaciones asíncronas se completen
  await Promise.all(promesas);

  // Escribir el resultado actualizado de vuelta al archivo JSON
  try {
    // 'null, 2' formatea el JSON para que sea legible (indentación de 2 espacios)
    const jsonOutput = JSON.stringify(canalesActualizados, null, 2);
    await fs.writeFile(JSON_FILE, jsonOutput, "utf8");
    console.log(
      `\nProceso completado. El archivo ${JSON_FILE} ha sido actualizado con el nuevo estado 'active'.`
    );
  } catch (error) {
    console.error(
      "Error al escribir el archivo JSON actualizado:",
      error.message
    );
  }
}

analizarCanales();
