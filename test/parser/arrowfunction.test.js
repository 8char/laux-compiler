import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import parser from '../../src/parser';

chai.use(chaiSubset);

export default {
  /**
   * Fat arrow expression parsing without body or parameters
   */
  fatExpression: () => {
    const ast = parser.parse('a = () => end');
    const statement = ast.chunk.body[0];
    const declaration = statement.init[0];

    expect(declaration).to.deep.equal({
      type: 'FatArrowExpression',
      parameters: [],
      body: [],
    });
  },

  /**
   * Fat arrow expression parsing with body
   */
  fatExpressionBody: () => {
    const ast = parser.parse('a = () => print(\'hi\') end');
    const statement = ast.chunk.body[0];
    const declaration = statement.init[0];

    expect(declaration).to.containSubset({
      type: 'FatArrowExpression',
      parameters: [],
      body: [{
        expression: {
          arguments: [{
            raw: '\'hi\'',
            type: 'StringLiteral',
            value: 'hi',
          }],
          base: {
            name: 'print',
            type: 'Identifier',
          },
          type: 'CallExpression',
        },
        type: 'CallStatement',
      }],
    });
  },

  /**
   * Thin arrow expression parsing without body or parameters,
   * Should generate output with self identifier as first parameters
   */
  thinExpression: () => {
    const ast = parser.parse('a = () -> end');
    const statement = ast.chunk.body[0];
    const declaration = statement.init[0];

    expect(declaration).to.containSubset({
      type: 'ThinArrowExpression',
      parameters: [{
        type: 'Identifier',
        name: 'self',
      }],
      body: [],
    });
  },
  /**
   * Thin arrow expression parsing with body,
   * Should generate output with self identifier as first parameters
   */
  thinExpressionBody: () => {
    const ast = parser.parse('a = () -> print(\'hi\') end');
    const statement = ast.chunk.body[0];
    const declaration = statement.init[0];

    expect(declaration).to.containSubset({
      type: 'ThinArrowExpression',
      parameters: [{
        type: 'Identifier',
        name: 'self',
      }],
      body: [{
        expression: {
          arguments: [{
            raw: '\'hi\'',
            type: 'StringLiteral',
            value: 'hi',
          }],
          base: {
            name: 'print',
            type: 'Identifier',
          },
          type: 'CallExpression',
        },
        type: 'CallStatement',
      }],
    });
  },
};
