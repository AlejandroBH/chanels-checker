// Importar librerías
const fs = require("fs/promises");
const axios = require("axios");

const JSON_FILE = "canales.json";
const LOG_FILE = "canales_caidos.log";
const MIN_CONTENT_LENGTH = 30; // Umbral de tamaño mínimo para un m3u8 válido.

/**
 * Comprueba el estado del stream m3u8 usando una petición GET y analizando el contenido.
 * @param {string} url La URL del stream.
 * @returns {Promise<boolean>} Devuelve true si el canal parece activo, false en caso contrario.
 */
async function checkStreamStatus(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    // Usamos el método GET con un timeout de 2 segundos.
    const response = await axios.get(url, {
      timeout: 2000,
      maxContentLength: 1024 * 10, // Límite de 10KB de respuesta
      responseType: "text",
    });

    if (response.status < 200 || response.status >= 300) {
      return false;
    }

    const content = response.data;

    if (!content || content.length < MIN_CONTENT_LENGTH) {
      return false;
    }

    const contentLines = content.trim().split("\n");

    // Un m3u8 válido debe comenzar con #EXTM3U
    if (contentLines.length === 0 || contentLines[0].trim() !== "#EXTM3U") {
      return false;
    }

    // Si pasa todas las verificaciones, se considera activo.
    return true;
  } catch (error) {
    // Captura errores de red, timeout, etc.
    return false;
  }
}

/**
 * Función principal para analizar y actualizar el estado de los canales,
 * y generar un archivo de registro de canales caídos.
 */
async function analizarCanales() {
  console.log(`Iniciando el análisis de canales en ${JSON_FILE}...`);
  console.log(`Tiempo de espera máximo por canal: 2 segundos.`);

  let canales;
  try {
    const data = await fs.readFile(JSON_FILE, "utf8");
    canales = JSON.parse(data);
  } catch (error) {
    console.error(
      "ERROR FATAL: No se pudo leer o parsear el archivo JSON:",
      error.message
    );
    return;
  }

  const canalesCaidosLog = [];

  // 1. Crear y ejecutar promesas de comprobación en paralelo
  const promesasDeComprobacion = canales.map(async (canal) => {
    const isActive = await checkStreamStatus(canal.url);

    const statusText = isActive ? "ACTIVO (✓)" : "INACTIVO (✗)";
    console.log(`[${statusText}] ID ${canal.id}: ${canal.title}`);

    if (!isActive) {
      // Si el canal está inactivo, añadirlo al array de log
      // NOTA: Se sigue guardando la descripción internamente, pero no se usará en el log.
      const timestamp = new Date().toISOString();
      canalesCaidosLog.push({
        timestamp: timestamp,
        id: canal.id,
        title: canal.title,
        url: canal.url,
      });
    }

    // Devolvemos el objeto del canal con el nuevo estado 'active'
    return { ...canal, active: isActive };
  });

  // 2. Esperar a que todas las comprobaciones terminen y mantener el orden original
  const canalesActualizados = await Promise.all(promesasDeComprobacion);

  // 3. Escribir el resultado actualizado de vuelta al archivo JSON
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

  // 4. Escribir el archivo de LOG de canales caídos (SIN el motivo/descripción)
  if (canalesCaidosLog.length > 0) {
    try {
      // Modificamos esta sección para omitir la descripción del motivo
      const logContent = canalesCaidosLog
        .map(
          (logEntry) =>
            `[${logEntry.timestamp}] ID: ${logEntry.id} | TÍTULO: ${logEntry.title}\n  URL: ${logEntry.url}`
        )
        .join("\n---\n"); // Separador entre entradas

      // Añadimos un encabezado con la fecha de generación
      const header = `--- LOG DE CANALES CAÍDOS GENERADO: ${new Date().toISOString()} ---\n\n`;

      // Escribimos el archivo de log
      await fs.writeFile(LOG_FILE, header + logContent + "\n", "utf8");
      console.log(
        `\n¡ATENCIÓN! Se detectaron ${canalesCaidosLog.length} canales caídos.`
      );
      console.log(
        `Se ha generado o actualizado el archivo de log: ${LOG_FILE}`
      );
    } catch (error) {
      console.error("Error al escribir el archivo de LOG:", error.message);
    }
  } else {
    console.log(
      "\nTodos los canales verificados están activos. No se generó un archivo de log de caídos."
    );
  }
}

analizarCanales();
