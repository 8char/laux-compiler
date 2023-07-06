import defineType from './index';

defineType('BreakStatement', {
  aliases: ['Statement'],
});

defineType('ContinueStatement', {
  aliases: ['Statement'],
});

defineType('GotoStatement', {
  visitors: ['label'],
  builder: ['label'],
  aliases: ['Statement'],
});

defineType('LabelStatement', {
  visitors: ['label'],
  builder: ['label'],
  aliases: ['Statement'],
});

defineType('CallStatement', {
  visitors: ['expression'],
  builder: ['expression'],
  aliases: ['Statement'],
});

defineType('DecoratorStatement', {
  visitors: ['expression'],
  builder: ['expression'],
  aliases: ['Statement'],
});

defineType('AssignmentStatement', {
  visitors: ['variables', 'init'],
  builder: ['variables', 'init'],
  aliases: ['Statement'],
});

defineType('LocalStatement', {
  visitors: ['variables', 'init'],
  builder: ['variables', 'init'],
  aliases: ['Statement', 'Declaration'],
});

defineType('LocalDestructorStatement', {
  visitors: ['variables', 'init'],
  builder: ['variables', 'init'],
  aliases: ['Statement'],
});

// If statement and clauses

defineType('IfStatement', {
  visitors: ['clauses'],
  builder: ['clauses'],
  aliases: ['Statement', 'Scopable'],
});

defineType('IfClause', {
  visitors: ['condition', 'body'],
  builder: ['condition', 'body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement', 'Clause'],
});

defineType('ElseifClause', {
  visitors: ['condition', 'body'],
  builder: ['condition', 'body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement', 'Clause'],
});

defineType('ElseClause', {
  visitors: ['body'],
  builder: ['body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement', 'Clause'],
});

//

defineType('WhileStatement', {
  visitors: ['condition', 'body'],
  builder: ['condition', 'body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement'],
});

defineType('RepeatStatement', {
  visitors: ['condition', 'body'],
  builder: ['condition', 'body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement'],
});

defineType('ForGenericStatement', {
  visitors: ['variables', 'iterators', 'body'],
  builder: ['variables', 'iterators', 'body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement', 'ForStatement'],
});

defineType('ForNumericStatement', {
  visitors: ['variable', 'start', 'end', 'step', 'body'],
  builder: ['variable', 'start', 'end', 'step', 'body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement', 'ForStatement'],
});

defineType('ForOfStatement', {
  visitors: ['expression', 'variables', 'body'],
  builder: ['variables', 'expression', 'body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement', 'ForStatement'],
});

defineType('DoStatement', {
  visitors: ['body'],
  builder: ['body'],
  aliases: ['Statement', 'Scopable', 'BlockStatement'],
});

defineType('ReturnStatement', {
  visitors: ['arguments'],
  builder: ['arguments'],
  aliases: ['Statement'],
});

defineType('FunctionDeclaration', {
  visitors: ['identifier', 'parameters', 'body'],
  builder: ['identifier', 'parameters', 'isLocal', 'body'],
  aliases: ['Statement', 'Scopable', 'Declaration', 'Function', 'FunctionParent', 'BlockStatement'],
});

defineType('MutationStatement', {
  visitors: ['expression', 'value'],
  builder: ['expression', 'sign', 'value'],
  aliases: ['Statement'],
});

defineType('ClassStatement', {
  visitors: ['identifier', 'parent', 'constructor', 'members', 'methods'],
  builder: ['identifier', 'parent', 'body', 'isPublic'],
  aliases: ['Statement', 'Scopable', 'Declaration'],
});

defineType('ClassMethodStatement', {
  visitors: ['identifier', 'parameters', 'body'],
  builder: ['identifier', 'kind', 'parameters', 'body', 'isStatic', 'async', 'visibility'],
  aliases: ['Statement', 'Scopable'],
});

defineType('ClassMemberStatement', {
  visitors: ['identifier', 'expression'],
  builder: ['identifier', 'expression', 'isStatic'],
  aliases: ['Statement'],
});
defineType('ClassGetSetStatement', {
  visitors: ['identifier'],
  builder: ['identifier', 'isGet', 'isSet'],
  aliases: ['Statement'],
});
defineType('StopIfStatement', {
  visitors: ['arguments'],
  builder: ['arguments'],
  aliases: ['Statement'],
});

defineType('BreakIfStatement', {
  visitors: ['arguments'],
  builder: ['arguments'],
  aliases: ['Statement'],
});

defineType('ContinueIfStatement', {
  visitors: ['arguments'],
  builder: ['arguments'],
  aliases: ['Statement'],
});

defineType('AwaitStatement', {
  visitors: ['expression'],
  builder: ['expression'],
  aliases: ['Statement'],
});

defineType('ThrowStatement', {
  visitors: ['expression'],
  builder: ['expression'],
  aliases: ['Statement'],
});

defineType('ImportStatement', {
  visitors: ['variables', 'init'],
  builder: ['variables', 'init'],
  aliases: ['Statement', 'Statement'],
});
