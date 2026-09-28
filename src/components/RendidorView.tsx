/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Dashboard de Rendiciones · Consola Unificada (Rendidor / Administrador)
 * Bloque Único de Digitalización: Imagen del comprobante + Desglose de parámetros
 * Persistencia Real en Supabase (Bucket: 'rendiciones-idiem' | Tabla: 'rendiciones')
 */

import React, { useState, useRef, useMemo } from 'react';
import { RendicionItem } from '../types';
import { CENTROS_COSTO_IDIEM } from '../data/initialData';
import { comprimirImagenCliente } from '../utils/httpAndImageUtils';
import { validarRutChileno, formatearRut as formatearRutUtil } from '../lib/utils';
import {
  subirComprobanteRobusto,
  extraerOcrRobusto,
  validarSiiRobusto,
  guardarRendicionRobusta,
  formatearRut,
  limpiarRut,
  evaluarRutConRevisionManual,
} from '../utils/clientOcrAndStorage';
import { exportarExcelAuditoria, exportarPdfAuditoria } from '../utils/exportAuditoria';

interface RendidorViewProps {
  rendiciones: RendicionItem[];
  onNuevaRendicion: (rendicion: RendicionItem) => void;
  onVerMotivoRechazo: (observacion: string, folio: string) => void;
  onShowToast: (mensaje: string) => void;
}

export const RendidorView: React.FC<RendidorViewProps> = ({
  rendiciones,
  onNuevaRendicion,
  onVerMotivoRechazo,
  onShowToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // =========================================================================
  // 1. ESTADOS DINÁMICOS DE CAMPOS DESGLOSADOS (INICIA LIMPIO PARA PRODUCCIÓN)
  // =========================================================================
  const [rutEmisor, setRutEmisor] = useState<string>('');
  const [folioDte, setFolioDte] = useState<number | string>('');
  const [montoTotal, setMontoTotal] = useState<number | string>('');
  const [montoNeto, setMontoNeto] = useState<number>(0);
  const [montoIva, setMontoIva] = useState<number>(0);
  const [razonSocial, setRazonSocial] = useState<string>('');
  const [tipoDocumento, setTipoDocumento] = useState<string>('Boleta Electrónica');
  const [selectedCC, setSelectedCC] = useState<string>('CC-402');
  const [glosa, setGlosa] = useState<string>('');

  // Estados de proceso y persistencia
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processStep, setProcessStep] = useState<'IDLE' | 'STORAGE' | 'OCR' | 'VALIDATING' | 'SUCCESS'>('IDLE');
  const [processMessage, setProcessMessage] = useState<string>('');
  const [uploadedSupabaseUrl, setUploadedSupabaseUrl] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>('');
  const [loadedFile, setLoadedFile] = useState<{ name: string; size: string } | null>(null);
  const [requiereRevisionManual, setRequiereRevisionManual] = useState<boolean>(false);
  const [rutAdvertencia, setRutAdvertencia] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Estados para la Tabla de Rendiciones
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<'TODOS' | 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'>('TODOS');
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null);
  const [modalComprobante, setModalComprobante] = useState<{ url: string; titulo: string } | null>(null);

  // Validación reactiva de RUT en tiempo real al escribir en el campo
  const rutEvaluation = useMemo(() => {
    return evaluarRutConRevisionManual(rutEmisor);
  }, [rutEmisor]);

  // Actualizador reactivo de montos
  const handleMontoTotalChange = (valStr: string) => {
    if (valStr === '') {
      setMontoTotal('');
      setMontoNeto(0);
      setMontoIva(0);
      return;
    }
    const val = Number(valStr);
    if (!isNaN(val)) {
      setMontoTotal(val);
      const neto = Math.round(val / 1.19);
      setMontoNeto(neto);
      setMontoIva(val - neto);
    }
  };

  // =========================================================================
  // 2. CICLO UNIFICADO DE ESCANEO: OCR INMEDIATO + STORAGE CON RESILIENCIA
  // =========================================================================
  const procesarArchivoComprobante = async (file: File) => {
    const formatosPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!formatosPermitidos.includes(file.type)) {
      onShowToast('⚠️ Formato no compatible. Usa JPG, PNG, WEBP o GIF.');
      return;
    }

    // 1. Vista previa local instantánea (0ms)
    let localBlob = '';
    try {
      localBlob = URL.createObjectURL(file);
      setLocalPreviewUrl(localBlob);
      setPreviewImageUrl(localBlob);
    } catch (blobErr) {
      console.warn('Blob local error:', blobErr);
    }

    setLoadedFile({
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
    });

    setIsProcessing(true);
    setProcessStep('OCR');
    setProcessMessage('Digitalizando comprobante y extrayendo parámetros...');
    setUploadedSupabaseUrl(null);
    setCopiedUrl(false);

    try {
      // Optimización de tamaño si supera 1MB
      let fileAProcesar = file;
      if (file.size > 2 * 1024 * 1024) {
        try {
          fileAProcesar = await comprimirImagenCliente(file, 2 * 1024 * 1024);
        } catch (compErr) {
          console.warn('Compresión fallback:', compErr);
        }
      }

      // Conversión Base64 para motor OCR
      const fileBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(fileAProcesar);
      });

      // 2. EXTRACCIÓN DIRECTA MEDIANTE /api/ocr + Gemini Vision
      const aplicarDatosAlFormulario = (datos: any) => {
        if (datos.rutEmisor) setRutEmisor(datos.rutEmisor);
        if (datos.folio !== undefined && datos.folio !== '') setFolioDte(datos.folio);
        if (datos.montoTotal !== undefined && datos.montoTotal !== '') {
          setMontoTotal(datos.montoTotal);
          const neto = datos.montoNeto !== undefined && datos.montoNeto !== null ? Number(datos.montoNeto) : 0;
          const iva = datos.montoIva !== undefined && datos.montoIva !== null ? Number(datos.montoIva) : 0;
          setMontoNeto(neto);
          setMontoIva(iva);
        }
        if (datos.razonSocial) setRazonSocial(datos.razonSocial);
        if (datos.tipoDocumento) {
          const tipo = String(datos.tipoDocumento).toUpperCase().includes('FACTURA')
            ? 'Factura Electrónica'
            : 'Boleta Electrónica';
          setTipoDocumento(tipo);
        }
        if (datos.glosaSugerida) setGlosa(datos.glosaSugerida);

        if (datos.requiereRevisionManual || datos.advertenciaRut) {
          setRequiereRevisionManual(true);
          setRutAdvertencia(datos.advertenciaRut || 'Sugerencia: Confirme los datos manualmente');
        } else if (datos.rutEmisor) {
          const evalRut = evaluarRutConRevisionManual(datos.rutEmisor);
          setRequiereRevisionManual(evalRut.requiereRevisionManual);
          setRutAdvertencia(evalRut.mensaje || null);
        }
      };

      const extracted = await extraerOcrRobusto(
        fileAProcesar,
        fileBase64,
        (pct, msg) => {
          setProcessMessage(msg);
        },
        (datos) => {
          aplicarDatosAlFormulario(datos);
        }
      );

      aplicarDatosAlFormulario(extracted);

      setIsProcessing(false);
      setProcessStep('IDLE');

      // 3. SUBIDA A STORAGE EN SEGUNDO PLANO
      subirComprobanteRobusto(fileAProcesar)
        .then((storageResult) => {
          if (storageResult?.url) {
            setUploadedSupabaseUrl(storageResult.url);
          }
        })
        .catch((err) => {
          console.warn('[Storage background warn]:', err);
        });

      const folioToast = extracted.folio || folioDte;
      const totalToast = extracted.montoTotal || montoTotal;
      if (folioToast && totalToast) {
        onShowToast(`✓ Folio #${folioToast} · $${Number(totalToast).toLocaleString('es-CL')} CLP`);
      } else if (totalToast) {
        onShowToast(`✓ Monto detectado: $${Number(totalToast).toLocaleString('es-CL')} CLP`);
      } else {
        onShowToast('✓ Comprobante listo para completar');
      }
    } catch (err: any) {
      console.warn('[Error flujo escaneo]:', err);
      setIsProcessing(false);
      setProcessStep('IDLE');
      onShowToast('✓ Comprobante cargado. Verifique los campos.');
    } finally {
      setIsProcessing(false);
      setProcessStep('IDLE');
    }
  };

  // =========================================================================
  // 3. PERSISTENCIA EN SUPABASE (Bucket 'rendiciones-idiem' y Tabla 'rendiciones')
  // =========================================================================
  const handleGuardarRendicion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Validación de RUT Real con Dígito Verificador Módulo 11
    if (!rutEmisor.trim()) {
      onShowToast('⚠️ Por favor ingresa el RUT del emisor.');
      return;
    }

    if (!validarRutChileno(rutEmisor)) {
      onShowToast('⚠️ El RUT del emisor ingresado no es válido (Dígito Verificador incorrecto según Módulo 11). Corríjalo antes de guardar.');
      return;
    }

    if (!montoTotal || Number(montoTotal) <= 0) {
      onShowToast('Por favor ingresa un monto total válido.');
      return;
    }

    setIsSubmitting(true);
    setProcessMessage('Persistiendo registro en Supabase...');

    try {
      const numFolio = Number(folioDte) || 0;
      if (!numFolio) {
        onShowToast('⚠️ Ingresa o corrige el folio del documento antes de guardar.');
        setIsSubmitting(false);
        return;
      }
      const numMonto = Number(montoTotal) || 0;
      const urlFinal = uploadedSupabaseUrl || previewImageUrl;

      const res = await guardarRendicionRobusta({
        glosa: glosa || 'Gasto operacional IDIEM',
        centroCosto: selectedCC,
        centroCostoId: '22222222-2222-2222-2222-222222222222',
        usuarioId: '33333333-3333-3333-3333-333333333333',
        tipoDocumento,
        rutEmisor,
        razonSocial,
        folio: numFolio,
        montoTotal: numMonto,
        montoNeto,
        montoIva,
        comprobanteUrl: urlFinal,
        requiereRevisionManual: requiereRevisionManual || !rutEvaluation.esValido,
      });

      if (res.rendicion) {
        onNuevaRendicion(res.rendicion);
      }

      setProcessStep('SUCCESS');
      onShowToast(`✓ Rendición guardada en Supabase: Folio ${res.rendicion?.folio || '#RD'}`);
    } catch (err: any) {
      console.error('Error al guardar rendición:', err);
      onShowToast(`Aviso al guardar: ${err?.message || 'Verifique la conexión'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await procesarArchivoComprobante(file);
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleCopiarUrl = () => {
    const url = uploadedSupabaseUrl || previewImageUrl;
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    onShowToast('URL pública del comprobante (rendiciones-idiem) copiada');
    setTimeout(() => setCopiedUrl(false), 3000);
  };

  // =========================================================================
  // 4. LISTADO Y EXPORTACIÓN
  // =========================================================================
  const rendicionesFiltradas = useMemo(() => {
    return rendiciones.filter((item) => {
      if (filterEstado !== 'TODOS' && item.estado !== filterEstado) {
        return false;
      }
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchFolio = item.folio.toLowerCase().includes(term);
        const matchDte = String(item.folioDte).includes(term);
        const matchRut = (item.rutProveedor || '').toLowerCase().includes(term);
        const matchRazon = (item.razonSocial || '').toLowerCase().includes(term);
        const matchGlosa = (item.glosa || '').toLowerCase().includes(term);
        return matchFolio || matchDte || matchRut || matchRazon || matchGlosa;
      }
      return true;
    });
  }, [rendiciones, filterEstado, searchTerm]);

  const totalMontoRendido = useMemo(() => {
    return rendiciones.reduce((acc, curr) => acc + (curr.montoBruto || 0), 0);
  }, [rendiciones]);

  const totalPendientes = useMemo(() => {
    return rendiciones.filter((r) => r.estado === 'PENDIENTE').length;
  }, [rendiciones]);

  const totalAprobadas = useMemo(() => {
    return rendiciones.filter((r) => r.estado === 'APROBADO').length;
  }, [rendiciones]);

  const handleExportExcel = () => {
    setIsExporting('excel');
    try {
      exportarExcelAuditoria(rendicionesFiltradas, 'Libro de Rendiciones IDIEM');
      onShowToast(`✓ Libro Excel exportado con ${rendicionesFiltradas.length} registros.`);
    } catch (err) {
      console.error(err);
      onShowToast('Error al exportar Excel');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPdf = () => {
    setIsExporting('pdf');
    try {
      exportarPdfAuditoria(rendicionesFiltradas, 'Reporte Oficial de Rendiciones IDIEM');
      onShowToast(`✓ Reporte PDF foliado generado exitosamente.`);
    } catch (err) {
      console.error(err);
      onShowToast('Error al exportar PDF');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="flex flex-col w-full pb-28 bg-[#f8f9ff]">
      {/* ------------------------------------------------------------------- */}
      {/* HEADER INSTITUCIONAL: MÉTRICAS Y ACCIONES                           */}
      {/* ------------------------------------------------------------------- */}
      <section className="bg-gradient-to-r from-[#eff4ff] via-[#f5f8ff] to-[#eff4ff] px-4 py-4 border-b border-[#e5eeff]">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                <span className="text-[11px] text-[#006398] font-bold uppercase tracking-wider">
                  IDIEM · Universidad de Chile
                </span>
              </div>
              <h1 className="text-[20px] text-[#00236f] font-bold tracking-tight">
                Panel de Rendiciones de Gastos
              </h1>
              <p className="text-[12px] text-[#444651]">
                Digitalización de comprobantes con conexión en tiempo real a Supabase Storage y Base de Datos
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3.5 bg-[#00236f] hover:bg-[#0038a8] text-white rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs text-[12px] font-bold cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
                <span>Escanear Comprobante</span>
              </button>

              <button
                onClick={() => {
                  const el = document.getElementById('tabla-rendiciones');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="h-9 px-3 bg-white text-[#00236f] hover:bg-[#e5eeff] border border-[#b6c4ff] rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs text-[12px] font-bold cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">table_chart</span>
                <span>Ver Tabla ({rendiciones.length})</span>
              </button>
            </div>
          </div>

          {/* Tarjetas de Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="bg-white rounded-xl p-3 shadow-xs border border-[#e5eeff]">
              <span className="text-[10px] text-[#757682] uppercase font-semibold block">Total Rendido</span>
              <span className="text-[18px] text-[#00236f] font-bold block">
                ${totalMontoRendido.toLocaleString('es-CL')}
              </span>
              <span className="text-[10px] text-[#006398] font-mono">CLP acumulados</span>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-xs border border-[#e5eeff]">
              <span className="text-[10px] text-[#757682] uppercase font-semibold block">Rendiciones</span>
              <span className="text-[18px] text-[#0b1c30] font-bold block">
                {rendiciones.length}
              </span>
              <span className="text-[10px] text-[#757682] font-mono">registros totales</span>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-xs border border-[#e5eeff]">
              <span className="text-[10px] text-[#757682] uppercase font-semibold block">Aprobadas</span>
              <span className="text-[18px] text-emerald-700 font-bold block">
                {totalAprobadas}
              </span>
              <span className="text-[10px] text-emerald-600 font-mono">visadas</span>
            </div>

            <div className="bg-white rounded-xl p-3 shadow-xs border border-[#e5eeff]">
              <span className="text-[10px] text-[#757682] uppercase font-semibold block">En Revisión</span>
              <span className="text-[18px] text-amber-700 font-bold block">
                {totalPendientes}
              </span>
              <span className="text-[10px] text-amber-600 font-mono">pendientes</span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* CUERPO PRINCIPAL                                                    */}
      {/* ------------------------------------------------------------------- */}
      <div className="max-w-4xl mx-auto w-full px-4 flex flex-col gap-6 pt-5">
        
        {/* ================================================================= */}
        {/* BLOQUE ÚNICO: IMAGEN DE BOLETA ESCANEADA + PARÁMETROS DESGLOSADOS */}
        {/* ================================================================= */}
        <section className="bg-white rounded-2xl shadow-md border-2 border-[#b6c4ff] overflow-hidden transition-all">
          {/* Encabezado del Bloque Único */}
          <div className="bg-gradient-to-r from-[#00236f] to-[#0038a8] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-white">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[22px] text-[#85f8c4]">
                document_scanner
              </span>
              <div>
                <h2 className="text-[14px] font-bold tracking-tight">
                  Digitalización y Parámetros del Comprobante
                </h2>
                <p className="text-[10px] text-[#d3e4fe] font-mono">
                  Bucket: <span className="text-white font-bold">rendiciones-idiem</span> · Persistencia en Supabase
                </p>
              </div>
            </div>

            {/* Badges de Estado */}
            <div className="flex items-center gap-2">
              {isProcessing ? (
                <span className="inline-flex items-center gap-1.5 bg-amber-400 text-amber-950 text-[10px] font-bold px-2.5 py-1 rounded-full animate-pulse shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-900 animate-ping" />
                  {processMessage || 'Procesando...'}
                </span>
              ) : !rutEmisor && !previewImageUrl ? (
                <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                  <span className="material-symbols-outlined text-[13px]">add_photo_alternate</span>
                  Listo para digitalizar
                </span>
              ) : !rutEvaluation.esValido ? (
                <span className="inline-flex items-center gap-1 bg-amber-500 text-amber-950 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                  <span className="material-symbols-outlined text-[13px]">help_outline</span>
                  Revisión Manual de RUT
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-[#85f8c4] text-[#002114] text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                  <span className="material-symbols-outlined text-[13px]">verified</span>
                  Comprobante Listo
                </span>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                title="Cambiar o subir otro comprobante"
              >
                <span className="material-symbols-outlined text-[14px]">upload_file</span>
                <span>Cambiar Archivo</span>
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
            title="Seleccionar comprobante"
          />

          {/* Cuerpo en 2 columnas: Izquierda Imagen, Derecha Parámetros Desglosados */}
          <div className="p-4 sm:p-5 flex flex-col lg:flex-row gap-5">
            
            {/* COLUMNA IZQUIERDA: IMAGEN ESCANEADA */}
            <div className="w-full lg:w-5/12 flex flex-col gap-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    procesarArchivoComprobante(file);
                  }
                }}
                className="relative w-full h-72 sm:h-80 bg-slate-900 rounded-xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center group"
              >
                {localPreviewUrl || previewImageUrl ? (
                  <>
                    <img
                      src={localPreviewUrl || previewImageUrl}
                      alt="Comprobante escaneado"
                      onError={(e) => {
                        if (localPreviewUrl && e.currentTarget.src !== localPreviewUrl) {
                          e.currentTarget.src = localPreviewUrl;
                        }
                      }}
                      className={`w-full h-full object-contain transition-opacity duration-300 ${
                        isProcessing ? 'opacity-30 scale-105 filter blur-xs' : 'opacity-100'
                      }`}
                    />

                    {/* Botón Flotante Superior: Flechita para abrir la foto en el explorador */}
                    {!isProcessing && (
                      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
                        <a
                          href={localPreviewUrl || previewImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-8 px-2.5 bg-[#00236f]/95 hover:bg-[#00236f] text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-xs transition-all active:scale-95 border border-white/20 cursor-pointer"
                          title="Abrir foto en una pestaña nueva del explorador"
                        >
                          <span>Abrir en explorador</span>
                          <span className="material-symbols-outlined text-[16px] text-[#85f8c4]">
                            open_in_new
                          </span>
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:bg-slate-800 transition-colors w-full h-full text-slate-300"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-[#85f8c4] mb-3">
                      <span className="material-symbols-outlined text-[32px]">add_photo_alternate</span>
                    </div>
                    <span className="text-[14px] font-bold text-white">
                      Cargar Comprobante Digital
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 max-w-[240px]">
                      Haz clic aquí o arrastra una foto (JPG, PNG o WEBP). En celular puedes tomar la boleta directamente con la cámara.
                    </span>
                  </div>
                )}

                {/* Overlay durante procesamiento */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-[#00174e]/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center text-white z-10">
                    <div className="w-10 h-10 rounded-full border-3 border-[#85f8c4] border-t-transparent animate-spin mb-2" />
                    <span className="text-[13px] font-bold text-white tracking-wide">
                      Digitalizando Comprobante...
                    </span>
                    <span className="text-[10px] text-[#d3e4fe] font-mono mt-1">
                      {processMessage}
                    </span>
                    <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#85f8c4] to-transparent shadow-[0_0_12px_#85f8c4] animate-[bounce_1.5s_infinite]" />
                  </div>
                )}

                {/* Barra Inferior sobre la imagen: Folio, Explorador y Zoom */}
                {!isProcessing && (localPreviewUrl || previewImageUrl) && (
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-20">
                    <span className="bg-[#00236f]/90 backdrop-blur text-white text-[10px] font-mono px-2.5 py-1 rounded-md font-bold shadow-sm border border-white/10">
                      Folio DTE #{folioDte || '---'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={localPreviewUrl || previewImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white/95 hover:bg-white text-[#00236f] px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-sm transition-transform active:scale-95 cursor-pointer"
                        title="Abrir imagen en el explorador"
                      >
                        <span className="material-symbols-outlined text-[15px] text-[#006398]">open_in_new</span>
                        <span>Ver en explorador</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => setModalComprobante({ url: localPreviewUrl || previewImageUrl, titulo: `Folio #${folioDte || 'DTE'} - ${razonSocial || 'Comprobante'}` })}
                        className="bg-white/95 hover:bg-white text-[#00236f] p-1.5 rounded-md text-[11px] flex items-center shadow-sm cursor-pointer"
                        title="Ampliar en pantalla"
                      >
                        <span className="material-symbols-outlined text-[16px]">zoom_in</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Botón de acción inferior */}
              {(localPreviewUrl || previewImageUrl) ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2 px-3 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#00236f] font-bold text-[12px] rounded-xl flex items-center justify-center gap-1.5 border border-[#b6c4ff] transition-all cursor-pointer shadow-2xs active:scale-98"
                  >
                    <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                    <span>Cambiar o Subir Otra Foto</span>
                  </button>

                  <a
                    href={localPreviewUrl || previewImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 bg-[#00236f] hover:bg-[#0038a8] text-white font-bold text-[12px] rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-98"
                    title="Abrir foto en una pestaña nueva"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#85f8c4]">open_in_new</span>
                    <span>Explorador</span>
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#00236f] font-bold text-[12px] rounded-xl flex items-center justify-center gap-1.5 border border-[#b6c4ff] transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
                  <span>Tomar o Seleccionar Boleta</span>
                </button>
              )}

              {/* Alerta no bloqueante de revisión manual si el RUT no pasa Módulo 11 */}
              {!rutEvaluation.esValido && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2 text-amber-900 text-[11px] animate-fadeIn">
                  <span className="material-symbols-outlined text-amber-600 text-[16px] mt-0.5 shrink-0">
                    info
                  </span>
                  <div>
                    <span className="font-bold block">Marcado para Revisión Manual:</span>
                    <span>{rutEvaluation.mensaje || 'Verifique el RUT emisor antes o después de guardar.'} El documento será registrado normalmente.</span>
                  </div>
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA: DETALLES Y PARÁMETROS DESGLOSADOS */}
            <div className="w-full lg:w-7/12 flex flex-col justify-between">
              <form onSubmit={handleGuardarRendicion} className="flex flex-col gap-3.5">
                
                {/* Fila 1: RUT Emisor y Folio DTE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#0b1c30] font-bold flex items-center justify-between mb-1">
                      <span>RUT Emisor *</span>
                      <span className={`text-[10px] font-mono font-bold ${rutEvaluation.esValido ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {rutEvaluation.esValido ? '✓ Módulo 11 Válido' : '⚠️ Revisión manual'}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={rutEmisor}
                        onChange={(e) => setRutEmisor(e.target.value)}
                        onBlur={() => {
                          if (rutEmisor.trim()) {
                            setRutEmisor(formatearRutUtil(rutEmisor));
                          }
                        }}
                        placeholder="76.xxx.xxx-x"
                        className={`w-full h-10 px-3 font-mono font-bold text-[#0b1c30] text-[13px] rounded-xl border focus:outline-none focus:ring-2 ${
                          rutEvaluation.esValido
                            ? 'bg-[#f8faff] border-[#b6c4ff] focus:ring-[#00236f]'
                            : 'bg-amber-50/60 border-amber-300 focus:ring-amber-500'
                        }`}
                      />
                      <span className={`material-symbols-outlined absolute right-3 top-2.5 text-[18px] ${
                        rutEvaluation.esValido ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {rutEvaluation.esValido ? 'check_circle' : 'pending'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-[#0b1c30] font-bold flex items-center justify-between mb-1">
                      <span>Folio DTE *</span>
                      <span className="text-[10px] text-indigo-700 font-mono">N° Documento</span>
                    </label>
                    <input
                      type="number"
                      value={folioDte}
                      onChange={(e) => setFolioDte(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Ej: 48291"
                      className="w-full h-10 px-3 font-mono font-bold bg-[#f8faff] text-[#0b1c30] text-[13px] rounded-xl border border-[#b6c4ff] focus:outline-none focus:ring-2 focus:ring-[#00236f]"
                    />
                  </div>
                </div>

                {/* Fila 2: Razón Social y Tipo de Documento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#0b1c30] font-semibold block mb-1">
                      Razón Social / Proveedor *
                    </label>
                    <input
                      type="text"
                      value={razonSocial}
                      onChange={(e) => setRazonSocial(e.target.value)}
                      placeholder="Nombre del proveedor o comercio"
                      className="w-full h-10 px-3 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-medium rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#00236f]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#0b1c30] font-semibold block mb-1">
                      Tipo de Documento
                    </label>
                    <select
                      value={tipoDocumento}
                      onChange={(e) => setTipoDocumento(e.target.value)}
                      className="w-full h-10 px-3 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-medium rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#00236f] cursor-pointer"
                    >
                      <option value="Boleta Electrónica">Boleta Electrónica (DTE 39)</option>
                      <option value="Factura Electrónica">Factura Electrónica (DTE 33)</option>
                      <option value="Boleta Transbank">Boleta POS / Transbank</option>
                      <option value="Comprobante">Comprobante de Gasto</option>
                    </select>
                  </div>
                </div>

                {/* Fila 3: Monto Total y Desglose Financiero */}
                <div className="bg-[#eff4ff] p-3 rounded-xl border border-[#d3e4fe] flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] text-[#00236f] font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">payments</span>
                      <span>Monto Total (CLP) *</span>
                    </label>
                    <div className="relative w-full sm:w-48">
                      <span className="absolute left-3 top-2 text-[#00236f] font-bold text-[14px]">$</span>
                      <input
                        type="number"
                        value={montoTotal}
                        onChange={(e) => handleMontoTotalChange(e.target.value)}
                        placeholder="Ej: 38900"
                        className="w-full h-9 pl-7 pr-3 font-mono font-extrabold bg-white text-[#00236f] text-[15px] rounded-lg border border-[#b6c4ff] focus:outline-none focus:ring-2 focus:ring-[#00236f]"
                      />
                    </div>
                  </div>

                  {/* Desglose Neto e IVA */}
                  <div className="pt-2 border-t border-[#d3e4fe] flex items-center justify-between text-[11px] font-mono text-[#0b1c30]">
                    <span>Neto: <strong>${montoNeto.toLocaleString('es-CL')}</strong></span>
                    <span>•</span>
                    <span>IVA (19%): <strong>${montoIva.toLocaleString('es-CL')}</strong></span>
                    <span>•</span>
                    <span className="text-[#00236f] font-bold">Total: ${(Number(montoTotal) || 0).toLocaleString('es-CL')} CLP</span>
                  </div>
                </div>

                {/* Fila 4: Centro de Costos y Glosa */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="text-[11px] text-[#0b1c30] font-semibold block mb-1">
                      Centro de Costo IDIEM *
                    </label>
                    <select
                      value={selectedCC}
                      onChange={(e) => setSelectedCC(e.target.value)}
                      className="w-full h-10 px-2.5 bg-[#eff4ff] text-[#0b1c30] text-[11px] font-medium rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#00236f] cursor-pointer"
                    >
                      {CENTROS_COSTO_IDIEM.map((cc) => (
                        <option key={cc.codigo} value={cc.codigo}>
                          {cc.codigo} ({cc.nombre.split(' ')[0]})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-[#0b1c30] font-semibold block mb-1">
                      Glosa / Justificación Técnica *
                    </label>
                    <input
                      type="text"
                      value={glosa}
                      onChange={(e) => setGlosa(e.target.value)}
                      placeholder="Motivo del gasto o insumo adquirido..."
                      className="w-full h-10 px-3 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-medium rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#00236f]"
                    />
                  </div>
                </div>

                {/* BOTÓN PRIMARIO DE GUARDADO */}
                <div className="pt-2 flex items-center justify-between gap-3">
                  <span className="text-[10px] text-[#757682] font-mono hidden sm:inline">
                    Guardará en Supabase (rendiciones) con URL de imagen.
                  </span>

                  <button
                    type="submit"
                    disabled={isSubmitting || isProcessing}
                    className={`w-full sm:w-auto px-6 h-11 bg-[#00236f] hover:bg-[#0038a8] text-white rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer ${
                      isSubmitting ? 'opacity-75 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
                        <span>Guardar Rendición</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* SECCIÓN 2: TABLA CONSOLIDADA Y EXPORTACIÓN A EXCEL / PDF          */}
        {/* ----------------------------------------------------------------- */}
        <section id="tabla-rendiciones" className="bg-white rounded-2xl p-5 shadow-sm border border-[#e5eeff] flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#00236f] text-[20px]">
                  receipt_long
                </span>
                <h3 className="text-[16px] font-bold text-[#0b1c30]">
                  Registro Histórico de Rendiciones
                </h3>
              </div>
              <p className="text-[12px] text-[#757682] mt-0.5">
                Rendiciones persistidas en Supabase · Descarga de libros y reportes oficiales
              </p>
            </div>

            {/* BOTONES DE EXPORTACIÓN */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExportExcel}
                disabled={isExporting !== null}
                className="h-9 px-3.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl flex items-center gap-1.5 text-[12px] font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Descargar libro Excel multihoja"
              >
                {isExporting === 'excel' ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[17px]">table_view</span>
                )}
                <span>Exportar Excel (.xlsx)</span>
              </button>

              <button
                onClick={handleExportPdf}
                disabled={isExporting !== null}
                className="h-9 px-3.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl flex items-center gap-1.5 text-[12px] font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Descargar reporte oficial foliado PDF"
              >
                {isExporting === 'pdf' ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[17px]">picture_as_pdf</span>
                )}
                <span>Exportar PDF Foliado</span>
              </button>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#757682] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por Folio, RUT, Proveedor o Glosa..."
                className="w-full h-9 pl-9 pr-3 text-[12px] bg-[#eff4ff] text-[#0b1c30] rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#00236f]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2 text-[#757682] hover:text-[#0b1c30]"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-[#757682] font-semibold">Estado:</span>
              {(['TODOS', 'PENDIENTE', 'APROBADO', 'RECHAZADO'] as const).map((est) => (
                <button
                  key={est}
                  onClick={() => setFilterEstado(est)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                    filterEstado === est
                      ? 'bg-[#00236f] text-white'
                      : 'bg-[#eff4ff] text-[#444651] hover:bg-[#dce9ff]'
                  }`}
                >
                  {est === 'TODOS' ? 'Todos' : est === 'PENDIENTE' ? 'Pendientes' : est === 'APROBADO' ? 'Aprobados' : 'Rechazados'}
                </button>
              ))}
            </div>
          </div>

          {/* TABLA DE RENDICIONES */}
          <div className="overflow-x-auto rounded-xl border border-[#e5eeff]">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#eff4ff] text-[#00236f] font-bold border-b border-[#e5eeff]">
                  <th className="py-2.5 px-3">Folio IDIEM</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Proveedor / RUT</th>
                  <th className="py-2.5 px-3">Folio DTE</th>
                  <th className="py-2.5 px-3">Centro Costo</th>
                  <th className="py-2.5 px-3">Glosa</th>
                  <th className="py-2.5 px-3 text-right">Monto Total</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-center">Comprobante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rendicionesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#757682]">
                      No se encontraron rendiciones registradas.
                    </td>
                  </tr>
                ) : (
                  rendicionesFiltradas.map((item) => {
                    const isAprobado = item.estado === 'APROBADO';
                    const isPendiente = item.estado === 'PENDIENTE';
                    const isRechazado = item.estado === 'RECHAZADO';

                    return (
                      <tr key={item.id} className="hover:bg-[#f8faff] transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#00236f] whitespace-nowrap">
                          {item.folio}
                        </td>
                        <td className="py-2.5 px-3 text-[#444651] whitespace-nowrap">
                          {item.fecha}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#0b1c30] truncate max-w-[160px]">
                            {item.razonSocial || 'Proveedor'}
                          </div>
                          <div className="text-[10px] font-mono text-[#006398]">
                            {item.rutProveedor || '76.xxx.xxx-x'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#444651] whitespace-nowrap">
                          #{item.folioDte}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="bg-[#eff4ff] text-[#00236f] px-1.5 py-0.5 rounded font-mono text-[10px] font-bold">
                            {item.centroCosto}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#444651] max-w-[200px] truncate" title={item.glosa}>
                          {item.glosa}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0b1c30] whitespace-nowrap">
                          ${item.montoBruto.toLocaleString('es-CL')}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {isAprobado && (
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">
                              Aprobado
                            </span>
                          )}
                          {isPendiente && (
                            <span className="bg-blue-50 text-[#00236f] px-2 py-0.5 rounded text-[10px] font-bold">
                              Pendiente
                            </span>
                          )}
                          {isRechazado && (
                            <button
                              onClick={() =>
                                onVerMotivoRechazo(
                                  item.revisorObservacion || 'Rechazado por jefatura',
                                  item.folio
                                )
                              }
                              className="bg-rose-50 text-rose-700 hover:bg-rose-100 px-2 py-0.5 rounded text-[10px] font-bold underline cursor-pointer"
                            >
                              Rechazado
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {item.comprobanteUrl ? (
                            <button
                              onClick={() =>
                                setModalComprobante({
                                  url: item.comprobanteUrl!,
                                  titulo: `${item.folio} - ${item.razonSocial}`,
                                })
                              }
                              className="text-[#00236f] hover:text-[#0038a8] p-1 rounded-lg hover:bg-[#eff4ff] transition-colors cursor-pointer"
                              title="Ver Comprobante Digital"
                            >
                              <span className="material-symbols-outlined text-[18px]">visibility</span>
                            </button>
                          ) : (
                            <span className="text-[#94a3b8] text-[11px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#757682] pt-1">
            <span>
              Mostrando {rendicionesFiltradas.length} de {rendiciones.length} rendiciones registradas
            </span>
            <span className="font-mono">
              Total página: ${rendicionesFiltradas.reduce((a, b) => a + b.montoBruto, 0).toLocaleString('es-CL')} CLP
            </span>
          </div>
        </section>
      </div>

      {/* Modal para ver comprobante ampliado */}
      {modalComprobante && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="bg-[#00236f] px-4 py-3 text-white flex items-center justify-between">
              <span className="text-[13px] font-bold">{modalComprobante.titulo}</span>
              <button
                onClick={() => setModalComprobante(null)}
                className="text-white/80 hover:text-white"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-900 max-h-[75vh]">
              <img
                src={modalComprobante.url}
                alt="Comprobante"
                className="max-h-[70vh] object-contain rounded-lg"
              />
            </div>
            <div className="p-3 bg-slate-50 flex items-center justify-between">
              <a
                href={modalComprobante.url}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-bold text-[#00236f] hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                <span>Abrir en pestaña nueva</span>
              </a>
              <button
                onClick={() => setModalComprobante(null)}
                className="px-4 py-1.5 bg-[#00236f] text-white rounded-lg text-[12px] font-bold hover:bg-[#0038a8]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RendidorView;
