import compiler from './src/compiler';
import parser from './src/parser';
import CodeGenerator from './src/codegenerator';

require('babel-core/register');

export function compile(code) {
  const compiledAST = compiler.compile(
    { ...parser.parse(code) },
    {
      debug: false,
    },
  );

  return new CodeGenerator(code, compiledAST)
    .generate()
    .code;
}
