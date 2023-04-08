import { describe, it } from 'mocha';
// import { expect } from 'chai';
// import { isSymbol } from 'underscore';
// import parser from '../src/parser';

import arrowFunctionTests from './parser/arrowfunction.test';
import getterSetterTests from './parser/gettersetter.test';
import compilerClasses from './compiler/classes.test';

describe('Parser', () => {
  describe('#fat arrow functions', () => {
    it('parses expression', arrowFunctionTests.fatExpression);
    it('parses expression with body', arrowFunctionTests.fatExpressionBody);
  });

  describe('#thin arrow functions', () => {
    it('parses expression', arrowFunctionTests.thinExpression);
    it('parses expression with body', arrowFunctionTests.thinExpressionBody);
  });

  describe('#getter and setter', () => {
    it('is correct statement', getterSetterTests.isCorrectStatement);
    it('only has get', getterSetterTests.onlyHasGet);
    it('only has set', getterSetterTests.onlyHasSet);
    it('has set and get', getterSetterTests.hasSetAndGet);
  });
});

describe('Compiler', () => {
  describe('#classes', () => {
    it('compiles a class', compilerClasses.class);
    it('compiles setter', compilerClasses.setter);
    it('compiles getter', compilerClasses.getter);
    it('compiles setter & getter', compilerClasses.getterAndSetter);
  });
});
