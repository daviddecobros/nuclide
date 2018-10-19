"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createOutlines = createOutlines;

var _RxMin = require("rxjs/bundles/Rx.min.js");

function _featureConfig() {
  const data = _interopRequireDefault(require("../../../../nuclide-commons-atom/feature-config"));

  _featureConfig = function () {
    return data;
  };

  return data;
}

function _textEditor() {
  const data = require("../../../../nuclide-commons-atom/text-editor");

  _textEditor = function () {
    return data;
  };

  return data;
}

function _collection() {
  const data = require("../../../../nuclide-commons/collection");

  _collection = function () {
    return data;
  };

  return data;
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * 
 * @format
 */
const LOADING_DELAY_MS = 500;
const OUTLINE_DEBOUNCE_DELAY = 100;

function createOutlines(editorService) {
  return outlinesForProviderResults(editorService.getResultsStream());
}

function outlinesForProviderResults(providerResults) {
  return providerResults.switchMap(uiOutlinesForResult);
}

function uiOutlinesForResult(result) {
  switch (result.kind) {
    case 'not-text-editor':
      return _RxMin.Observable.of({
        kind: 'not-text-editor'
      });

    case 'no-provider':
      return _RxMin.Observable.of({
        kind: 'no-provider',
        grammar: result.grammar.name
      });

    case 'pane-change':
      // Originally, we displayed a empty pane immediately, but this caused an undesireable
      // flickering effect so we prefer stale information for the first LOADING_DELAY_MS.
      // If we haven't received anything after LOADING_DELAY_MS, display a loading indicator.
      return _RxMin.Observable.concat(_RxMin.Observable.of({
        kind: 'loading'
      }).delay(LOADING_DELAY_MS));

    case 'result':
      const outline = result.result;

      if (outline == null) {
        return _RxMin.Observable.of({
          kind: 'provider-no-outline'
        });
      }

      return rootOutline(outline, result.editor);

    case 'provider-error':
      return _RxMin.Observable.of({
        kind: 'provider-no-outline'
      });

    default:
      // Don't change the UI after 'edit' or 'save' events.
      // It's better to just leave the existing outline visible until the new results come in.
      return _RxMin.Observable.empty();
  }
}

function rootOutline(outline, editor) {
  const nameOnly = _featureConfig().default.get('atom-ide-outline-view.nameOnly');

  const outlineTrees = outline.outlineTrees.map(outlineTree => treeToUiTree(outlineTree, Boolean(nameOnly)));
  return getHighlightedPaths(outline, editor).map(highlightedPaths => ({
    kind: 'outline',
    highlightedPaths,
    outlineTrees,
    editor
  }));
}

function treeToUiTree(outlineTree, nameOnly) {
  const shortName = nameOnly && outlineTree.representativeName != null;
  return {
    icon: nameOnly ? undefined : outlineTree.icon,
    kind: nameOnly ? undefined : outlineTree.kind,
    plainText: shortName ? outlineTree.representativeName : outlineTree.plainText,
    tokenizedText: shortName ? undefined : outlineTree.tokenizedText,
    startPosition: outlineTree.startPosition,
    endPosition: outlineTree.endPosition,
    landingPosition: outlineTree.landingPosition,
    children: outlineTree.children.map(tree => treeToUiTree(tree, nameOnly))
  };
}

function getHighlightedPaths(outline, editor) {
  return (0, _textEditor().getCursorPositions)(editor).debounceTime(OUTLINE_DEBOUNCE_DELAY) // optimization: the outline never needs to update when navigating within a row
  .distinctUntilChanged((p1, p2) => p1.row === p2.row).map(position => {
    return highlightedPathsForOutline(outline, position);
  }).distinctUntilChanged((p1, p2) => (0, _collection().arrayEqual)(p1, p2, _collection().arrayEqual));
}

function highlightedPathsForOutline(outline, position) {
  const paths = [];

  function findHighlightedNodes(currentNode, currentPath) {
    if (shouldHighlightNode(currentNode, position)) {
      paths.push(currentPath);
    }

    if (currentNode.children) {
      currentNode.children.forEach((n, i) => findHighlightedNodes(n, currentPath.concat([i])));
    }
  }

  outline.outlineTrees.forEach((o, i) => findHighlightedNodes(o, [i]));
  return paths;
}

function shouldHighlightNode(outlineTree, cursorLocation) {
  const {
    startPosition,
    endPosition
  } = outlineTree;

  if (endPosition == null) {
    return false;
  }

  if (outlineTree.children.length !== 0) {
    const childStartPosition = outlineTree.children[0].startPosition; // Since the parent is rendered in the list above the children, it doesn't really make sense to
    // highlight it if you are below the start position of any child. However, if you are at the top
    // of a class it does seem desirable to highlight it.

    return cursorLocation.isGreaterThanOrEqual(startPosition) && cursorLocation.isLessThan(childStartPosition);
  }

  return cursorLocation.isGreaterThanOrEqual(startPosition) && cursorLocation.isLessThanOrEqual(endPosition);
}