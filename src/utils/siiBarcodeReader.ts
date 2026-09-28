/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * CAPA A: Decodificador Oficial de Timbre Electrónico DTE (TED / PDF417) del SII
 * 100% Local en el Navegador / Móvil (Sin APIs externas ni Gemini)
 */

import { BrowserPDF417Reader, BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';
import { formatearRut, validarRutChileno, limpiarRut, evaluarRutConRevisionManual } from './rutValidator';

export interface ResultadoTimbreSii {
  exito: boolean;
  rutEmisor: string;
  folio: number;
  montoTotal: number;
  montoNeto: number;
  montoIva: number;
  tipoDocumento: string;
  tipoDteCode?: string;
  fechaEmision: string;
  razonSocial: string;
  glosaSugerida: string;
  rutReceptor?: string;
  rawTedXml?: string;
  motor: string;
}

const TIPOS_DTE_SII: Record<string, string> = {
  '33': 'Factura Electrónica (DTE 33)',
  '34': 'Factura no Afecta o Exenta Electrónica (DTE 34)',
  '39': 'Boleta Electrónica (DTE 39)',
  '41': 'Boleta Exenta Electrónica (DTE 41)',
  '52': 'Guía de Despacho Electrónica (DTE 52)',
  '56': 'Nota de Débito Electrónica (DTE 56)',
  '61': 'Nota de Crédito Electrónica (DTE 61)',
};

/**
 * Escanea el código PDF417 impreso al final del DTE chileno usando ZXing en cliente
 */
export async function decodificarTimbreElectronicoSii(file: File): Promise<ResultadoTimbreSii | null> {
  return new Promise<ResultadoTimbreSii | null>((resolve) => {
    // Timeout de 1500ms para no bloquear la ejecución si la imagen no contiene PDF417
    const timer = setTimeout(() => resolve(null), 1500);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;

          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            clearTimeout(timer);
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, w, h);

          let rawXml = '';
          const pdf417Reader = new BrowserPDF417Reader();

          // 1. Intento con imagen directa
          try {
            const resDirect = await pdf417Reader.decodeFromImageElement(img);
            if (resDirect && resDirect.getText()) {
              rawXml = resDirect.getText();
            }
          } catch (_) {}

          // 2. Intento con escaneo en la zona inferior (donde se ubica el TED en Chile)
          if (!rawXml) {
            try {
              const canvasCrop = document.createElement('canvas');
              const startY = Math.floor(h * 0.40);
              const cropH = h - startY;
              canvasCrop.width = w;
              canvasCrop.height = cropH;
              const ctxCrop = canvasCrop.getContext('2d');
              if (ctxCrop) {
                ctxCrop.drawImage(canvas, 0, startY, w, cropH, 0, 0, w, cropH);
                const dataUrlCrop = canvasCrop.toDataURL('image/jpeg', 0.92);
                const imgCrop = new Image();
                await new Promise<void>((rCrop) => {
                  imgCrop.onload = async () => {
                    try {
                      const resCrop = await pdf417Reader.decodeFromImageElement(imgCrop);
                      if (resCrop && resCrop.getText()) {
                        rawXml = resCrop.getText();
                      }
                    } catch (_) {}
                    rCrop();
                  };
                  imgCrop.onerror = () => rCrop();
                  imgCrop.src = dataUrlCrop;
                });
              }
            } catch (_) {}
          }

          // 3. Intento con MultiFormatReader con TRY_HARDER
          if (!rawXml) {
            try {
              const hints = new Map<DecodeHintType, any>();
              hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417, BarcodeFormat.QR_CODE]);
              hints.set(DecodeHintType.TRY_HARDER, true);
              const multiReader = new BrowserMultiFormatReader(hints);
              const resMulti = await multiReader.decodeFromImageElement(img);
              if (resMulti && resMulti.getText()) {
                rawXml = resMulti.getText();
              }
            } catch (_) {}
          }

          clearTimeout(timer);

          if (rawXml) {
            const parsed = parsearTedXml(rawXml, file.name);
            resolve(parsed);
          } else {
            resolve(null);
          }
        } catch (err) {
          clearTimeout(timer);
          resolve(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Parsea el XML oficial del TED (Timbre Electrónico DTE) del SII
 * <TED version="1.0"><DD><RE>76123456-7</RE><TD>39</TD><F>14520</F><FE>2026-09-25</FE><MNT>34900</MNT>...</DD></TED>
 */
export function parsearTedXml(xmlTexto: string, fileName: string): ResultadoTimbreSii | null {
  try {
    // 1. RUT Emisor (<RE>...</RE>)
    const matchRE = xmlTexto.match(/<RE>([\s\S]*?)<\/RE>/i);
    let rawRutEmisor = matchRE ? matchRE[1].trim() : '';

    // 2. Tipo DTE (<TD>...</TD>)
    const matchTD = xmlTexto.match(/<TD>([\s\S]*?)<\/TD>/i);
    const tipoDteCode = matchTD ? matchTD[1].trim() : '39';
    const tipoDocumento = TIPOS_DTE_SII[tipoDteCode] || 'Boleta Electrónica (DTE 39)';

    // 3. Folio DTE (<F>...</F>)
    const matchF = xmlTexto.match(/<F>([\s\S]*?)<\/F>/i);
    let folio = 0;
    if (matchF) {
      const parsedF = parseInt(matchF[1].trim(), 10);
      // Validar que el Folio sea un número positivo y NO coincida con un año de fecha aislado a menos que sea el tag <F>
      if (!isNaN(parsedF) && parsedF > 0) {
        folio = parsedF;
      }
    }

    // 4. Fecha de Emisión (<FE> o <FST>)
    const matchFE = xmlTexto.match(/<FE>([\s\S]*?)<\/FE>/i);
    const matchFST = xmlTexto.match(/<FST>([\s\S]*?)<\/FST>/i);
    let fechaEmision = new Date().toISOString().split('T')[0];
    if (matchFE && matchFE[1].trim()) {
      fechaEmision = matchFE[1].trim();
    } else if (matchFST && matchFST[1].trim()) {
      fechaEmision = matchFST[1].trim().split('T')[0];
    }

    // 5. Monto Total (<MNT>...</MNT>)
    const matchMNT = xmlTexto.match(/<MNT>([\s\S]*?)<\/MNT>/i);
    let montoTotal = 0;
    if (matchMNT) {
      const parsedMonto = parseInt(matchMNT[1].trim(), 10);
      if (!isNaN(parsedMonto) && parsedMonto > 0) {
        montoTotal = parsedMonto;
      }
    }

    // 6. Razón Social / Ítem (<RSR> o <IT1>)
    const matchRSR = xmlTexto.match(/<RSR>([\s\S]*?)<\/RSR>/i);
    const matchIT1 = xmlTexto.match(/<IT1>([\s\S]*?)<\/IT1>/i);
    const itemDescripcion = matchIT1 ? matchIT1[1].trim() : '';
    let razonSocial = matchRSR ? matchRSR[1].trim() : '';

    // 7. RUT Receptor (<RR>...</RR>)
    const matchRR = xmlTexto.match(/<RR>([\s\S]*?)<\/RR>/i);
    const rutReceptor = matchRR ? matchRR[1].trim() : '';

    if (!razonSocial && rawRutEmisor) {
      razonSocial = `Proveedor DTE (RUT ${formatearRut(rawRutEmisor)})`;
    }

    if (rawRutEmisor || folio > 0 || montoTotal > 0) {
      const rutFormateado = formatearRut(rawRutEmisor);
      const montoNeto = Math.round(montoTotal / 1.19);
      const montoIva = Math.round(montoTotal - montoNeto);

      return {
        exito: true,
        rutEmisor: rutFormateado || rawRutEmisor,
        folio,
        montoTotal,
        montoNeto,
        montoIva,
        tipoDocumento,
        tipoDteCode,
        fechaEmision,
        razonSocial,
        rutReceptor: rutReceptor ? formatearRut(rutReceptor) : undefined,
        glosaSugerida: itemDescripcion
          ? `Adquisición operacional: ${itemDescripcion} (Folio #${folio})`
          : `Gasto operacional con Timbre SII (Folio #${folio})`,
        rawTedXml: xmlTexto,
        motor: 'Lector PDF417 SII (Capa A)',
      };
    }

    return null;
  } catch (err) {
    return null;
  }
}
