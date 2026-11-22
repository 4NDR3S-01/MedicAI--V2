import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { removeUnverifiedHotlineHours } from '../src/modules/ai/ai-safety';

describe('asistente: horario de la línea 171 (no verificado)', () => {
  it('quita "24/7" de la 171 y agrega la nota de confirmar el horario + 911', () => {
    const reply =
      'Por favor, llama de inmediato al 911. Si estás en Ecuador, también puedes llamar a la Línea de Prevención del Suicidio: 171 (gratuita y confidencial, 24/7). No tienes que pasar por esto en soledad.';
    const result = removeUnverifiedHotlineHours(reply);
    assert.doesNotMatch(result, /24\s*\/\s*7/);
    assert.match(result, /171 \(gratuita y confidencial\)\./);
    assert.match(result, /Confirma su horario al llamar; si no contestan o el riesgo es inmediato, llama al 911\. No tienes/);
    assert.match(result, /^Por favor, llama de inmediato al 911\./);
  });

  it('cubre otras formas de decir que atiende siempre', () => {
    for (const claim of ['las 24 horas', 'las 24 horas, los 7 días de la semana', 'a cualquier hora', '24x7']) {
      const result = removeUnverifiedHotlineHours(`Llama a la línea 171, opción 6, disponible ${claim}.`);
      assert.doesNotMatch(result, /24|cualquier hora|disponible/, `${claim} → ${result}`);
      assert.match(result, /171, opción 6\./);
    }
  });

  it('no toca el 911 ni respuestas sin la 171', () => {
    const reply = 'Llama al 911, atiende las 24 horas.';
    assert.equal(removeUnverifiedHotlineHours(reply), reply);
    const both = 'El 911 atiende 24/7. También está la 171, opción 6.';
    assert.equal(removeUnverifiedHotlineHours(both), both);
  });
});
