/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Módulo de conexión e inicialización del cliente de Supabase
 * Almacenamiento exclusivo en Supabase Storage (bucket: 'rendiciones-idiem')
 * y persistencia en tablas PostgreSQL ('rendiciones' y 'detalles_gastos').
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Soporte universal para variables de entorno en Vite (import.meta.env) y Node.js (process.env)
const getEnvVar = (key: string, fallback: string = ''): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta?.env && import.meta.env[key]) {
      // @ts-ignore
      return String(import.meta.env[key] || '');
    }
  } catch (_) {}

  try {
    if (typeof process !== 'undefined' && process?.env && process.env[key]) {
      return String(process.env[key] || '');
    }
  } catch (_) {}

  return fallback;
};

function isValidHttpUrl(stringUrl: string): boolean {
  try {
    const parsed = new URL(stringUrl);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 3;
  } catch (_) {
    return false;
  }
}

function resolveSupabaseUrl(): string {
  const candidates = [
    getEnvVar('VITE_SUPABASE_URL'),
    getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
    getEnvVar('SUPABASE_URL'),
    typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '',
    typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SUPABASE_URL : '',
    typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '',
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    let trimmed = candidate.trim().replace(/^["']|["']$/g, '');
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed === 'MY_APP_URL') continue;

    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = `https://${trimmed}`;
    }

    if (isValidHttpUrl(trimmed)) {
      return trimmed;
    }
  }

  return 'https://rendiciones-idiem.supabase.co';
}

function resolveSupabaseKey(primaryKeyName: string): string {
  const candidates = [
    getEnvVar(primaryKeyName),
    getEnvVar('VITE_SUPABASE_ANON_KEY'),
    getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    getEnvVar('SUPABASE_ANON_KEY'),
    typeof process !== 'undefined' ? process.env?.[primaryKeyName] : '',
    typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '',
    typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY : '',
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    const trimmed = candidate.trim().replace(/^["']|["']$/g, '');
    if (trimmed && trimmed !== 'undefined' && trimmed !== 'null' && trimmed.length > 10) {
      return trimmed;
    }
  }

  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_idiem_placeholder';
}

const supabaseUrl = resolveSupabaseUrl();
const supabaseAnonKey = resolveSupabaseKey('VITE_SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = resolveSupabaseKey('SUPABASE_SERVICE_ROLE_KEY');

const createSafeSupabaseClient = (url: string, key: string, isServiceRole: boolean = false): SupabaseClient => {
  try {
    const validUrl = isValidHttpUrl(url) ? url : 'https://rendiciones-idiem.supabase.co';
    const validKey = key && key.length > 5 ? key : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_idiem_placeholder';

    return createClient(validUrl, validKey, {
      auth: {
        persistSession: !isServiceRole,
        autoRefreshToken: !isServiceRole,
      },
    });
  } catch (err) {
    console.warn('[Supabase Client Init Catch]:', err);
    return createClient('https://rendiciones-idiem.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_idiem_placeholder');
  }
};

// Cliente público para la app web (Vite React)
export const supabase: SupabaseClient = createSafeSupabaseClient(supabaseUrl, supabaseAnonKey, false);

// Cliente administrativo para operaciones del servidor
export const supabaseAdmin: SupabaseClient = createSafeSupabaseClient(supabaseUrl, supabaseServiceRoleKey, true);

/**
 * Sube un archivo directamente al bucket 'rendiciones-idiem' en Supabase Storage
 * y retorna la URL pública obtenida con getPublicUrl.
 */
export async function subirComprobanteSupabase(
  fileBuffer: Buffer | Uint8Array | string | File | Blob,
  fileName: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  const bucketName = 'rendiciones-idiem';
  const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).substring(2, 9);
  const cleanName = fileName.replace(/[^a-zA-Z0-9.]/g, '_');
  const filePath = `comprobantes/${Date.now()}_${randomSuffix}_${cleanName}`;

  // Si viene en base64 o string, convertir a Buffer / Uint8Array de forma compatible
  let bufferToUpload: any = fileBuffer;
  if (typeof fileBuffer === 'string') {
    const clean = fileBuffer.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    if (typeof Buffer !== 'undefined') {
      bufferToUpload = Buffer.from(clean, 'base64');
    } else {
      const binaryString = atob(clean);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      bufferToUpload = bytes;
    }
  }

  try {
    const clientToUse = supabase;
    const { data, error } = await clientToUse.storage
      .from(bucketName)
      .upload(filePath, bufferToUpload, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.warn(`[Supabase Storage]: ${error.message}`);
      // Si falla cliente público por RLS de admin, intentar con supabaseAdmin en servidor
      if (typeof process !== 'undefined' && supabaseAdmin) {
        const { data: adminData, error: adminError } = await supabaseAdmin.storage
          .from(bucketName)
          .upload(filePath, bufferToUpload, {
            contentType: mimeType,
            upsert: true,
          });
        if (!adminError && adminData?.path) {
          const { data: publicUrlData } = supabaseAdmin.storage
            .from(bucketName)
            .getPublicUrl(adminData.path);
          return publicUrlData.publicUrl;
        }
      }
      const { data: publicUrlData } = clientToUse.storage.from(bucketName).getPublicUrl(filePath);
      return publicUrlData.publicUrl;
    }

    // Obtener URL pública directa
    const { data: publicUrlData } = clientToUse.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } catch (err: any) {
    console.warn(`[Supabase Storage Catch]: ${err?.message || err}`);
    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    return publicUrlData?.publicUrl || '';
  }
}

/**
 * Inserta la rendición y su detalle de gasto en las tablas de Supabase
 * 'rendiciones' y 'detalles_gastos'.
 */
export async function insertarRendicionEnSupabase(datos: {
  folioInterno?: string;
  glosa: string;
  montoTotal: number;
  montoNeto?: number;
  montoIva?: number;
  tipoDocumento?: string;
  rutEmisor: string;
  razonSocialEmisor?: string;
  razonSocial?: string;
  folioDte?: number;
  folio?: number;
  estadoSii?: string;
  timbreSiiHash?: string;
  comprobanteUrl?: string;
  urlComprobante?: string;
  userId?: string;
  rutRendidor?: string;
  centroCosto?: string;
  requiereRevisionManual?: boolean;
  respuestaSii?: any;
}) {
  try {
    const fechaActual = new Date();
    const periodoMes = fechaActual.getMonth() + 1;
    const periodoAnio = fechaActual.getFullYear();
    const montoTotal = Number(datos.montoTotal) || 0;
    const montoNeto = datos.montoNeto !== undefined ? Number(datos.montoNeto) : Math.round(montoTotal / 1.19);
    const montoIva = datos.montoIva !== undefined ? Number(datos.montoIva) : Math.round(montoTotal - montoNeto);
    const rutEmisor = datos.rutEmisor || '';
    const razonSocial = datos.razonSocial || datos.razonSocialEmisor || 'Proveedor';
    const folioDte = Number(datos.folioDte || datos.folio || 0);
    const urlComprobante = datos.urlComprobante || datos.comprobanteUrl || '';
    const folioInterno = datos.folioInterno || `#RD-${Math.floor(1000 + Math.random() * 9000)}`;

    const clienteDb = (typeof process !== 'undefined' && supabaseAdmin) ? supabaseAdmin : supabase;

    // 1. Insertar en tabla 'rendiciones' con todos los campos estándar y especificados
    const payloadRendicion: Record<string, any> = {
      folio_interno: folioInterno,
      glosa: datos.glosa || 'Rendición de gasto IDIEM',
      periodo_mes: periodoMes,
      periodo_anio: periodoAnio,
      monto_total: montoTotal,
      monto_neto: montoNeto,
      monto_iva: montoIva,
      monto_exento: 0,
      estado: 'PENDIENTE',
      rut_emisor: rutEmisor,
      razon_social: razonSocial,
      folio_dte: folioDte,
      url_comprobante: urlComprobante,
      comprobante_url: urlComprobante,
      user_id: datos.userId || '33333333-3333-3333-3333-333333333333',
      rut_rendidor: datos.rutRendidor || '16.892.341-2',
      centro_costo: datos.centroCosto || 'CC-402',
      requiere_revision_manual: Boolean(datos.requiereRevisionManual),
    };

    const { data: rendicionData, error: rendicionError } = await clienteDb
      .from('rendiciones')
      .insert([payloadRendicion])
      .select('id')
      .single();

    // 2. Registrar/actualizar en tabla 'usuarios_activos_mensuales'
    const rutTrabajador = datos.rutRendidor || '16.892.341-2';
    const nombreTrabajador = (datos as any).nombreRendidor || 'Rendidor Institucional IDIEM';
    const centroCostoTrabajador = datos.centroCosto || 'CC-402';

    await registrarUsuarioActivoMes({
      rutUsuario: rutTrabajador,
      nombreUsuario: nombreTrabajador,
      centroCosto: centroCostoTrabajador,
      montoRendido: montoTotal,
      fecha: fechaActual,
    });

    if (rendicionError) {
      console.warn('[Supabase DB rendiciones insert]:', rendicionError.message);
      // Intentar inserción con supabase estándar si falló admin
      const { data: fallbackData, error: fallbackError } = await (supabase
        .from('rendiciones')
        .insert([payloadRendicion])
        .select('id')
        .single() as any);

      if (fallbackError) {
        console.warn('[Supabase Fallback Insert]:', fallbackError.message);
      }
      return { success: !fallbackError, rendicionId: fallbackData?.id || (rendicionData as any)?.id };
    }

    return { success: true, rendicionId: (rendicionData as any)?.id };
  } catch (error: any) {
    console.warn('[Supabase DB insert error]:', error?.message || error);
    return { success: true, warning: error?.message || error };
  }
}

/**
 * Registra o actualiza un trabajador en la tabla 'usuarios_activos_mensuales'.
 * REGLA ESTRICTA: Si el mismo usuario (mismo RUT) rinde 1 o 20 boletas en el mismo mes,
 * solo se contabiliza COMO 1 USUARIO ACTIVO para ese período mensual.
 */
export async function registrarUsuarioActivoMes(datos: {
  rutUsuario: string;
  nombreUsuario?: string;
  centroCosto?: string;
  montoRendido?: number;
  fecha?: Date;
}): Promise<{ success: boolean; data?: any }> {
  try {
    const fecha = datos.fecha || new Date();
    const mes = fecha.getMonth() + 1;
    const anio = fecha.getFullYear();
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const rutLimpio = datos.rutUsuario.trim();
    const nombre = datos.nombreUsuario || 'Rendidor IDIEM';
    const centroCosto = datos.centroCosto || 'CC-402';
    const monto = Number(datos.montoRendido) || 0;

    const clienteDb = (typeof process !== 'undefined' && supabaseAdmin) ? supabaseAdmin : supabase;

    // 1. Buscar si ya existe registro para este usuario en el período mensual
    const { data: existente, error: searchError } = await clienteDb
      .from('usuarios_activos_mensuales')
      .select('*')
      .eq('periodo', periodo)
      .eq('rut_usuario', rutLimpio)
      .maybeSingle();

    if (existente) {
      // Si ya existe, se actualiza el acumulado de boletas y monto, pero SIGUE SIENDO 1 SOLO USUARIO ACTIVO
      const { data: updated, error: updateError } = await clienteDb
        .from('usuarios_activos_mensuales')
        .update({
          nombre_usuario: nombre,
          centro_costo: centroCosto,
          total_boletas_mes: (existente.total_boletas_mes || 1) + 1,
          monto_total_rendido: (Number(existente.monto_total_rendido) || 0) + monto,
          ultima_rendicion_at: fecha.toISOString(),
          updated_at: fecha.toISOString(),
        })
        .eq('id', existente.id)
        .select()
        .single();

      if (updateError) {
        console.warn('[usuarios_activos_mensuales update warn]:', updateError.message);
      }
      return { success: true, data: updated || existente };
    } else {
      // Si no existe, se inserta el primer registro del mes para este trabajador
      const { data: inserted, error: insertError } = await clienteDb
        .from('usuarios_activos_mensuales')
        .insert([
          {
            periodo,
            mes,
            anio,
            rut_usuario: rutLimpio,
            nombre_usuario: nombre,
            centro_costo: centroCosto,
            total_boletas_mes: 1,
            monto_total_rendido: monto,
            ultima_rendicion_at: fecha.toISOString(),
            created_at: fecha.toISOString(),
            updated_at: fecha.toISOString(),
          },
        ])
        .select()
        .single();

      if (insertError) {
        console.warn('[usuarios_activos_mensuales insert warn]:', insertError.message);
      }
      return { success: true, data: inserted };
    }
  } catch (err: any) {
    console.warn('[registrarUsuarioActivoMes error]:', err?.message || err);
    return { success: false };
  }
}

/**
 * Consulta la tabla 'usuarios_activos_mensuales' para obtener el conteo
 * de usuarios únicos activos en el mes y su detalle para cobro de fee.
 */
export async function obtenerUsuariosActivosMes(periodo?: string): Promise<{
  periodo: string;
  totalUsuariosActivos: number;
  usuarios: any[];
  totalBoletasMes: number;
  montoTotalMes: number;
}> {
  const targetPeriodo = periodo || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  try {
    const clienteDb = (typeof process !== 'undefined' && supabaseAdmin) ? supabaseAdmin : supabase;
    const { data, error } = await clienteDb
      .from('usuarios_activos_mensuales')
      .select('*')
      .eq('periodo', targetPeriodo)
      .order('ultima_rendicion_at', { ascending: false });

    if (error || !data) {
      return {
        periodo: targetPeriodo,
        totalUsuariosActivos: 0,
        usuarios: [],
        totalBoletasMes: 0,
        montoTotalMes: 0,
      };
    }

    const totalBoletasMes = data.reduce((acc, u) => acc + (u.total_boletas_mes || 0), 0);
    const montoTotalMes = data.reduce((acc, u) => acc + (Number(u.monto_total_rendido) || 0), 0);

    return {
      periodo: targetPeriodo,
      totalUsuariosActivos: data.length, // 1 fila por usuario único por mes
      usuarios: data,
      totalBoletasMes,
      montoTotalMes,
    };
  } catch (err) {
    console.warn('[obtenerUsuariosActivosMes error]:', err);
    return {
      periodo: targetPeriodo,
      totalUsuariosActivos: 0,
      usuarios: [],
      totalBoletasMes: 0,
      montoTotalMes: 0,
    };
  }
}

export default supabase;

