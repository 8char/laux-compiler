import compiler from './compiler';
import parser from './parser';
import CodeGenerator from './codegenerator';

export default function compile(code) {
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
