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




function repeatString(str, times) {
  if (times <= 0) return "";
  var s = repeatString(str, times >> 1);
  s += s;
  if (times & 1) s += str;
  return s;
}
function chr(n) { return String.fromCharCode(n+48); }
function ord(c) { return c.charCodeAt(0)-48; }

function map(array, func) {
  var result = [];
  // must remain compatible with "arguments" pseudo-array
  for(var i=0;i<array.length;i++) {
    if (func) result.push(func(array[i], i));
    else result.push(array[i]);
  }
  return result;
}

function forEach(array, func) {
  for(var i=0;i<array.length;i++) {
    var result = func(array[i], i);
    if (result) break;
  }
}

function getText(padOpaqueRef, r, func/*(text, optErrorData)*/) {
  doAjaxGet('/ep/pad/history/'+padOpaqueRef+'/text/'+Number(r),
	    function(data, optErrorData) {
	      if (optErrorData) {
		func(null, optErrorData);
	      }
	      else {
		var text = data.text;
		func({text: text});
	      }
	    });
}

function getChanges(padOpaqueRef, first, last, func/*(data, optErrorData)*/) {
  doAjaxGet('/ep/pad/history/'+padOpaqueRef+'/changes/'+Number(first)+'-'+Number(last),
	    function(data, optErrorData) {
	      if (optErrorData) {
		func(null, optErrorData);
	      }
	      else {
		func(uncompressChangesBlock({charPool: data.charPool,
					     changes: data.changes,
					     firstRev: first}));
	      }
	    });
}

function statPad(padOpaqueRef, func/*(atext, optErrorData)*/) {
  doAjaxGet('/ep/pad/history/'+padOpaqueRef+'/stat',
	    function(data, optErrorData) {
	      if (optErrorData) {
		func(null, optErrorData);
	      }
	      else {
		var obj = {exists: data.exists};
		if (obj.exists) {
		  obj.latestRev = data.latestRev;
		}
		
		func(obj);
	      }
	    });
}

function doAjaxGet(url, func/*(data, optErrorData)*/) {
  $.ajax({
    type: 'get',
    dataType: 'json',
    url: url,
    success: function(data) {
      if (data.error) {
	func(null, {serverError: data});
      }
      else {
	func(data);
      }
    },
    error: function(xhr, textStatus, errorThrown) {
      func(null, {clientError: { textStatus:textStatus, errorThrown: errorThrown }});
    }
  });  
}

function uncompressChangesBlock(data) {
  var charPool = data.charPool;
  var changesArray = data.changes.split(',');
  var firstRev = data.firstRev;
  
  var changesBlock = {};
  var changeStructs = [];
  var charPoolIndex = 0;
  var lastTimestamp = 0;
  for(var i=0;i<changesArray.length;i++) {
    var receiver = [null, 0];
    var curString = changesArray[i];
    function nextChar() {
      return curString.charAt(receiver[1]);
    }
    function readChar() {
      var c = nextChar();
      receiver[1]++;
      return c;
    }
    function readNum() {
      return decodeVarInt(curString, receiver[1], receiver);
    }
    function readString() {
      var len = readNum();
      var str = charPool.substr(charPoolIndex, len);
      charPoolIndex += len;
      return str;
    }
    function readTimestamp() {
      var absolute = false;
      if (nextChar() == "+") {
	readChar();
	absolute = true;
      }
      var t = readNum()*1000;
      if (! absolute) {
	t += lastTimestamp;
      }
      lastTimestamp = t;
      return t;
    }
    function atEnd() {
      return receiver[1] >= curString.length;
    }
    var timestamp = readTimestamp();
    var authorNum = readNum();
    var splices = [];
    while (! atEnd()) {
      var spliceType = readChar();
      var startChar = readNum();
      var oldText = "";
      var newText = "";
      if (spliceType != '+') {
	oldText = readString();
      }
      if (spliceType != '-') {
	newText = readString();
      }
      splices.push([startChar,oldText,newText]);
    }
    changeStructs.push({t:timestamp, a:authorNum, splices:splices});
  }

  changesBlock.firstRev = firstRev;
  changesBlock.changeStructs = changeStructs;

  return changesBlock;
}

var BASE64_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._";
var BASE64_DIGIT_TO_NUM = (function() {
  var map = {};
  for(var i=0;i<BASE64_DIGITS.length;i++) {
    map[BASE64_DIGITS.charAt(i)] = i;
  }
  return map;
})();

function decodeVarInt(stringIn, indexIn, numAndIndexOut) {
  var n = 0;
  var done = false;
  var i = indexIn;
  while (! done) {
    var d = + BASE64_DIGIT_TO_NUM[stringIn.charAt(i++)];
    if (isNaN(d)) return -1;
    if ((d & 32) == 0) {
      done = true;
    }
    n = n*32 + (d & 31);
  }
  if (numAndIndexOut) {
    numAndIndexOut[0] = n;
    numAndIndexOut[1] = i;
  }
  return n;
}

function escapeHTML(s) {
  var re = /[&<>\n]/g;
  if (! re.MAP) {
    // persisted across function calls!
    re.MAP = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '\n': '<br/>'
    };
  }
  return s.replace(re, function(c) { return re.MAP[c]; });
}

var padOpaqueRef = clientVars.padOpaqueRef;
var keyframes = []; // [rev, atext] pairs
var changesBlocks = []; // [first, last, changesBlock]
var lastRev;
var lastRevLoaded = -1;
var problemData = null;
var curRev = -1;
var curText = { lines: [/*string, length+1*/] };

function setLastRevLoaded(r) {
  lastRevLoaded = r;
  //$("#sliderui").slider('option', 'max', lastRevLoaded);
  $("#currevdisplay .max").html(String(lastRevLoaded));
}

function initialStat(continuation) {
  statPad(padOpaqueRef, function(data, errorData) {
    if (errorData) {
      reportProblem(errorData);
      continuation(false);
    }
    else {
      if (! data.exists) {
	reportProblem({msg: "Pad not found."});
	continuation(false);
      }
      else {
	lastRev = data.latestRev;
	continuation(true);
	return;
      }
    }
  });
}

function loadKeyframe(r, continuation) {
  getText(padOpaqueRef, r, function(data, errorData) {
    if (errorData) {
      reportProblem(errorData);
      continuation(false);
    }
    else {
      keyframes.push([r, data]);
      keyframes.sort(function(a, b) {
	return a[0] - b[0];
      });
      continuation(true);
    }
  });
}

function loadChangesBlock(first, last, continuation) {
  getChanges(padOpaqueRef, first, last, function(data, errorData) {
    if (errorData) {
      reportProblem(errorData);
      continuation(false);
    }
    else {
      changesBlocks.push([first, last, data]);
      continuation(true);
    }
  });
}

function loadThroughZero(continuation) {
  initialStat(function(success) {
    if (success) {
      loadKeyframe(0, function(success) {
	if (success) {
	  setLastRevLoaded(0);
	  continuation(true);
	}
	else continuation(false);
      });
    }
    else continuation(false);
  });
}

function loadMoreRevs(continuation) {
  if (lastRevLoaded >= lastRev) {
    continuation(true);
  }
  else {
    var first = lastRevLoaded+1;
    var last = first + 499;
    if (last > lastRev) {
      last = lastRev;
    }
    loadChangesBlock(first, last, function(success) {
      if (success) {
	loadKeyframe(last, function(success) {
	  if (success) {
	    setLastRevLoaded(last);
	    continuation(true);
	  }
	  else continuation(false);
	});
      }
      else continuation(false);
    });
  }
}

function getDocTextForText(text) {
  var lines = map(text.split('\n').slice(0, -1), function(s) {
    return [s, s.length+1];
  });
  return { lines: lines };
}

function getLineAndChar(docText, charIndex) {
  // returns [lineIndex, charIndexIntoLine];
  // if the charIndex is after the final newline of the document,
  // lineIndex may be == docText.lines.length.
  // Otherwise, lneIndex is an actual line and charIndex
  // is between 0 and the line's length inclusive.
  var startLine = 0;
  var startLineStartChar = 0;
  var lines = docText.lines;
  var done = false;
  while (!done) {
    if (startLine >= lines.length) {
      done = true;
    }
    else {
      var lineLength = lines[startLine][1];
      var nextLineStart = startLineStartChar + lineLength;
      if (nextLineStart <= charIndex) {
	startLine++;
	startLineStartChar = nextLineStart;
      }
      else {
	done = true;
      }
    }
  }
  return [startLine, charIndex - startLineStartChar];
}

function applySplice(docText, splice, forward) {
  var startChar = splice[0];
  var oldText = splice[1];
  var newText = splice[2];
  if (! forward) {
    var tmp = oldText;
    oldText = newText;
    newText = tmp;
  }

  //var OLD_FULL_TEXT = map(docText.lines, function(L) { return L[0]; }).join('\n')+'\n';
  //var OLD_NUM_LINES = docText.lines.length;
  
  var lines = docText.lines;
  var startLineAndChar = getLineAndChar(docText, startChar);
  var endLineAndChar = getLineAndChar(docText, startChar+oldText.length);
  
  var lineSpliceStart = startLineAndChar[0];
  var lineSpliceEnd = endLineAndChar[0];
  var newLines = newText.split('\n');
  // we want to splice in entire lines, so adjust start to include beginning of line
  // we're starting to insert into
  if (startLineAndChar[1] > 0) {
    newLines[0] = lines[startLineAndChar[0]][0].substring(0, startLineAndChar[1]) + newLines[0];
  }
  // adjust end to include entire last line that will be changed
  if (endLineAndChar[1] > 0 || newLines[newLines.length-1].length > 0) {
    newLines[newLines.length-1] += lines[endLineAndChar[0]][0].substring(endLineAndChar[1]);
    lineSpliceEnd += 1;
  }
  else {
    // the splice is ok as is, except for an extra newline
    newLines.pop();
  }
  
  var newLineEntries = map(newLines, function(s) {
    return [s, s.length+1];
  });

  Array.prototype.splice.apply(lines,
			       [lineSpliceStart, lineSpliceEnd-lineSpliceStart].concat(newLineEntries));
  
  // check it
  //var EXPECTED_FULL_TEXT = OLD_FULL_TEXT.substring(0, startChar) + newText +
  //OLD_FULL_TEXT.substring(startChar + oldText.length, OLD_FULL_TEXT.length);
  //var ACTUAL_FULL_TEXT = map(docText.lines, function(L) { return L[0]; }).join('\n')+'\n';
  
  //console.log("%o %o %o %d %d %d %d %d",
  //docText.lines, startLineAndChar, endLineAndChar, OLD_NUM_LINES,
  //lines.length, lineSpliceStart, lineSpliceEnd-lineSpliceStart, newLineEntries.length);
  
  //if (EXPECTED_FULL_TEXT != ACTUAL_FULL_TEXT) {
  //console.log(escapeHTML("mismatch: "+EXPECTED_FULL_TEXT+" / "+ACTUAL_FULL_TEXT));
  //}

  return [lineSpliceStart, lineSpliceEnd-lineSpliceStart, newLines];
}

function lineHTML(line) {
  return (escapeHTML(line) || '&nbsp;');
}

function setCurText(docText, dontSetDom) {
  curText = docText;
  if (! dontSetDom) {
    var docNode = $("#stuff");
    var html = map(docText.lines, function(line) {
      return '<div>'+lineHTML(line[0])+'</div>';
    });
    docNode.html(html.join(''));
  }
}

function spliceDom(splice) {
  var index = splice[0];
  var numRemoved = splice[1];
  var newLines = splice[2];

  var overlap = Math.min(numRemoved, newLines.length);
  var container = $("#stuff").get(0);
  var oldNumNodes = container.childNodes.length;
  var i = 0;
  for(;i<overlap;i++) {
    var n = container.childNodes.item(index+i);
    $(n).html(lineHTML(newLines[i]));
  }
  for(;i<newLines.length;i++) {
    var insertIndex = index+i;
    var content = '<div>'+lineHTML(newLines[i])+'</div>';
    if (insertIndex >= container.childNodes.length) {
      $(container).append(content);
    }
    else {
      $(container.childNodes.item(insertIndex)).before(content);
    }
  }
  for(;i<numRemoved;i++) {
    var deleteIndex = index+overlap;
    $(container.childNodes.item(deleteIndex)).remove();
  }

  //console.log("%d %d %d %d %d", splice[0], splice[1], splice[2].length,
  //oldNumNodes + newLines.length - numRemoved,
  //container.childNodes.length);
}

function seekToRev(r) {
  // precond: r is reachable

  var isStep = false;
  
  var bestKeyFrameIndex = -1;
  var bestKeyFrameDistance = -1;
  function considerKeyframe(index, kr) {
    var dist = Math.abs(r - kr);
    if (bestKeyFrameDistance < 0 || dist < bestKeyFrameDistance) {
      bestKeyFrameDistance = dist;
      bestKeyFrameIndex = index;
    }
  }
  for(var i=0;i<keyframes.length;i++) {
    considerKeyframe(i, keyframes[i][0]);
  }
  if (curRev >= 0) {
    if (Math.abs(r - curRev) == 1) {
      isStep = true;
      bestKeyFrameIndex = -2; // -2 to mean "current revision"
    }
    else {
      considerKeyframe(-2, curRev);
    }
  }

  var docText = curText;
  var docRev = curRev;
  if (bestKeyFrameIndex >= 0) {
    // some keyframe is better than moving from the current location;
    // move to that keyframe
    var keyframe = keyframes[bestKeyFrameIndex];
    docRev = keyframe[0];
    docText = getDocTextForText(keyframe[1].text);
  }

  var startRev = docRev;
  var destRev = r;

  var curChangesBlock = null;
  function findChangesBlockFor(n) {
    function changesBlockWorks(arr) {
      return n >= arr[0] && n <= arr[1];
    }
    if (curChangesBlock == null || ! changesBlockWorks(curChangesBlock)) {
      curChangesBlock = null;
      for(var i=0;i<changesBlocks.length;i++) {
	var cba = changesBlocks[i];
	if (changesBlockWorks(cba)) {
	  curChangesBlock = cba;
	  break;
	}
      }
    }
  }

  //var DEBUG_REVS_APPLIED = [];
  
  function applyRev(n, forward) {
    findChangesBlockFor(n);
    var cb = curChangesBlock[2];
    var idx = n - curChangesBlock[0];
    var chng = cb.changeStructs[idx];
    
    var splices = chng.splices;
    if (forward) {
      for(var i=0;i<splices.length;i++) {
	var splice = applySplice(docText, splices[i], true);
	if (isStep) spliceDom(splice);
      }
    }
    else {
      for(var i=splices.length-1;i>=0;i--) {
	var splice = applySplice(docText, splices[i], false);
	if (isStep) spliceDom(splice);
      }
    }

    //DEBUG_REVS_APPLIED.push(n);
  }
  
  if (destRev > startRev) {
    for (var j=startRev+1; j<=destRev; j++) {
      applyRev(j, true);
    }
  }
  else if (destRev < startRev) {
    for(var j=startRev; j >= destRev+1; j--) {
      applyRev(j, false);
    }
  }

  docRev = destRev;
  
  setCurText(docText, isStep);
  curRev = docRev;
  $("#currevdisplay .cur").html(String(curRev));
}

function reportProblem(probData) {
  problemData = probData;
  if (probData.msg) {
    $("#stuff").html(escapeHTML(probData.msg));
  }
}

var playTimer = null;

$(function() {
  /*$("#sliderui").slider({min: 0, max: 0, value: 0, step: 1, change: slidechange});
  function slidechange(event, ui) {
    alert("HELLO");
    var value = ui.value;
    console.log(value);
  }*/

  $("#controls .next").click(function() {
    if (curRev < lastRevLoaded) {
      seekToRev(curRev+1);
    }
    return false;
  });

  $("#controls .prev").click(function() {
    if (curRev > 0) {
      seekToRev(curRev-1);
    }
    return false;
  });

  function stop() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function play() {
    stop();
    playTimer = setInterval(function() {
      if (curRev < lastRevLoaded) {
	seekToRev(curRev+1);	
      }
      else {
	stop();
      }
    }, 60);
    return false;    
  }
  
  $("#controls .play").click(play);
  
  $("#controls .stop").click(function() {
    stop();
    return false;
  });

  $("#controls .entry").change(function() {
    var value = $("#controls .entry").val();
    value = Number(value || 0);
    if (isNaN(value)) value = 0;
    if (value < 0) value = 0;
    if (value > lastRevLoaded) {
      value = lastRevLoaded;
    }
    $("#controls .entry").val('');
    seekToRev(value);
  });
  $("#controls .entry").val('');

  var useAutoplay = true;
  var hasAutoplayed = false;
  
  loadThroughZero(function(success) {
    if (success) {
      seekToRev(0);
      
      function loadMoreRevsIfNecessary(continuation) {
	if (lastRevLoaded < lastRev) {
	  loadMoreRevs(continuation);
	}
      }
      loadMoreRevsIfNecessary(function cont(success) {
	if (success) {
	  if (lastRevLoaded > 0 && useAutoplay && ! hasAutoplayed) {
	    hasAutoplayed = true;
	    play();
	  }
	  loadMoreRevsIfNecessary(cont);
	}
      });
    }
  });
});

