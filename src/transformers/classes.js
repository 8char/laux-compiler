import _ from "underscore";

import ReplaceSupers from "../helpers/replace-supers";

import * as b from "../builder";

const verifyConstructorVisitor = {
  SuperExpression(path) {
    if (
      this.isDerived &&
      !this.hasBareSuper &&
      !path.parentPath.isCallExpression({ base: path.node })
    ) {
      // TODO: Code frame
      throw new Error("'super.*' is not allowed before super()");
    }
  },

  CallExpression: {
    exit(path) {
      if (path.get("base").isSuperExpression()) {
        this.hasBareSuper = true;

        if (!this.isDerived) {
          // TODO: Code frame
          throw new Error("super() is only allowed in a derived constructor");
        }
      }
    },
  },

  SelfExpression(path) {
    if (this.isDerived && !this.hasBareSuper) {
      const fn = path.find((p) => p.isFunction());

      if (!fn) {
        // TODO: Code frame
        throw new Error("'self' is not allowed before super()");
      }
    }
  },
};

export default class ClassTransformer {
  constructor(path, state) {
    this.parent = path.parent;
    this.node = path.node;
    this.path = path;
    this.state = state;
    this.name = undefined;

    this.staticMembers = [];
    this.members = [];
    this.methods = [];

    this.userMethods = [];
    this.userMembers = [];

    this.getters = [];
    this.setters = [];

    this.body = [];

    this.classRef = this.node.identifier;
    this.superRef = this.node.parent;
    this.isDerived = !!this.superRef;
  }

  run() {
    const { path } = this;
    const { node } = path;

    const { parent } = node;
    const { body } = this;

    const singletonVars =
      node.identifier.type === "CallExpression" && node.identifier.arguments;
    // If it's a singleton, we still wanna define our class as normal, hence get the Identifier/MemberExpression
    if (singletonVars) {
      node.identifier = node.identifier.base;
    }
    let strName = node.identifier.name;

    function constructName(obj, separator = "", postFix = "") {
      if (obj.type === "Identifier") {
        strName += `${separator}${obj.name}${postFix}`;
      } else if (obj.type === "BinaryExpression") {
        if (strName === "") {
          constructName(obj.left);
        }

        constructName(obj.right, "|");
      } else if (obj.type === "MemberExpression") {
        constructName(obj.base, `${strName === "" ? "" : "|"}`);

        constructName(obj.identifier, ".", "");
      }
    }

    if (strName === undefined) {
      strName = "";

      constructName(node.identifier);
    }

    this.name = strName;

    this.constructorBody = [];
    this.constructor = this.buildConstructor();

    const idClass0 = b.identifier("_class_0", true);
    const idParent0 = b.identifier("_parent_0", true);
    const idBase0 = b.identifier("_base_0", true);
    const idSetMetaTable = b.identifier("setmetatable");

    const varargLiteral = b.varargLiteral("...", "...");

    if (!node.isPublic) {
      body.push(b.localStatement([node.identifier], []));
    }

    const doBody = [];
    const baseTableKeys = [
      b.tableKeyString(
        b.identifier("__name"),
        b.stringLiteral(strName, `"${strName}"`),
      ),
    ];

    doBody.push(b.localStatement([idClass0], []));

    if (parent) {
      doBody.push(b.localStatement([idParent0], [parent]));
      baseTableKeys.push(
        b.tableKeyString(
          b.identifier("__base"),
          b.memberExpression(parent, ".", b.identifier("__base")),
        ),
      );
    }

    this.buildBody();

    this.setters.forEach((method) => {
      baseTableKeys.push(method);
    });

    this.getters.forEach((method) => {
      baseTableKeys.push(method);
    });

    this.methods.forEach((method) => {
      baseTableKeys.push(method);
    });

    this.members.forEach((member) => {
      this.constructorBody.unshift(member);
    });

    // If no constructor is written but the class extends, we add an vararg super constructor ourself
    if (this.constructorBody.length === 0 && parent) {
      const { constructor } = this;
      constructor.parameters.push(b.varargLiteral("...", "..."));
      const init = b.memberExpression(
        b.identifier("__parent"),
        ".",
        b.identifier("__init"),
      );
      const split = this.name.split(".");
      const identifier = b.memberExpression(
        b.identifier(split[0]),
        ".",
        split.length === 1 && init,
      );
      let currentIdentifier = identifier;
      for (let i = 1; i < split.length; i += 1) {
        currentIdentifier.identifier = b.memberExpression(
          b.identifier(split[i]),
          ".",
          split[i + 1] || init,
        );
        currentIdentifier = currentIdentifier.identifier;
      }
      const buildNode = b.callStatement(
        b.callExpression(identifier, [b.varargLiteral("...", "...")]),
      );
      constructor.body.push(buildNode);
    }

    doBody.push(
      b.localStatement(
        [idBase0],
        [b.tableConstructorExpression(baseTableKeys)],
      ),
    );

    doBody.push(
      b.assignmentStatement(
        [b.memberExpression(idBase0, ".", b.identifier("__index"))],
        [idBase0],
      ),
    );

    if (parent) {
      doBody.push(
        b.callStatement(
          b.callExpression(idSetMetaTable, [
            idBase0,
            b.memberExpression(idParent0, ".", b.identifier("__index")),
          ]),
        ),
      );
    }

    const idSelf0 = b.identifier("_self_0", true);
    const idCls = b.identifier("cls", true);
    let clsIndex;
    const clsTable = [
      b.tableKeyString(b.identifier("__init"), this.constructor),
      b.tableKeyString(b.identifier("__base"), idBase0) /* ,
      b.tableKeyString(
        b.identifier("__name"),
        b.stringLiteral(strName, `"${strName}"`)
      ), */,
    ];

    if (parent) {
      const idParent = b.identifier("_parent", true);
      const idName = b.identifier("parent", true);
      const idVal = b.identifier("val", true);
      clsIndex = b.functionExpression([idCls, idName], true, [
        b.localStatement(
          [idVal],
          [b.callExpression(b.identifier("rawget"), [idBase0, idName])],
        ),
        b.ifStatement([
          b.ifClause(
            b.binaryExpression("==", idVal, b.nilLiteral(null, "nil")),
            [
              b.localStatement(
                [idParent],
                [
                  b.callExpression(b.identifier("rawget"), [
                    idCls,
                    b.stringLiteral("__parent", '"__parent"'),
                  ]),
                ],
              ),
              b.ifStatement([
                b.ifClause(idParent, [
                  b.returnStatement([b.indexExpression(idParent, idName)]),
                ]),
              ]),
            ],
          ),
          b.elseClause([b.returnStatement([idVal])]),
        ]),
      ]);

      clsTable.push(b.tableKeyString(b.identifier("__parent"), idParent0));
    } else {
      clsIndex = idBase0;
    }

    _.each(this.staticMembers, (member) => {
      clsTable.push(b.tableKeyString(member.identifier, member.expression));
    });

    const callBody = [
      b.localStatement(
        [idSelf0],
        [
          b.callExpression(idSetMetaTable, [
            b.tableConstructorExpression([]),
            idBase0,
          ]),
        ],
      ),
      b.callStatement(
        b.callExpression(
          b.memberExpression(idCls, ".", b.identifier("__init")),
          [idSelf0, varargLiteral],
        ),
      ),
      b.returnStatement([idSelf0]),
    ];

    doBody.push(
      b.assignmentStatement(
        [idClass0],
        [
          b.callExpression(idSetMetaTable, [
            b.tableConstructorExpression(clsTable),
            b.tableConstructorExpression([
              b.tableKeyString(b.identifier("__index"), clsIndex),
              b.tableKeyString(
                b.identifier("__call"),
                b.functionExpression([idCls, varargLiteral], true, callBody),
              ),
            ]),
          ]),
        ],
      ),
    );

    if (parent) {
      doBody.push(
        b.ifStatement([
          b.ifClause(
            b.memberExpression(idParent0, ".", b.identifier("__inherited")),
            [
              b.callStatement(
                b.callExpression(
                  b.memberExpression(
                    idParent0,
                    ".",
                    b.identifier("__inherited"),
                  ),
                  [idParent0, idClass0],
                ),
              ),
            ],
          ),
        ]),
      );
    }

    doBody.push(
      b.assignmentStatement(
        [node.identifier],
        [singletonVars ? b.callExpression(idClass0, singletonVars) : idClass0],
      ),
    );

    body.push(b.doStatement(doBody));

    return body;
  }

  buildBody() {
    this.pushBody();
    // this.verifyConstructor();
  }

  buildConstructor() {
    return b.functionExpression(
      [b.selfExpression()],
      true,
      this.constructorBody,
    );
  }

  static buildMember(member) {
    return b.assignmentStatement(
      [b.memberExpression(b.selfExpression(), ".", member.identifier)],
      [member.expression],
    );
  }

  translateCallExpressions(node) {
    if (Array.isArray(node)) {
      node.forEach((childNode) => this.translateCallExpressions(childNode));

      return;
    }

    const { body, type, expression, base, identifier } = node;
    if (body && body.length >= 1) {
      body.forEach((childNode) => this.translateCallExpressions(childNode));
    }
    if (expression) {
      this.translateCallExpressions(expression);
    }
    if (base) {
      this.translateCallExpressions(base);
    }
    if (node.clauses) {
      this.translateCallExpressions(node.clauses);
    }
    if (identifier && type !== "ClassMethodStatement") {
      if (this.privateSet.has(identifier.name)) {
        identifier.name = this.getPrivateName(identifier.name);
      }
    }
    if (node.init) {
      this.translateCallExpressions(node.init);
    }

    // console.log(node.type, node.name, node.visibility, node)
  }

  pushBody() {
    const classBodyPaths = this.path.get("body");
    let typeMethod;
    // First we create a private set
    const privateSet = new Set();
    classBodyPaths.forEach((path) => {
      const { visibility } = path.node;
      const { name } = path.node.identifier;

      if (visibility === "PRIVATE") {
        privateSet.add(name);
      }
    });

    this.privateSet = privateSet;

    classBodyPaths.forEach((path) => {
      const { node } = path;

      if (path.isClassMemberStatement()) {
        this.pushMember(node, path);
      }

      if (path.isClassGetSetStatement()) {
        this.pushGetSet(node, path);
      }

      if (path.isClassMethodStatement()) {
        const isConstructor = node.kind === "constructor";
        this.translateCallExpressions(node);

        if (isConstructor) {
          path.traverse(verifyConstructorVisitor, this);

          if (!this.hasBareSuper && this.isDerived) {
            // TODO: Code frame
            throw new Error("missing super() call in constructor");
          }
        }

        const replaceSupers = new ReplaceSupers({
          methodPath: path,
          methodNode: node,
          classRef: this.classRef,
          inClass: true,
          scope: this.scope,
        });

        replaceSupers.replace();

        if (isConstructor) {
          this.pushConstructor(replaceSupers, node, path);
        } else {
          if (path.node.identifier.name === "__type") {
            typeMethod = path;
          }

          this.pushMethod(node, path);
        }
      }
    });

    if (!typeMethod) {
      this.methods.push(
        b.tableKeyString(
          b.identifier("__type"),
          b.functionExpression([b.selfExpression()], true, [
            b.returnStatement([
              b.memberExpression(
                b.selfExpression(),
                ".",
                b.identifier("__name"),
              ),
            ]),
          ]),
        ),
      );
    }
  }

  pushConstructor(replaceSupers, node, path) {
    this.bareSupers = replaceSupers.bareSupers;

    const { constructor } = this;

    constructor.parameters.push(...node.parameters);

    this.userConstructorPath = path;
    this.userConstructor = node;
    this.hasConstructor = true;

    node.body.forEach((n) => {
      if (
        n.type === "CallStatement" &&
        n.expression &&
        n.expression.type === "CallExpression" &&
        n.expression.base.type === "MemberExpression" &&
        n.expression.base.base.type === "SelfExpression"
      ) {
        n.expression.arguments
          .filter(
            (arg) =>
              arg.type === "MemberExpression" &&
              arg.base.type === "SelfExpression",
          )
          .forEach((arg) => {
            if (this.privateSet.has(arg.identifier.name)) {
              // eslint-disable-next-line no-param-reassign
              arg.identifier.name = this.getPrivateName(arg.identifier.name);
            }
          });
      }
    });

    this.constructorBody.push(...node.body);
  }

  getPrivateName(fieldName) {
    let { name } = this;
    name = name.charAt(0).toLowerCase() + name.slice(1);
    name = name.replace(/\./g, "_");

    return `${name}__${fieldName}`;
  }

  pushMethod(node) {
    const params = node.parameters.slice();
    if (!node.isStatic) {
      params.unshift(b.selfExpression());
    }

    this.userMethods.push(node);

    const { visibility } = node;
    const { identifier } = node;
    if (visibility) {
      switch (visibility) {
        case "PRIVATE":
          identifier.name = this.getPrivateName(identifier.name);
          break;

        default:
          break;
      }
    }
    // console.log(identifier);

    const exp = b.functionExpression(params, true, node.body);
    exp.async = node.async;
    exp.blockAsync = node.async;
    if (node.isStatic) {
      this.staticMembers.push({
        identifier,
        expression: exp,
      });
    } else {
      this.methods.push(b.tableKeyString(identifier, exp));
    }
  }

  pushGetSet(node) {
    const rawName = node.identifier.name;
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    if (node.isGet) {
      this.getters.push(
        b.tableKeyString(
          b.identifier(`get${name}`),
          b.functionExpression([b.selfExpression()], true, [
            b.returnStatement([
              b.memberExpression(
                b.selfExpression(),
                ".",
                b.identifier(rawName),
              ),
            ]),
          ]),
        ),
      );
    }
    if (node.isSet) {
      const idParam = b.identifier(rawName);

      const test = b.tableKeyString(
        b.identifier(`set${name}`),
        b.functionExpression([b.selfExpression(), idParam], true, [
          b.assignmentStatement(
            [
              b.memberExpression(
                b.selfExpression(),
                ".",
                b.identifier(rawName),
              ),
            ],
            [idParam],
          ),
          b.returnStatement([b.selfExpression()]),
        ]),
      );

      this.setters.push(test);
    }
  }

  pushMember(node) {
    this.userMembers.push(node);

    const member = ClassTransformer.buildMember(node);

    if (node.isStatic) {
      this.staticMembers.push({
        identifier: node.identifier,
        expression: node.expression,
      });
    } else {
      this.members.push(member);
    }
  }
}
