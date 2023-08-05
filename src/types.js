import { VISITOR_KEYS, BUILDER_KEYS, ALIAS_KEYS } from "./definitions";

import "./definitions/init";

export { VISITOR_KEYS, BUILDER_KEYS, ALIAS_KEYS };

const t = exports;

t.INHERIT_KEYS = {
  optional: [],
  force: ["range", "loc"],
};

function registerType(type) {
  const isFunc = t[`is${type}`];
  if (!isFunc) {
    t[`is${type}`] = (node, opts) => {
      return t.is(type, node, opts);
    };
  }

  t[`assert${type}`] = (node, opts = {}) => {
    if (!isFunc(node, opts)) {
      throw new Error(
        `Expected type ${JSON.stringify(type)} with option ${JSON.stringify(
          opts,
        )}`,
      );
    }
  };
}

t.FLIPPED_ALIAS_KEYS = {};
Object.keys(ALIAS_KEYS).forEach((type) => {
  t.ALIAS_KEYS[type].forEach((alias) => {
    const aliasKeys = t.FLIPPED_ALIAS_KEYS[alias];
    const types = aliasKeys || [];

    types.push(type);
  });
});

Object.entries(VISITOR_KEYS).forEach(([type]) => {
  registerType(type);
});

Object.keys(ALIAS_KEYS).forEach((key) => {
  ALIAS_KEYS[key].forEach((type) => {
    registerType(type);
  });
});

export function isType(nodeType, type) {
  if (nodeType === type) return true;

  if (t.ALIAS_KEYS[type]) return false;

  const aliases = t.FLIPPED_ALIAS_KEYS[type];
  if (aliases) {
    if (aliases[0] === nodeType) return true;

    const isAliasPresent = aliases.some((alias) => nodeType === alias);

    if (isAliasPresent) {
      return true;
    }
  }

  return false;
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

export function isScope(node) {
  return t.isScopable(node);
}

export function isReferenced(/* node, parent */) {
  return true;
}

export function isBlockScoped(node) {
  return t.isClassStatement(node);
}

export function shallowEqual(actual, expected) {
  const keys = Object.keys(expected);

  return keys.every((key) => actual[key] === expected[key]);
}

// TODO: Rework this as it uses "dangling underscores" to denote private members, which is being phased out
export function inherits(child, parent) {
  if (!child || !parent) return child;

  // force inherit "private" properties
  Object.keys(parent).forEach((key) => {
    console.log(parent[key]);
    if (key[0] === "_") {
      child[key] = parent[key];
    }
  });

  // force inherit select properties
  Object.keys(t.INHERIT_KEYS.force).forEach((key) => {
    child[key] = parent[key];
  });

  // t.inheritsComments(child, parent);

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
        const nameToIdentifiersMap = ids[id.name] || (ids[id.name] = []);
        nameToIdentifiersMap.push(id);
      } else {
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
      for (let i = 0; i < keys.length; i += 1) {
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

  // FunctionDeclaration: ["id", "params"],
  // FunctionDeclaration: ["id", "params"],

  ClassStatement: ["identifier"],
  // ClassExpression: ["id"],
};

export function getOuterBindingIdentifiers(node, duplicates) {
  return getBindingIdentifiers(node, duplicates, true);
}

export const TYPES = Object.keys(t.VISITOR_KEYS).concat(
  Object.keys(t.FLIPPED_ALIAS_KEYS),
);
