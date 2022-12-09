export default class CompiledFile {
  constructor(code, ast, compiledAST) {
    this.code = code;
    this.ast = ast;
    this.compiledAST = compiledAST;
  }
}