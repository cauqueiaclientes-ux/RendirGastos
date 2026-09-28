/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Módulo de Exportación Certificada para Auditoría Contable (Excel y PDF)
 * Genera libros auxiliares, cuadros de conciliación y reportes foliados.
 */

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RendicionItem } from '../types';

/**
 * Limpia y normaliza el nombre del archivo
 */
function sanitizeFileName(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Formato de moneda chilena sin decimales
 */
function formatCLP(val: number): string {
  return `$ ${Math.round(val || 0).toLocaleString('es-CL')}`;
}

/**
 * Exporta las tablas de rendiciones a formato Excel (.xlsx)
 * con libro multi-hoja: Detalle de Rendiciones, Resumen por Centro de Costos y Balance Tributario SII.
 */
export function exportarExcelAuditoria(
  rendiciones: RendicionItem[],
  periodoNombre: string = 'Mayo 2024'
): void {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // HOJA 1: Libro Auxiliar Detallado de Rendiciones
  // -------------------------------------------------------------
  const detalleRows = rendiciones.map((r) => ({
    'Folio Rendición': r.folio,
    'Fecha': r.fechaCompleta ? r.fechaCompleta.split('T')[0] : r.fecha,
    'Rendidor': r.rendidor,
    'RUT Rendidor': r.rutRendidor,
    'Centro Costo': r.centroCosto,
    'Nombre Centro Costo': r.centroCostoNombre,
    'RUT Proveedor': r.rutProveedor,
    'Razón Social Emisor': r.razonSocial,
    'Tipo Documento': r.tipoDte,
    'Folio DTE': r.folioDte,
    'Glosa Imputación': r.glosa,
    'Monto Neto (CLP)': r.montoNeto,
    'Monto IVA (CLP)': r.montoIva,
    'Monto Exento (CLP)': r.montoExento || 0,
    'Monto Total (CLP)': r.montoBruto,
    'Estado SII': r.estadoSii,
    'Estado Rendición': r.estado,
    'Estado Pago': r.estadoPago,
    'Timbre TED / Hash SII': r.timbreSiiHash || 'N/A',
    'URL Comprobante': r.comprobanteUrl || 'N/A',
  }));

  const wsDetalle = XLSX.utils.json_to_sheet(detalleRows);

  // Ajuste de anchos de columna recomendados
  wsDetalle['!cols'] = [
    { wch: 14 }, // Folio
    { wch: 12 }, // Fecha
    { wch: 22 }, // Rendidor
    { wch: 14 }, // RUT Rendidor
    { wch: 10 }, // CC
    { wch: 30 }, // Nombre CC
    { wch: 14 }, // RUT Proveedor
    { wch: 28 }, // Razon Social
    { wch: 20 }, // Tipo Documento
    { wch: 12 }, // Folio DTE
    { wch: 32 }, // Glosa
    { wch: 16 }, // Neto
    { wch: 16 }, // IVA
    { wch: 16 }, // Exento
    { wch: 18 }, // Total
    { wch: 14 }, // Estado SII
    { wch: 14 }, // Estado
    { wch: 14 }, // Estado Pago
    { wch: 24 }, // Timbre
    { wch: 45 }, // URL
  ];

  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Libro de Rendiciones');

  // -------------------------------------------------------------
  // HOJA 2: Resumen Consolidado por Centro de Costos
  // -------------------------------------------------------------
  const ccMap = new Map<string, {
    nombre: string;
    cantidad: number;
    neto: number;
    iva: number;
    total: number;
  }>();

  rendiciones.forEach((r) => {
    const key = r.centroCosto || 'SIN_CC';
    const current = ccMap.get(key) || {
      nombre: r.centroCostoNombre || key,
      cantidad: 0,
      neto: 0,
      iva: 0,
      total: 0,
    };
    current.cantidad += 1;
    current.neto += r.montoNeto || 0;
    current.iva += r.montoIva || 0;
    current.total += r.montoBruto || 0;
    ccMap.set(key, current);
  });

  const totalGeneral = rendiciones.reduce((acc, r) => acc + (r.montoBruto || 0), 0);

  const resumenCCRows = Array.from(ccMap.entries()).map(([codigo, datos]) => ({
    'Código Centro Costo': codigo,
    'Nombre Centro de Costo': datos.nombre,
    'Cantidad Rendiciones': datos.cantidad,
    'Monto Neto (CLP)': datos.neto,
    'Monto IVA Crédito Fiscal': datos.iva,
    'Monto Total Rendido (CLP)': datos.total,
    '% Participación Presupuestaria': totalGeneral > 0
      ? `${((datos.total / totalGeneral) * 100).toFixed(2)}%`
      : '0.00%',
  }));

  const wsResumenCC = XLSX.utils.json_to_sheet(resumenCCRows);
  wsResumenCC['!cols'] = [
    { wch: 16 },
    { wch: 38 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsResumenCC, 'Resumen por CC');

  // -------------------------------------------------------------
  // HOJA 3: Auditoría y Resumen Tributario SII
  // -------------------------------------------------------------
  const totalNeto = rendiciones.reduce((acc, r) => acc + (r.montoNeto || 0), 0);
  const totalIva = rendiciones.reduce((acc, r) => acc + (r.montoIva || 0), 0);
  const totalExento = rendiciones.reduce((acc, r) => acc + (r.montoExento || 0), 0);
  const dteValidados = rendiciones.filter((r) => r.estadoSii === 'ACEPTADO').length;
  const dtePendientes = rendiciones.filter((r) => r.estadoSii !== 'ACEPTADO').length;

  const tributarioRows = [
    { Indicador: 'Período Fiscal Auditado', Valor: periodoNombre },
    { Indicador: 'Fecha de Generación', Valor: new Date().toLocaleString('es-CL') },
    { Indicador: 'Institución', Valor: 'IDIEM - Universidad de Chile (RUT 60.910.000-1)' },
    { Indicador: 'Total de Comprobantes Auditados', Valor: rendiciones.length },
    { Indicador: 'DTEs Verificados Conformes ante SII', Valor: dteValidados },
    { Indicador: 'DTEs Observados / Pendientes', Valor: dtePendientes },
    { Indicador: 'Monto Total Neto Imputable (CLP)', Valor: totalNeto },
    { Indicador: 'IVA Crédito Fiscal Recuperable (CLP)', Valor: totalIva },
    { Indicador: 'Monto Exento de IVA (CLP)', Valor: totalExento },
    { Indicador: 'Total Rendido Bruto (CLP)', Valor: totalGeneral },
  ];

  const wsTributario = XLSX.utils.json_to_sheet(tributarioRows);
  wsTributario['!cols'] = [{ wch: 36 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsTributario, 'Control Tributario SII');

  // Descarga del archivo
  const fileName = `Libro_Rendiciones_IDIEM_${sanitizeFileName(periodoNombre)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exporta el Libro Foliado Oficial de Rendiciones a formato PDF
 * con membrete institucional de la Universidad de Chile, timbre de auditoría,
 * desglose por ítem y cuadro de totales.
 */
export function exportarPdfAuditoria(
  rendiciones: RendicionItem[],
  periodoNombre: string = 'Mayo 2024'
): void {
  // Crear documento PDF en orientación horizontal (Landscape)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Encabezado Institucional
  // Barra superior azul IDIEM
  doc.setFillColor(0, 35, 111); // #00236f
  doc.rect(0, 0, pageWidth, 48, 'F');

  // Títulos superiores
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('UNIVERSIDAD DE CHILE · FACULTAD DE CIENCIAS FÍSICAS Y MATEMÁTICAS', 32, 20);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(211, 228, 254);
  doc.text('IDIEM — Investigación, Desarrollo e Innovación de Estructuras y Materiales | RUT: 60.910.000-1', 32, 34);

  // Fecha y Foliado en el header derecho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`AUDITORÍA FISCAL · ${periodoNombre.toUpperCase()}`, pageWidth - 32, 20, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(211, 228, 254);
  doc.text(`Emisión: ${new Date().toLocaleDateString('es-CL')} ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs`, pageWidth - 32, 34, { align: 'right' });

  // Título principal del reporte
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(11, 28, 48); // #0b1c30
  doc.text('LIBRO AUXILIAR FOLIADO DE RENDICIONES DE GASTOS Y AUDITORÍA DTE', 32, 74);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(68, 70, 81);
  doc.text(
    `Registro oficial de comprobantes tributarios validados ante el SII con imputación presupuestaria a Centros de Costo IDIEM.`,
    32,
    88
  );

  // Métricas Clave y Resumen Financiero en tarjetas superiores
  const totalNeto = rendiciones.reduce((acc, r) => acc + (r.montoNeto || 0), 0);
  const totalIva = rendiciones.reduce((acc, r) => acc + (r.montoIva || 0), 0);
  const totalGeneral = rendiciones.reduce((acc, r) => acc + (r.montoBruto || 0), 0);
  const dteValidados = rendiciones.filter((r) => r.estadoSii === 'ACEPTADO').length;

  const cardY = 100;
  const cardWidth = (pageWidth - 64 - 24) / 4;
  const cardHeight = 38;

  const metricas = [
    { label: 'Total Rendiciones', valor: `${rendiciones.length} ítems (${dteValidados} validadas SII)` },
    { label: 'Monto Neto Consolidado', valor: formatCLP(totalNeto) },
    { label: 'IVA Crédito Fiscal (19%)', valor: formatCLP(totalIva) },
    { label: 'Total Auditado IDIEM', valor: formatCLP(totalGeneral) },
  ];

  metricas.forEach((m, idx) => {
    const x = 32 + idx * (cardWidth + 8);
    // Fondo de tarjeta
    doc.setFillColor(241, 245, 255); // #f1f5ff
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 4, 4, 'F');
    doc.setDrawColor(211, 228, 254);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 4, 4, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 99, 152); // #006398
    doc.text(m.label.toUpperCase(), x + 8, cardY + 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 35, 111); // #00236f
    doc.text(m.valor, x + 8, cardY + 28);
  });

  // Generación de Tabla con jsPDF-AutoTable
  const headers = [
    'Folio',
    'Fecha',
    'Rendidor',
    'C. Costo',
    'Emisor / Proveedor',
    'DTE Tipo/Folio',
    'Glosa Imputada',
    'Monto Neto',
    'IVA (19%)',
    'Total CLP',
    'Estado SII',
  ];

  const bodyData = rendiciones.map((r) => [
    r.folio,
    r.fecha,
    `${r.rendidorCorto}\n${r.rutRendidor}`,
    r.centroCosto,
    `${r.razonSocial.slice(0, 24)}\nRUT: ${r.rutProveedor}`,
    `${r.tipoDte === 'FACTURA_ELECTRONICA' ? 'Factura' : 'Boleta'} #${r.folioDte}`,
    r.glosa.length > 28 ? `${r.glosa.slice(0, 26)}...` : r.glosa,
    formatCLP(r.montoNeto),
    formatCLP(r.montoIva),
    formatCLP(r.montoBruto),
    r.estadoSii === 'ACEPTADO' ? '✓ ACEPTADO' : r.estadoSii,
  ]);

  autoTable(doc, {
    startY: 148,
    head: [headers],
    body: bodyData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 4,
      font: 'helvetica',
      textColor: [17, 24, 39],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [0, 35, 111],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 46, halign: 'center', fontStyle: 'bold' }, // Folio
      1: { cellWidth: 38, halign: 'center' }, // Fecha
      2: { cellWidth: 70 }, // Rendidor
      3: { cellWidth: 45, halign: 'center', fontStyle: 'bold' }, // C. Costo
      4: { cellWidth: 105 }, // Proveedor
      5: { cellWidth: 68 }, // DTE
      6: { cellWidth: 115 }, // Glosa
      7: { cellWidth: 55, halign: 'right' }, // Neto
      8: { cellWidth: 50, halign: 'right' }, // IVA
      9: { cellWidth: 62, halign: 'right', fontStyle: 'bold' }, // Total
      10: { cellWidth: 58, halign: 'center', fontStyle: 'bold' }, // Estado SII
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      // Pie de página en cada hoja
      const totalPages = (doc.internal as any).getNumberOfPages
        ? (doc.internal as any).getNumberOfPages()
        : 1;
      const currentPage = (data as any).pageNumber || 1;

      // Línea divisoria inferior
      doc.setDrawColor(203, 213, 225);
      doc.line(32, pageHeight - 24, pageWidth - 32, pageHeight - 24);

      // Texto de certificación legal y pie de página
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(117, 118, 130);
      doc.text(
        'Certificación Electrónica: Sistema SaaS IDIEM Gastos · Comprobantes con Timbre Electrónico Digital (TED) validado ante SII.',
        32,
        pageHeight - 12
      );

      doc.text(
        `Página ${currentPage} de ${totalPages}`,
        pageWidth - 32,
        pageHeight - 12,
        { align: 'right' }
      );
    },
  });

  // Guardar y descargar archivo PDF
  const fileName = `Reporte_Auditoria_Rendiciones_IDIEM_${sanitizeFileName(periodoNombre)}.pdf`;
  doc.save(fileName);
}
