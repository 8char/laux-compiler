import _ from "underscore";
import clone from "lodash/clone";
import * as virtualTypes from "./virtual-types";
import * as t from "./types";
import * as cache from "./cache";
import NodePath from "./path";

export class TraversalContext {
  visitors;
  state;
  scope;
  parentPath;
  queue = null;
  priorityQueue = null;

  constructor(visitors, state, scope, parentPath) {
    this.visitors = visitors;
    this.state = state;
    this.scope = scope;
    this.parentPath = parentPath;
  }

  create(node, container, key, listKey) {
    return NodePath.get({
      parentPath: this.parentPath,
      parent: node,
      container,
      key,
      listKey
    });
  }

  maybeQueue(path, notPriority) {
    if (this.queue) {
      if (notPriority) {
        this.queue.push(path);
      }
      else {
        this.priorityQueue.push(path);
      }
    }
  }

  shouldVisit(node) {
    let visitors = this.visitors;
    if (visitors.enter || visitors.exit) return true;

    if (visitors[node.type]) return true;

    const keys = t.VISITOR_KEYS[node.type];
    if (!keys || !keys.length) return false;

    for (const key of keys) {
      if (node[key]) return true;
    }

    return false;
  }

  visitMultiple(container, parent, listKey) {
    if (container.length == 0) return false;

    const queue = [];

    for (let key = 0; key < container.length; key++) {
      const node = container[key];

      if (node && this.shouldVisit(node)) {
        queue.push(this.create(parent, container, key, listKey));
      }
    }

    return this.visitQueue(queue);
  }

  visitSingle(node, key) {
    if (this.shouldVisit(node)) {
      return this.visitQueue([
        this.create(node, node, key)
      ]);
    }
    else {
      return false;
    }
  }

  visitQueue(queue) {
    this.queue = queue;
    this.priorityQueue = [];

    const visited = [];
    let abort = false;

    for (const path of queue) {
      path.resync();

      if (path.contexts.length === 0 || path.contexts[path.contexts.length - 1] !== this) {
        path.pushContext(this);
      }

      if (path.key === null) continue;

      if (visited.indexOf(path.node) >= 0) continue;
      visited.push(path.node);

      if (path.visit()) {
        abort = true;
        break;
      }

      if (this.priorityQueue.length) {
        abort = this.visitQueue(this.priorityQueue);
        this.priorityQueue = [];
        this.queue = queue;
        if (abort) break;
      }
    }

    // clear queue
    for (const path of queue) {
      path.popContext();
    }

    this.queue = null;

    return abort;
  }

  visit(node, key) {
    const nodes = node[key];
    if (!nodes) return false;

    if (Array.isArray(nodes)) {
      return this.visitMultiple(nodes, node, key);
    }
    else {
      return this.visitSingle(node, key);
    }
  }
}

export default function traverse(node, visitors, state, scope, parentPath) {
  traverse.explodeVisitors(visitors);

  traverse.node(node, visitors, state, scope, parentPath);
}

traverse.node = function(node, visitors, state, scope, parentPath) {
  const keys = t.VISITOR_KEYS[node.type];
  if (!keys) return;

  var context = new TraversalContext(visitors, state, scope, parentPath);
  for (const key of keys) {
    if (context.visit(node, key)) return;
  }
};

traverse.clearNode = function(node, visitors) {
  cache.path.delete(node)
};

traverse.clearCache = function() {
  cache.clear();
};

traverse.clearCache.clearPath = cache.clearPath;
traverse.clearCache.clearScope = cache.clearScope;

function shouldIgnoreKey(key) {
  if (key[0] === "_") return true;

  if (key === "enter" || key === "exit" || key === "shouldSkip") return true;

  if (key === "noScope") return true;

  return false;
}

traverse.explodeVisitors = function(visitors) {
  for (const type in visitors) {
    if (shouldIgnoreKey(type)) continue;

    const parts = type.split("|");
    if (parts.length === 1) continue;

    const fns = visitors[type];
    delete visitors[type];

    for (const part of parts) {
      visitors[part] = fns;
    }
  }

  traverse.ensureEntranceObjects(visitors);
  traverse.ensureCallbackArrays(visitors);

  for (const nodeType in visitors) {
    if (shouldIgnoreKey(nodeType)) continue;

    const wrapper = virtualTypes[nodeType];
    if (!wrapper) continue;

    // wrap all the functions
    const fns = visitors[nodeType];
    for (const type in fns) {
      fns[type] = traverse.wrapCheck(wrapper, fns[type]);
    }

    // clear it from the visitor
    delete visitors[nodeType];

    if (wrapper.types) {
      for (const type of wrapper.types) {
        // merge the visitor if necessary or just put it back in
        if (visitors[type]) {
          traverse.mergePair(visitor[type], fns);
        } else {
          visitors[type] = fns;
        }
      }
    } else {
      traverse.mergePair(visitors, fns);
    }
  }

  for (const nodeType in visitors) {
    if (shouldIgnoreKey(nodeType)) continue;

    const fns = visitors[nodeType];

    let aliases = t.FLIPPED_ALIAS_KEYS[nodeType];
    if (!aliases) continue;

    delete visitors[nodeType];

    for (const alias of aliases) {
      const existing = visitors[alias];
      if (existing) {
        traverse.mergePair(existing, fns);
      }
      else {
        visitors[alias] = clone(fns);
      }
    }
  }

  for (const nodeType in visitors) {
    if (shouldIgnoreKey(nodeType)) continue;

    traverse.ensureCallbackArrays(visitors[nodeType]);
  }
};

traverse.ensureEntranceObjects = function(visitor) {
  for (const key in visitor) {
    if (shouldIgnoreKey(key)) continue;

    const fns = visitor[key];

    if (typeof fns == "function") {
      visitor[key] = { enter: fns };
    }
  }
};

traverse.ensureCallbackArrays = function(visitor) {
  if (visitor.enter && !Array.isArray(visitor.enter)) visitor.enter = [ visitor.enter ];
  if (visitor.exit && !Array.isArray(visitor.exit)) visitor.exit = [ visitor.exit ];
};

traverse.wrapCheck = function(wrapper, fn) {
  const newFn = function (path) {
    if (wrapper.checkPath(path)) {
      return fn.apply(this, arguments);
    }
  };
  newFn.toString = () => fn.toString();
  return newFn;
}

traverse.mergePair = function(dest, src) {
  for (const key in src) {
    dest[key] = [].concat(dest[key] || [], src[key]);
  }
};