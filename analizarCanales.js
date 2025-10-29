// Importar librerías
const fs = require("fs/promises");
const axios = require("axios");

const JSON_FILE = "canales.json";

/**
 * Comprueba si un URL de stream (m3u8) está activo haciendo una petición HEAD.
 * Se mantiene inalterado.
 * @param {string} url La URL del stream.
 * @returns {Promise<boolean>} Devuelve true si el canal está activo (código 2xx), false en caso contrario.
 */
async function checkStreamStatus(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    // Usamos el método HEAD para solo obtener los encabezados.
    const response = await axios.head(url, {
      timeout: 7000,
    });

    // Los códigos de estado 2xx indican éxito (ej. 200 OK)
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    // Maneja errores de conexión, timeouts, o códigos de estado 4xx/5xx
    return false;
  }
}

/**
 * Función principal para analizar y actualizar el estado de los canales,
 * manteniendo el orden original de la lista.
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

  // 1. Creamos un array de promesas. Usamos 'map' para crear las promesas
  // en el mismo orden que los canales originales.
  const promesasDeComprobacion = canales.map(async (canal) => {
    // La comprobación se hace sobre el campo 'url'
    const isActive = await checkStreamStatus(canal.url);

    const statusText = isActive ? "ACTIVO (✓)" : "INACTIVO (✗)";
    console.log(`[${statusText}] ID ${canal.id}: ${canal.title}`);

    // 2. Devolvemos el objeto del canal con el nuevo estado 'active'
    // El Promise.all(promesas) asegurará que este resultado se guarde en orden.
    return { ...canal, active: isActive };
  });

  // 3. Promise.all() garantiza que el array resultante (canalesActualizados)
  // tenga los resultados en el mismo orden en que se crearon las promesas (el orden original del JSON).
  const canalesActualizados = await Promise.all(promesasDeComprobacion);

  // 4. Escribir el resultado actualizado de vuelta al archivo JSON
  try {
    const jsonOutput = JSON.stringify(canalesActualizados, null, 2);
    await fs.writeFile(JSON_FILE, jsonOutput, "utf8");
    console.log(
      `\nProceso completado. El archivo ${JSON_FILE} ha sido actualizado y el orden original (por ID) ha sido preservado.`
    );
  } catch (error) {
    console.error(
      "Error al escribir el archivo JSON actualizado:",
      error.message
    );
  }
}

analizarCanales();
