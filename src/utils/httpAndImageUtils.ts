/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Utilidades de Manejo Seguro de Respuestas HTTP y Compresión en Cliente
 * Previene errores de parseo JSON ("Unexpected token T") ante caídas/timeouts de Vercel
 * y comprime comprobantes mayores a 1 MB antes de su transmisión.
 */

export interface SafeHttpResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

/**
 * Procesa y parsea de forma segura cualquier respuesta fetch de API.
 * 
 * 1. Verifica si response.ok es false o si la respuesta no es de tipo JSON.
 * 2. Si response.ok es false, lee la respuesta como texto plano (await response.text())
 *    para extraer el mensaje real del servidor o reverse proxy (ej. Vercel 504 Gateway Timeout,
 *    413 Payload Too Large, o 500 HTML) y formatea un mensaje amigable al usuario,
 *    impidiendo que la aplicación falle con el error clásico "Unexpected token T".
 */
export async function parsearRespuestaSegura<T = any>(
  response: Response,
  contextoOperacion: string = 'la operación'
): Promise<SafeHttpResponse<T>> {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.toLowerCase().includes('application/json');

  // Caso 1: Error en la respuesta HTTP (status fuera del rango 200-299)
  if (!response.ok) {
    let mensajeError = '';

    try {
      if (isJson) {
        const errorJson = await response.json();
        mensajeError =
          errorJson.error ||
          errorJson.mensaje ||
          errorJson.message ||
          (typeof errorJson === 'string' ? errorJson : '');
      } else {
        // Leer como texto para no fallar con "Unexpected token T" al parsear HTML o texto de Vercel/Proxy
        const textoPlano = await response.text();
        const textoLimpio = textoPlano.replace(/<[^>]*>?/gm, '').trim();

        if (
          response.status === 504 ||
          textoLimpio.toLowerCase().includes('gateway time-out') ||
          textoLimpio.toLowerCase().includes('gateway timeout') ||
          textoLimpio.toLowerCase().includes('timed out')
        ) {
          mensajeError =
            'El servidor excedió el tiempo límite de espera (Timeout de Vercel). El comprobante fue optimizado, pero la red o el servicio tardaron en responder. Intente nuevamente.';
        } else if (
          response.status === 413 ||
          textoLimpio.toLowerCase().includes('payload too large') ||
          textoLimpio.toLowerCase().includes('entity too large') ||
          textoLimpio.toLowerCase().includes('function payload')
        ) {
          mensajeError =
            'El comprobante excede el límite de tamaño permitido por el servidor. Comprima el documento o seleccione un archivo más liviano.';
        } else if (response.status === 502 || textoLimpio.toLowerCase().includes('bad gateway')) {
          mensajeError =
            'El servicio backend está temporalmente no disponible (Bad Gateway). Por favor, espere unos segundos e intente nuevamente.';
        } else if (textoLimpio.length > 0) {
          mensajeError =
            textoLimpio.length > 180 ? `${textoLimpio.substring(0, 177)}...` : textoLimpio;
        }
      }
    } catch {
      // Ignorar fallos de lectura secundaria
    }

    if (!mensajeError) {
      mensajeError = `No fue posible completar ${contextoOperacion} (Código ${response.status}: ${response.statusText || 'Error de servidor'}).`;
    }

    return {
      ok: false,
      error: mensajeError,
      statusCode: response.status,
    };
  }

  // Caso 2: Respuesta con status 200 OK pero que NO es JSON
  if (!isJson) {
    try {
      const texto = await response.text();
      const textoLimpio = texto.replace(/<[^>]*>?/gm, '').trim();
      return {
        ok: false,
        error: `El servidor no devolvió una respuesta JSON válida (${textoLimpio.substring(0, 80) || 'Texto plano'}).`,
        statusCode: response.status,
      };
    } catch {
      return {
        ok: false,
        error: `Respuesta de servidor no reconocida para ${contextoOperacion}.`,
        statusCode: response.status,
      };
    }
  }

  // Caso 3: Respuesta 200 OK con Content-Type application/json
  try {
    const data = await response.json();
    return {
      ok: true,
      data,
      statusCode: response.status,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Error al interpretar los datos recibidos de ${contextoOperacion}.`,
      statusCode: response.status,
    };
  }
}

/**
 * Reduce y comprime una imagen en el cliente utilizando un Canvas HTML5
 * antes de enviarla a la API, si el archivo pesa más de 1 MB (1024 * 1024 bytes).
 * 
 * Esto asegura que la petición se envíe rápido a la API y no exceda
 * el tiempo límite de ejecución o el límite de payload (4.5 MB) de Vercel Serverless.
 */
export async function comprimirImagenCliente(
  archivo: File,
  limiteBytes: number = 2 * 1024 * 1024
): Promise<File> {
  // Si no es una imagen o si ya pesa 2 MB o menos, no requiere compresión
  if (!archivo.type.startsWith('image/') || archivo.size <= limiteBytes) {
    return archivo;
  }

  // En navegadores donde createImageBitmap o canvas estén disponibles
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return archivo;
  }

  try {
    const datosImagen = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = (e) => resolve((e.target?.result as string) || '');
      lector.onerror = () => reject(new Error('No fue posible leer el archivo en el navegador'));
      lector.readAsDataURL(archivo);
    });

    if (!datosImagen) return archivo;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const elementoImg = new Image();
      elementoImg.onload = () => resolve(elementoImg);
      elementoImg.onerror = () => reject(new Error('No fue posible cargar la imagen en memoria'));
      elementoImg.src = datosImagen;
    });

    // Escalar la imagen manteniendo la relación de aspecto si supera 2200px
    // Se conserva suficiente resolución para RUT, folio y montos pequeños.
    const DIMENSION_MAXIMA = 2200;
    let ancho = img.width;
    let alto = img.height;

    if (ancho > DIMENSION_MAXIMA || alto > DIMENSION_MAXIMA) {
      if (ancho > alto) {
        alto = Math.round((alto * DIMENSION_MAXIMA) / ancho);
        ancho = DIMENSION_MAXIMA;
      } else {
        ancho = Math.round((ancho * DIMENSION_MAXIMA) / alto);
        alto = DIMENSION_MAXIMA;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return archivo;
    }

    // Fondo blanco para evitar fondos negros en documentos con fondo transparente PNG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    // Comprimir a JPEG con calidad 0.88
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        'image/jpeg',
        0.88
      );
    });

    if (!blob) {
      return archivo;
    }

    // Si el archivo comprimido es más liviano, retornar el nuevo File
    if (blob.size < archivo.size) {
      const nombreSinExtension = archivo.name.replace(/\.[^/.]+$/, '');
      const archivoComprimido = new File([blob], `${nombreSinExtension}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      return archivoComprimido;
    }

    return archivo;
  } catch (error) {
    console.warn('[CompresionCliente]: Advertencia durante compresión en canvas:', error);
    // En caso de cualquier error con el canvas, se utiliza el archivo original de forma segura
    return archivo;
  }
}
