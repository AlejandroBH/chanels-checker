// Importar librerías
const fs = require("fs/promises");
const axios = require("axios");

const JSON_FILE = "canales.json";

// Definimos un umbral de tamaño mínimo para el contenido del archivo m3u8 (en caracteres).
// Los archivos m3u8 válidos y no vacíos suelen ser más largos que un simple '404' o un cuerpo vacío.
const MIN_CONTENT_LENGTH = 30;

/**
 * Comprueba el estado del stream m3u8 usando una petición GET y analizando el contenido.
 * Esto es más robusto contra falsos positivos que solo usar HEAD.
 * * @param {string} url La URL del stream.
 * @returns {Promise<boolean>} Devuelve true si el canal parece activo, false en caso contrario.
 */
async function checkStreamStatus(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    // Usamos el método GET para obtener el contenido del archivo m3u8.
    const response = await axios.get(url, {
      // Un tiempo de espera de 10 segundos.
      timeout: 10000,
      // Limitamos la respuesta para no descargar un archivo m3u8 enorme,
      // solo necesitamos las primeras líneas (aprox. 10KB).
      maxContentLength: 1024 * 10,
      responseType: "text",
    });

    // 1. Verificación de Código de Estado
    if (response.status < 200 || response.status >= 300) {
      return false;
    }

    const content = response.data;

    // 2. Verificación de Estructura Básica (HLS/m3u8)
    if (!content || content.length < MIN_CONTENT_LENGTH) {
      // El contenido es demasiado corto o nulo.
      return false;
    }

    const contentLines = content.trim().split("\n");

    // 3. Verificación de Encabezado HLS
    if (contentLines.length === 0 || contentLines[0].trim() !== "#EXTM3U") {
      // No comienza con la etiqueta mágica de HLS/m3u8
      return false;
    }

    // Si pasa las verificaciones de código, longitud y encabezado, asumimos que está activo.
    return true;
  } catch (error) {
    // Captura errores de red, timeout, o si la respuesta excede maxContentLength
    // Si hay un error, el canal se considera inactivo.
    return false;
  }
}

/**
 * Función principal para analizar y actualizar el estado de los canales,
 * manteniendo el orden original de la lista.
 */
async function analizarCanales() {
  console.log(
    `Iniciando el análisis de canales en ${JSON_FILE} (Verificación de Contenido).`
  );
  console.log(`Tiempo de espera máximo por canal: 2 segundos.`);
  let canales;
  try {
    const data = await fs.readFile(JSON_FILE, "utf8");
    canales = JSON.parse(data);
  } catch (error) {
    console.error("Error al leer o parsear el archivo JSON:", error.message);
    return;
  }

  // Usamos .map y Promise.all para ejecutar en paralelo manteniendo el orden.
  const promesasDeComprobacion = canales.map(async (canal) => {
    const isActive = await checkStreamStatus(canal.url);

    const statusText = isActive ? "ACTIVO (✓)" : "INACTIVO (✗)";
    console.log(`[${statusText}] ID ${canal.id}: ${canal.title}`);

    return { ...canal, active: isActive };
  });

  const canalesActualizados = await Promise.all(promesasDeComprobacion);

  // Escribir el resultado actualizado de vuelta al archivo JSON
  try {
    const jsonOutput = JSON.stringify(canalesActualizados, null, 2);
    await fs.writeFile(JSON_FILE, jsonOutput, "utf8");
    console.log(
      `\nProceso completado. El archivo ${JSON_FILE} ha sido actualizado.`
    );
  } catch (error) {
    console.error(
      "Error al escribir el archivo JSON actualizado:",
      error.message
    );
  }
}

analizarCanales();
