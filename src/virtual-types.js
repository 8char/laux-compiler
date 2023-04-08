import * as t from './types';

export const ReferencedIdentifier = {
  types: ['Identifier'],
  checkPath({ node, parent }) {
    // check if node is referenced
    return t.isReferenced(node, parent);
  },
};

export const BlockScoped = {
  checkPath(path) {
    return t.isBlockScoped(path.node);
  },
};
