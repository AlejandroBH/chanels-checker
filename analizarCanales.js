// Importar librerías
const fs = require("fs/promises");
const axios = require("axios");

const JSON_FILE = "canales.json";
const LOG_FILE = "canales_caidos.log";
const M3U_FILE = "channels.m3u"; // Nuevo archivo de salida
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
    // Usamos el método GET con un timeout de 10 segundos.
    const response = await axios.get(url, {
      timeout: 10000,
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

    return true;
  } catch (error) {
    // Captura errores de red, timeout, etc.
    return false;
  }
}

/**
 * Genera el contenido de la línea M3U para un canal.
 * @param {object} canal El objeto del canal.
 * @returns {string} La cadena de formato M3U.
 */
function generarLineaM3U(canal) {
  const logoUrl = canal.icon; // Asumimos que 'icon' es la URL del logo
  const title = canal.title;
  const url = canal.url;

  // Formato: #EXTINF:-1 tvg-logo="logo.png", title\nurl
  return `#EXTINF:-1 tvg-logo="${logoUrl}",${title}\n${url}`;
}

/**
 * Función principal para analizar, actualizar el estado, generar log y crear el M3U.
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
  const canalesM3U = []; // Array para almacenar solo los canales activos

  // 1. Crear y ejecutar promesas de comprobación en paralelo
  const promesasDeComprobacion = canales.map(async (canal) => {
    const isActive = await checkStreamStatus(canal.url);

    const statusText = isActive ? "ACTIVO (✓)" : "INACTIVO (✗)";
    console.log(`[${statusText}] ID ${canal.id}: ${canal.title}`);

    if (isActive) {
      // Si está activo, lo añadimos a la lista para el M3U
      canalesM3U.push(canal);
    } else {
      // Si está inactivo, lo añadimos al array de log
      const timestamp = new Date().toISOString();
      canalesCaidosLog.push({
        timestamp: timestamp,
        id: canal.id,
        title: canal.title,
        url: canal.url,
        description: `Verificación fallida: No se pudo conectar, timeout, o formato m3u8 inválido.`,
      });
    }

    // Devolvemos el objeto del canal con el nuevo estado 'active'
    return { ...canal, active: isActive };
  });

  // 2. Esperar a que todas las comprobaciones terminen y mantener el orden original
  const canalesActualizados = await Promise.all(promesasDeComprobacion);

  // --- PASO 3: Generación de Archivos de Salida ---

  // 3.1. Escribir el resultado actualizado de vuelta al archivo JSON
  try {
    const jsonOutput = JSON.stringify(canalesActualizados, null, 2);
    await fs.writeFile(JSON_FILE, jsonOutput, "utf8");
    console.log(`\n✅ Archivo JSON actualizado: ${JSON_FILE}`);
  } catch (error) {
    console.error(
      "Error al escribir el archivo JSON actualizado:",
      error.message
    );
  }

  // 3.2. Escribir el archivo de LOG de canales caídos
  if (canalesCaidosLog.length > 0) {
    try {
      const logContent = canalesCaidosLog
        .map(
          (logEntry) =>
            `[${logEntry.timestamp}] ID: ${logEntry.id} | TÍTULO: ${logEntry.title}\n  URL: ${logEntry.url}\n  MOTIVO: ${logEntry.description}`
        )
        .join("\n---\n");

      const header = `--- LOG DE CANALES CAÍDOS GENERADO: ${new Date().toISOString()} ---\n\n`;

      await fs.writeFile(LOG_FILE, header + logContent + "\n", "utf8");
      console.log(
        `\n⚠️ ¡ATENCIÓN! Se detectaron ${canalesCaidosLog.length} canales caídos.`
      );
      console.log(`✅ Archivo de log generado/actualizado: ${LOG_FILE}`);
    } catch (error) {
      console.error("Error al escribir el archivo de LOG:", error.message);
    }
  } else {
    console.log("\nTodos los canales verificados están activos.");
  }

  // 3.3. GENERAR EL ARCHIVO M3U SOLO CON CANALES ACTIVOS
  if (canalesM3U.length > 0) {
    try {
      // El encabezado M3U principal
      const m3uHeader = "#EXTM3U\n";

      // Mapeamos solo los canales activos a su formato M3U
      const m3uEntries = canalesM3U
        // Filtramos el array de canalesActualizados para mantener el orden original
        .filter((canal) => canal.active === true)
        .map(generarLineaM3U)
        .join("\n"); // Unimos con saltos de línea

      const m3uContent = m3uHeader + m3uEntries;

      await fs.writeFile(M3U_FILE, m3uContent, "utf8");
      console.log(
        `\n✅ Archivo de lista de reproducción M3U generado: ${M3U_FILE}`
      );
      console.log(`   Incluye ${canalesM3U.length} canales activos.`);
    } catch (error) {
      console.error("Error al escribir el archivo M3U:", error.message);
    }
  } else {
    console.log(
      `\nNo se generó el archivo M3U porque no se encontraron canales activos.`
    );
  }
}

analizarCanales();
