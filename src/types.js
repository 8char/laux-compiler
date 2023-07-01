import { VISITOR_KEYS, BUILDER_KEYS, ALIAS_KEYS } from "./definitions";
export { VISITOR_KEYS, BUILDER_KEYS, ALIAS_KEYS }

import "./definitions/init";

const t = exports;

t.INHERIT_KEYS = {
  optional: [],
  force: ["range", "loc"]
};

function registerType(type) {
  let is = t[`is${type}`];
  if (!is) {
    t[`is${type}`] = function(node, opts) {
      return t.is(type, node, opts);
    }
  }

  t[`assert${type}`] = function(node, opts) {
    opts = opts || {};
    if (!is(node, opts)) {
      throw new Error(`Expected type ${JSON.stringify(type)} with option ${JSON.stringify(opts)}`);
    }
  }
}

t.FLIPPED_ALIAS_KEYS = {};
Object.keys(ALIAS_KEYS).forEach(function(type) {
  t.ALIAS_KEYS[type].forEach(function(alias) {
    const types = t.FLIPPED_ALIAS_KEYS[alias] = t.FLIPPED_ALIAS_KEYS[alias] || [];
    types.push(type);
  });
});

for (const type in VISITOR_KEYS) {
  registerType(type);
}

for (const key in ALIAS_KEYS) {
  for (const type of ALIAS_KEYS[key]) {
    registerType(type);
  }
}

export function is(type, node, opts) {
  if (!node) return false;

  const matches = isType(node.type, type);
  if (!matches) return false;

  if (typeof opts === "undefined") {
    return true;
  }

  return t.shallowEqual(node, opts);
}

export function isType(nodeType, type) {
  if (nodeType == type) return true;

  if (t.ALIAS_KEYS[type]) return false;

  const aliases = t.FLIPPED_ALIAS_KEYS[type];
  if (aliases) {
    if (aliases[0] === nodeType) return true;

    for (const alias of aliases) {
      if (nodeType === alias) return true;
    }
  }

  return false;
}

export function isScope(node, parent) {
  return t.isScopable(node);
}

export function isReferenced(node, parent) {
  switch (parent.type) {

  }

  return true;
}

export function isBlockScoped(node) {
  return t.isClassStatement(node);
}

export function shallowEqual(actual, expected) {
  const keys = Object.keys(expected);

  for (const key of keys) {
    if (actual[key] !== expected[key]) {
      return false;
    }
  }

  return true;
}

export function inherits(child, parent) {
  if (!child || !parent) return child;

  // force inherit "private" properties
  for (const key in parent) {
    if (key[0] === "_") child[key] = parent[key];
  }

  // force inherit select properties
  for (const key of t.INHERIT_KEYS.force) {
    child[key] = parent[key];
  }

  //t.inheritsComments(child, parent);

  return child;
}

export function getBindingIdentifiers(node, duplicates, outerOnly) {
  let search = [].concat(node);
  const ids = Object.create(null);

  while (search.length) {
    const id = search.shift();
    if (!id) continue;

    const keys = t.getBindingIdentifiers.keys[id.type];

    if (t.isIdentifier(id)) {
      if (duplicates) {
        const _ids = ids[id.name] = ids[id.name] || [];
        _ids.push(id);
      }
      else {
        ids[id.name] = id;
      }
      continue;
    }

    if (outerOnly) {
      if (t.isFunctionDeclaration(id)) {
        search.push(id.id);
        continue;
      }

      if (t.isFunctionDeclaration(id)) {
        continue;
      }
    }

    if (keys) {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        if (id[key]) {
          search = search.concat(id[key]);
        }
      }
    }
  }

  return ids;
}

t.getBindingIdentifiers.keys = {
  UnaryExpression: ["argument"],
  AssignmentStatement: ["variables"],

  //FunctionDeclaration: ["id", "params"],
  //FunctionDeclaration: ["id", "params"],

  ClassStatement: ["identifier"],
  //ClassExpression: ["id"],
};

export function getOuterBindingIdentifiers(node, duplicates) {
  return getBindingIdentifiers(node, duplicates, true);
}

export const TYPES = Object.keys(t.VISITOR_KEYS)
  .concat(Object.keys(t.FLIPPED_ALIAS_KEYS));