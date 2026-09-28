/**
 * Servicio de compatibilidad para el motor OCR.
 *
 * Las credenciales de IA nunca se manejan en el navegador.
 * La imagen se envía al endpoint interno /api/ocr y el servidor consulta Gemini.
 */

export interface DatosComprobanteExtraidos {
  rut: string;
  folio: string | number;
  razonSocial: string;
  montoTotal: number | string;
  montoNeto?: number;
  montoIva?: number;
  fecha?: string;
  tipoDocumento?: string;
  glosaSugerida?: string;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function extraerDatosComprobante(
  archivo: File | string,
): Promise<DatosComprobanteExtraidos> {
  const image = typeof archivo === 'string'
    ? (archivo.startsWith('data:') ? archivo : `data:image/jpeg;base64,${archivo}`)
    : await fileToBase64(archivo);

  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'No fue posible procesar el comprobante.');
  }

  const data = payload.data || {};
  return {
    rut: data.rutEmisor || '',
    folio: data.folio ?? '',
    razonSocial: data.razonSocial || '',
    montoTotal: data.montoTotal ?? '',
    montoNeto: data.montoNeto ?? 0,
    montoIva: data.montoIva ?? 0,
    fecha: data.fechaEmision || undefined,
    tipoDocumento: data.tipoDocumento || 'COMPROBANTE',
    glosaSugerida: data.glosaSugerida || '',
  };
}
