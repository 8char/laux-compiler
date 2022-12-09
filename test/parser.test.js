import {expect} from "chai";
import parser from "../src/parser";

import arrowFunctionTests from "./parser/arrowfunction.test.js";
import getterSetterTests from "./parser/gettersetter.test.js";
import compilerClasses from "./compiler/classes.test.js";
import { isSymbol } from "underscore";

describe("Parser", function() {
  describe("#fat arrow functions", function() {
    it("parses expression", arrowFunctionTests.fatExpression);
    it("parses expression with body", arrowFunctionTests.fatExpressionBody);
  });

  describe("#thin arrow functions", function() {
    it("parses expression", arrowFunctionTests.thinExpression);
    it("parses expression with body", arrowFunctionTests.thinExpressionBody);
  });

  describe("#getter and setter", function() {
    it("is correct statement", getterSetterTests.isCorrectStatement);
    it("only has get", getterSetterTests.onlyHasGet);
    it("only has set", getterSetterTests.onlyHasSet);
    it("has set and get", getterSetterTests.hasSetAndGet);
  });
});

describe("Compiler", function() {
  describe("#classes", function() {
    it("compiles a class", compilerClasses.class);
    it("compiles setter", compilerClasses.setter);
    it("compiles getter", compilerClasses.getter);
    it("compiles setter & getter", compilerClasses.getterAndSetter);
  })
})