import _, { first, unique } from "underscore";
import extend from "extend";

import * as b from "./builder";

import parser from "./parser";
import traverse from "./visitor";
import Buffer from "./buffer";
import CodeGenerator from "./codegenerator";
import ClassTransformer from "./transformers/classes";

import createConcatFunction from "./lau-functions/concat";
import { uniqueId } from "lodash";

var ast, options, lauIdx;
var currentClass;

var utilFunctionFactory = {
	concat: createConcatFunction
};
var utilFunctions = {};

var defaultOptions = {
  debug: false
};

var generateLAUIdentifier = function(expression, isLocal, name) {
	var id = lauIdx++;
	var str = `__lauxi${id}`;
	if (name)
		str = `__laux_${name}_${id}`;

  return b.identifier(str, true);
};

var generateAssert = function(expression, message) {
  var assertId = b.identifier("assert");
  var messageLiteral = b.stringLiteral(message, `"${message}"`);
  var expBin = b.binaryExpression("~=", expression, b.literal("NilLiteral", null, "nil"))
  var callExp = b.callExpression(assertId, [expBin, messageLiteral])

  return b.callStatement(callExp)
};

var getUtilityFunctionIdentifier = function(name) {
	if (!utilFunctions[name]) {
		utilFunctions[name] = generateLAUIdentifier(null, true, name);
	}

	return utilFunctions[name];
}

var generateUtilityFunctions = function() {
  var body = [];

	_.each(utilFunctions, (identifier, name) => {
		var factory = utilFunctionFactory[name];
		if (factory) {
			body.push(factory(identifier));
		}
	});

  return body;
}

var attachLocations = function(node, compiled) {
  if (node) {
    if ("undefined" !== typeof node.loc) compiled.loc = node.loc;
    if ("undefined" !== typeof node.range) compiled.range = node.range;
    if ("undefined" !== typeof node.inParens) compiled.inParens = node.inParens;
    if ("undefined" !== typeof node.isLocal) compiled.isLocal = node.isLocal;
  }

  return compiled;
};

var debugWrapScope = function(node, scope) {
  if (!options.debug) return scope;
  if (scope.length == 0) return scope;

  var tblId = generateLAUIdentifier(b.identifier("tbl", true));

  var start = node.loc.start;
  var end = node.loc.end;

  var errMsgs = [
    `[LAU] An error occured in the scope between [${start.line},${start.column}] and [${end.line},${end.column}]`,
    `[LAU] Original error:`,
    b.indexExpression(
      tblId,
      b.literal("NumericLiteral", 2, 2)
    )
  ];

  var errBody = [];
  _.each(errMsgs, (msg) => {
    var exp = msg;
    if (typeof msg == "string" || msg instanceof String) {
      exp = b.literal("StringLiteral", msg, `"${msg}"`);
    }

    errBody.push(
      b.callStatement(
        b.callExpression(
          b.identifier("print"),
          [
            exp
            //b.binaryExpression("..", exp, b.literal("StringLiteral", "\\n", `"\\n"`))
          ]
        )
      )
    );
  });

  return [
    b.localStatement(
      [
        tblId,
      ],
      [
        b.tableConstructorExpression([
          b.tableValue(
            b.callExpression(
              b.identifier("pcall"),
              [
                b.functionExpression([], false, scope)
              ]
            )
          )
        ])
      ]
    ),
    b.ifStatement(
      [
        b.ifClause(
          b.unaryExpression(
            "not",
            b.indexExpression(
              tblId,
              b.literal("NumericLiteral", 1, 1)
            )
          ),
          errBody
        ),
        b.elseClause([
          b.callStatement(
            b.callExpression(
              b.memberExpression(
                b.identifier("table"), ".",
                b.identifier("remove")
              ),
              [
                tblId,
                b.literal("NumericLiteral", 1, 1)
              ]
            )
          ),
          b.returnStatement([
            b.callExpression(b.identifier("unpack"), [tblId])
          ])
        ])
      ]
    )
  ];
};

var compileStatementList = function(statements) {
  var body = [];
  _.each(statements, (statement) => {
    var res = compileStatement(statement);

    if (!res) return;

    if (Array.isArray(res)) {
      body = body.concat(res);
      return;
    }

    body.push(res);
  });

  return body;
};


var compileStatement = function(statement) {
  if (!statement) return;

  var type = statement.type;

  switch (type) {
    case "AssignmentStatement":
      var variables = _.map(statement.variables, (variable) => {
        return compileExpression(variable);
      });

      var init = _.map(statement.init, (init) => {
        return compileExpression(init);
      });

      return attachLocations(
        statement,
        b.assignmentStatement(variables, init)
      );

    case "LocalStatement":
      var init = _.map(statement.init, (init) => {
        return compileExpression(init);
      });

      return attachLocations(
        statement,
        b.localStatement(statement.variables, init)
      );

    case "CallStatement":
      return attachLocations(
        statement,
        b.callStatement(compileExpression(statement.expression))
      );

    case "IfStatement":
      var clauses = _.map(statement.clauses, (clause) => {
        switch (clause.type) {
          case "IfClause":
            return attachLocations(
              clause,
              b.ifClause(
                compileExpression(clause.condition),
                debugWrapScope(statement, compileStatementList(clause.body))
              )
            );

          case "ElseifClause":
            return attachLocations(
              clause,
              b.elseifClause(
                compileExpression(clause.condition),
                debugWrapScope(statement, compileStatementList(clause.body))
              )
            );

          case "ElseClause":
            return attachLocations(
              clause,
              b.elseClause(debugWrapScope(statement, compileStatementList(clause.body)))
            );

          default:
            return clause;
        }
      });

      return attachLocations(
        statement,
        b.ifStatement(clauses)
      );

    case "WhileStatement":
      return attachLocations(
        statement,
        b.whileStatement(
          compileExpression(statement.condition),
          debugWrapScope(statement, compileStatementList(statement.body))
        )
      );

    case "DoStatement":
      return attachLocations(
        statement,
        b.doStatement(debugWrapScope(statement, compileStatementList(statement.body)))
      );

    case "ReturnStatement":
      var args = _.map(statement.arguments, (arg) => {
        return compileExpression(arg);
      });

      return attachLocations(
        statement,
        b.returnStatement(args)
      );

    case "RepeatStatement":
      return attachLocations(
        statement,
        b.repeatStatement(
          compileExpression(statement.condition),
          compileStatementList(statement.body)
        )
      );

    case "FunctionDeclaration":
      return compileFunctionStatement(statement);

    case "ForGenericStatement":
      var iterators = _.map(statement.iterators, (it) => {
        return compileExpression(it);
      });

      return attachLocations(
        statement,
        b.forGenericStatement(
          statement.variables,
          iterators,
          debugWrapScope(statement, compileStatementList(statement.body))
        )
      );

    case "ForNumericStatement":
      return attachLocations(
        statement,
        b.forNumericStatement(
          statement.variable,
          compileExpression(statement.start),
          compileExpression(statement.end),
          compileExpression(statement.step),
          debugWrapScope(statement, compileStatementList(statement.body))
        )
      );

    case "ForOfStatement":
      var iterator = b.callExpression(b.identifier("pairs"), [
        compileExpression(statement.expression)
      ]);

      return attachLocations(
        statement,
        compileStatement(
          b.forGenericStatement(statement.variables, [iterator], statement.body)
        )
      );

    case "MutationStatement":
      var expression = compileExpression(statement.expression);
      var value = compileExpression(statement.value);

      return attachLocations(
        statement,
        b.assignmentStatement(
          [expression],
          [
            attachLocations(
              statement,
              b.binaryExpression(statement.sign, expression, value)
            )
          ]
        )
      );

    case "LocalDestructorStatement":
      var body = [];

      var init = statement.init;
      var identifier;
      if (init.type == "CallExpression" || init.type == "SafeMemberExpression") {
        identifier = generateLAUIdentifier(init.base, true);
        var local = b.localStatement(
          [identifier],
          [init]
        );

        body.push(compileStatement(local));
      }

      body.push(
        compileStatement(
          generateAssert(identifier || init, "cannot destructure nil value")
        )
      );

      var init = _.map(statement.variables, (variable) => {
        return b.memberExpression(identifier || init, ".", compileExpression(variable));
      });

      body.push(b.localStatement(statement.variables, init));

      return body;

    case "TableDestructorStatement":
      var body = [];

      var init = statement.init;
      var identifier;
      if (init.type == "CallExpression" || init.type == "SafeMemberExpression") {
        identifier = generateLAUIdentifier(init.base, true);
        var local = b.localStatement(
          [identifier],
          [init]
        );

        body.push(compileStatement(local));
      }

      body.push(
        compileStatement(
          generateAssert(identifier || init, "cannot destructure nil value")
        )
      );

      var init = _.map(statement.variables, (variable) => {
        return b.memberExpression(identifier || init, ".", compileExpression(variable));
      });

      body.push(b.assignmentStatement(statement.variables, init));

      return body;

    case "ClassStatement":
      let prevClass = currentClass;
      currentClass = statement;

      var parent = statement.parent;
      var body = [];

      var strName = statement.identifier.name;

      var idClass0 = b.identifier("_class_0", true);
      var idParent0 = b.identifier("_parent_0", true);
      var idBase0 = b.identifier("_base_0", true);
      var idSelf = b.selfExpression();
      var idSetMetaTable = b.identifier("setmetatable");

      if (!statement.isPublic) {
        body.push(b.localStatement([statement.identifier], []));
      }

      var doBody = [];
      var staticMembers = [];
      var baseTableKeys = [
        b.tableKeyString(
          b.identifier("__name"),
          b.stringLiteral(strName, `"${strName}"`)
        )
      ];

      doBody.push(b.localStatement([idClass0], []));

      if (parent) {
        doBody.push(b.localStatement([idParent0], [parent]));
        baseTableKeys.push(b.tableKeyString(
          b.identifier("__base"),
          b.memberExpression(parent, ".", b.identifier("__base"))
        ));
      }

      _.each(statement.members, (member) => {
        if (!member.isStatic) return;

        staticMembers.push({
          identifier: member.identifier,
          expression: compileExpression(member.expression)
        });
      });
      _.each(statement.methods, (method) => {
        var params = method.parameters.slice();
        if (!method.isStatic) {
          params.unshift(idSelf);
        }

        var methodBody = method.body;

        var exp = compileFunctionStatement(
          attachLocations(
            method,
            b.functionExpression(params, true,
              compileStatementList(method.body))
          )
        );

        if (method.isStatic) {
          staticMembers.push({
            identifier: method.identifier,
            expression: exp
          });
        }
        else {
          baseTableKeys.push(b.tableKeyString(
            method.identifier,
            exp
          ));
        }
      });

      doBody.push(b.localStatement([idBase0], [
        b.tableConstructorExpression(baseTableKeys)
      ]));

      doBody.push(
        b.assignmentStatement([
          b.memberExpression(idBase0, ".", b.identifier("__index"))
        ], [idBase0])
      );

      if (parent) {
        doBody.push(
          b.callStatement(
            b.callExpression(
              idSetMetaTable,
              [
                idBase0,
                b.memberExpression(idParent0, ".", b.identifier("__index"))
              ],
              [idBase0]
            )
          )
        )
      }

      var varargLiteral = b.varargLiteral("...", "...");
      var constructorArgs = statement.constructor ? statement.constructor.parameters : [];
      constructorArgs.unshift(idSelf);

      var constructorBody = statement.constructor ?
        statement.constructor.body : [];

      /*
      _.each(constructorBody, (constructorStatement, index) => {
        if (constructorStatement.type == "CallStatement") {
          let expression = constructorStatement.expression;
          if (expression && expression.type == "SuperCallExpression") {
            _.each(statement.members, (member) => {
              constructorBody.splice(index + 1, 0,
                b.assignmentStatement([
                  b.memberExpression(idSelf, ".", member.identifier)
                ], [
                    compileExpression(member.expression)
                  ])
              );
            });
          }
        }
      });
      */



      var idSelf0 = b.identifier("_self_0", true);
      var idCls = b.identifier("cls", true);
      var clsIndex;
      var clsTable = [
        b.tableKeyString(
          b.identifier("__init"),
          compileFunctionStatement(
            attachLocations(
              statement.constructor,
              b.functionExpression(constructorArgs, true,
                constructorBody)
            )
          )
        ),
        b.tableKeyString(
          b.identifier("__base"),
          idBase0
        ),
        b.tableKeyString(
          b.identifier("__name"),
          b.stringLiteral(strName, `"${strName}"`)
        ),
      ]

      if (parent) {
        var idParent = b.identifier("parent", true);
        var idName = b.identifier("parent", true);
        var idVal = b.identifier("val", true);
        clsIndex = b.functionExpression([idCls, idName], true, [
          b.localStatement([idVal], [
            b.callExpression(b.identifier("rawget"), [idBase0, idName])
          ]),
          b.ifStatement([
            b.ifClause(
              b.binaryExpression(
                "==",
                idVal,
                b.nilLiteral(null, "nil")
              ),
              [
                b.localStatement([idParent], [
                  b.callExpression(b.identifier("rawget"), [
                    idCls,
                    b.stringLiteral("__parent", `"__parent"`)
                  ])
                ]),
                b.ifStatement([
                  b.ifClause(idParent, [
                    b.returnStatement([
                      b.indexExpression(idParent, idName)
                    ])
                  ])
                ])
              ]
            ),
            b.elseClause([
              b.returnStatement([idVal])
            ])
          ])
        ]);

        clsTable.push(
          b.tableKeyString(
            b.identifier("__parent"),
            idParent0
          )
        );
      } else {
        clsIndex = idBase0;
      }

      _.each(staticMembers, (member) => {
        clsTable.push(
          b.tableKeyString(
            member.identifier,
            member.expression
          )
        );
      });

      var callBody = [
        b.localStatement(
          [idSelf0],
          [b.callExpression(
            idSetMetaTable,
            [b.tableConstructorExpression([]), idBase0]
          )]
        ),
        b.callStatement(
          b.callExpression(
            b.memberExpression(idCls, ".", b.identifier("__init")),
            [idSelf0, varargLiteral]
          )
        ),
        b.returnStatement([idSelf0])
      ];

      doBody.push(
        b.assignmentStatement(
          [idClass0],
          [
            b.callExpression(
              idSetMetaTable,
              [
                b.tableConstructorExpression(clsTable),
                b.tableConstructorExpression([
                  b.tableKeyString(b.identifier("__index"), clsIndex),
                  b.tableKeyString(
                    b.identifier("__call"),
                    b.functionExpression([
                      idCls,
                      varargLiteral
                    ], true, callBody)
                  )
                ])
              ]
            )
          ]
        )
      );

      if (parent) {
        doBody.push(
          b.ifStatement(
            [
              b.ifClause(
                b.memberExpression(idParent0, ".", b.identifier("__inherited")),
                [
                  b.callStatement(
                    b.callExpression(
                      b.memberExpression(idParent0, ".", b.identifier("__inherited")),
                      [idParent0, idClass0]
                    )
                  )
                ]
              )
            ],
            [idClass0]
          )
        )
      }

      doBody.push(
        b.assignmentStatement(
          [statement.identifier],
          [idClass0]
        )
      );

      body.push(b.doStatement(doBody));

      currentClass = prevClass;
      return body;

    case "SuperCallStatement":
      if (!currentClass)
        throw "Tried to compile SuperCallExpression without class reference.";

      var list = [];

      list.push(
        attachLocations(
          statement,
          b.callStatement(compileExpression(statement.expression))
        )
      );

      _.each(currentClass.members, (member) => {
        list.push(
          b.assignmentStatement([
            b.memberExpression(b.selfExpression(), ".", member.identifier)
          ], [
            compileExpression(member.expression)
          ])
        );
      });

      return list;

    default:
      return statement;
  }
}

var compileExpression = function(expression) {
  if (!expression) return;

  var type = expression.type;

  switch (type) {
    case "LogicalExpression": case "BinaryExpression":
      var operator = expression.operator;
      if (operator == "!=") operator = "~=";
      else if (operator == "||") operator = "or";
      else if (operator == "&&") operator = "and";

      return attachLocations(
        expression,
        b.binaryExpression(
          operator,
          compileExpression(expression.left),
          compileExpression(expression.right)
        )
      );

    case "UnaryExpression":
      var operator = expression.operator;
      if (operator == "!") operator = "not";

      return attachLocations(
        expression,
        b.unaryExpression(
          operator,
          compileExpression(expression.argument)
        )
      );

    case "CallExpression":
      var args = _.map(expression.arguments, (arg) => {
        return compileExpression(arg);
      });

      var result = attachLocations(
        expression,
        b.callExpression(
          compileExpression(expression.base),
          args
        )
      );

      return result;

    case "TableCallExpression":
      return attachLocations(
        expression,
        b.tableCallExpression(
          compileExpression(expression.base),
          compileExpression(expression.arguments)
        )
      );

    case "StringCallExpression":
      return attachLocations(
        expression,
        b.stringCallExpression(
          compileExpression(expression.base),
          compileExpression(expression.argument)
        )
      );

    case "IndexExpression":
      return attachLocations(
        expression,
        b.indexExpression(
          compileExpression(expression.base),
          compileExpression(expression.index)
        )
      );

    case "MemberExpression":
      return attachLocations(
        expression,
        b.memberExpression(
          compileExpression(expression.base),
          expression.indexer,
          compileExpression(expression.identifier)
        )
      );

    case "SafeMemberExpression":
      return compileSafeMemberExpression(expression);

    case "FunctionDeclaration":
      return compileFunctionStatement(expression);

    case "FatArrowDeclaration": case "ThinArrowDeclaration":
      return compileFunctionStatement(
        attachLocations(
          expression,
          b.functionExpression(
            expression.parameters,
            true,
            expression.body
          )
        )
      );

    case "TemplateStringLiteral":
      var expressions = expression.expressions;
      if (expressions.length) {
        var bin = expressions[expressions.length - 1];

        if (bin.type != "StringLiteral") {
          bin = b.callExpression(b.identifier("tostring"), [bin]);
        }

        for (var i = expressions.length - 2; i >= 0; i--) {
          var exp = expressions[i];

          if (exp.type != "StringLiteral") {
            exp = b.callExpression(b.identifier("tostring"), [exp]);
          }

          bin = b.binaryExpression("..", exp, bin);
        }

        return bin;
      }

      return attachLocations(
        expression,
        b.stringLiteral("", `""`)
      );

    case "TableConstructorExpression":
      var fields = [];
      var spreaders = [];
      _.each(expression.fields, (field, index) => {
				var compiled = compileExpression(field);

        if (field.type == "TableSpreadExpression") {
          spreaders.push({
            index: index,
            field: compiled
          });
        }

        fields.push(compiled);
      });

      if (spreaders.length > 0) {
        var groups = [];

        var args = [];

        var lastIndex = 0;
        _.each(spreaders, (sp) => {
          var subFields = fields.slice(lastIndex, sp.index);
          if (subFields.length > 0) {
            args.push(b.tableConstructorExpression([
              ...fields.slice(lastIndex, sp.index)
            ]));
          }

          args.push(sp.field);
          lastIndex = sp.index + 1;
        });

        var lastSubFields = fields.slice(lastIndex);
        if (lastSubFields.length > 0) {
          args.push(b.tableConstructorExpression([
            ...lastSubFields
          ]));
        }

        return attachLocations(
          expression,
          b.callExpression(
            getUtilityFunctionIdentifier("concat"),
            args
          )
        )
      }
      else {
        return attachLocations(
          expression,
          b.tableConstructorExpression(fields)
        );
      }

    case "TableKeyString":
      return attachLocations(
        expression,
        b.tableKeyString(
          compileExpression(expression.key),
          compileExpression(expression.value)
        )
      );

    case "TableKey":
      return attachLocations(
        expression,
        b.tableKey(
          compileExpression(expression.key),
          compileExpression(expression.value)
        )
      );

    case "TableValue":
      return attachLocations(
        expression,
        b.tableValue(
          compileExpression(expression.value)
        )
      );

    case "SuperExpression":
      var id = currentClass.identifier;
      return attachLocations(
        expression,
        b.memberExpression(
          id,
          ".",
          b.identifier("__parent"),
        )
      )

    case "SuperCallExpression":
      if (!currentClass)
        throw "Tried to compile SuperCallExpression without class reference.";

      var id = currentClass.identifier;
      var base;
      if (expression.base.type == "SuperExpression") {
        base = attachLocations(
          expression.base,
          b.memberExpression(
            compileExpression(expression.base),
            ".",
            b.identifier("__init"),
          )
        );
      }
      else {
        base = compileExpression(expression.base);
      }

      var args = _.map(expression.arguments, (arg) => {
        return compileExpression(arg);
      });

      args.unshift(b.selfExpression());

      return attachLocations(
        expression,
        b.callExpression(
          compileExpression(base),
          args
        )
      );

    case "SuperStringCallExpression":
      return attachLocations(
        expression,
        compileExpression(
          b.superCallExpression(
            expression.base,
            [ expression.argument ]
          )
        )
      );

    case "SuperTableCallExpression":
      return attachLocations(
        expression,
        compileExpression(
          b.superCallExpression(
            expression.base,
            [ expression['arguments'] ]
          )
        )
      );

    case "TableSpreadExpression":
			getUtilityFunctionIdentifier("concat");

      return expression.expression;

    case "SpreadExpression":
			getUtilityFunctionIdentifier("concat");

      return attachLocations(
        expression,
        compileExpression(
          b.callExpression(
            b.identifier("unpack"),
            [ expression.expression ]
          )
        )
      );

    default:
      return expression;
  }
};

function compileFunctionStatement(statement) {
  var body = debugWrapScope(statement, compileStatementList(statement.body));

  var typeChecks = []
  _.each(statement.parameters, (param => {
    if (param.typeCheck) {
      let name = ""
      function constructName(obj, separator = "", postFix = "") {
        if (obj.type == "Identifier") {
          name += `${separator}${obj.name}${postFix}`

          return
        } else if (obj.type == "BinaryExpression") {
          if (name == "") {
            constructName(obj.left)
          } 

          constructName(obj.right, "|")
        } else if (obj.type == "MemberExpression") {
          constructName(obj.base, `${name == "" ? "" : "|"}`)

          constructName(obj.identifier, ".", "")
        }
      }
      constructName(param.typeCheck)

      const types = name.split("|")
      const typeName = `__laux_type`
      const andExpression = b.logicalExpression(
        "and",
        b.logicalExpression(
          "and",
          b.callExpression(b.identifier("istable"), [
            b.identifier(param.name)
          ]),
          b.memberExpression(
            b.identifier(param.name),
            ".",
            b.identifier("__type")
          ),
        ),
        b.callStatement(
          b.callExpression(
            b.memberExpression(
              b.identifier(param.name),
              ":",
              b.identifier("__type")
            )
          )
        )
      )
      andExpression.inParens = true

      const type = name
      const typeVar =  b.localStatement(
        [b.identifier(typeName)], 
        [
          b.logicalExpression(
            "or",
            andExpression,
            b.callStatement(
              b.callExpression(
                b.identifier("type"),
                [b.identifier(param.name)]
              )
            )
          )
        ]
      )


      let compareParam  = b.logicalExpression(
        "==", 
        b.identifier(typeName),
        b.stringLiteral(types[0], `"${types[0]}"`)
      )
      for (let i = 1; i < types.length; i++) {
        compareParam = b.logicalExpression(
          "or",
          compareParam,
          b.logicalExpression(
            "==", 
            b.identifier(typeName),
            b.stringLiteral(types[i], `"${types[i]}"`)
          )
        )
      }

      const assertFailMsg = `Expected parameter \`${param.name}\` to be type \`${name}\``
      let call = b.callStatement(
        b.callExpression(
          b.identifier("assert"),
          [
            compareParam,
            b.stringLiteral(
              assertFailMsg, `"${assertFailMsg} instead of \`" .. ${typeName} .. "\`"`)
          ]
        )
      )

      typeChecks.push(typeVar)
      typeChecks.push(call)
    }
  }))

  if (typeChecks.length) {
    node.body.unshift.apply(node.body, typeChecks);
  }

  var defaultValues = [];

  var parameters = _.map(statement.parameters, (param) => {
    if (param.defaultValue) {
      var ifBody = b.assignmentStatement(
        [param],
        [compileExpression(param.defaultValue)]);
      var ifCondition = b.binaryExpression(
        "==",
        compileExpression(param),
        b.nilLiteral(null, "nil"))
      var ifClause = b.ifClause(ifCondition, [ifBody]);
      var ifStatement = b.ifStatement([ifClause]);
      ifStatement.inline = true;

      defaultValues.push(ifStatement);
    }

    return compileExpression(param);
  });

  if (defaultValues.length) {
    body = defaultValues.concat(body);
  }

  return attachLocations(
    statement,
    b.functionDeclaration(
      compileExpression(statement.identifier),
      parameters,
      statement.isLocal,
      body
    )
  );
}

function compileSafeMemberExpression(expression) {
  var bases = [];

  var exp = expression;
  while (exp) {
    if (exp.type == "Identifier") {
      bases.unshift(compileExpression(exp));
    }
    else if (exp.type != "SafeMemberExpression") {
      bases.unshift(compileExpression(exp));
      break;
    }
    if (exp.identifier) {
      bases.unshift(compileExpression(exp.identifier));
    }
    exp = exp.base;
  }

  var memExp;
  for (var i = 0; i < bases.length - 1; i++) {
    var base = bases[i];
    var next = bases[i + 1];

    if (!memExp) {
      memExp = b.memberExpression(base, ".", next)
    }
    else {
      memExp = b.memberExpression(memExp, ".", next);
    }
  }

  var logicalExp = attachLocations(
    expression,
    b.binaryExpression("and",
      compileExpression(expression.base),
      memExp
    )
  );
  logicalExp.inParens = true;

  return logicalExp;
}

var compiler = {
  compile: function(_ast, _options) {
    ast = _ast;
    options = extend(defaultOptions, _options);
    utilFunctions = {};

    lauIdx = 0;

    let state = { num: 0 };

    traverse(ast, {
      MutationStatement(path) {
        const node = path.node;

        node.value.inParens = true;

        path.replaceWith(
          b.assignmentStatement(
            [ node.expression ],
            [
              b.binaryExpression(
                node.sign,
                node.expression,
                node.value
              )
            ]
          )
        );
      },

      TemplateStringLiteral(path) {
        const node = path.node;

        var expressions = node.expressions;
        if (expressions.length) {
          var bin = expressions[expressions.length - 1];

          if (bin.type != "StringLiteral") {
            bin = b.callExpression(b.identifier("tostring"), [ bin ]);
          }

          for (var i = expressions.length - 2; i >= 0; i--) {
            var exp = expressions[i];

            if (exp.type != "StringLiteral") {
              exp = b.callExpression(b.identifier("tostring"), [ exp ]);
            }

            bin = b.binaryExpression("..", exp, bin);
          }

          path.replaceWith(bin);
          return;
        }

        path.replaceWith(
          b.stringLiteral("", `""`)
        );
      },

      SpreadExpression(path) {
        const node = path.node;

        path.replaceWith(
          b.callExpression(b.identifier("unpack"), [ node.expression ])
        );
      },

      TableSpreadExpression(path) {
        path.replaceWith(path.node.expression);
      },

      TableConstructorExpression(path) {
        const node = path.node;

        var fields = [];
        var spreaders = [];
        _.each(node.fields, (field, index) => {
          if (field.type == "TableSpreadExpression") {
            spreaders.push({
              index: index,
              field: field
            });
          }

          fields.push(field);
        });

        if (spreaders.length > 0) {
          var groups = [];

          var args = [];

          var lastIndex = 0;
          _.each(spreaders, (sp) => {
            var subFields = fields.slice(lastIndex, sp.index);
            if (subFields.length > 0) {
              args.push(b.tableConstructorExpression([
                ...fields.slice(lastIndex, sp.index)
              ]));
            }

            args.push(sp.field);
            lastIndex = sp.index + 1;
          });

          var lastSubFields = fields.slice(lastIndex);
          if (lastSubFields.length > 0) {
            args.push(b.tableConstructorExpression([
              ...lastSubFields
            ]));
          }

          path.replaceWith(
            b.callExpression(
              getUtilityFunctionIdentifier("concat"),
              args
            )
          );
        }
      },

      "FunctionDeclaration|FunctionExpression|FatArrowExpression|ThinArrowExpression"(path) {
        const node = path.node;
        var typeChecks = []
        _.each(node.parameters, (param => {
          if (param.typeCheck) {
            let name = ""
            function constructName(obj, separator = "", postFix = "") {
              if (obj.type == "Identifier") {
                name += `${separator}${obj.name}${postFix}`

                return
              } else if (obj.type == "BinaryExpression") {
                if (name == "") {
                  constructName(obj.left)
                } 

                constructName(obj.right, "|")
              } else if (obj.type == "MemberExpression") {
                constructName(obj.base, `${name == "" ? "" : "|"}`)

                constructName(obj.identifier, ".", "")
              }
            }
            constructName(param.typeCheck)

            const types = name.split("|")
            const typeName = `__laux_type`
            const andExpression = b.logicalExpression(
              "and",
              b.logicalExpression(
                "and",
                b.callExpression(b.identifier("istable"), [
                  b.identifier(param.name)
                ]),
                b.memberExpression(
                  b.identifier(param.name),
                  ".",
                  b.identifier("__type")
                ),
              ),
              b.callStatement(
                b.callExpression(
                  b.memberExpression(
                    b.identifier(param.name),
                    ":",
                    b.identifier("__type")
                  )
                )
              )
            )
            andExpression.inParens = true

            const type = name
            const typeVar =  b.localStatement(
              [b.identifier(typeName)], 
              [
                b.logicalExpression(
                  "or",
                  andExpression,
                  b.callStatement(
                    b.callExpression(
                      b.identifier("type"),
                      [b.identifier(param.name)]
                    )
                  )
                )
              ]
            )

            let compareParam  = b.logicalExpression(
              "==", 
              b.identifier(typeName),
              b.stringLiteral(types[0], `"${types[0]}"`)
            )
            for (let i = 1; i < types.length; i++) {
              compareParam = b.logicalExpression(
                "or",
                compareParam,
                b.logicalExpression(
                  "==", 
                  b.identifier(typeName),
                  b.stringLiteral(types[i], `"${types[i]}"`)
                )
              )
            }

            const assertFailMsg = `Expected parameter \`${param.name}\` to be type \`${name}\``
            let call = b.callStatement(
              b.callExpression(
                b.identifier("assert"),
                [
                  compareParam,
                  b.stringLiteral(
                    assertFailMsg, `"${assertFailMsg} instead of \`" .. ${typeName} .. "\`"`)
                ]
              )
            )

            typeChecks.push(typeVar)
            typeChecks.push(call)
          }
        }))

        if (typeChecks.length) {
          node.body.unshift.apply(node.body, typeChecks);
        }
        var defaultValues = [];

        _.each(node.parameters, (param) => {
          if (param.defaultValue) {
            var ifBody = b.assignmentStatement(
              [ param ],
              [ param.defaultValue ]);
            var ifCondition = b.binaryExpression(
              "==",
              param,
              b.nilLiteral(null, "nil"))

            var ifClause = b.ifClause(ifCondition, [ ifBody ]);
            var ifStatement = b.ifStatement([ ifClause ]);

            defaultValues.push(ifStatement);
          }
        });

        if (defaultValues.length) {
          node.body.unshift.apply(node.body, defaultValues);
        }

        if (node.async) {
          const uniqueIdentifier = generateLAUIdentifier(undefined, undefined, "promise");
          const existingReturn = [];
          let foundAt = -1
          for (let i = 0; i < node.body.length && foundAt === -1; i++) {
            const entry = node.body[i];
            if (entry.type !== "ReturnStatement") continue;

            for (const argument of entry.arguments) {
              existingReturn.push(argument);
            }
            foundAt = i;
          }
          
          if (node.blockAsync) {
            const insertNode = b.returnStatement([ b.callExpression(
              b.memberExpression(
                uniqueIdentifier,
                ":",
                b.identifier("resolve")
              ),
              existingReturn
            )])
          
            if (foundAt !== -1) {
              node.body[foundAt] = insertNode;
            } else {
              node.body.push.apply(node.body, [ insertNode ]);
            }

            const promiseInit = b.localStatement(
              [
                uniqueIdentifier
              ],
              [
                b.callExpression(
                  b.memberExpression(
                    b.identifier("XeninUI"),
                    ".",
                    b.memberExpression(
                      b.identifier("Promises"),
                      ".",
                      b.identifier("new")
                    )
                  )
                )
              ]
            );
            node.body.unshift.apply(node.body, [ promiseInit ]);
            const promiseReturn = b.returnStatement([
              uniqueIdentifier,
            ]);
            promiseReturn.asyncBlockReturn = true
            //node.body.push.apply(node.body, [ promiseReturn ]);
          }
        }
      },

      LocalDestructorStatement(path) {
        const node = path.node;
        const init = node.init;

        let identifier
        if (init.type != "Identifier") {
          identifier = generateLAUIdentifier(init.base, true);
          var local = b.localStatement(
            [ identifier ],
            [ init ]
          );

          path.insertBefore(local);
        }

        path.insertBefore(
          generateAssert(identifier || init, "cannot destructure nil value")
        );

        const newInit = _.map(node.variables, (variable) => {
          return b.memberExpression(identifier || init, ".", variable);
        });

        path.replaceWith(
          b.localStatement(node.variables, newInit)
        );
      },

      ForOfStatement(path) {
        const node = path.node;

        var iterator = b.callExpression(
          b.identifier("pairs"),
          [ node.expression ]
        );

        path.replaceWith(
          b.forGenericStatement(
            node.variables,
            [ iterator ],
            node.body
          )
        );
      },

      SafeMemberExpression(path) {
        const node = path.node;

        var bases = [];
        var exp = node;
        while (exp) {
          if (exp.type == "Identifier") {
            bases.unshift(exp);
          }
          else if (exp.type != "SafeMemberExpression") {
            bases.unshift(exp);
            break;
          }

          if (exp.identifier) {
            bases.unshift(exp.identifier);
          }

          exp = exp.base;
        }

        let memExp;
        for (let i = 0; i < bases.length - 1; i++) {
          const base = bases[i];
          const next = bases[i + 1];
          const exp = !memExp ? base : memExp;

          if (next.type == "Identifier") {
            if (next.isLocal == undefined) {
              memExp = b.memberExpression(exp, ".", next);
            } else {
              memExp = b.indexExpression(exp, next);
            }
          } else if (next.type == "CallExpression") {
            memExp = b.memberExpression(exp, ":", next);
          } else {
            memExp = b.indexExpression(exp, next);
          }
        }

        var logicalExp = b.binaryExpression("and", node.base, memExp);
        logicalExp.inParens = true;

        path.replaceWith(logicalExp);
      },

      ClassStatement(path, state) {
        path.replaceWithMultiple(
          new ClassTransformer(path, state).run()
        );
      },

      // This is HOT garbage
      AwaitStatement(path) {
        if (!path.scope.block.async) {
          throw new Error("Unable to use await outside an async scope")
        }
        
        const node = path.node;
        const parent = path.parent;
        let useParent = false;
        if (parent) {
          if (parent.type == "LocalStatement") {
            parent.init = [];
            useParent = true;
          } else if (parent.type == "AssignmentStatement") {
            path.parentPath.remove();
            useParent = true;
          } else if (parent.type == "CallExpression") {
            if (parent.arguments[0].type == "AwaitStatement") {
              parent.arguments.shift();
            }
          }
        }

        const uniqueIdentifier = generateLAUIdentifier(node, true, "result");
        const errorIdentifier = generateLAUIdentifier(node, true, "error");
        const body = [
          b.assignmentStatement(
            [ 
              useParent ? 
                b.identifier(parent.variables[0].name) :
                generateLAUIdentifier(node, true, "await_var")
            ],
            [ uniqueIdentifier ]
          )
        ];
        const funcExp = b.functionExpression([ uniqueIdentifier ], true, body)
        const errorExp = b.functionExpression([ errorIdentifier ], true, [
          b.callExpression(b.identifier("__laux__replace__me"), [ errorIdentifier ])
        ])
        funcExp.async = true
        const exp = b.callStatement(
          b.memberExpression(
            node.expression,
            ":",
            b.callExpression(
              b.identifier("next"),
              [
                funcExp,
                errorExp
              ]
            )
          )
        );
        exp.async = true
        exp.isBeingSearchedFor = true
        exp.hasErrorAsync = true
        path.parentPath.insertAfter(exp);

        const stop = 0
        if (stop) return
        const len = path.scope.block.body.length;
        const block = path.scope.block;
        let oldBody = [];
        const newBody = [];
        const maxLen = len - 0;
        let hasFoundSearchedFor;
        for (let i = 0; i < maxLen; i++) {
          const entry = block.body[i];
          if (!hasFoundSearchedFor) {
            if (entry.isBeingSearchedFor) {
              hasFoundSearchedFor = i;
              delete entry.isBeingSearchedFor;
            }

            oldBody.push(entry);
          } else {
            newBody.push(entry);
          }
        }

        let mergeBody
        let identifierResolve = path.scope.block.body.slice(maxLen - 1, len)[0].arguments[0].base.base
        if (path.scope.block.blockAsync) {
          mergeBody = path.scope.block.body.slice(maxLen - 1, len);
          const returnStatement = b.returnStatement([ 
            mergeBody[0].arguments[0].base.base
          ]);
          returnStatement.isAsyncResolve = true
          mergeBody = [ returnStatement ]
        } else {
          mergeBody = path.scope.block.body.slice(maxLen, len);
        }

        oldBody = [...oldBody, ...mergeBody];
        path.scope.block.body = oldBody
        exp.expression.identifier.arguments[0].body = [
          ...exp.expression.identifier.arguments[0].body,
          ...newBody
        ]

        // Recursively finds all the return and throw statements
        function findReturnAndThrowStatements(node) {
          const len = node.length;

          for (let i = 0; i < len; i++) {
            const exp = node[i];

            const { type } = exp;
            switch(type) {
              case "CallStatement":
                // await block
                if (exp.hasErrorAsync) {
                  const body = exp.expression.identifier.arguments[0].body
                  findReturnAndThrowStatements(body);
                }

                break;

              case "IfStatement":
                findReturnAndThrowStatements(exp.clauses);

                break;

              case "IfClause":
              case "ElseifClause":
              case "ElseClause":
                for (let j = 0; j < exp.body.length; j++) {
                  const clauseExp = exp.body[j];
                  const { type } = clauseExp;
                  if (type === "ReturnStatement") {
                    const args = [];
                    if (clauseExp.arguments.length > 1) {
                      const tableValues = [];
                      for (const arg of clauseExp.arguments) {
                        tableValues.push(b.tableValue(arg));
                      }
                      args.push(b.tableConstructorExpression(tableValues));
                    } else {
                      args.push(...clauseExp.arguments);
                    }

                    exp.body[j] = b.returnStatement([
                      b.callExpression(
                        b.memberExpression(
                          b.identifier(identifierResolve.name),
                          ":",
                          b.identifier("resolve")
                        ),
                        args
                      )
                    ])
                  } else if (type === "ThrowStatement") {
                    const args = [];
                    if (clauseExp.expression.length > 1) {
                      const tableValues = [];
                      for (const arg of clauseExp.expression) {
                        tableValues.push(b.tableValue(arg));
                      }
                      args.push(b.tableConstructorExpression(tableValues));
                    } else {
                      args.push(...clauseExp.expression);
                    }

                    exp.body[j] = b.returnStatement([
                      b.callExpression(
                        b.memberExpression(
                          b.identifier(identifierResolve.name),
                          ":",
                          b.identifier("reject")
                        ),
                        args
                      )
                    ])
                  }
                }

                break;

              case "ThrowStatement":
                const args = [];
                if (exp.expression.length > 1) {
                  const tableValues = [];
                  for (const arg of exp.expression) {
                    tableValues.push(b.tableValue(arg));
                  }
                  args.push(b.tableConstructorExpression(tableValues));
                } else {
                  args.push(...exp.expression);
                }

                node[i] = b.callExpression(
                  b.memberExpression(
                    b.identifier(identifierResolve.name),
                    ":",
                    b.identifier("reject")
                  ),
                  args
                );

                break;

              case "ReturnStatement":
                const firstArgument = exp.arguments[0];
                // Filter the overall return
                if (firstArgument.type === "Identifier" && 
                    firstArgument.name === identifierResolve.name) {
                  continue;
                }

                break;

              case "LocalStatement":
                const { init } = exp;
                if (init.length > 0) {
                  findReturnAndThrowStatements(init);
                }

                break;

              default:

                break;
            }
          }
        }
        findReturnAndThrowStatements(path.scope.block.body);

        for (let i = 0; i < path.scope.block.body.length; i++) {
          const entry = path.scope.block.body[i];
          if (entry.type === "CallStatement" && entry.hasErrorAsync) {
            const errorIdentifier = entry.expression.identifier.arguments[1].body[0].arguments[0]
            entry.expression.identifier.arguments[1].body[0] = b.returnStatement([
              b.callExpression(
                b.memberExpression(
                  b.identifier(identifierResolve.name),
                  ":",
                  b.identifier("reject")
                ),
                [ errorIdentifier ]
              )
            ])
          }
        }
      },

      SuperExpression(path) {
        const node = path.node;

        //console.log("super");

        /*

        var id = currentClass.identifier;
        path.replaceWith(
          b.memberExpression(
            id,
            ".",
            b.identifier("__parent"),
          )
        );

        */
      },

      CallExpression(path) {
        if (path.get("base").node.name == "__dumpscope") {
          path.scope.dump();
        }
        //if (path.type === "Identifier") {
          //console.log(path.node.name, path.scope.hasBinding(path.node.name));
        //}
        //console.log(path.type, path.scope);
      }

    }, state);

    var utilFuncs = generateUtilityFunctions();
    ast.chunk.body.unshift.apply(ast.chunk.body, utilFuncs);

    return ast;
  }
}

export default compiler;