import traverse from "./visitor";
import * as virtualTypes from "./virtual-types";
import * as t from "./types";
import Scope from "./scope";
import { path as pathCache } from "./cache";

const hooks = [
  function(self, parent) {
    const removeParent =
      (self.condition === "test" && (parent.isWhileStatement()));

    if (removeParent) {
      parent.remove();
      return true
    }
  }
]

export default class NodePath {
  hub;
  node;
  scope;
  type;
  parent;
  parentPath;
  state;
  visitors;
  context;
  contexts;
  data;
  key;
  listKey;
  inList;

  removed;
  shouldSkip;
  shouldStop;

  constructor(hub, parent) {
    this.hub = hub;

    this.node = null;
    this.scope = null;
    this.type = null;

    this.parent = parent;
    this.parentPath = null;

    this.state = null;
    this.visitors = null;

    this.context = null;
    this.contexts = [];
    this.data = {};

    this.key = null;
    this.listKey = null;
    this.inList = false;

    this.removed = false;
    this.shouldSkip = false;
    this.shouldStop = false;
  }

  static get({ hub, parentPath, parent, container, listKey, key}) {
    if (!hub && parentPath) {
      hub = parentPath.hub;
    }

    const targetNode = container[key];

    let paths = pathCache.get(parent) || [];
    if (!pathCache.has(parent)) {
      pathCache.set(parent, paths);
    }

    let path

    for (let i = 0; i < paths.length; i++) {
      const pathCheck = paths[i];
      if (pathCheck.node == targetNode) {
        path = pathCheck
        break;
      }
    }

    if (!path) {
      path = new NodePath(hub, parent);
      paths.push(path);
    }

    path.setup(parentPath, container, listKey, key);

    return path;
  }

  get(key, context) {
    if (context === true) context = this.context;

    const parts = key.split(".");
    if (parts.length === 1) {
      return this._getKey(key, context);
    }

    return this._getPattern(parts, context);
  }

  // Scopes
  getScope(scope) {
    let ourScope = scope;

    if (this.isScope()) {
      ourScope = new Scope(this, scope);
    }

    return ourScope;
  }

  setScope() {
    if (this.visitors && this.visitors.noScope) return;

    let target = this.context && this.context.scope;

    if (!target) {
      let path = this.parentPath;
      while (path && !target) {
        if (path.visitors && path.visitors.noScope) return;

        target = path.scope;
        path = path.parentPath;
      }
    }

    this.scope = this.getScope(target);
    if (this.scope) this.scope.init();
  }

  getBindingIdentifiers(duplicates) {
    return t.getBindingIdentifiers(this.node, duplicates);
  }

  isStatic() {
    return this.scope.isStatic(this.node);
  }

  setData(key, val) {
    this.data[key] = val;
  }

  getData(key, def) {
    let val = this.data[key];
    if (!val && def) val = this.data[key] = def;
    return val;
  }

  getSibling(key) {
    return NodePath.get({
      parentPath: this.parentPath,
      parent: this.parent,
      container: this.container,
      listKey: this.listKey,
      key: key
    });
  }

  getPrevSibling() {
    return this.getSibling(this.key - 1);
  }

  getPrevSibling() {
    return this.getSibling(this.key + 1);
  }

  findParent(test) {
    let path = this;

    while (path = path.parentPath) {
      if (test(path)) return path;
    }

    return null;
  }

  find(test) {
    let path = this;

    do {
      if (test(path)) return path;
    }
    while (path = path.parentPath);

    return null;
  }

  findStatementParent() {
    return this.find((path) => Array.isArray(path.container));
  }

  getAncestry() {
    let path = this;
    const paths = [];

    do {
      paths.push(path);
    }
    while (path = path.parentPath);

    return paths;
  }

  isAncestor(maybeDescendant) {
    return maybeDescendant.isDescendant(this);
  }

  isDescendant(maybeAncestor) {
    return !!this.findParent((parent) => parent === maybeAncestor);
  }

  setup(parentPath, container, listKey, key) {
    this.inList = !!listKey;
    this.listKey = listKey;
    this.parentKey = listKey || key;
    this.container = container;

    this.parentPath = parentPath || this.parentPath;
    this.setKey(key);
  }

  setKey(key) {
    this.key = key;
    this.node = this.container[this.key];
    this.type = this.node && this.node.type;
  }

  setContext(context) {
    this.shouldStop = false;
    this.shouldSkip = false;
    this.removed = false;

    if (context) {
      this.context = context;
      this.state = context.state;
      this.visitors = context.visitors;
    }

    this.setScope();

    return this;
  }

  pushContext(context) {
    this.contexts.push(context);
    this.setContext(context);
  }

  popContext() {
    this.contexts.pop();
    this.setContext(this.contexts[this.contexts.length - 1]);
  }

  resync() {
    if (this.removed) return;

    this._resyncParent();
    this._resyncList();
    this._resyncKey();
  }

  traverse(visitors, state) {
    traverse(this.node, visitors, state, this.scope, this);
  }

  visit() {
    if (!this.node) return false;

    if (this.call("enter") || this.shouldSkip) {
      return this.shouldStop;
    }

    traverse.node(this.node, this.visitors, this.state, this.scope, this);

    this.call("exit");

    return this.shouldStop;
  }

  call(key) {
    const visitors = this.visitors;

    if (this.node) {
      if (this._call(visitors[key])) return true;
    }

    if (this.node) {
      return this._call(visitors[this.node.type] && visitors[this.node.type][key]);
    }

    return false;
  }

  requeue(pathToQueue = this) {
    if (pathToQueue.removed) return;

    const contexts = this.contexts;
    for (const context of contexts) {
      context.maybeQueue(pathToQueue);
    }
  }

  stop() {
    this.shouldStop = true;
    this.shouldSkip = true;
  }

  skip() {
    this.shouldSkip = true;
  }

  updateSiblingKeys(fromIndex, incrementBy) {
    if (!this.parent) return;

    const paths = pathCache.get(this.parent);
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path.key >= fromIndex) {
        path.key += incrementBy;
      }
    }
  }

  getStatementParent() {
    let path = this;
    do {
      if (Array.isArray(path.container)) {
        return path;
      }
    } while (path = path.parentPath);
  }

  remove() {
    this.resync();

    if (this._callRemovalHooks()) {
      this._markRemoved();
      return;
    }

    this._remove();
    this._markRemoved();
  }

  insertBefore(nodes) {
    if (!Array.isArray(nodes)) {
      nodes = [ nodes ];
    }

    if (Array.isArray(this.container)) {
      return this._containerInsertBefore(nodes);
    }
    else {
      let parent = this.getStatementParent();
      if (parent) {
        return parent.insertBefore(nodes);
      }

      throw new Error("We don't know what to do with this node type. " +
        "We were previously a Statement but we can't fit in here?");
    }
  }

  insertAfter(nodes) {
    if (!Array.isArray(nodes)) {
      nodes = [ nodes ];
    }

    if (Array.isArray(this.container)) {
      return this._containerInsertAfter(nodes);
    }
    else {
      let parent = this.getStatementParent();
      if (parent) {
        return parent.insertBefore(nodes);
      }

      throw new Error("We don't know what to do with this node type. " +
        "We were previously a Statement but we can't fit in here?");
    }
  }

  replaceWith(replacement) {
    this.resync();

    if (this.removed) {
      throw new Error(
        "You can't replace this node, we've already removed it");
    }

    if (replacement instanceof NodePath) {
      replacement = replacement.node;
    }

    if (!replacement) {
      throw new Error(
        "You passed `path.replaceWith()` with a falsy node, use `path.remove()` instead");
    }

    if (this.node === replacement) return;

    if (t.isChunk(this.node) && !t.isChunk(replacement)) {
      throw new Error(
        "You can only replace a Chunk root node with another Chunk node");
    }

    if (Array.isArray(replacement)) {
      throw new Error(
        "Don't use `path.replaceWith()` with an array of nodes, use `path.replaceWithMultiple()`");
    }

    if (typeof replacement === "string") {
      throw new Error(
        "Don't use `path.replaceWith()` with a source string, use `path.replaceWithSourceString()`");
    }

    if (t.isStatement(this.node) && t.isExpression(replacement)) {
      throw new Error(
        "Cannot replace a statement with an expression");
    }

    const oldNode = this.node;

    this._replaceWith(replacement);
    this.type = replacement.type;

    this.requeue();
  }

  replaceWithMultiple(nodes) {
    this.resync();

    this.node = this.container[this.key] = null;
    this.insertAfter(nodes);

    if (this.node) {
      this.requeue();
    }
    else {
      this.remove();
    }
  }

  isScope() {
    return t.isScope(this.node, this.parent)
  }

  _remove() {
    if (Array.isArray(this.container)) {
      this.container.splice(this.key, 1);
      this.updateSiblingKeys(this.key, -1);
    }
    else {
      this._replaceWith(null);
    }
  }

  _callRemovalHooks() {
    for (const fn of hooks) {
      if (fn(this, this.parentPath)) return true;
    }
  }

  _markRemoved() {
    this.shouldSkip = true;
    this.removed = true;
    this.node = null;
  }

  _containerInsert(from, nodes) {
    this.updateSiblingKeys(from, nodes.length);

    const paths = [];

    for (let i = 0; i < nodes.length; i++) {
      const to = from + i;
      const node = nodes[i];

      this.container.splice(to, 0, node);

      if (this.context) {
        const path = this.context.create(this.parent, this.container, to, this.listKey);

        if (this.context.queue) path.pushContext(this.context);
        paths.push(path);
      }
      else {
        paths.push(NodePath.get({
          parentPath: this.parentath,
          parent: this.parent,
          container: this.container,
          listKey: this.listKey,
          key: to
        }));
      }

      const contexts = this._getQueueContexts();

      for (const path of paths) {
        path.setScope();

        for (const context of contexts) {
          context.maybeQueue(path, true);
        }
      }
    }

    return paths;
  }

  _containerInsertBefore(nodes) {
    this._containerInsert(this.key, nodes);
  }

  _containerInsertAfter(nodes) {
    this._containerInsert(this.key + 1, nodes);
  }

  _replaceWith(node) {
    if (!this.container) {
      throw new ReferenceError("Container is falsy");
    }

    if (this.inList) {
    }

    this.node = this.container[this.key] = node;
  }

  _call(fns) {
    if (!fns) return false;

    for (const fn of fns) {
      if (!fn) continue;

      const node = this.node;
      if (!node) return true;

      const ret = fn.call(this.state, this, this.state);
      if (ret) throw new Error(`Unexpected return value from visitor method ${fn}`);

      if (this.node !== node) return true;

      if (this.shouldStop || this.shouldSkip || this.removed) return true;
    }

    return false;
  }

  _resyncParent() {
    if (this.parentPath)
      this.parent = this.parentPath.node;
  }

  _resyncKey() {
    if (!this.container) return;
    if (this.node === this.container[this.key]) return;

    if (Array.isArray(this.container)) {
      for (let i = 0; i < this.container.length; i++) {
        if (this.container[i] === this.node) {
          return this.setKey(i);
        }
      }
    }
    else {
      for (const key in this.container) {
        if (this.container[key] === this.node) {
          return this.setKey(key);
        }
      }
    }

    // ¯\_(ツ)_/¯ who knows where it's gone lol
    this.key = null;
  }

  _resyncList() {
    if (!this.parent || !this.inList) return;

    const newContainer = this.parent[this.listKey];
    if (this.container === newContainer) return;

    this.container = newContainer || null;
  }

  _getQueueContexts() {
    let path = this;
    let contexts = this.contexts;

    while (!contexts.length) {
      path = path.parentPath;
      contexts = path.contexts;
    }

    return contexts;
  }

  _getKey(key, context) {
    const node = this.node;
    const container = node[key];

    if (Array.isArray(container)) {
      return container.map((_, i) => {
        return NodePath.get({
          listKey: key,
          parentPath: this,
          parent: node,
          container: container,
          key: i
        }).setContext(context);
      });
    }
    else {
      return NodePath.get({
        parentPath: this,
        parent: node,
        container: node,
        key: key
      }).setContext(context);
    }
  }

  _getPattern(parts, context) {
    let path = this;

    for (const part of parts) {
      if (part === ".") {
        path = path.parentPath;
      }
      else {
        if (Array.isArray(path)) {
          path = path[part];
        }
        else {
          path = path.get(part, context);
        }
      }
    }

    return path;
  }
}

for (const type of t.TYPES) {
  const typeKey = `is${type}`;
  NodePath.prototype[typeKey] = function(opts) {
    return t[typeKey](this.node, opts);
  };

  NodePath.prototype[`assert${type}`] = function(opts) {
    if (!this[typeKey](opts)) {
      throw new TypeError(`Expected node path of type ${type}`);
    }
  };
}

for (const type in virtualTypes) {
  if (type[0] === "_") continue;
  if (t.TYPES.indexOf(type) < 0) t.TYPES.push(type);

  const virtualType = virtualTypes[type];

  NodePath.prototype[`is${type}`] = function (opts) {
    return virtualType.checkPath(this, opts);
  };
}
