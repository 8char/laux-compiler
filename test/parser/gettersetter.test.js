import chai from "chai";
import chaiSubset from "chai-subset";
import parser from "../../src/parser";

chai.use(chaiSubset);

let {expect} = chai;

const code = "public class Test _get id end"

export default {
  isCorrectStatement: function() {
    var ast = parser.parse(code);
    var statement = ast.chunk.body[0].body[0];

    expect(statement.type).to.equal("ClassGetSetStatement")
  },
  onlyHasGet: function() {
      var ast = parser.parse(code);
      var statement = ast.chunk.body[0].body[0];

      expect(statement.isGet).to.be.true;
      expect(statement.isSet).to.be.false;
  },
  onlyHasSet: function() {
    var ast = parser.parse("public class Test _set id end");
    var statement = ast.chunk.body[0].body[0];

    expect(statement.isGet).to.be.false;
    expect(statement.isSet).to.be.true;
  },
  hasSetAndGet: function() {
    var ast = parser.parse("public class Test _get _set id end");
    var statement = ast.chunk.body[0].body[0];

    expect(statement.isGet).to.be.true;
    expect(statement.isSet).to.be.true;
  }
}