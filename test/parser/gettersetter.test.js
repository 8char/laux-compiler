/* eslint-disable no-unused-expressions */
import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { stripIndent } from '../util';
import parser from '../../src/parser';

chai.use(chaiSubset);

const CODE = {
  GETTER: stripIndent(`
    public class Test
      _get id
    end
  `),
  SETTER: stripIndent(`
    public class Test
      _set id
    end
  `),
  GETTER_SETTER: stripIndent(`
    public class Test
      _get _set id
    end
  `),
};

export default {
  isCorrectStatement: () => {
    const ast = parser.parse(CODE.GETTER);
    const statement = ast.chunk.body[0].body[0];

    expect(statement.type).to.equal('ClassGetSetStatement');
  },
  onlyHasGet: () => {
    const ast = parser.parse(CODE.GETTER);
    const statement = ast.chunk.body[0].body[0];

    expect(statement.isGet).to.be.true;
    expect(statement.isSet).to.be.false;
  },
  onlyHasSet: () => {
    const ast = parser.parse(CODE.SETTER);
    const statement = ast.chunk.body[0].body[0];

    expect(statement.isGet).to.be.false;
    expect(statement.isSet).to.be.true;
  },
  hasSetAndGet: () => {
    const ast = parser.parse(CODE.GETTER_SETTER);
    const statement = ast.chunk.body[0].body[0];

    expect(statement.isGet).to.be.true;
    expect(statement.isSet).to.be.true;
  },
};
