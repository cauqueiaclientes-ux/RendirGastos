/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Servidor Fullstack Express + Vite Middleware (Puerto 3000)
 * Rutas de API para Rendiciones de Gastos, OCR IA, Supabase Storage y SII
 */

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { consultarValidezDTE, validarRutChileno, formatearRut } from './lib/sii.js';
import {
  supabaseAdmin,
  subirComprobanteSupabase,
  insertarRendicionEnSupabase,
  registrarUsuarioActivoMes,
  obtenerUsuariosActivosMes,
} from './lib/supabase.js';

dotenv.config();
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Almacén en memoria de rendiciones (inicia limpio en producción real)
const rendicionesDb: any[] = [];

async function startServer() {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // =========================================================================
  // API ROUTES
  // =========================================================================

  // 1. POST /api/ocr y /api/ocr/process
  // Motor único de extracción para boletas/facturas chilenas.
  // La API key de Gemini vive exclusivamente en el servidor.
  app.post(['/api/ocr/process', '/api/ocr'], async (req: Request, res: Response) => {
    try {
      const { image, fileName } = req.body || {};

      if (!image || typeof image !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'No se recibió la imagen del comprobante.',
        });
      }

      const mimeMatch = image.match(/^data:([^;]+);base64,/i);
      const mimeType = (mimeMatch?.[1] || 'image/jpeg').toLowerCase();
      const cleanBase64 = image.replace(/^data:[^;]+;base64,/i, '');

      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(mimeType)) {
        return res.status(415).json({
          success: false,
          error: 'Formato no compatible. Sube una imagen JPG, PNG, WEBP o un PDF.',
        });
      }

      if (!cleanBase64 || cleanBase64.length < 100) {
        return res.status(400).json({
          success: false,
          error: 'La imagen recibida está vacía o dañada.',
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(503).json({
          success: false,
          error: 'El motor OCR no está configurado. Falta GEMINI_API_KEY en el servidor.',
        });
      }

      const prompt = `
Eres un especialista en OCR y documentos tributarios de Chile. Analiza la imagen/documento adjunto y extrae SOLO información que realmente sea visible o claramente inferible del documento. NO inventes valores.

OBJETIVO:
Identificar datos de una boleta, factura, comprobante de pago u otro comprobante chileno.

REGLAS IMPORTANTES:
1. Si un dato no se puede leer con seguridad, devuelve null.
2. No confundas el RUT del emisor con el RUT del cliente/comprador.
3. El folio es el número del documento asociado a "N°", "Folio", "Nº", "Boleta Electrónica" o "Factura Electrónica". No uses números de teléfono, códigos de autorización o números de caja como folio.
4. El montoTotal debe ser el TOTAL/Total a pagar del documento, no el subtotal, vuelto, descuento ni monto pagado con tarjeta.
5. Si aparecen Neto, IVA y Total, extrae los tres. Si no aparecen Neto/IVA, déjalos null; NO los inventes salvo que la relación sea inequívoca.
6. La fecha debe convertirse a AAAA-MM-DD cuando pueda determinarse sin ambigüedad.
7. tipoDocumento debe ser BOLETA_ELECTRONICA, FACTURA_ELECTRONICA, BOLETA_TRANSBANK o COMPROBANTE.
8. razonSocial es el nombre comercial/razón social del EMISOR.
9. glosaSugerida debe ser breve y basada en los productos/servicios visibles. Si no hay suficiente información, null.
10. Si el documento está inclinado, tiene sombras, arrugas o baja calidad, intenta leerlo, pero no rellenes campos dudosos.
11. Ignora códigos QR/PDF417 si no puedes leerlos; el texto impreso tiene prioridad.

DEVUELVE EXCLUSIVAMENTE JSON válido con esta estructura:
{
  "rutEmisor": "string o null",
  "folio": "number o null",
  "fechaEmision": "YYYY-MM-DD o null",
  "tipoDocumento": "BOLETA_ELECTRONICA | FACTURA_ELECTRONICA | BOLETA_TRANSBANK | COMPROBANTE | null",
  "razonSocial": "string o null",
  "montoNeto": "number o null",
  "montoIva": "number o null",
  "montoExento": "number o null",
  "montoTotal": "number o null",
  "glosaSugerida": "string o null"
}
`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  rutEmisor: { type: 'STRING', nullable: true },
                  folio: { type: 'NUMBER', nullable: true },
                  fechaEmision: { type: 'STRING', nullable: true },
                  tipoDocumento: { type: 'STRING', nullable: true },
                  razonSocial: { type: 'STRING', nullable: true },
                  montoNeto: { type: 'NUMBER', nullable: true },
                  montoIva: { type: 'NUMBER', nullable: true },
                  montoExento: { type: 'NUMBER', nullable: true },
                  montoTotal: { type: 'NUMBER', nullable: true },
                  glosaSugerida: { type: 'STRING', nullable: true },
                },
                required: [
                  'rutEmisor', 'folio', 'fechaEmision', 'tipoDocumento',
                  'razonSocial', 'montoNeto', 'montoIva', 'montoExento',
                  'montoTotal', 'glosaSugerida',
                ],
              },
            },
          }),
        },
      );

      if (!geminiResponse.ok) {
        const providerText = await geminiResponse.text();
        console.error('[OCR Gemini] Error proveedor:', geminiResponse.status, providerText.slice(0, 1000));
        return res.status(502).json({
          success: false,
          error: 'El servicio de lectura inteligente no pudo procesar el comprobante. Intenta nuevamente.',
        });
      }

      const providerJson = await geminiResponse.json();
      const textOutput = providerJson?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('') || '';

      let aiData: any;
      try {
        aiData = JSON.parse(textOutput);
      } catch {
        const match = textOutput.match(/\{[\s\S]*\}/);
        if (!match) {
          throw new Error('El motor OCR no devolvió JSON válido.');
        }
        aiData = JSON.parse(match[0]);
      }

      const cleanString = (value: any): string => {
        if (value === null || value === undefined) return '';
        return String(value).trim();
      };

      const cleanMoney = (value: any): number | null => {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
        const raw = String(value).trim().replace(/[$\s]/g, '');
        if (!raw) return null;
        // Formato chileno: 14.990 / 1.234.567. Si hay coma decimal, se interpreta como decimal.
        const normalized = raw.includes(',')
          ? raw.replace(/\./g, '').replace(',', '.')
          : raw.replace(/\./g, '');
        const n = Number(normalized.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(n) ? Math.round(n) : null;
      };

      const rutEmisor = cleanString(aiData.rutEmisor || aiData.rut);
      const folioRaw = cleanMoney(aiData.folio);
      const folio = folioRaw !== null && folioRaw > 0 ? folioRaw : null;
      const montoTotal = cleanMoney(aiData.montoTotal);
      const montoNeto = cleanMoney(aiData.montoNeto);
      const montoIva = cleanMoney(aiData.montoIva);
      const montoExento = cleanMoney(aiData.montoExento) || 0;
      const tipoDocumento = cleanString(aiData.tipoDocumento).toUpperCase() || null;
      const fechaEmision = /^\d{4}-\d{2}-\d{2}$/.test(cleanString(aiData.fechaEmision)) ? cleanString(aiData.fechaEmision) : null;
      const razonSocial = cleanString(aiData.razonSocial) || null;
      const glosaSugerida = cleanString(aiData.glosaSugerida) || null;

      const rutValido = rutEmisor ? validarRutChileno(rutEmisor) : false;
      const tieneDatosMinimos = Boolean(rutEmisor || folio !== null || montoTotal !== null || razonSocial);
      const requiereRevisionManual = !rutValido || folio === null || montoTotal === null || !razonSocial;

      let advertencias: string[] = [];
      if (!rutEmisor) advertencias.push('No se pudo identificar el RUT del emisor.');
      else if (!rutValido) advertencias.push('El RUT detectado no supera la validación Módulo 11; revisar manualmente.');
      if (folio === null) advertencias.push('No se pudo identificar con seguridad el folio.');
      if (montoTotal === null) advertencias.push('No se pudo identificar con seguridad el monto total.');
      if (!razonSocial) advertencias.push('No se pudo identificar la razón social.');

      // Comprobación aritmética: si el documento entrega neto + IVA, deben coincidir con total.
      let inconsistenciaMontos = false;
      if (montoTotal !== null && montoNeto !== null && montoIva !== null) {
        const suma = montoNeto + montoIva + montoExento;
        inconsistenciaMontos = Math.abs(suma - montoTotal) > 2;
        if (inconsistenciaMontos) {
          advertencias.push('Los montos detectados no cuadran con el total; revisar manualmente.');
        }
      }

      const confianzaOcr = !tieneDatosMinimos
        ? 0
        : Math.max(0, Math.min(1,
            (rutValido ? 0.30 : 0) +
            (folio !== null ? 0.20 : 0) +
            (montoTotal !== null ? 0.30 : 0) +
            (razonSocial ? 0.15 : 0) +
            (fechaEmision ? 0.05 : 0) -
            (inconsistenciaMontos ? 0.20 : 0)
          ));

      const extracted = {
        rutEmisor,
        folio: folio ?? '',
        fecha: fechaEmision,
        fechaEmision,
        montoTotal: montoTotal ?? '',
        tipoDocumento: tipoDocumento || 'COMPROBANTE',
        razonSocial: razonSocial || '',
        montoNeto: montoNeto ?? 0,
        montoIva: montoIva ?? 0,
        montoExento,
        glosaSugerida: glosaSugerida || '',
        timbreFiscalDetectado: false,
        confianzaOcr,
        requiereRevisionManual,
        advertencias,
        motor: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      };

      return res.json({
        success: true,
        data: extracted,
        procesadoEn: new Date().toISOString(),
        archivo: fileName || null,
      });
    } catch (error: any) {
      console.error('[OCR Error]:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || 'Error inesperado durante el procesamiento OCR del comprobante.',
      });
    }
  });

  // 1.5. POST /api/storage/subir (sube archivo a Supabase Storage bucket 'rendiciones-idiem')
  app.post('/api/storage/subir', upload.any(), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const file = req.file || (files && files.length > 0 ? (files.find(f => f.fieldname === 'file' || f.fieldname === 'comprobante') || files[0]) : undefined);

      let fileBuffer: Buffer | string = 'dummy_receipt';
      let fileName = `dte_${Date.now()}.jpg`;
      let mimeType = 'image/jpeg';

      if (file) {
        fileBuffer = file.buffer;
        fileName = file.originalname || fileName;
        mimeType = file.mimetype || mimeType;
      } else if (req.body && req.body.comprobanteBase64) {
        const base64Str = req.body.comprobanteBase64;
        const mimeMatch = base64Str.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
        if (mimeMatch) mimeType = mimeMatch[1];
        const clean = base64Str.replace(/^data:[^;]+;base64,/, '');
        fileBuffer = Buffer.from(clean, 'base64');
      }

      const comprobanteUrl = await subirComprobanteSupabase(fileBuffer, fileName, mimeType);

      res.json({
        success: true,
        comprobanteUrl,
        bucket: 'rendiciones-idiem',
        fileName,
        mensaje: 'Comprobante almacenado exitosamente en Supabase Storage.',
      });
    } catch (error: any) {
      console.error('[Error /api/storage/subir]:', error);
      const mensajeError = error?.message || 'Error al almacenar el archivo en Supabase Storage';
      res.status(500).json({ success: false, error: mensajeError });
    }
  });

  // 2. POST /api/rendiciones/crear (soporta multipart/form-data con 'file' o 'comprobante' y application/json)
  app.post('/api/rendiciones/crear', upload.any(), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const files = req.files as Express.Multer.File[] | undefined;
      const file = req.file || (files && files.length > 0 ? (files.find(f => f.fieldname === 'file' || f.fieldname === 'comprobante') || files[0]) : undefined);

      const glosa = body.glosa || 'Adquisición de insumos técnicos operacionales';
      const centroCostoId = body.centroCostoId || '22222222-2222-2222-2222-222222222222';
      const usuarioId = body.usuarioId || '33333333-3333-3333-3333-333333333333';
      const centroCosto = body.centroCosto || body.centroCostoCodigo || 'CC-402';
      const tipoDocumento = body.tipoDocumento || 'BOLETA_ELECTRONICA';
      const rutEmisor = body.rutEmisor || '';
      const razonSocial = body.razonSocial || body.razonSocialEmisor || '';
      const folio = Number(body.folioDte || body.folio || 0);
      const montoTotal = Number(body.montoTotal || 0);

      // 1. Guardar la foto/comprobante EXCLUSIVAMENTE en Supabase Storage (bucket 'rendiciones-idiem') si no fue subido previamente
      let comprobanteUrl = body.comprobanteUrl || '';
      if (!comprobanteUrl) {
        let fileBuffer: Buffer | string = 'dummy_receipt';
        let fileName = `dte_${folio}_${Date.now()}.jpg`;
        let mimeType = 'image/jpeg';

        if (file) {
          fileBuffer = file.buffer;
          fileName = file.originalname || fileName;
          mimeType = file.mimetype || mimeType;
        } else if (body.comprobanteBase64) {
          const base64Str = body.comprobanteBase64;
          const mimeMatch = base64Str.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
          if (mimeMatch) mimeType = mimeMatch[1];
          const clean = base64Str.replace(/^data:[^;]+;base64,/, '');
          fileBuffer = Buffer.from(clean, 'base64');
        }

        comprobanteUrl = await subirComprobanteSupabase(fileBuffer, fileName, mimeType);
      }

      // 2. Validación tributaria ante el SII
      const resultadoSii = await consultarValidezDTE({
        rutEmisor,
        folio,
        montoTotal,
        tipoDte: tipoDocumento.toUpperCase().includes('FACTURA') ? 33 : 39,
      });

      if (resultadoSii.estado === 'RECHAZADO') {
        return res.status(422).json({
          success: false,
          error: resultadoSii.glosaSii || 'Comprobante no válido tributariamente ante el SII. No se ha guardado en la base de datos.',
          sii: resultadoSii,
        });
      }

      const montoNum = Number(montoTotal);
      const netoNum = Math.round(montoNum / 1.19);
      const ivaNum = Math.round(montoNum - netoNum);

      const nuevoFolioNum = 8961 + Math.floor(Math.random() * 20);
      const nuevoFolio = `#RD-${nuevoFolioNum}`;

      // 3. Persistir en las tablas 'rendiciones' y 'detalles_gastos' de Supabase
      await insertarRendicionEnSupabase({
        folioInterno: nuevoFolio,
        glosa,
        montoTotal: montoNum,
        montoNeto: netoNum,
        montoIva: ivaNum,
        tipoDocumento,
        rutEmisor,
        razonSocialEmisor: razonSocial,
        folioDte: folio,
        estadoSii: resultadoSii.estado,
        timbreSiiHash: resultadoSii.codigoVerificacion,
        comprobanteUrl,
        respuestaSii: resultadoSii,
      });

      // 4. Actualizar estado reactivo local
      const nuevaRendicion = {
        id: `rd-${nuevoFolioNum}`,
        folio: nuevoFolio,
        fecha: '14/05',
        fechaCompleta: new Date().toISOString(),
        rendidor: req.body.rendidor || 'Usuario IDIEM',
        rendidorCorto: 'U. IDIEM',
        rendidorAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDX2nizxPLkQzholIPJ7qIqYG6XhetelcnYj0fttxR0irYOm1p9rhAuHMvKL6tO5ONyn2wK0kT77W1yZmXpjGT2GaDELIKWh310KGiPwccIphpI1ZiUH7rr-SCdJoTo51lzlTSxuNgp5T6U_lbPl67Yd9_jsbK1CH12-ym4yQoetA8dHsN141XRvC_1aWiZXjMfKw4lAfbgyBCNSVMhKCxVc-PiiNEIOnSZ9PmWNwgAwkXyC9kgN90XPA',
        rutRendidor: req.body.rutRendidor || '16.892.341-2',
        centroCosto,
        centroCostoNombre: centroCosto === 'CC-402' ? 'LEMat - Laboratorio de Estructuras y Materiales' : 'División Ensayos IDIEM',
        rutProveedor: formatearRut(rutEmisor),
        razonSocial,
        giroProveedor: 'Suministros Técnicos Industriales',
        glosa,
        montoBruto: montoNum,
        montoNeto: netoNum,
        montoIva: ivaNum,
        montoExento: 0,
        estadoSii: resultadoSii.estado,
        folioDte: Number(folio),
        tipoDte: tipoDocumento.toUpperCase().includes('FACTURA') ? 'Factura Electrónica' : 'Boleta Electrónica',
        estado: 'PENDIENTE',
        estadoPago: 'En Revisión',
        imputacion: glosa,
        comprobanteUrl: comprobanteUrl,
        timbreSiiHash: resultadoSii.codigoVerificacion,
        revisorObservacion: null,
      };

      rendicionesDb.unshift(nuevaRendicion);

      res.json({
        success: true,
        mensaje: `Rendición ${nuevoFolio} creada y comprobante subido a Supabase Storage ('rendiciones-idiem').`,
        rendicion: nuevaRendicion,
        comprobanteUrl: comprobanteUrl,
        sii: resultadoSii,
      });
    } catch (error: any) {
      console.error('[Error /api/rendiciones/crear]:', error);
      const mensajeError = error?.message || 'Error inesperado al crear y persistir la rendición de gastos';
      res.status(500).json({ success: false, error: mensajeError });
    }
  });

  // 3. PATCH /api/rendiciones/:id/estado
  app.patch('/api/rendiciones/:id/estado', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { estado, observaciones } = req.body;

      const rendicion = rendicionesDb.find(r => r.id.toLowerCase() === id.toLowerCase() || r.folio.toLowerCase().includes(id.toLowerCase()));

      if (!rendicion) {
        return res.status(404).json({ error: 'Rendición no encontrada' });
      }

      rendicion.estado = estado;
      rendicion.revisorObservacion = observaciones || (estado === 'APROBADO' ? 'Aprobado por Jefatura' : 'Observado por Jefatura');
      if (estado === 'APROBADO') {
        rendicion.estadoPago = 'Por Liquidar';
      } else if (estado === 'RECHAZADO') {
        rendicion.estadoPago = 'Rechazado';
      }

      res.json({
        success: true,
        mensaje: `Rendición ${rendicion.folio} actualizada a ${estado}.`,
        rendicion,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. GET /api/admin/usuarios-activos-mensuales
  app.get('/api/admin/usuarios-activos-mensuales', async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const defaultPeriodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const periodo = (req.query.periodo as string) || defaultPeriodo;

      const resultado = await obtenerUsuariosActivosMes(periodo);

      // Si no hay datos en Supabase, calcular a partir de rendiciones en memoria para resiliencia
      let usuarios = resultado.usuarios;
      let totalUsuariosActivos = resultado.totalUsuariosActivos;
      let totalBoletasMes = resultado.totalBoletasMes;
      let montoTotalMes = resultado.montoTotalMes;

      if (totalUsuariosActivos === 0 && rendicionesDb.length > 0) {
        const mapaUsuarios = new Map<string, any>();
        for (const r of rendicionesDb) {
          const rut = r.rutRendidor || '16.892.341-2';
          if (!mapaUsuarios.has(rut)) {
            mapaUsuarios.set(rut, {
              id: `usr-${rut}`,
              periodo,
              rut_usuario: rut,
              nombre_usuario: r.rendidor || 'Rendidor IDIEM',
              centro_costo: r.centroCosto || 'CC-402',
              total_boletas_mes: 1,
              monto_total_rendido: Number(r.montoBruto) || 0,
              ultima_rendicion_at: r.fechaCompleta || new Date().toISOString(),
            });
          } else {
            const u = mapaUsuarios.get(rut);
            u.total_boletas_mes += 1;
            u.monto_total_rendido += Number(r.montoBruto) || 0;
          }
        }
        usuarios = Array.from(mapaUsuarios.values());
        totalUsuariosActivos = usuarios.length;
        totalBoletasMes = usuarios.reduce((a, b) => a + b.total_boletas_mes, 0);
        montoTotalMes = usuarios.reduce((a, b) => a + b.monto_total_rendido, 0);
      }

      const valorUfClp = 37850;
      const feePorUsuarioUf = 0.45;
      const feePorUsuarioClp = Math.round(feePorUsuarioUf * valorUfClp);
      const totalFeeClp = totalUsuariosActivos * feePorUsuarioClp;
      const totalFeeUf = Number((totalUsuariosActivos * feePorUsuarioUf).toFixed(2));

      res.json({
        success: true,
        periodo,
        totalUsuariosActivos,
        totalBoletasMes,
        montoTotalMes,
        feePorUsuarioUf,
        feePorUsuarioClp,
        totalFeeClp,
        totalFeeUf,
        reglaCobro: '1 usuario activo = 1 fee mensual (independiente de si rinde 1 o 20 boletas)',
        usuarios,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 4.5. GET /api/admin/reporte-facturacion (Reporte consolidado de facturación mensual)
  app.get('/api/admin/reporte-facturacion', async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const mes = parseInt((req.query.mes as string) || String(now.getMonth() + 1), 10);
      const anio = parseInt((req.query.anio as string) || String(now.getFullYear()), 10);
      const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

      const resActivos = await obtenerUsuariosActivosMes(periodo);
      let usuariosActivos = resActivos.totalUsuariosActivos;
      let totalBoletas = resActivos.totalBoletasMes;
      let montoTotalRendido = resActivos.montoTotalMes;

      if (usuariosActivos === 0 && rendicionesDb.length > 0) {
        const uniqueRuts = new Set(rendicionesDb.map(r => r.rutRendidor || '16.892.341-2'));
        usuariosActivos = uniqueRuts.size;
        totalBoletas = rendicionesDb.length;
        montoTotalRendido = rendicionesDb.reduce((acc, r) => acc + (Number(r.montoBruto) || 0), 0);
      }

      const valorUfEstimadoClp = 37850;
      const licenciasTotales = 60;
      const costoPorUsuarioUf = 0.45;
      const subtotalUf = Number((usuariosActivos * costoPorUsuarioUf).toFixed(2));
      const subtotalClp = Math.round(subtotalUf * valorUfEstimadoClp);

      res.json({
        success: true,
        periodo: { mes, anio, periodo, etiqueta: `Período ${periodo}` },
        facturacion: {
          organizacion: 'IDIEM Universidad de Chile',
          rut: '60.910.000-1',
          usuariosActivos,
          licenciasTotales,
          cuposDisponibles: Math.max(0, licenciasTotales - usuariosActivos),
          tasaUso: `${Math.round((usuariosActivos / licenciasTotales) * 100)}%`,
          rendicionesTramitadas: totalBoletas,
          montoTotalRendidoClp: montoTotalRendido,
          costoPorUsuarioUf,
          subtotalUf,
          subtotalClp,
          iva19Clp: Math.round(subtotalClp * 0.19),
          totalFacturadoClp: Math.round(subtotalClp * 1.19),
          reglaCobro: '1 usuario activo = 1 fee mensual (independiente de si rinde 1 o 20 boletas)',
          usuarios: resActivos.usuarios,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. GET /api/rendiciones
  app.get('/api/rendiciones', (req: Request, res: Response) => {
    res.json({
      success: true,
      rendiciones: rendicionesDb,
      total: rendicionesDb.length,
    });
  });

  // 6. POST /api/sii/validar
  app.post('/api/sii/validar', async (req: Request, res: Response) => {
    try {
      const { rutEmisor, folio, montoTotal, tipoDte = 39, fechaEmision } = req.body || {};
      if (!rutEmisor || !folio || !montoTotal) {
        return res.status(400).json({
          success: false,
          valido: false,
          estado: 'DATOS_INCOMPLETOS',
          error: 'Se requiere RUT del emisor, folio y monto total para consultar el SII.',
        });
      }
      const resultado = await consultarValidezDTE({
        rutEmisor,
        folio,
        montoTotal,
        tipoDte,
        fechaEmision,
      });
      return res.status(resultado.estado === 'ACEPTADO' ? 200 : 422).json({
        success: resultado.estado === 'ACEPTADO',
        valido: resultado.estado === 'ACEPTADO',
        estado: resultado.estado,
        resultado,
        mensaje: resultado.glosaSii,
      });
    } catch (error: any) {
      console.error('[Error /api/sii/validar]:', error);
      return res.status(500).json({ success: false, valido: false, error: error?.message || 'Error validando el documento ante el SII.' });
    }
  });

  // =========================================================================
  // VITE INTEGRATION
  // =========================================================================
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[IDIEM Gastos Server] Escuchando en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Fatal Server Startup Error]:', err);
});
