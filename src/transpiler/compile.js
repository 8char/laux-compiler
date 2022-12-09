import parser from "../parser";
import compiler from "../compiler";
import CompiledFile from "./compiledfile";

class Compile {
  compileCode(code, workspace) {
    const ast = parser.parse(code, {
      comments: true,
      locations: true,
      ranges: true
    })

    const compiledAST = compiler.compile(
      JSON.parse(JSON.stringify(ast)),
      { 
          debug: workspace.getDebug() 
      }
    );
    
    return new CompiledFile(code, ast, compiledAST);
  }
}

export default new Compile();