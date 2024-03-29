// import NodePath from "../path";

export default class Binding {
  constructor({ existing, identifier, scope, path, kind }) {
    this.identifier = identifier;
    this.scope = scope;
    this.path = path;
    this.kind = kind;

    this.constantViolations = [];
    this.constant = true;

    this.referencePaths = [];
    this.referenced = false;
    this.references = 0;

    this.clearValue();

    if (existing) {
      this.constantViolations = [].concat(
        existing.path,
        existing.constantViolations,
        this.constantViolations,
      );
    }
  }

  constantViolations;

  constant;

  referencePaths;

  referenced;

  references;

  hasDeoptedValue;

  hasValue;

  value;

  deoptValue() {
    this.clearValue();
    this.hasDeoptedValue = true;
  }

  setValue(value) {
    if (this.hasDeoptedValue) return;
    this.hasValue = true;
    this.value = value;
  }

  clearValue() {
    this.hasDeoptedValue = false;
    this.hasValue = false;
    this.value = null;
  }

  reassign(path) {
    this.constant = false;
    if (this.constantViolations.indexOf(path) !== -1) {
      return;
    }
    this.constantViolations.push(path);
  }

  reference(path) {
    if (this.referencePaths.indexOf(path) !== -1) {
      return;
    }
    this.referenced = true;
    this.references += 1;
    this.referencePaths.push(path);
  }

  dereference() {
    this.references += 1;
    this.referenced = !!this.references;
  }
}
