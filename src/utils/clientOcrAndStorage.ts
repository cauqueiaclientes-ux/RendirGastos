/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * MOTOR DE LECTURA DE COMPROBANTES CON GEMINI VISION (servidor)
 * 
 * - Endpoint: "https://api.groq.com/openai/v1/chat/completions"
 * - Modelo: "llama-3.2-11b-vision-preview"
 * - Extracción directa de: rut, folio, razonSocial, montoTotal.
 * - Asignación directa a la interfaz de usuario con campos 100% editables.
 * - Registro de error en consola (console.log / console.error) sin bloquear la interfaz.
 * 
 * Bucket: 'rendiciones-idiem' | Tabla: 'rendiciones'
 */

import { supabase, insertarRendicionEnSupabase, registrarUsuarioActivoMes } from '../../lib/supabase';
import {
  validarRutChileno,
  formatearRut,
  limpiarRut,
  evaluarRutConRevisionManual,
} from './rutValidator';

export { formatearRut, validarRutChileno, limpiarRut, evaluarRutConRevisionManual };

export interface DatosOcrExtraidos {
  rutEmisor: string;
  folio: number | string;
  montoTotal: number | string;
  tipoDocumento: string;
  razonSocial: string;
  glosaSugerida: string;
  montoNeto: number;
  montoIva: number;
  fechaEmision?: string;
  timbradoDigital?: string;
  confianzaOcr?: number;
  motor?: string;
  requiereRevisionManual?: boolean;
  advertenciaRut?: string | null;
}

/**
 * 1. SUBIDA DE ARCHIVO A SUPABASE STORAGE (Bucket: 'rendiciones-idiem')
 */
export async function subirComprobanteRobusto(
  file: File
): Promise<{ url: string; origen: 'supabase_storage' | 'local_fallback'; filePath: string }> {
  const bucketName = 'rendiciones-idiem';
  const randomUuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).substring(2, 9);
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
  const filePath = `comprobantes/${Date.now()}_${randomUuid}_${cleanFileName}`;

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('[Supabase Storage Warn]:', error.message);
      const localDataUrl = await convertirFileADataUrl(file);
      return { url: localDataUrl, origen: 'local_fallback', filePath };
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return {
      url: publicUrlData.publicUrl,
      origen: 'supabase_storage',
      filePath,
    };
  } catch (err) {
    console.warn('[Storage Catch Fallback]:', err);
    const localDataUrl = await convertirFileADataUrl(file);
    return { url: localDataUrl, origen: 'local_fallback', filePath };
  }
}

/**
 * Utilidad: Convierte un archivo a Data URL de forma segura
 */
export function convertirFileADataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Utilidad: Comprime una imagen en el cliente para acelerar la subida a Groq
 */
export async function comprimirImagenCliente(file: File, maxSizeBytes = 1024 * 1024): Promise<File> {
  if (file.size <= maxSizeBytes || !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const maxDimension = 1600;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * =========================================================================
 * 2. LLAMADA AL ENDPOINT INTERNO /api/ocr
 * =========================================================================
 */
export async function extraerOcrRobusto(
  file: File,
  fileBase64?: string,
  onProgress?: (porcentaje: number, mensaje: string) => void,
  onEtapa1Inmediata?: (datos: DatosOcrExtraidos) => void
): Promise<DatosOcrExtraidos> {
  if (onProgress) onProgress(20, 'Preparando comprobante para lectura inteligente...');

  const b64 = fileBase64 || await convertirFileADataUrl(file);
  if (!b64) {
    throw new Error('No fue posible leer el archivo seleccionado.');
  }

  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
    throw new Error('Formato no compatible. Selecciona una imagen JPG, PNG o WEBP.');
  }

  if (onProgress) onProgress(40, 'Analizando comprobante con IA...');

  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: b64,
      fileName: file.name,
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`El servidor OCR respondió de forma inesperada (HTTP ${response.status}).`);
  }

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `No fue posible analizar el comprobante (HTTP ${response.status}).`);
  }

  const raw = payload.data || {};
  const rutFinal = raw.rutEmisor ? formatearRut(String(raw.rutEmisor)) : '';
  const folioFinal = raw.folio !== null && raw.folio !== undefined && raw.folio !== '' ? Number(raw.folio) : '';
  const totalFinal = raw.montoTotal !== null && raw.montoTotal !== undefined && raw.montoTotal !== '' ? Number(raw.montoTotal) : '';
  const netoFinal = raw.montoNeto !== null && raw.montoNeto !== undefined ? Number(raw.montoNeto) : 0;
  const ivaFinal = raw.montoIva !== null && raw.montoIva !== undefined ? Number(raw.montoIva) : 0;
  const razonFinal = String(raw.razonSocial || '').trim();
  const evalRut = evaluarRutConRevisionManual(rutFinal);

  const resultado: DatosOcrExtraidos = {
    rutEmisor: rutFinal,
    folio: Number.isFinite(folioFinal as number) ? folioFinal : '',
    montoTotal: Number.isFinite(totalFinal as number) ? totalFinal : '',
    montoNeto: Number.isFinite(netoFinal) ? netoFinal : 0,
    montoIva: Number.isFinite(ivaFinal) ? ivaFinal : 0,
    tipoDocumento: raw.tipoDocumento || 'COMPROBANTE',
    razonSocial: razonFinal,
    glosaSugerida: String(raw.glosaSugerida || '').trim(),
    fechaEmision: raw.fechaEmision || undefined,
    timbradoDigital: '',
    confianzaOcr: typeof raw.confianzaOcr === 'number' ? raw.confianzaOcr : 0,
    motor: raw.motor || 'Gemini Vision',
    requiereRevisionManual: Boolean(raw.requiereRevisionManual) || evalRut.requiereRevisionManual,
    advertenciaRut: raw.advertencias?.length
      ? raw.advertencias.join(' ')
      : (evalRut.mensaje || null),
  };

  if (onProgress) onProgress(100, resultado.requiereRevisionManual ? '✓ Lectura completada · revisar datos' : '✓ Comprobante analizado correctamente');
  if (onEtapa1Inmediata) onEtapa1Inmediata(resultado);

  return resultado;
}

/**
 * 3. VALIDACIÓN TRIBUTARIA SII ROBUSTA (100% Client-Side)
 */
export async function validarSiiRobusto(params: {
  rutEmisor: string;
  folio: number | string;
  monto?: number | string;
  montoTotal?: number | string;
  tipoDocumento?: string;
  fechaEmision?: string;
}): Promise<{
  valido: boolean;
  estado: string;
  estadoSii: string;
  codigoRespuesta: string;
  glosaRespuesta: string;
  timbradoDigital?: string;
  requiereRevisionManual?: boolean;
}> {
  const response = await fetch('/api/sii/validar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new Error('El servidor SII respondió de forma inesperada.');
  }

  if (!response.ok) {
    return {
      valido: false,
      estado: data?.estado || 'ERROR',
      estadoSii: data?.resultado?.estado || 'ERROR',
      codigoRespuesta: data?.resultado?.codigoVerificacion || `HTTP-${response.status}`,
      glosaRespuesta: data?.error || 'No fue posible validar el documento ante el SII.',
      requiereRevisionManual: true,
    };
  }

  const resultado = data?.resultado || data;
  return {
    valido: Boolean(data?.valido ?? resultado?.estado === 'ACEPTADO'),
    estado: data?.estado || resultado?.estado || 'NO_ENCONTRADO',
    estadoSii: resultado?.estado || 'NO_ENCONTRADO',
    codigoRespuesta: resultado?.codigoVerificacion || 'SII-SIN-CODIGO',
    glosaRespuesta: data?.mensaje || resultado?.glosaSii || 'Resultado de validación tributaria.',
    timbradoDigital: resultado?.timbreValido ? resultado.codigoVerificacion : undefined,
    requiereRevisionManual: resultado?.estado !== 'ACEPTADO',
  };
}

/**
 * 4. PERSISTENCIA REAL DE RENDICIÓN EN SUPABASE
 */
export async function guardarRendicionRobusta(payload: any) {
  const folioNum = Number(String(payload.folioDte || payload.folio || 0).replace(/[^0-9]/g, '')) || 0;
  const montoNum = Number(String(payload.montoTotal || payload.monto || 0).replace(/[^0-9]/g, '')) || 0;
  const netoNum = payload.montoNeto ? Number(String(payload.montoNeto).replace(/[^0-9]/g, '')) : Math.round(montoNum / 1.19);
  const ivaNum = payload.montoIva ? Number(String(payload.montoIva).replace(/[^0-9]/g, '')) : Math.round(montoNum - netoNum);
  const now = new Date();
  const folioInterno = payload.folioInterno || `RD-${Date.now().toString().slice(-6)}`;

  const insertPayload = {
    folioInterno,
    rutRendidor: payload.rutRendidor || '',
    nombreRendidor: payload.nombreRendidor || '',
    centroCosto: payload.centroCosto || 'CC-402',
    rutEmisor: payload.rutEmisor || '',
    razonSocial: payload.razonSocial || '',
    folioDte: folioNum,
    tipoDocumento: payload.tipoDocumento || 'Boleta Electrónica',
    montoTotal: montoNum,
    montoNeto: netoNum,
    montoIva: ivaNum,
    glosa: payload.glosa || 'Rendición de gastos operacionales',
    comprobanteUrl: payload.comprobanteUrl || '',
    timbradoDigital: payload.timbradoDigital || '',
    estado: payload.requiereRevisionManual ? 'revision_manual' : 'en_revision',
    validoSii: false,
  };

  const resultado = await insertarRendicionEnSupabase(insertPayload);

  registrarUsuarioActivoMes(insertPayload.rutRendidor).catch((err) => {
    console.warn('[Active User Reg Warn]:', err);
  });

  const fullRendicionItem = {
    id: resultado.rendicionId || folioInterno,
    folio: folioInterno,
    folioInterno,
    fecha: now.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
    fechaCompleta: now.toISOString().split('T')[0],
    rendidor: insertPayload.nombreRendidor,
    rendidorCorto: insertPayload.nombreRendidor.split(' ')[0],
    rendidorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    rutRendidor: insertPayload.rutRendidor,
    centroCosto: insertPayload.centroCosto,
    centroCostoNombre: 'Centro Operacional IDIEM',
    rutProveedor: insertPayload.rutEmisor,
    razonSocial: insertPayload.razonSocial,
    glosa: insertPayload.glosa,
    montoBruto: insertPayload.montoTotal,
    montoNeto: insertPayload.montoNeto,
    montoIva: insertPayload.montoIva,
    montoExento: 0,
    tipoDocumento: insertPayload.tipoDocumento,
    folioDTE: String(folioNum),
    timbreSII: true,
    timbradoDigital: insertPayload.timbradoDigital,
    estado: (payload.requiereRevisionManual ? 'revision_manual' : 'en_revision') as any,
    urlComprobante: insertPayload.comprobanteUrl,
    comprobanteUrl: insertPayload.comprobanteUrl,
  };

  return {
    success: true,
    rendicionId: resultado.rendicionId || folioInterno,
    rendicion: fullRendicionItem as any,
  };
}

export const persistirRendicionCompleta = guardarRendicionRobusta;
