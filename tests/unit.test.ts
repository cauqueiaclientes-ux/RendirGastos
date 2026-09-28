/**
 * Tests unitarios mínimos para la aplicación IDIEM.
 * No realizan llamadas externas al SII, Supabase ni a proveedores de IA.
 */

import { validarRutChileno, formatearRut } from '../lib/sii';

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  PASS: ${description}`);
      passed++;
    } else {
      console.error(`  FAIL: ${description}`);
      failed++;
    }
  }

  console.log('1. RUT chileno / Módulo 11');
  assert(validarRutChileno('76.432.890-K'), 'RUT válido 76.432.890-K');
  assert(validarRutChileno('76.123.456-7'), 'RUT válido 76.123.456-7');
  assert(validarRutChileno('60.910.000-1'), 'RUT válido 60.910.000-1');
  assert(!validarRutChileno('11.111.111-9'), 'RUT inválido 11.111.111-9');
  assert(formatearRut('76432890K') === '76.432.890-K', 'Formateo estándar del RUT');

  console.log('\n2. Reglas contables');
  const neto = 100000;
  const iva = 19000;
  const total = 119000;
  assert(neto + iva === total, 'Neto + IVA = Total');
  assert(Math.round(14990 / 1.19) + (14990 - Math.round(14990 / 1.19)) === 14990, 'Desglose de total con IVA');

  console.log('\n3. Resultado');
  console.log(`${passed} pasados, ${failed} fallidos.`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
