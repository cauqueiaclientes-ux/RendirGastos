/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Componente Visual de Vista Previa para Archivo Cargado
 * Muestra el documento escaneado, spinner de procesamiento y resalta
 * los campos clave detectados automáticamente por el OCR (RUT, Folio, Monto)
 * antes de que el usuario confirme el envío.
 */

import React from 'react';

export interface DetectedVoucherData {
  tipoDocumento: string;
  rutEmisor: string;
  razonSocial: string;
  fechaEmision: string;
  montoTotal: number;
  montoNeto: number;
  montoIva: number;
  folio: number;
  timbradoDigital: string;
  imagenUrl: string;
}

interface ComprobantePreviewCardProps {
  fileName: string | null;
  fileSize?: string;
  isProcessing: boolean;
  stepMessage: string;
  stepStatus: 'IDLE' | 'STORAGE' | 'OCR' | 'VALIDATING_SII' | 'SAVING_DB' | 'SUCCESS' | 'REJECTED';
  siiError: string | null;
  rutRequiereRevision?: boolean;
  voucherData: DetectedVoucherData;
  uploadedSupabaseUrl: string | null;
  isConfirmed: boolean;
  isSubmitting: boolean;
  onConfirmarEnvio: () => void;
  onCambiarArchivo: () => void;
  onCopiarUrl?: () => void;
  copiedUrl?: boolean;
}

export const ComprobantePreviewCard: React.FC<ComprobantePreviewCardProps> = ({
  fileName,
  fileSize = '1.8 MB',
  isProcessing,
  stepMessage,
  stepStatus,
  siiError,
  rutRequiereRevision = false,
  voucherData,
  uploadedSupabaseUrl,
  isConfirmed,
  isSubmitting,
  onConfirmarEnvio,
  onCambiarArchivo,
  onCopiarUrl,
  copiedUrl = false,
}) => {
  return (
    <div className="bg-white rounded-2xl border-2 border-[#b6c4ff] shadow-md overflow-hidden transition-all animate-fadeIn">
      {/* Encabezado del Componente de Vista Previa */}
      <div className="bg-gradient-to-r from-[#00236f] to-[#0038a8] px-4 py-3 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[#85f8c4]">
            preview
          </span>
          <div>
            <h3 className="text-[13px] font-bold tracking-tight">
              Vista Previa de Comprobante
            </h3>
            <p className="text-[10px] text-[#d3e4fe] font-mono">
              {fileName || 'comprobante_dte_digital.jpg'} {fileSize ? `(${fileSize})` : ''}
            </p>
          </div>
        </div>

        {/* Badge de Estado del Procesamiento */}
        <div>
          {isProcessing ? (
            <span className="inline-flex items-center gap-1.5 bg-amber-400 text-amber-950 text-[10px] font-bold px-2.5 py-1 rounded-full animate-pulse shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-900 animate-ping" />
              Procesando OCR...
            </span>
          ) : rutRequiereRevision ? (
            <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
              <span className="material-symbols-outlined text-[13px]">edit_note</span>
              Requiere Revisión Manual
            </span>
          ) : isConfirmed ? (
            <span className="inline-flex items-center gap-1 bg-[#85f8c4] text-[#002114] text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
              <span className="material-symbols-outlined text-[13px]">verified</span>
              Confirmado y Guardado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-[#d3e4fe] text-[#00236f] text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
              <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
              Detectado por OCR
            </span>
          )}
        </div>
      </div>

      {/* Cuerpo Principal: Imagen Escaneada + Campos Detectados Resaltados */}
      <div className="p-4 flex flex-col md:flex-row gap-4">
        {/* Columna Izquierda: Imagen / Miniatura con overlay de carga y efecto de escaneo láser */}
        <div className="relative w-full md:w-44 h-48 md:h-auto min-h-[190px] bg-slate-900 rounded-xl overflow-hidden shrink-0 border border-slate-200 shadow-inner flex items-center justify-center group">
          <img
            src={voucherData.imagenUrl}
            alt="Vista previa del comprobante"
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isProcessing ? 'opacity-35 scale-105 filter blur-xs' : 'opacity-95'
            }`}
          />

          {/* Overlay Spinner de Carga durante el procesamiento */}
          {isProcessing && (
            <div className="absolute inset-0 bg-[#00174e]/70 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center text-white z-10">
              <div className="w-10 h-10 rounded-full border-3 border-[#85f8c4] border-t-transparent animate-spin mb-2" />
              <span className="text-[12px] font-bold text-white tracking-wide">
                Analizando DTE...
              </span>
              <span className="text-[10px] text-[#d3e4fe] font-mono mt-1 px-1 line-clamp-2">
                {stepMessage || 'Detectando campos tributarios con OCR'}
              </span>

              {/* Línea animada de escaneo visual estilo láser */}
              <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#85f8c4] to-transparent shadow-[0_0_12px_#85f8c4] animate-[bounce_1.5s_infinite]" />
            </div>
          )}

          {/* Insignia de Folio sobre la imagen */}
          {!isProcessing && (
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <span className="bg-[#00236f]/90 backdrop-blur text-white text-[10px] font-mono px-2 py-0.5 rounded-md font-bold shadow-sm">
                Folio #{voucherData.folio}
              </span>
              <a
                href={voucherData.imagenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white/90 text-[#00236f] p-1 rounded-md hover:bg-white text-[10px] flex items-center shadow-sm"
                title="Ampliar imagen"
              >
                <span className="material-symbols-outlined text-[14px]">zoom_in</span>
              </a>
            </div>
          )}
        </div>

        {/* Columna Derecha: Campos Detectados Automáticamente por el OCR Resaltados */}
        <div className="flex-1 flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#00236f] text-[18px]">
                document_scanner
              </span>
              <span className="text-[12px] font-bold text-[#0b1c30]">
                Campos detectados automáticamente:
              </span>
            </div>
            <span className="bg-[#eff4ff] text-[#00236f] text-[10px] font-mono font-bold px-2 py-0.5 rounded">
              3 CAMPOS CLAVE
            </span>
          </div>

          {/* 1. CAMPO RESALTADO: RUT EMISOR */}
          <div className={`p-2.5 rounded-xl border-2 shadow-xs relative transition-all ${
            rutRequiereRevision
              ? 'border-amber-500 bg-amber-50/80 hover:bg-amber-50'
              : 'border-emerald-500 bg-emerald-50/70 hover:bg-emerald-50'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <div className={`flex items-center gap-1 text-[11px] font-bold ${
                rutRequiereRevision ? 'text-amber-900' : 'text-emerald-900'
              }`}>
                <span className={`material-symbols-outlined text-[15px] ${
                  rutRequiereRevision ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  badge
                </span>
                <span>RUT Emisor Detectado</span>
              </div>
              {rutRequiereRevision ? (
                <span className="inline-flex items-center gap-1 bg-amber-200 text-amber-950 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                  RUT requiere revisión manual
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-emerald-200 text-emerald-900 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  Módulo 11 OK
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`font-mono text-[16px] font-extrabold tracking-wide ${
                rutRequiereRevision ? 'text-amber-950' : 'text-emerald-950'
              }`}>
                {voucherData.rutEmisor}
              </span>
              <span className={`text-[10px] truncate max-w-[150px] font-medium ${
                rutRequiereRevision ? 'text-amber-800' : 'text-emerald-700'
              }`}>
                {voucherData.razonSocial}
              </span>
            </div>
          </div>

          {/* 2. CAMPO RESALTADO: FOLIO DTE */}
          <div className="p-2.5 rounded-xl border-2 border-indigo-500 bg-indigo-50/70 shadow-xs relative transition-all hover:bg-indigo-50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-900">
                <span className="material-symbols-outlined text-[15px] text-indigo-700">
                  tag
                </span>
                <span>Folio DTE Detectado</span>
              </div>
              <span className="inline-flex items-center gap-1 bg-indigo-200 text-indigo-900 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                <span className="material-symbols-outlined text-[11px]">verified</span>
                Timbre TED Válido
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[16px] font-extrabold text-indigo-950">
                #{voucherData.folio}
              </span>
              <span className="text-[10px] text-indigo-700 font-medium">
                {voucherData.tipoDocumento}
              </span>
            </div>
          </div>

          {/* 3. CAMPO RESALTADO: MONTO TOTAL */}
          <div className="p-2.5 rounded-xl border-2 border-blue-600 bg-blue-50/80 shadow-xs relative transition-all hover:bg-blue-50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#00236f]">
                <span className="material-symbols-outlined text-[15px] text-[#00236f]">
                  payments
                </span>
                <span>Monto Total Detectado</span>
              </div>
              <span className="inline-flex items-center gap-1 bg-blue-200 text-blue-900 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                19% IVA Incluido
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[19px] font-black text-[#00236f]">
                ${voucherData.montoTotal.toLocaleString('es-CL')} CLP
              </span>
              <div className="flex gap-2 text-[10px] font-mono text-blue-800">
                <span>Neto: ${voucherData.montoNeto.toLocaleString('es-CL')}</span>
                <span>•</span>
                <span>IVA: ${voucherData.montoIva.toLocaleString('es-CL')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Aviso visual cuando el RUT requiere revisión manual por OCR */}
      {rutRequiereRevision && !siiError && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-2 text-amber-900 text-[11px] animate-fadeIn">
          <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0 mt-0.5">
            warning
          </span>
          <div className="flex-1">
            <strong className="block font-bold">RUT requiere revisión manual:</strong>
            <span>El OCR detectó posibles caracteres ambiguos o inconsistencia con Módulo 11. Puedes corregir el RUT en el formulario antes o después de guardar en Supabase.</span>
          </div>
        </div>
      )}

      {/* Alerta informativa de Rechazo si existe error crítico */}
      {siiError && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-rose-50 border border-rose-300 flex items-start gap-2 text-rose-800 text-[11px]">
          <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0 mt-0.5">
            error
          </span>
          <div className="flex-1">
            <strong className="block font-bold">Aviso tributario ante el SII:</strong>
            <span>{siiError}</span>
          </div>
        </div>
      )}

      {/* URL de Supabase Storage generada */}
      {uploadedSupabaseUrl && (
        <div className="mx-4 mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-[#00236f] shrink-0">
              cloud_done
            </span>
            <span className="font-mono truncate">{uploadedSupabaseUrl}</span>
          </div>
          {onCopiarUrl && (
            <button
              type="button"
              onClick={onCopiarUrl}
              className="shrink-0 text-[#00236f] font-bold hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[13px]">
                {copiedUrl ? 'check' : 'content_copy'}
              </span>
              <span>{copiedUrl ? 'Copiado' : 'Copiar'}</span>
            </button>
          )}
        </div>
      )}

      {/* Barra Inferior de Acción y Confirmación */}
      <div className="bg-[#f8faff] px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <p className="text-[11px] text-[#444651] flex items-center gap-1 text-center sm:text-left">
          <span className="material-symbols-outlined text-[15px] text-[#00236f]">
            info
          </span>
          <span>Revisa los datos resaltados antes de confirmar el guardado en Supabase.</span>
        </p>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onCambiarArchivo}
            disabled={isProcessing || isSubmitting}
            className="flex-1 sm:flex-none px-3 py-2 text-[12px] font-semibold text-[#444651] hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Cambiar Archivo
          </button>

          {!isConfirmed ? (
            <button
              type="button"
              onClick={onConfirmarEnvio}
              disabled={isProcessing || isSubmitting}
              className="flex-1 sm:flex-none px-4 py-2 bg-[#00236f] hover:bg-[#00174e] text-white text-[12px] font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Confirmando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">
                    check_circle
                  </span>
                  <span>Confirmar y Enviar</span>
                </>
              )}
            </button>
          ) : (
            <span className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 text-white text-[12px] font-bold rounded-xl flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">
                done_all
              </span>
              <span>Rendición Confirmada</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
