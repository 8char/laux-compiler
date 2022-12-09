import parser from "./../parser";
import * as b from "./../builder";

export default function(identifier) {
  var idArr = b.identifier("arr", true);
  var idResult = b.identifier("result", true);
  var idi = b.identifier("i", true);
  var idk = b.identifier("k", true);
  var idv = b.identifier("v", true);
  var idObj = b.identifier("obj", true);
  var idUnderscore = b.identifier("_", true);
  var idIPairs = b.identifier("ipairs");
  var idPairs = b.identifier("pairs");
  var idType = b.identifier("type");
  var literalNumber = b.stringLiteral("number", `"number"`);
  var callType = b.callExpression(idType, [idk]);

  var varargLiteral = b.varargLiteral("...", "...");
  return b.functionDeclaration(
    identifier,
    [varargLiteral],
    true,
    [
      b.localStatement([idArr], [
        b.tableConstructorExpression([
          b.tableValue(varargLiteral)
        ])
      ]),
      b.localStatement([idResult], [b.tableConstructorExpression([])]),
      b.forGenericStatement([idUnderscore, idObj], [
        b.callExpression(idIPairs, [idArr])
      ], [
        b.forNumericStatement(
          idi,
          b.numericLiteral(1, "1"),
          b.unaryExpression("#", idObj),
          null,
          [
            b.assignmentStatement(
              [
                b.indexExpression(
                  idResult,
                  b.binaryExpression(
                    "+",
                    b.unaryExpression("#", idResult),
                    b.numericLiteral(1, "1")
                  )
                )
              ],
              [
                b.indexExpression(idObj, idi)
              ]
            )
          ]
        ),
        b.forGenericStatement([idk, idv], [
          b.callExpression(idPairs, [idObj])
        ], [
          b.ifStatement([
            b.ifClause(
              b.binaryExpression(
                "and",
                b.binaryExpression("==", callType, literalNumber),
                b.binaryExpression(">", idk, b.unaryExpression("#", idObj))
              ),
              [
                b.assignmentStatement([
                  b.indexExpression(idResult, idk)
                ], [idv])
              ]
            ),
            b.elseifClause(
              b.binaryExpression("~=", callType, literalNumber),
              [
                b.assignmentStatement([
                  b.indexExpression(idResult, idk)
                ], [idv])
              ]
            )
          ])
        ])
      ]),
      b.returnStatement([idResult])
    ]
  );
}