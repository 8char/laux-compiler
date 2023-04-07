import * as b from '../builder';

export default (identifier) => {
  const idArr = b.identifier('arr', true);
  const idResult = b.identifier('result', true);
  const idi = b.identifier('i', true);
  const idk = b.identifier('k', true);
  const idv = b.identifier('v', true);
  const idObj = b.identifier('obj', true);
  const idUnderscore = b.identifier('_', true);
  const idIPairs = b.identifier('ipairs');
  const idPairs = b.identifier('pairs');
  const idType = b.identifier('type');
  const literalNumber = b.stringLiteral('number', '"number"');
  const callType = b.callExpression(idType, [idk]);

  const varargLiteral = b.varargLiteral('...', '...');
  return b.functionDeclaration(
    identifier,
    [varargLiteral],
    true,
    [
      b.localStatement([idArr], [
        b.tableConstructorExpression([
          b.tableValue(varargLiteral),
        ]),
      ]),
      b.localStatement([idResult], [b.tableConstructorExpression([])]),
      b.forGenericStatement([idUnderscore, idObj], [
        b.callExpression(idIPairs, [idArr]),
      ], [
        b.forNumericStatement(
          idi,
          b.numericLiteral(1, '1'),
          b.unaryExpression('#', idObj),
          null,
          [
            b.assignmentStatement(
              [
                b.indexExpression(
                  idResult,
                  b.binaryExpression(
                    '+',
                    b.unaryExpression('#', idResult),
                    b.numericLiteral(1, '1'),
                  ),
                ),
              ],
              [
                b.indexExpression(idObj, idi),
              ],
            ),
          ],
        ),
        b.forGenericStatement([idk, idv], [
          b.callExpression(idPairs, [idObj]),
        ], [
          b.ifStatement([
            b.ifClause(
              b.binaryExpression(
                'and',
                b.binaryExpression('==', callType, literalNumber),
                b.binaryExpression('>', idk, b.unaryExpression('#', idObj)),
              ),
              [
                b.assignmentStatement([
                  b.indexExpression(idResult, idk),
                ], [idv]),
              ],
            ),
            b.elseifClause(
              b.binaryExpression('~=', callType, literalNumber),
              [
                b.assignmentStatement([
                  b.indexExpression(idResult, idk),
                ], [idv]),
              ],
            ),
          ]),
        ]),
      ]),
      b.returnStatement([idResult]),
    ],
  );
};
