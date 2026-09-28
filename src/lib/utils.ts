/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Utilidades generales y validación del Dígito Verificador (Módulo 11) de RUT Chileno
 */

/**
 * Limpia un RUT eliminando puntos, guiones y espacios, dejando sólo dígitos y K en mayúscula.
 * Ejemplo: '76.432.890-k' -> '76432890K'
 */
export function limpiarRut(rut: string | number): string {
  if (!rut) return '';
  return String(rut)
    .replace(/[^0-9kK]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Calcula el Dígito Verificador (DV) esperado según el algoritmo oficial Módulo 11.
 * 
 * @param rutSinDv Cuerpo numérico del RUT sin el dígito verificador (ej: '76432890' o 76432890)
 * @returns Dígito verificador ('0'-'9' o 'K')
 */
export function calcularDigitoVerificador(rutSinDv: string | number): string {
  const limpio = String(rutSinDv).replace(/[^0-9]/g, '');
  if (!limpio) return '';

  let suma = 0;
  let multiplicador = 2;

  for (let i = limpio.length - 1; i >= 0; i--) {
    suma += parseInt(limpio[i], 10) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = suma % 11;
  const resultado = 11 - resto;

  if (resultado === 11) return '0';
  if (resultado === 10) return 'K';
  return String(resultado);
}

/**
 * Valida si un RUT chileno completo tiene un formato válido y si su dígito verificador es real (Módulo 11).
 * 
 * @param rutCompleto Cadena del RUT completo (con o sin puntos/guion, ej: '76.432.890-K' o '76432890K')
 * @returns boolean indicando si el RUT y su DV son válidos
 */
export function validarRutChileno(rutCompleto: string | number): boolean {
  if (!rutCompleto) return false;
  const limpio = limpiarRut(rutCompleto);
  if (limpio.length < 8 || limpio.length > 9) return false;

  const cuerpo = limpio.slice(0, -1);
  const dvIngresado = limpio.slice(-1);

  // Asegurar que el cuerpo sea puramente numérico
  if (!/^\d+$/.test(cuerpo)) return false;

  const dvEsperado = calcularDigitoVerificador(cuerpo);
  return dvIngresado === dvEsperado;
}

/**
 * Formatea un RUT al estándar chileno: XX.XXX.XXX-Y
 * Ejemplo: '76432890K' -> '76.432.890-K'
 */
export function formatearRut(rut: string | number): string {
  const limpio = limpiarRut(rut);
  if (!limpio) return '';
  if (limpio.length === 1) return limpio;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  let cuerpoFormateado = '';
  let contador = 0;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    cuerpoFormateado = cuerpo[i] + cuerpoFormateado;
    contador++;
    if (contador === 3 && i > 0) {
      cuerpoFormateado = '.' + cuerpoFormateado;
      contador = 0;
    }
  }

  return `${cuerpoFormateado}-${dv}`;
}

/**
 * Utilidad para concatenar clases CSS condicionales (Tailwind)
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
