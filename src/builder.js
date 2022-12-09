import { VISITOR_KEYS, BUILDER_KEYS, ALIAS_KEYS } from "./types";

const b = exports;

function registerBuilder(type) {
  if (!type) return;

  const keys = BUILDER_KEYS[type];

  function builder() {
    if (arguments.length > keys.length) {
      throw new Error(
        `t.${type}: Too many arguments passed. Received ${arguments.length} but can receive ` +
        `no more than ${keys.length}`
      );
    }

    const node = {};
    node.type = type;

    let i = 0;

    for (const key of keys) {
      let arg = arguments[i++];

      node[key] = arg;
    }

    return node;
  }

  b[type] = builder;
  b[type[0].toLowerCase() + type.slice(1)] = builder;
}

export function literal(type, value, raw) {
  switch (type) {
    case "StringLiteral":
      return b.stringLiteral(value, raw);

    case "NumericLiteral":
      return b.numericLiteral(value, raw);

    case "BooleanLiteral":
      return b.booleanLiteral(value, raw);

    case "NilLiteral":
      return b.nilLiteral(value, raw);

    case "VarargLiteral":
      return b.varargLiteral(value, raw);
  }

  throw new Error(
    `Tried to create literal with invalid type ${type}`);
}

for (const type in BUILDER_KEYS) {
  registerBuilder(type);
}