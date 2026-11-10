/**
 * Buscador de condiciones y alergias (app/src/features/auth/utils/medical-search.ts):
 * errores de escritura, palabras de la gente y escritura normalizada.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatCustomMedicalItem, suggestMedicalOptions } from '../../src/features/auth/utils/medical-search';

const OPTIONS = ['Diabetes', 'Hipertensión arterial', 'Asma', 'Enfermedad tiroidea', 'AINEs (ibuprofeno, aspirina)'];
const SYNONYMS = {
  'Hipertensión arterial': ['presión alta', 'tensión alta'],
  Diabetes: ['azúcar alta', 'glucosa'],
  'Enfermedad tiroidea': ['tiroides'],
};

const first = (query: string) => suggestMedicalOptions(query, OPTIONS, SYNONYMS)[0];

describe('suggestMedicalOptions', () => {
  it('ignora mayúsculas, tildes y espacios', () => {
    assert.deepEqual(first('  DIABETES '), { item: 'Diabetes', reason: 'exact' });
    assert.deepEqual(first('hipertension arterial'), { item: 'Hipertensión arterial', reason: 'exact' });
  });

  it('encuentra por el comienzo de una palabra', () => {
    assert.equal(first('hiper')?.item, 'Hipertensión arterial');
    assert.equal(first('ibupro')?.item, 'AINEs (ibuprofeno, aspirina)');
  });

  it('sugiere la opción correcta ante errores de escritura', () => {
    assert.deepEqual(first('iabetes'), { item: 'Diabetes', reason: 'typo' });
    assert.deepEqual(first('diabetis'), { item: 'Diabetes', reason: 'typo' });
    assert.deepEqual(first('asmma'), { item: 'Asma', reason: 'typo' });
  });

  it('entiende palabras comunes de la gente', () => {
    assert.deepEqual(first('presion alta'), { item: 'Hipertensión arterial', reason: 'synonym', via: 'presión alta' });
    assert.deepEqual(first('tiroides'), { item: 'Enfermedad tiroidea', reason: 'synonym', via: 'tiroides' });
    assert.equal(first('azucar')?.item, 'Diabetes');
  });

  it('no inventa coincidencias para algo distinto', () => {
    assert.deepEqual(suggestMedicalOptions('migraña', OPTIONS, SYNONYMS), []);
    assert.deepEqual(suggestMedicalOptions('a', OPTIONS, SYNONYMS), []);
  });

  it('pone primero la coincidencia exacta y no repite opciones', () => {
    const results = suggestMedicalOptions('asma', OPTIONS, SYNONYMS);
    assert.equal(results[0]?.item, 'Asma');
    assert.equal(new Set(results.map((result) => result.item)).size, results.length);
  });
});

describe('formatCustomMedicalItem', () => {
  it('limpia espacios y pone la primera letra en mayúscula', () => {
    assert.equal(formatCustomMedicalItem('  migraña   crónica '), 'Migraña crónica');
    assert.equal(formatCustomMedicalItem('MIGRAÑA'), 'MIGRAÑA');
    assert.equal(formatCustomMedicalItem('lupus'), 'Lupus');
  });
});
