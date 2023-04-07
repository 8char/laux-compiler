/**
  A WeakMap that stores paths of nodes in an abstract syntax tree (AST).
  @type {WeakMap}
*/
export let path = new WeakMap();

/**
  A WeakMap that stores the scope of nodes in an AST.
  @type {WeakMap}
*/
export let scope = new WeakMap();


/**
  Clears both the path and scope WeakMaps.
*/
export function clear() {
  clearPath();
  clearScope();
}

/**
  Clears the path WeakMap.
*/
export function clearPath() {
  path = new WeakMap();
}

/**
  Clears the scope WeakMap.
*/
export function clearScope() {
  scope = new WeakMap();
}