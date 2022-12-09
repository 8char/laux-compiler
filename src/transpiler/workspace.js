import path from "path";

function getAbsolutePath(p) {
  if (p) {
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  }

  return process.cwd();
}

export default class Workspace {
  constructor(data, release = false) {
    const json = JSON.parse(data);

    this.merges = json.merges || {};
    this.input = json.path.input;
    this.output = json.path.output;
    this.debug = json.debug || false;
    this.ast = json.ast || false;
    this.minify = json.minify || false;
    this.obfuscate = json.obfuscate || false;
    this.indent = json.indent || 4;
    this.release = release;
  }

  getMerges() {
    return this.merges;
  }

  getInput() {
    return this.input;
  }

  getOutput() {
    return this.output;
  }

  getAbsoluteInput() {
    return getAbsolutePath(this.getInput());
  }

  getAbsoluteOutput() {
    return getAbsolutePath(this.getOutput());
  }

  getDebug() {
    return this.debug;
  }

  getAST() {
    return this.ast;
  }

  getMinify() {
    return this.minify;
  }

  getObfuscate() {
    return this.obfuscate;
  }

  getIndent() {
    return this.indent;
  }

  isRelease() {
    return this.release;
  }
}