import * as t from "../types.js";
import * as b from "../builder.js";

const visitor = {
  enter(path, state) {
    if (path.isIdentifier()) {
    }

    const isBareSuper = path.isCallExpression() && path.get("base").isSuperExpression();

    const result = state.buildSuper(path);

    if (result) {
      state.hasSuper = true;
    }

    if (isBareSuper) {
      state.bareSupers.push(path);
    }

    if (result === true) {
      path.requeue();
    }

    if (result !== true && result) {
      if (Array.isArray(result)) {
        path.replaceWithMultiple(result);
      }
      else {
        path.replaceWith(result);
      }

      let parent = path.find((p) => {
        return p.isCallExpression() || Array.isArray(path.container)
      });

      if (parent.isCallExpression()) {
        parent.replaceWith(
          b.callExpression(
            parent.node.base,
            [
              b.selfExpression(),
              ...parent.node.arguments
            ]
          )
        );
      }

    }
  }
}

export default class ReplaceSupers {
  constructor({ methodPath, methodNode, classRef }) {

    this.methodPath = methodPath;
    this.methodNode = methodNode;
    this.classRef = classRef

    this.scope = this.methodPath.scope;

    this.hasSuper = false;
    this.bareSupers = [];
  }

  getSuperProperty(property) {
    return b.memberExpression(
      this.classRef,
      ".",
      b.memberExpression(
        b.identifier("__parent"),
        ".",
        property
      )
    );
  }

  buildSuper(path) {
    const parent = path.parent;
    const node = path.node;

    let property;
    let args;

    if (path.isCallExpression()) {
      const base = node.base;

      if (t.isSuperExpression(base)) {
        property = b.identifier("__init");
        args = node.arguments;
      }
    }
    else if (t.isMemberExpression(node) && t.isSuperExpression(node.base)) {
      property = node.identifier;
    }
    else if (path.isSuperExpression()) {
      property = b.identifier("__init");
    }

    if (!property) return;

    const superProperty = this.getSuperProperty(property);

    if (args) {
      return b.callExpression(
        superProperty,
        args
      );
    }
    else {
      return superProperty
    }
  }

  replace() {
    this.methodPath.traverse(visitor, this);
  }
}