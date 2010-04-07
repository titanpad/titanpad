/**
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

AceLexer = (function lexer_init() {

function makeIncrementalLexer(lineParser) {

  var parseLine = lineParser.parseLine;
  var initialState = lineParser.initialState;
  var getClassesForScope = lineParser.getClassesForScope;
  
  var lineData = newSkipList(); // one entry per line
  var buffer = ""; // full text of document, each line ending with \n
  var lineStatus = ""; // one char per line in buffer, (d)irty/(u)ncolored/(c)olored
  var nextLineDataId = 1;

  // "dirty" lines are unparsed lines.  Other lines have properties startState,endState.
  // "uncolored" lines are parsed but the data has not been handled by ACE.
  
  function roundBackToLineIndex(charOffset) { // charOffset is [0,document length]
    return lineData.indexOfOffset(charOffset);
    // result is [0,num lines]
  }

  function roundForwardToLineIndex(charOffset) { // charOffset is [0,document length]
    var idx = lineData.indexOfOffset(charOffset);
    var newCharOffset = lineData.offsetOfIndex(idx);
    if (newCharOffset < charOffset) {
      // rounded back, round forward instead
      return idx + 1;
    }
    return idx;
    // result is [0,num lines]
  }
  
  function updateBuffer(newBuffer, spliceStart, charsRemoved, charsAdded) {
    // newBuffer is string to replace buffer, other args explain the splice
    // that happened between the old buffer and newBuffer

    // determine range of lines (and character offsets of line boundaries) affected
    var spliceStartLineIndex = roundBackToLineIndex(spliceStart);
    var spliceStartCharOffset = lineData.offsetOfIndex(spliceStartLineIndex);
    var spliceEndLineIndex = roundForwardToLineIndex(spliceStart + charsRemoved);
    var spliceEndCharOffset = lineData.offsetOfIndex(spliceEndLineIndex);
    
    var extraBeginChars = spliceStart - spliceStartCharOffset;
    var extraEndChars = spliceEndCharOffset - (spliceStart + charsRemoved);
    var newChars = newBuffer.substring(spliceStart - extraBeginChars,
      spliceStart + charsAdded + extraEndChars);
    
    var newLineEntries = [];
    newChars.replace(/[^\n]*\n/g, function(line) {
      newLineEntries.push({ width: line.length, key: String(nextLineDataId++) });
    });
    
    lineData.splice(spliceStartLineIndex, spliceEndLineIndex - spliceStartLineIndex,
		    newLineEntries);

    var newDirtyStatus = "";
    for(var i=0;i<newLineEntries.length;i++) newDirtyStatus += "d";
    var extraDirty = 0;
    if ((! newDirtyStatus) && spliceEndLineIndex < lineStatus.length &&
	spliceEndLineIndex > spliceStartLineIndex) {
      // pure deletion of one or more lines, mark the next line after
      // the deletion as dirty to trigger relexing
      newDirtyStatus = "d";
      extraDirty = 1;
    }
    lineStatus = lineStatus.substring(0, spliceStartLineIndex) +
      newDirtyStatus + lineStatus.substring(spliceEndLineIndex + extraDirty);

    buffer = newBuffer;
  }
  
  function findBeginningOfDirtyRegion(dirtyLineIndex) {
    // search backwards for a line that is either the first line
    // or is preceded by a non-dirty line.
    var cleanLine = Math.max(lineStatus.lastIndexOf("c", dirtyLineIndex),
      lineStatus.lastIndexOf("u", dirtyLineIndex));
    // cleanLine is now either -1 (if all lines are dirty back to beginning of doc)
    // or the index of a clean line
    return cleanLine + 1;
  }

  function findEndOfUncoloredRegion(uncoloredLineIndex) {
    // search forwards for a line that is not uncolored,
    // or return number of lines in doc if end of doc is hit.
    var idx1 = lineStatus.indexOf("c", uncoloredLineIndex);
    var idx2 = lineStatus.indexOf("d", uncoloredLineIndex);
    if (idx1 < 0) {
      if (idx2 < 0) return lineStatus.length;
      else return idx2;
    }
    else {
      if (idx2 < 0) return idx1;
      else return Math.min(idx1, idx2);
    }
  }

  function getLineText(lineIndex) {
    var lineEntry = lineData.atIndex(lineIndex);
    var lineTextStart = lineData.offsetOfIndex(lineIndex);
    var lineTextEnd = lineTextStart + lineEntry.width;
    return buffer.substring(lineTextStart, lineTextEnd);    
  }

  function setLineStatus(lineIndex, status) {
    lineStatus = lineStatus.substring(0, lineIndex) + status +
      lineStatus.substring(lineIndex+1);
  }
  
  function lexCharRange(charRange, isTimeUp) {
    if (isTimeUp()) return;

    var lexStart = roundBackToLineIndex(charRange[0]);
    var lexEnd = roundForwardToLineIndex(charRange[1]);

    // can't parse a dirty line in the middle of a dirty region,
    // no sensible start state; so find beginning of dirty region
    var nextCandidate = findBeginningOfDirtyRegion(lexStart);
    
    while (! isTimeUp()) {
      // find a dirty line to parse; if may be before lexStart,
      // but stop at lexEnd.
      var nextDirty = lineStatus.indexOf("d", nextCandidate);
      if (nextDirty < 0 || nextDirty >= lexEnd) {
	break;
      }
      var theLineIndex = nextDirty;
      var theLineEntry = lineData.atIndex(theLineIndex);
      var lineText = getLineText(theLineIndex);
      
      // assert: previous line is not dirty
      var startState;
      if (theLineIndex > 0) {
	startState = lineData.atIndex(theLineIndex-1).endState;
      }
      else {
	startState = initialState;
      }

      var tokenWidths = [];
      var tokenNames = [];
      var tokenFunc = function(str, cls) {
	tokenWidths.push(str.length);
	tokenNames.push(cls);
      }
      var endState = parseLine(lineText, startState, tokenFunc);

      theLineEntry.startState = startState;
      theLineEntry.endState = endState;
      theLineEntry.tokenWidths = tokenWidths;
      theLineEntry.tokenNames = tokenNames;

      setLineStatus(theLineIndex, "u");

      nextCandidate = theLineIndex + 1;
      if (nextCandidate < lineStatus.length &&
	  lineStatus.charAt(nextCandidate) != "d" &&
	  lineData.atIndex(nextCandidate).startState != endState) {
	// state has changed, lexing must continue past end of dirty
	// region
	setLineStatus(nextCandidate, "d");
      }
    }
  }
  
  function forEachUncoloredSubrange(startChar, endChar, func, isTimeUp) {
    var startLine = roundBackToLineIndex(startChar);
    var endLine = roundForwardToLineIndex(endChar);
    
    var nextCandidate = startLine;

    while (! isTimeUp()) {
      var nextUncolored = lineStatus.indexOf("u", nextCandidate);
      if (nextUncolored < 0 || nextUncolored >= endLine) {
	break;
      }
      var uncoloredEndLine = findEndOfUncoloredRegion(nextUncolored);

      var rangeStart = Math.max(startChar, lineData.offsetOfIndex(nextUncolored));
      var rangeEnd = Math.min(endChar, lineData.offsetOfIndex(uncoloredEndLine));

      func(rangeStart, rangeEnd, isTimeUp);

      nextCandidate = uncoloredEndLine;
    }
  }

  function getSpansForRange(startChar, endChar, func, justPeek) {
    var startLine = roundBackToLineIndex(startChar);
    var endLine = roundForwardToLineIndex(endChar);

    function doToken(tokenStart, tokenWidth, tokenClass) {
      // crop token to [startChar,endChar] range
      if (tokenStart + tokenWidth <= startChar) return;
      if (tokenStart >= endChar) return;
      if (tokenStart < startChar) {
	tokenWidth -= (startChar - tokenStart);
	tokenStart = startChar;
      }
      if (tokenStart + tokenWidth > endChar) {
	tokenWidth -= (tokenStart + tokenWidth - endChar);
      }
      if (tokenWidth <= 0) return;
      func(tokenWidth, tokenClass);
    }
    
    for(var i=startLine; i<endLine; i++) {
      var status = lineStatus.charAt(i);
      var lineEntry = lineData.atIndex(i);
      var charOffset = lineData.offsetOfIndex(i);
      if (status == "d") {
	doToken(charOffset, lineEntry.width, "dirty");
      }
      else {
	var tokenWidths = lineEntry.tokenWidths;
	var tokenNames = lineEntry.tokenNames;
	for(var j=0;j<tokenWidths.length;j++) {
	  var w = tokenWidths[j];
	  doToken(charOffset, w, getClassesForScope(tokenNames[j]));
	  charOffset += w;
	}
	if (status != "c" && ! justPeek) {
	  setLineStatus(i, "c");
	}
      }
    }
  }

  function markRangeUncolored(startChar, endChar) {
    var startLine = roundBackToLineIndex(startChar);
    var endLine = roundForwardToLineIndex(endChar);

    function stripColors(statuses) {
      var a = [];
      for(var i=0;i<statuses.length;i++) {
	var x = statuses.charAt(i);
	a.push((x == 'c') ? 'u' : x);
      }
      return a.join('');
    }

    lineStatus = lineStatus.substring(0, startLine) +
      stripColors(lineStatus.substring(startLine, endLine)) +
      lineStatus.substring(endLine);
  }
  
  function _vars() {
    return {lineData:lineData, buffer:buffer, lineStatus:lineStatus, nextLineDataId:nextLineDataId,
	    lineParser:lineParser};
  }
  
  return {
    updateBuffer: updateBuffer,
    lexCharRange: lexCharRange,
    getSpansForRange: getSpansForRange,
    forEachUncoloredSubrange: forEachUncoloredSubrange,
    markRangeUncolored: markRangeUncolored,
    _vars: _vars
  };
}

function makeSimpleLexer(lineParser) {
  var parseLine = lineParser.parseLine;
  var initialState = lineParser.initialState;
  var getClassesForScope = lineParser.getClassesForScope;
  
  function lexAsLines(str, tokenFunc, newLineFunc) {
    if (str.charAt(str.length-1) != '\n') {
      str = str+'\n';
    }
    function doToken(txt, scope) {
      tokenFunc(txt, getClassesForScope(scope));
    }
    var state = initialState;
    str.replace(/[^\n]*\n/g, function(line) {
      state = parseLine(line, state, doToken);
      newLineFunc();
    });
  }

  function lexString(str, tokenFunc) {
    lexAsLines(str, tokenFunc, function() {});
  }

  return {lexString:lexString, lexAsLines:lexAsLines};
}

function codeStringToHTML(codeString) {
  var simpleLexer = makeSimpleLexer(grammars["source.js"]);
  var atLineStart = true;
  var html = [];
  function tokenFunc(txt, type) {
    var cls = type;
    if (cls) html.push('<tt class="',cls,'">');
    else html.push('<tt>');
    html.push(escapeHTML(txt),'</tt>');
    atLineStart = false;
  }
  function newLineFunc() {
    html.push('<br/>\n');
    atLineStart = true;
  }
  simpleLexer.lexAsLines(codeString, tokenFunc, newLineFunc);
  if (atLineStart) html.push('<br/>\n');
  return html.join('');
}

function escapeHTML(s) {
  var re = /[&<>\'\" ]/g;
  if (! re.MAP) {
    // persisted across function calls!
    re.MAP = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&#34;',
      "'": '&#39;',
      ' ': '&#160;'
    };
  }
  return s.replace(re, function(c) { return re.MAP[c]; });
}

function getIncrementalLexer(type) {
  return makeIncrementalLexer(grammars["text.html.basic"]);//grammars[type]);
}
function getSimpleLexer(type) {
  return makeSimpleLexer(grammars[type]);
}
  
return {getIncrementalLexer:getIncrementalLexer, getSimpleLexer:getSimpleLexer,
	codeStringToHTML:codeStringToHTML};

})();
