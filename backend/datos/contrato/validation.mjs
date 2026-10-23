// validaciones compartidas del contrato de datos
// las importa la implementacion de sqlite para rechazar exactamente lo que dice database/contrato.md
// regla: el contrato valida el formato, las cuentas las hace el dominio

import { FIELD_BY_TYPE, ALERT_TYPES } from './types.mjs';

const DECIMAL = /^\d+(\.\d{1,8})?$/; // digitos con un punto y hasta ocho decimales

export function isValidDecimal(value) {
  return typeof value === 'string' && DECIMAL.test(value);
}

export function validateDecimal(value, field) {
  if (!isValidDecimal(value)) {
    throw new Error('decimal invalido en ' + field + ': ' + String(value));
  }
  return value;
}

export function validateNullableDecimal(value, field) {
  if (value == null) return null;
  return validateDecimal(value, field);
}

// entero mayor o igual al minimo (instantes, contadores, limites)
export function validateInteger(value, field, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error('entero invalido en ' + field + ': ' + String(value));
  }
  return value;
}

export function validateInstant(value, field) {
  return validateInteger(value, field, 0);
}

// booleanos guardados como 0 o 1
export function validateBoolean(value, field) {
  if (value !== 0 && value !== 1) {
    throw new Error('booleano invalido en ' + field + ': ' + String(value));
  }
  return value;
}

export function validateEnum(value, field, options) {
  if (!options.includes(value)) {
    throw new Error(field + ' invalido: ' + String(value) + ' (se espera uno de ' + options.join(', ') + ')');
  }
  return value;
}

// texto obligatorio: string, no puede estar vacio
export function validateText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('texto invalido en ' + field + ': ' + String(value));
  }
  return value;
}

export function validateNullableText(value, field) {
  if (value == null) return null;
  return validateText(value, field);
}

// parametro que la funcion necesita si o si
export function required(value, field) {
  if (value == null) throw new Error('parametro requerido: ' + field);
  return value;
}

// el par exchange + symbol viaja junto
export function validateSymbolPair(data) {
  required(data.exchange_id, 'exchange_id');
  required(data.symbol, 'symbol');
  validateText(data.exchange_id, 'exchange_id');
  validateText(data.symbol, 'symbol');
}

// rechaza campos desconocidos: nunca ignorar un typo
export function validateFields(obj, allowed) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('se espera un objeto');
  }
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new Error('campo desconocido: ' + key);
  }
}

// pareja tipo + campo de alertas, mismo criterio que el CHECK de la tabla
export function validateTypeField(tipo, campo) {
  validateEnum(tipo, 'tipo', ALERT_TYPES);
  if (tipo === 'indicador') {
    validateText(campo, 'campo');
  } else if (campo !== FIELD_BY_TYPE[tipo]) {
    throw new Error('campo ' + String(campo) + ' no corresponde al tipo ' + tipo + ' (se espera ' + FIELD_BY_TYPE[tipo] + ')');
  }
  return campo;
}

// lista de tags: no puede estar vacia, no puede repetir, devuelve copia validada
export function validateTags(tags) {
  if (tags == null) return [];
  if (!Array.isArray(tags)) throw new Error('tags: se espera una lista');
  const out = [];
  for (const tag of tags) {
    validateText(tag, 'tag');
    if (out.includes(tag)) throw new Error('tag repetida: ' + tag);
    out.push(tag);
  }
  return out;
}