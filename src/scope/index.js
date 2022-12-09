import includes from "lodash/includes";
import repeat from "lodash/repeat";
import defaults from "lodash/defaults";
// import Renamer from "./lib/renamer";
import NodePath from "../path";
import traverse from "../visitor";
import Binding from "./binding";
import * as t from "../types";
import { scope as scopeCache } from "../cache";

let _crawlCallsCount = 0;

function getCache(path, parentScope, self) {
  const scopes = scopeCache.get(path.node) || [];

  for (const scope of scopes) {
    if (scope.parent === parentScope && scope.path === path) return scope;
  }

  scopes.push(self);

  if (!scopeCache.has(path.node)) {
    scopeCache.set(path.node, scopes);
  }
}

// Recursively gathers the identifying names of a node.
function gatherNodeParts(node, parts) {
  if (t.isMemberExpression(node)) {
    gatherNodeParts(node.left, parts);
    gatherNodeParts(node.right, parts);
  }
  else if (t.isIdentifier(node)) {
    parts.push(node.value);
  }
  else if (t.isCallExpression(node)) {
    gatherNodeParts(node.base, parts);
  }
}

const collectorVisitor = {
  Declaration(path) {
    if (path.isBlockScoped()) return;

    path.scope.getBlockParent().registerDeclaration(path);
  },

  ForOfStatement(path, state) {
    var variables = path.get("variables");
    for (var variable of variables) {
      path.scope.getBlockParent().registerBinding("var", variable);

      state.constantViolations.push(variable);
    }
  },

  ForGenericStatement(path, state) {
    var variables = path.get("variables");
    for (var variable of variables) {
      path.scope.getBlockParent().registerBinding("var", variable);

      state.constantViolations.push(variable);
    }
  },

  ForNumericStatement(path, state) {
    var variable = path.get("variable");
    if (variable) {
      path.scope.getBlockParent().registerBinding("var", variable);

      state.constantViolations.push(variable);
    }
  },

  BlockScoped(path, state) {
    let scope = path.scope;
    if (scope.path === path) scope = scope.parent;
    scope.getBlockParent().registerDeclaration(path);
  },

  ClassStatement(path, state) {
    const id = path.node.identifier;
    if (!id) return;

    var name = id.name;
    var binding = path.scope.getBinding(name);
    if (binding)
      path.scope.bindings[name] = path.scope.getBinding(name);
  },

  MutationStatement(path, state) {
    state.constantViolations.push(path.get("expression"));
  },

  AssignmentStatement(path, state) {
    state.assignments.push(path);
  },

  ReferencedIdentifier(path, state) {
    state.references.push(path);
  }
}

let uid = 0;
export default class Scope {
  constructor(path, parentScope) {
    if (parentScope && parentScope.block == path.node) {
      return parentScope;
    }

    const cached = getCache(path, parentScope, this);
    if (cached) return cached;

    this.uid = uid++;
    this.parent = parentScope;
    this.hub = path.hub;

    this.parentBlock = path.parent;
    this.block = path.node;
    this.path = path;

    this.labels = new Map();
  }

  static globals = [];
  static contextVariables = [];

  traverse(node, visitors, state) {
    traverse(node, visitors, state, this, this.path);
  }

  generateDeclaredUidIdentifier(name = "temp") {
    const id = this.generateUidIdentifier(name);
    this.push({ id });
    return id;
  }

  generateUidIdentifier(name = "temp") {
    return t.identifier(this.generateUid(name));
  }

  generateUid(name = "temp") {
    name = t.toIdentifier(name).replace(/^_+/, "").replace(/[0-9]+$/g, "");

    let uid;
    let i = 0;
    do {
      uid = this._generateUid(name, i);
      i++;
    }
    while (this.hasLabel(uid) || this.hasBinding(uid) || this.hasGlobal(uid) || this.hasReference(uid));

    const chunk = this.getChunkParent();
    chunk.references[uid] = true;
    chunk.uids[uid] = true;

    return uid;
  }

  _generateUid(name, i) {
    let id = name;
    if (i > 1) id += i;
    return `_${id}`;
  }

  generateUidIdentifierBasedOnNode(parent, defaultName)   {
    let node = parent;

    const parts = [];
    gatherNodeParts(node, parts);

    let id = parts.join("$");
    id = id.replace(/^_/, "") || defaultName || "ref";

    return this.generateUidIdentifier(id.slice(0, 20));
  }

  isStatic(node)   {
    // Check self identifier

    if (t.isIdentifier(node)) {
      const binding = this.getBinding(node.name);
      if (binding) {
        return binding.constant;
      }
      else {
        return this.hasBinding(node.name);
      }
    }
  }

  checkBlockScopedCollisions(local, kind, name, id) {
    if (kind === "param") return;
  }

  rename(oldName, newName, block) {
    const binding = this.getBinding(oldName);
    if (binding) {
      newName = newName || this.generateUidIdentifier(oldName).name;
      // TODO: Call renamer class
      // return new Renamer(binding, oldName, newName).rename(block);
    }
  }

  _renameFromMap(map, oldName, newName, value) {
    if (map[oldName]) {
      map[newName] = value;
      map[oldName] = null;
    }
  }

  dump() {
    const sep = repeat("-", 60);

    console.log(sep);
    let scope = this;
    do {
      console.log("#", scope.block.type);
      for (const name in scope.bindings) {
        const binding = scope.bindings[name];
        console.log(" -", name, {
          constant: binding.constant,
          references: binding.references,
          violations: binding.constantViolations.length,
          kind: binding.kind
        });
      }
    }
    while (scope = scope.parent);
    console.log(sep);
  }

  toArray(node, i) {
    const file = this.hub.file;

    if (t.isIdentifier(node)) {
      const binding = this.getBinding(node.name);
      if (binding && binding.constant && binding.path.isGenericType("Array")) return node;
    }

    let helperName = "toArray";
    const args = [node];
    if (i === true) {
      helperName = "toConsumableArray";
    }

    // TODO finish
  }

  hasLabel(name) {
    return !!this.getLabel(name);
  }

  getLabel(name) {
    return this.labels.get(name);
  }

  registerLabel(path) {
    this.labels.set(path.node.label.name, path);
  }

  registerDeclaration(path) {
    if (path.isLocalStatement()) {
      const variables = path.get("variables");

      for (const variable of variables) {
        this.registerBinding("var", variable)
      }
    }
    else if (path.isClassStatement()) {
      this.registerBinding("var", path);
    }
    else {
      this.registerBinding("unknown", path);
    }
  }

  buildUndefinedNode() {
  }

  registerConstantViolation(path) {
    const ids = path.getBindingIdentifiers();
    for (const name in ids) {
      const binding = this.getBinding(name);
      if (binding) binding.reassign(path);
    }
  }

  registerBinding(kind, path, bindingPath) {
    if (!kind) throw new ReferenceError("no `kind`");

    // TODO: Register variable declarations
    /*
    if (path.isVariableDeclaration()) {
    }
    */

    const parent = this.getChunkParent();
    const ids = path.getBindingIdentifiers(true);

    for (const name in ids) {
      for (const id of ids[name]) {
        let local = this.getOwnBinding(name);
        if (local) {
          if (local.identifier === id) continue;

          this.checkBlockScopedCollisions(local, kind, name, id);
        }

        parent.references[name] = true;

        this.bindings[name] = new Binding({
          identifier: id,
          existing: local,
          scope: this,
          path: bindingPath,
          kind: kind
        });
      }
    }
  }

  addGlobal(node) {
    this.globals[node.name] = node;
  }

  hasUid(name) {
    let scope = this;

    do {
      if (scope.uids[name]) return true;
    } while (scope = scope.parent);

    return false;
  }

  hasGlobal(name) {
    let scope = this;

    do {
      if (scope.globals[name]) return true;
    } while (scope = scope.parent);

    return false;
  }

  hasReference(name) {
    let scope = this;

    do {
      if (scope.references[name]) return true;
    } while (scope = scope.parent);

    return false;
  }

  isPure(node, constantsOnly) {
    if (t.isIdentifier(node)) {
      const binding = this.getBinding(node.name);
      if (!binding) return false;
      if (constantsOnly) return binding.constant;

      return true;
    }
  }

  setData(key, val) {
    return this.data[key] = val;
  }

  getData(key) {
    let scope = this;
    do {
      const data = scope.data[key];
      if (data != null) return data;
    }
    while (scope = scope.parent);
  }

  removeData(key) {
    let scope = this;
    do {
      const data = scope.data[key];
      if (data != null) scope.data[key] = null;
    }
    while (scope = scope.parent);
  }

  init() {
    if (!this.references) this.crawl();
  }

  crawl() {
    _crawlCallsCount++;
    this._crawl();
    _crawlCallsCount--;
  }

  _crawl() {
    const path = this.path;

    this.references = Object.create(null);
    this.bindings = Object.create(null);
    this.globals = Object.create(null);
    this.uids = Object.create(null);
    this.data = Object.create(null);

    // TODO: Register for loops

    // TODO: Register function expression

    // TODO: Register class

    if (path.isFunction()) {
      const params = path.get("parameters");
      for (const param of params) {
        this.registerBinding("param", param);
      }
    }

    const parent = this.getChunkParent();
    if (parent.crawling) return;

    const state = {
      references: [],
      constantViolations: [],
      assignments: []
    };

    this.crawling = true;
    path.traverse(collectorVisitor, state);
    this.crawling = false;

    for (const path of state.assignments) {
      const ids = path.getBindingIdentifiers();
      let chunkParent;
      for (const name in ids) {
        if (path.scope.getBinding(name)) continue;

        chunkParent = chunkParent || path.scope.getChunkParent();
        chunkParent.addGlobal(ids[name]);
      }

      path.scope.registerConstantViolation(path);
    }

    for (const ref of state.references) {
      const binding = ref.scope.getBinding(ref.node.name);
      if (binding) {
        binding.reference(ref);
      }
      else {
        ref.scope.getChunkParent().addGlobal(ref.node);
      }
    }

    for (const path of state.constantViolations) {
      path.scope.registerConstantViolation(path);
    }
  }

  push(opts) {
    let path = this.path;

    // TODO

    const unique = opts.unique;
    const blockHoist = opts._blockHoist == null ? 2 : opts._blockHoist;

    const dataKey = `declaration:${king}:${blockHoist}`;
    let declarPath = !unique && path.getData(dataKey);

    // TODO: Declare
    if (!declarPath) {
    }
  }

  getChunkParent() {
    let scope = this;
    do {
      if (scope.path.isChunk()) {
        return scope;
      }
    }
    while (scope = scope.parent);

    throw new Error("We couldn't find a Function or Chunk...");
  }

  getFunctionParent() {
    let scope = this;
    do {
      if (scope.path.isFunctionParent()) {
        return scope;
      }
    } while (scope = scope.parent);
    throw new Error("We couldn't find a Function or Chunk...");
  }

  getBlockParent() {
    let scope = this;
    do {
      if (scope.path.isBlockStatement()) {
        return scope;
      }
    } while (scope = scope.parent);
    throw new Error("We couldn't find a BlockStatement, For, Switch, Function, Loop or Program...");
  }

  getAllBindings(){
    const ids = Object.create(null);

    let scope = this;
    do {
      defaults(ids, scope.bindings);
      scope = scope.parent;
    }
    while (scope);

    return ids;
  }

  getAllBindingsOfKind() {
    const ids = Object.create(null);

    for (const kind of arguments) {
      let scope = this;
      do {
        for (const name in scope.bindings) {
          const binding = scope.bindings[name];
          if (binding.kind === kind) ids[name] = binding;
        }
        scope = scope.parent;
      }
      while (scope);
    }

    return ids;
  }

  bindingIdentifierEquals(name, node) {
    return this.getBindingIdentifiers(name) === node;
  }

  getBinding(name) {
    let scope = this;

    do {
      const binding = scope.getOwnBinding(name);
      if (binding) return binding;
    }
    while (scope = scope.parent);
  }

  getOwnBinding(name) {
    return this.bindings[name];
  }

  getBindingIdentifier(name) {
    const info = this.getBinding(name);
    return info && info.identifier;
  }

  getOwnBindingIdentifier(name) {
    const binding = this.bindings[name];
    return binding && binding.identifier;
  }

  hasOwnBinding(name) {
    return !!this.getOwnBinding(name);
  }

  hasBinding(name, noGlobals) {
    if (!name) return false;
    if (this.hasOwnBinding(name)) return true;
    if (this.parentHasbinding(name, noGlobals)) return true;
    if (this.hasUid(name)) return true;
    if (!noGlobals && includes(Scope.globals, name)) return true;
    if (!noGlobals && includes(Scope.contextVariables, name)) return true;
    return false;
  }

  parentHasbinding(name, noGlobals) {
    return this.parent && this.parent.hasBinding(name, noGlobals);
  }

  moveBindingTo(name, scope) {
    const info = this.getBinding(name);
    if (info) {
      info.scope.removeOwnBinding(name);
      info.scope = scope;
      scope.bindings[name] = info;
    }
  }

  removeOwnBinding(name) {
    delete this.bindings[name];
  }

  removeBinding(name) {
    const info = this.getBinding(name);
    if (info) {
      info.scope.removeOwnBinding(name);
    }

    let scope = this;
    do {
      if (scope.uids[name]) {
        scope.uids[name] = false;
      }
    }
    while (scope = scope.parent);
  }
}