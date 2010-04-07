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


/* This file is also a Helma module, referenced by its path! */

AceLexer = (function lexer_init() {

// utility functions, make this file self-contained

function forEach(array, func) {
  for(var i=0;i<array.length;i++) {
    var result = func(array[i], i);
    if (result) break;
  }
}

function map(array, func) {
  var result = [];
    // must remain compatible with "arguments" pseudo-array
  for(var i=0;i<array.length;i++) {
    if (func) result.push(func(array[i], i));
    else result.push(array[i]);
  }
  return result;
}

function filter(array, func) {
  var result = [];
    // must remain compatible with "arguments" pseudo-array
  for(var i=0;i<array.length;i++) {
    if (func(array[i], i)) result.push(array[i]);
  }
  return result;
}

function isArray(testObject) {
  return testObject && typeof testObject === 'object' &&
    !(testObject.propertyIsEnumerable('length')) &&
    typeof testObject.length === 'number';
}
  
// these three lines inspired by Steven Levithan's XRegExp
var singleLineRegex = /(?:[^[\\.]+|\\(?:[\S\s]|$)|\[\^?]?(?:[^\\\]]+|\\(?:[\S\s]|$))*]?)+|\./g;
var backReferenceRegex = /(?:[^\\[]+|\\(?:[^0-9]|$)|\[\^?]?(?:[^\\\]]+|\\(?:[\S\s]|$))*]?)+|\\([0-9]+)/g;
var parenFindingRegex = /(?:[^[(\\]+|\\(?:[\S\s]|$)|\[\^?]?(?:[^\\\]]+|\\(?:[\S\s]|$))*]?|\((?=\?))+|(\()/g;

// Creates a function that, when called with (string, startIndex), finds the first of the patterns that
// matches the string starting at startIndex (and anchored there).  Expects startIndex < string.length.
// The function returns a structure containing "whichCase", a number 0..(patterns.length-1) giving the
// index of the pattern that matched, or -1 if no pattern did, and "result", an array of the kind
// returned by RegExp.exec called on that pattern, or the array that would be returned by matching /[\S\s]/
// (any single character) if no other pattern matched.  Supports the flags 'i', 'm', and 's', where the
// effect of 's' is to make dots match all characters, including newlines.
// Patterns in general are not allowed to match zero-width strings, but a pattern that is specified
// as a regular expression literal with the 'm' flag is considered special, and may be zero-width,
// though as a consequence the match cannot include the final newline of the document.  (Other flags
// on regular expression literals are ignored; use the "flags" argument instead.)
function makeRegexSwitch(patterns, flags) {
  var numPatterns = patterns.length;
  var patternStrings = map(patterns, function (p) {
    if ((typeof p) == "string")
      return p; // a string
    else return p.source; // assume it's a regex
  });
  var patternZeros = map(patterns, function (p) {
    // using "multiline" is a special way to indicate the reg-ex is zero-width
    return ((typeof p) != "string") && p.multiline;
  });
  patternStrings.push("[\\S\\s]"); // default case
  patternZeros.push(false);
  // how many capturing groups each pattern has
  var numGroups = map(patternStrings, function (p) {
    var count = 0;
    p.replace(parenFindingRegex, function (full,paren,offset) { if (paren) count++; });
    return count;
  });
  // the group number for each case of the switch
  var caseGroupNums = [];
  var idx = 1;
  forEach(numGroups, function (n) { caseGroupNums.push(idx); idx += n+1; });
  // make a big alternation of capturing groups
  var alternation = map(patternStrings, function(p, pi) {
    // correct the back-reference numbers
    p = p.replace(backReferenceRegex, function (full, num) {
      if (num) return "\\"+((+num)+caseGroupNums[pi]);
      else return full;
    });
    var extra = (patternZeros[pi] ? "[\\S\\s]": ""); // tack on another char for zero-widths
    return '('+p+extra+')';
  }).join('|');
  // process regex flags
  flags = (flags || "");
  var realFlags = "g";
  for(var i=0;i<flags.length;i++) {
    var f = flags.charAt(i);
    if (f == "i" || f == "m") realFlags += f;
    else if (f == "s") {
      alternation = alternation.replace(singleLineRegex,
					function (x) { return x==='.' ? "[\\S\\s]" : x; });
    }
  }
  //console.log(alternation);
  var bigRegex = new RegExp(alternation, realFlags);
  return function (string, matchIndex) {
    bigRegex.lastIndex = matchIndex;
    var execResult = bigRegex.exec(string);
    var whichCase;
    var resultArray = [];
    // search linearly for which case matched in the alternation
    for(var i=0;i<=numPatterns;i++) {
      var groupNum = caseGroupNums[i];
      if (execResult[groupNum]) {
	whichCase = i;
	for(var j=0;j<=numGroups[i];j++) {
	  var r = execResult[groupNum+j];
	  if (patternZeros[i] && j==0) {
	    r = r.substring(0, r.length-1);
	  }
	  resultArray[j] = r;
	}
	break;
      }
    }
    if (whichCase == numPatterns)
      whichCase = -1; // default case
    return {whichCase: whichCase, result: resultArray};
  }
}


var tokenClasses = {
  'Token':                         '',
  
  'Text':                          '',
  'TEST':                          'test',
  'Whitespace':                    'w',
  'Error':                         'err',
  'Other':                         'x',
  'Dirty':                         'dirty',
  
  'Keyword':                       'k',
  'Keyword.Constant':              'kc',
  'Keyword.Declaration':           'kd',
  'Keyword.Pseudo':                'kp',
  'Keyword.Reserved':              'kr',
  'Keyword.Type':                  'kt',
  
  'Name':                          'n',
  'Name.Attribute':                'na',
  'Name.Builtin':                  'nb',
  'Name.Builtin.Pseudo':           'bp',
  'Name.Class':                    'nc',
  'Name.Constant':                 'no',
  'Name.Decorator':                'nd',
  'Name.Entity':                   'ni',
  'Name.Exception':                'ne',
  'Name.Function':                 'nf',
  'Name.Property':                 'py',
  'Name.Label':                    'nl',
  'Name.Namespace':                'nn',
  'Name.Other':                    'nx',
  'Name.Tag':                      'nt',
  'Name.Variable':                 'nv',
  'Name.Variable.Class':           'vc',
  'Name.Variable.Global':          'vg',
  'Name.Variable.Instance':        'vi',
  
  'Literal':                       'l',
  'Literal.Date':                  'ld',
  
  'String':                        's',
  'String.Backtick':               'sb',
  'String.Char':                   'sc',
  'String.Doc':                    'sd',
  'String.Double':                 's2',
  'String.Escape':                 'se',
  'String.Heredoc':                'sh',
  'String.Interpol':               'si',
  'String.Other':                  'sx',
  'String.Regex':                  'sr',
  'String.Single':                 's1',
  'String.Symbol':                 'ss',
  
  'Number':                        'm',
  'Number.Float':                  'mf',
  'Number.Hex':                    'mh',
  'Number.Integer':                'mi',
  'Number.Integer.Long':           'il',
  'Number.Oct':                    'mo',
  
  'Operator':                      'o',
  'Operator.Word':                 'ow',
  
  'Punctuation':                   'p',
  
  'Comment':                       'c',
  'Comment.Multiline':             'cm',
  'Comment.Preproc':               'cp',
  'Comment.Single':                'c1',
  'Comment.Special':               'cs',
  
  'Generic':                       'g',
  'Generic.Deleted':               'gd',
  'Generic.Emph':                  'ge',
  'Generic.Error':                 'gr',
  'Generic.Heading':               'gh',
  'Generic.Inserted':              'gi',
  'Generic.Output':                'go',
  'Generic.Prompt':                'gp',
  'Generic.Strong':                'gs',
  'Generic.Subheading':            'gu',
  'Generic.Traceback':             'gt'
}


function makeTokenProducer(regexData, flags) {
  var data = {};
  var procCasesMap = {};

  // topological sort of state dependencies
  var statesToProcess = [];
  var sortedStates = [];
  var sortedStatesMap = {};
  for(var state in regexData) statesToProcess.push(state);
  while (statesToProcess.length > 0) {
    var state = statesToProcess.shift();
    var stateReady = true;
    forEach(regexData[state], function (c) {
      if ((typeof c) == "object" && c.include) {
	var otherState = c.include;
	if (/!$/.exec(otherState)) {
	  otherState = otherState.substring(0, otherState.length-1);
	}
        if (! sortedStatesMap[otherState]) {
          stateReady = false;
          return true;
	}
      }
    });
    if (stateReady) {
      sortedStates.push(state);
      sortedStatesMap[state] = true;
    }
    else {
      // move to end of queue
      statesToProcess.push(state);
    }
  }
  
  forEach(sortedStates, function(state) {
    var cases = regexData[state];
    var procCases = [];
    forEach(cases, function (c) {
      if ((typeof c) == "object" && c.include) {
	var otherState = c.include;
	var isBang = false;
	if (/!$/.exec(otherState)) {
	  // "bang" include, returns to other state
	  otherState = otherState.substring(0, otherState.length-1);
	  isBang = true;
	}
	forEach(procCasesMap[otherState], function (d) {
	  var dd = [d[0], d[1], d[2]];
	  if (isBang) {
	    if (! (d[2] && d[2][0] && d[2][0].indexOf('#pop') != 0)) {
	      dd[2] = ['#pop', otherState].concat(d[2] || []);
	    }
	  }
	  procCases.push(dd);
	});
      }
      else procCases.push(c);
    });
    procCasesMap[state] = procCases;
    data[state] = {
      switcher: makeRegexSwitch(map(procCases, function(x) { return x[0]; }), flags),
      tokenTypes: map(procCases, function(x) { return x[1]; }),
      stateEffects: map(procCases, function(y) {
	var x = y[2];
	if (!x) return [];
	if (isArray(x)) return x;
	return [x];
      })
    }
  });
  
  // mutates stateStack, calls tokenFunc on each new token in order, returns new index
  return function(string, startIndex, stateStack, tokenFunc) {
    var stateBefore = stateStack.join('/');

    while (true) { // loop until non-zero-length token
      var stateData = data[stateStack[stateStack.length-1]];
      var switcherResult = stateData.switcher(string, startIndex);
      var whichCase = switcherResult.whichCase;
      var regexResult = switcherResult.result;
      var tokenTypes, stateEffects;
      if (whichCase < 0) {
	tokenTypes = 'Error';
	stateEffects = null;
      }
      else {
	tokenTypes = stateData.tokenTypes[whichCase];
	stateEffects = stateData.stateEffects[whichCase];
      }
      
      if (stateEffects) {
	forEach(stateEffects, function (se) {
	  if (se === '#pop') stateStack.pop();
	  else if (se === '#popall') {
	    while (stateStack.length > 0) stateStack.pop();
	  }
	  else stateStack.push(se);
	});
      }
      var stateAfter = stateStack.join('/');

      if (regexResult[0].length > 0) {
	if ((typeof tokenTypes) === "object" && tokenTypes.bygroups) {
	  var types = tokenTypes.bygroups;
	  forEach(types, function (t,i) {
	    var tkn = { width:regexResult[i+1].length, type:t };
	    if (i == 0) tkn.stateBefore = stateBefore;
	    if (i == (types.length-1)) tkn.stateAfter = stateAfter;
	    tokenFunc(tkn);
	  });
	}
	else {
	  tokenFunc({ width:regexResult[0].length, type:tokenTypes,
		      stateBefore:stateBefore, stateAfter:stateAfter });
	}
	return startIndex + regexResult[0].length;
      }
    }
  }
}

function makeSimpleLexer(tokenProducer) {
  function lexString(str, tokenFunc) {
    var state = ['root'];
    var idx = 0;
    while (idx < str.length) {
      var i = idx;
      idx = tokenProducer(str, idx, state, function (tkn) {
        tokenFunc(str.substr(i, tkn.width), tkn.type);
        i += tkn.width;
      });
    }
  }
  function lexAsLines(str, tokenFunc, newLineFunc) {
    str += "\n";
    var nextNewline = str.indexOf('\n');
    var curIndex = 0;
    
    lexString(str, function(txt, typ) {
      var wid = txt.length;
      var widthLeft = wid;
      while (widthLeft > 0 && curIndex + wid > nextNewline) {
        var w = nextNewline - curIndex;
        if (w > 0) {
          tokenFunc(str.substr(curIndex, w), typ);
        }
        curIndex += (w+1);
        widthLeft -= (w+1);
        if (curIndex < str.length) {
          newLineFunc();
          nextNewline = str.indexOf("\n", curIndex);
        }
      }
      if (widthLeft > 0) {
        tokenFunc(str.substr(curIndex, widthLeft), typ);
        curIndex += widthLeft;
      }
    });
  }
  return {lexString:lexString, lexAsLines:lexAsLines};
}

var txtTokenProducer = makeTokenProducer(
  {
    'root': [
      [/.*?\n/, 'Text'],
      [/.+/, 'Text']
    ]
  }, 's');

var jsTokenProducer = makeTokenProducer(
  {
    'root': [
      [/\/\*[^\w\n]+appjet:version[^\w\n]+[0-9.]+[^\w\n]+\*\/[^\w\n]*(?=\n)/,
       'Comment.Special', 'main'],
      [/(?:)/m, 'Text', ['main', 'regex-ready', 'linestart']]
    ],
    'whitespace' : [
      [/\n/, 'Text', 'linestart'],
      [/[^\S\n]+/, 'Text'],
      [/\/\*/, 'Comment', 'longcomment']
    ],
    'common' : [
      {include:'whitespace'},
      [/\"/, 'String.Double', 'dstr'],
      [/\'/, 'String.Single', 'sstr']
    ],
    'regex-ready' : [
      {include:'whitespace'},
      [/\/(?:[^[\\\n\/]|\\.|\[\^?]?(?:[^\\\]\n]|\\.)+\]?)+\/[gim]*/, 'String.Regex'],
      [/(?:)/m, 'Text', '#pop']
    ],
    'main': [
      [/\"\"\"/, 'String.Doc', 'mstr'],
      {include:"common"},
      [/<!--/, 'Comment'],
      [/\/\/.*?(?=\n)/, 'Comment'],
      [/[\{\}\[\]\(;]/, 'Punctuation', 'regex-ready'],
      [/[\).]/, 'Punctuation'],
      [/[~\^\*!%&<>\|=:,\/?\\]/, 'Operator', 'regex-ready'],
      [/[+-]/, 'Operator'],
      ['(import|break|case|catch|const|continue|default|delete|do|else|'+
       'export|for|function|if|in|instanceof|label|new|return|switch|this|'+
       'throw|try|typeof|var|void|while|with|abstract|boolean|byte|catch|char|'+
       'class|const|debugger|double|enum|extends|final|finally|float|goto|implements|'+
       'int|interface|long|native|package|private|protected|public|short|static|super|'+
       'synchronized|throws|transient|volatile|let|yield)\\b', 'Keyword'],
      [/(true|false|null|NaN|Infinity|undefined)\b/, 'Keyword.Constant'],
      [/[$a-zA-Z_][a-zA-Z0-9_]*/, 'Name.Other'],
      [/[0-9][0-9]*\.[0-9]+([eE][0-9]+)?[fd]?/, 'Number.Float'],
      [/0x[0-9a-f]+/, 'Number.Hex'],
      [/[0-9]+/, 'Number.Integer']
    ],
    'csscommon': [ // common outside of style rule brackets
      {include:'common'},
      [/\{/, 'Punctuation', 'csscontent'],
      [/\:[a-zA-Z0-9_-]+/, 'Name.Decorator'],
      [/\.[a-zA-Z0-9_-]+/, 'Name.Class'],
      [/\#[a-zA-Z0-9_-]+/, 'Name.Function'],
      [/[a-zA-Z0-9_-]+/, 'Name.Tag'],
      [/[~\^\*!%&\[\]\(\)<>\|+=@:;,.\/?-]/, 'Operator']
    ],
    'cssmain': [
      [/(@media)([^\S\n]+)(\w+)([^\S\n]*)(\{)/, {bygroups:['Keyword', 'Text', 'String',
							   'Text', 'Punctuation']}, 'cssmedia'],
      {include:'csscommon'}
    ],
    'cssmedia': [
      {include:'csscommon'},
      [/\}/, 'Punctuation', '#pop']
    ],
    'csscontent': [
      {include:'common'},
      [/\}/, 'Punctuation', '#pop'],
      [/url\(.*?\)/, 'String.Other'],
      ['(azimuth|background-attachment|background-color|'+
       'background-image|background-position|background-repeat|'+
       'background|border-bottom-color|border-bottom-style|'+
       'border-bottom-width|border-left-color|border-left-style|'+
       'border-left-width|border-right|border-right-color|'+
       'border-right-style|border-right-width|border-top-color|'+
       'border-top-style|border-top-width|border-bottom|'+
       'border-collapse|border-left|border-width|border-color|'+
       'border-spacing|border-style|border-top|border|caption-side|'+
       'clear|clip|color|content|counter-increment|counter-reset|'+
       'cue-after|cue-before|cue|cursor|direction|display|'+
       'elevation|empty-cells|float|font-family|font-size|'+
       'font-size-adjust|font-stretch|font-style|font-variant|'+
       'font-weight|font|height|letter-spacing|line-height|'+
       'list-style-type|list-style-image|list-style-position|'+
       'list-style|margin-bottom|margin-left|margin-right|'+
       'margin-top|margin|marker-offset|marks|max-height|max-width|'+
       'min-height|min-width|opacity|orphans|outline|outline-color|'+
       'outline-style|outline-width|overflow|padding-bottom|'+
       'padding-left|padding-right|padding-top|padding|page|'+
       'page-break-after|page-break-before|page-break-inside|'+
       'pause-after|pause-before|pause|pitch|pitch-range|'+
       'play-during|position|quotes|richness|right|size|'+
       'speak-header|speak-numeral|speak-punctuation|speak|'+
       'speech-rate|stress|table-layout|text-align|text-decoration|'+
       'text-indent|text-shadow|text-transform|top|unicode-bidi|'+
       'vertical-align|visibility|voice-family|volume|white-space|'+
       'widows|width|word-spacing|z-index|bottom|left|'+
       'above|absolute|always|armenian|aural|auto|avoid|baseline|'+
       'behind|below|bidi-override|blink|block|bold|bolder|both|'+
       'capitalize|center-left|center-right|center|circle|'+
       'cjk-ideographic|close-quote|collapse|condensed|continuous|'+
       'crop|crosshair|cross|cursive|dashed|decimal-leading-zero|'+
       'decimal|default|digits|disc|dotted|double|e-resize|embed|'+
       'extra-condensed|extra-expanded|expanded|fantasy|far-left|'+
       'far-right|faster|fast|fixed|georgian|groove|hebrew|help|'+
       'hidden|hide|higher|high|hiragana-iroha|hiragana|icon|'+
       'inherit|inline-table|inline|inset|inside|invert|italic|'+
       'justify|katakana-iroha|katakana|landscape|larger|large|'+
       'left-side|leftwards|level|lighter|line-through|list-item|'+
       'loud|lower-alpha|lower-greek|lower-roman|lowercase|ltr|'+
       'lower|low|medium|message-box|middle|mix|monospace|'+
       'n-resize|narrower|ne-resize|no-close-quote|no-open-quote|'+
       'no-repeat|none|normal|nowrap|nw-resize|oblique|once|'+
       'open-quote|outset|outside|overline|pointer|portrait|px|'+
       'relative|repeat-x|repeat-y|repeat|rgb|ridge|right-side|'+
       'rightwards|s-resize|sans-serif|scroll|se-resize|'+
       'semi-condensed|semi-expanded|separate|serif|show|silent|'+
       'slow|slower|small-caps|small-caption|smaller|soft|solid|'+
       'spell-out|square|static|status-bar|super|sw-resize|'+
       'table-caption|table-cell|table-column|table-column-group|'+
       'table-footer-group|table-header-group|table-row|'+
       'table-row-group|text|text-bottom|text-top|thick|thin|'+
       'transparent|ultra-condensed|ultra-expanded|underline|'+
       'upper-alpha|upper-latin|upper-roman|uppercase|url|'+
       'visible|w-resize|wait|wider|x-fast|x-high|x-large|x-loud|'+
       'x-low|x-small|x-soft|xx-large|xx-small|yes)\\b', 'Keyword'],
      ['(indigo|gold|firebrick|indianred|yellow|darkolivegreen|'+
       'darkseagreen|mediumvioletred|mediumorchid|chartreuse|'+
       'mediumslateblue|black|springgreen|crimson|lightsalmon|brown|'+
       'turquoise|olivedrab|cyan|silver|skyblue|gray|darkturquoise|'+
       'goldenrod|darkgreen|darkviolet|darkgray|lightpink|teal|'+
       'darkmagenta|lightgoldenrodyellow|lavender|yellowgreen|thistle|'+
       'violet|navy|orchid|blue|ghostwhite|honeydew|cornflowerblue|'+
       'darkblue|darkkhaki|mediumpurple|cornsilk|red|bisque|slategray|'+
       'darkcyan|khaki|wheat|deepskyblue|darkred|steelblue|aliceblue|'+
       'gainsboro|mediumturquoise|floralwhite|coral|purple|lightgrey|'+
       'lightcyan|darksalmon|beige|azure|lightsteelblue|oldlace|'+
       'greenyellow|royalblue|lightseagreen|mistyrose|sienna|'+
       'lightcoral|orangered|navajowhite|lime|palegreen|burlywood|'+
       'seashell|mediumspringgreen|fuchsia|papayawhip|blanchedalmond|'+
       'peru|aquamarine|white|darkslategray|ivory|dodgerblue|'+
       'lemonchiffon|chocolate|orange|forestgreen|slateblue|olive|'+
       'mintcream|antiquewhite|darkorange|cadetblue|moccasin|'+
       'limegreen|saddlebrown|darkslateblue|lightskyblue|deeppink|'+
       'plum|aqua|darkgoldenrod|maroon|sandybrown|magenta|tan|'+
       'rosybrown|pink|lightblue|palevioletred|mediumseagreen|'+
       'dimgray|powderblue|seagreen|snow|mediumblue|midnightblue|'+
       'paleturquoise|palegoldenrod|whitesmoke|darkorchid|salmon|'+
       'lightslategray|lawngreen|lightgreen|tomato|hotpink|'+
       'lightyellow|lavenderblush|linen|mediumaquamarine|green|'+
       'blueviolet|peachpuff)\\b', 'Name.Builtin'],
      [/\!important/, 'Comment.Preproc'],
      [/\#[a-zA-Z0-9]{1,6}/, 'Number'],
      [/[\.-]?[0-9]*[\.]?[0-9]+(em|px|\%|pt|pc|in|mm|cm|ex)/, 'Number'],
      [/-?[0-9]+/, 'Number'],
      [/[~\^\*!%&<>\|+=@:,.\/?-]+/, 'Operator'],
      [/[\[\]();]+/, 'Punctuation'],
      [/[a-zA-Z][a-zA-Z0-9]+/, 'Name']
    ],
    'linestart': [
      [/\/\*[^\w\n]+appjet:css[^\w\n]+\*\/[^\w\n]*(?=\n)/, 'Comment.Special',
       ['#popall', 'root', 'cssmain']],
      [/\/\*[^\w\n]+appjet:(\w+)[^\w\n]+\*\/[^\w\n]*(?=\n)/, 'Comment.Special',
       ['#popall', 'root', 'main', 'regex-ready']],
      [/(?:)/m, 'Text', '#pop']
    ],
    'dstr': [
      [/\"/, 'String.Double', '#pop'],
      [/(?=\n)/m, 'String.Double', '#pop'],
      [/(\\\\|\\\"|[^\"\n])+/, 'String.Double']
    ],
    'sstr': [
      [/\'/, 'String.Single', '#pop'],
      [/(?=\n)/m, 'String.Single', '#pop'],
      [/(\\\\|\\\'|[^\'\n])+/, 'String.Single']
    ],
    'longcomment': [
      [/\*\//, 'Comment', '#pop'],
      [/\n/, 'Comment'],
      [/.+?(?:\n|(?=\*\/))/, 'Comment']
    ],
    'mstr': [
      [/(\\\"\"\"|\n)/, 'String.Doc'],
      [/\"\"\"/, 'String.Doc', '#pop'],
      [/.+?(?=\\"""|"""|\n)/, 'String.Doc']
    ]
  }
);

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

var simpleLexer = makeSimpleLexer(jsTokenProducer);

function codeStringToHTML(codeString) {
  var atLineStart = true;
  var html = [];
  function tokenFunc(txt, type) {
    var cls = tokenClasses[type];
    if (cls) html.push('<tt class="',tokenClasses[type],'">');
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

/* ========== Incremental Lexer for ACE ========== */

function makeIncrementalLexer(tokenProducer) {

  var tokens = newSkipList();
  var buffer = "";
  var nextId = 1;
  var dirtyTokenKeys = [];
  var uncoloredRanges = [];

  //top.dbg_uncoloredRanges = function() { return uncoloredRanges; }
  //top.dbg_dirtyTokenKeys = function() { return dirtyTokenKeys; }
  
  function mergeRangesIfTouching(a, b) {
    // if a = [a0,a1] and b = [b0,b1] are overlapping or touching, return a single merged range
    // else return null
    var a0 = a[0], a1 = a[1], b0 = b[0], b1 = b[1];
    if (a1 < b0) return null;
    if (b1 < a0) return null;
    var c0 = ((a0 < b0) ? a0 : b0);
    var c1 = ((a1 > b1) ? a1 : b1);
    return [c0,c1];
  }
  
  function addUncoloredRange(rng) {
    // shouldn't this merge existing ranges if the new range overlaps multiple ones?
    var done = false;
    forEach(uncoloredRanges, function (x, i) {
      var merged = mergeRangesIfTouching(x, rng);
      if (merged) {
	uncoloredRanges[i] = merged;
	done = true;
	return true;
      }
    });
    if (! done) {
      uncoloredRanges.push(rng);
    }
  }

  function removeUncoloredRange(rng) {
    var i = uncoloredRanges.length-1;
    while (i >= 0) {
      removeUncoloredRangeFrom(rng, i);
      i--;
    }
  }
  
  function removeUncoloredRangeFrom(rangeToRemove, containingRangeIndex) {
    var idx = containingRangeIndex;
    var cont = uncoloredRanges[idx];
    var rem0 = rangeToRemove[0], rem1 = rangeToRemove[1];
    // limit to containing range
    if (rem0 < cont[0]) rem0 = cont[0];
    if (rem1 > cont[1]) rem1 = cont[1];
    if (rem1 <= rem0) return;
    // splice out uncoloredRanes[containingRangeIndex] for 0, 1, or 2 ranges
    uncoloredRanges.splice(idx, 1);
    if (cont[0] < rem0)
      uncoloredRanges.splice(idx, 0, [cont[0], rem0]);
    if (rem1 < cont[1])
      uncoloredRanges.splice(idx, 0, [rem1, cont[1]]);
  }
  
  function prepareTokens(tokenArray) {
    forEach(tokenArray, function (t) {
      t.key = "$"+(nextId++);
    });
    return tokenArray;
  }

  function roundBackToTokenBoundary(charOffset) {
    return tokens.indexOfOffset(charOffset);
  }
  function roundForwardToTokenBoundary(charOffset) {
    var tokenEnd;
    if (charOffset == tokens.totalWidth())
      tokenEnd = tokens.length();
    else {
      var endToken = tokens.keyAtOffset(charOffset);
      tokenEnd = tokens.indexOfKey(endToken);
      // round up to nearest token boundary
      if (charOffset > tokens.offsetOfKey(endToken)) {
	tokenEnd++;
      }
    }
    return tokenEnd;
  }
  
  // findLexingStartPoint and findLexingEndPoint take a character boundary
  // (0 .. buffer.length) and return a token boundary (0 .. tokens.length())
  // that, if not at the document edge, is such that the next token outside
  // the boundary has a pre/post lexing state associated with it (i.e is not
  // a dirty-region token or in the middle of a multi-token lexing rule).
  
  function findLexingStartPoint(startChar) {
    if (tokens.length() == 0) return 0;
    var tokenStart = roundBackToTokenBoundary(startChar);
    // expand to not break up a series of tokens from the same
    // lexing rule, and to include dirty regions
    if (tokenStart > 0) {
      var tokenBefore = tokens.atIndex(tokenStart - 1);
      while (tokenBefore && (! tokenBefore.stateAfter)) {
	tokenStart--;
	tokenBefore = tokens.prev(tokenBefore);
      }
    }
    return tokenStart;
  }

  function findLexingEndPoint(endChar) {
    if (tokens.length() == 0) return 0;
    var tokenEnd = roundForwardToTokenBoundary(endChar);
    // expand to not break up a series of tokens from the same
    // lexing rule, and to include dirty regions
    if (tokenEnd < tokens.length()) {
      var tokenAfter = tokens.atIndex(tokenEnd);
      while (tokenAfter && (! tokenAfter.stateBefore)) {
	tokenEnd++;
	tokenAfter = tokens.next(tokenAfter);
      }
    }
    return tokenEnd;
  }
  
  function updateBuffer(newBuffer, spliceStart, charsRemoved, charsAdded) {
    buffer = newBuffer;

    // back up to new line
    if (spliceStart > 0) {
      var newStart = buffer.lastIndexOf('\n', spliceStart-1) + 1;
      var charsBack = spliceStart - newStart;
      spliceStart -= charsBack;
      charsRemoved += charsBack;
      charsAdded += charsBack;
    }
    // expand to lexing points
    var tokenRangeStart = findLexingStartPoint(spliceStart);
    var tokenRangeEnd = findLexingEndPoint(spliceStart + charsRemoved);

    var dirtyWidth = 0;
    // make sure to mark at least one token dirty so that deletions correctly cause
    // rehighlighting; in practice doesn't come up often except when an entire line
    // is cleanly deleted, like deleting a blank line (which doesn't usually affect highlighting)
    while (dirtyWidth == 0) {
      var curStart = tokens.offsetOfIndex(tokenRangeStart);
      var curEnd = tokens.offsetOfIndex(tokenRangeEnd);
      dirtyWidth = (curEnd - curStart) + (charsAdded - charsRemoved);
      if (dirtyWidth == 0) {
	if (curEnd >= tokens.totalWidth()) break;
	tokenRangeEnd = findLexingEndPoint(curEnd+1);
      }
    }

    var dirtyTokens = []; // 0 or 1 of them
    if (dirtyWidth > 0) {
      dirtyTokens.push({ width: dirtyWidth, type: 'Dirty' });
    }

    //console.log("%d, %d, %d, %d", charsRemoved, charsAdded,
    //(curEnd - curStart), dirtyWidth);
    
    tokens.splice(tokenRangeStart, tokenRangeEnd - tokenRangeStart,
		  prepareTokens(dirtyTokens));

    if (tokens.totalWidth() != buffer.length) {
      console.error("updateBuffer: Bad total token width: "+
		    tokens.totalWidth()+" not "+buffer.length);
    }
    
    forEach(dirtyTokens, function (t) { dirtyTokenKeys.push(t.key); });
    dirtyTokenKeys = filter(dirtyTokenKeys, function (k) { return tokens.containsKey(k); });
    //console.log("after update: %s", toSource(tokens.slice()));

    function applySpliceToIndex(i) {
      if (i <= spliceStart) return i;
      if (i >= (spliceStart + charsRemoved)) return i + charsAdded - charsRemoved;
      return spliceStart;
    }
    for(var i=uncoloredRanges.length-1; i>=0; i--) {
      var r = uncoloredRanges[i];
      r[0] = applySpliceToIndex(r[0]);
      r[1] = applySpliceToIndex(r[1]);
      if (r[1] <= r[0]) uncoloredRanges.splice(i, 1);
    }
  }

  function processDirtyToken(dirtyToken, isTimeUp, stopAtChar) {

    //console.time("lexing");
    //var p = PROFILER("lex", false);
    var stateStack;
    if (! tokens.prev(dirtyToken)) stateStack = ['root'];
    else stateStack = tokens.prev(dirtyToken).stateAfter.split('/');
    var newTokens = [];
    var dirtyTokenIndex = tokens.indexOfEntry(dirtyToken);
    var tokenCount = 0;
    var startTime = (new Date()).getTime();
    var stopBasedOnChar = (typeof(stopAtChar) == "number");
    //p.mark("tokenize");
    
    var curOffset = tokens.offsetOfEntry(dirtyToken);
    var startedOffset = curOffset;
    var oldToken = dirtyToken;
    var oldTokenOffset = curOffset;
    var done = false;

    while ((! done) && (! isTimeUp()) && (! (stopBasedOnChar && curOffset >= stopAtChar))) {
      curOffset = tokenProducer(buffer, curOffset, stateStack,
				function (t) { newTokens.push(t); });
      while (oldToken && (oldTokenOffset + oldToken.width <= curOffset)) {
	oldTokenOffset += oldToken.width;
	oldToken = tokens.next(oldToken);
      }
      if (curOffset == tokens.totalWidth()) {
	// hit the end
	done = true;
      }
      else if (oldTokenOffset == curOffset) {
	// at a token boundary, the beginning of oldTokenOffset
	if (stateStack.join('/') === oldToken.stateBefore) {
	  // state matches up, we can stop
	  done = true;
	}
      }
    }
    
    var endedOffset = curOffset;
    var dist = endedOffset - startedOffset;
    var tokensToRemove;
    var newDirtyToken;
    if (dist < dirtyToken.width) {
      tokens.setEntryWidth(dirtyToken, dirtyToken.width - dist);
      tokensToRemove = 0;
      newDirtyToken = dirtyToken;
    }
    else {
      var nextLexingPoint = findLexingEndPoint(endedOffset);
      var lexingPointChar = tokens.offsetOfIndex(nextLexingPoint);
      if (lexingPointChar == endedOffset && (! done) && endedOffset < tokens.totalWidth()) {
	// happened to stop at token boundary before end, but not done lexing,
	// so make next token dirty
	nextLexingPoint = findLexingEndPoint(endedOffset+1);
	lexingPointChar = tokens.offsetOfIndex(nextLexingPoint);	
      }
      var dirtyCharsLeft = lexingPointChar - endedOffset;
      if (dirtyCharsLeft > 0) {
	newDirtyToken = { width: dirtyCharsLeft, type: 'Dirty' };
	newTokens.push(newDirtyToken);
      }
      tokensToRemove = nextLexingPoint - dirtyTokenIndex;
    }
    
    //p.mark("prepare");
    prepareTokens(newTokens);
    //p.mark("remove");
    tokens.splice(dirtyTokenIndex, tokensToRemove, []);
    //p.mark("insert");
    tokens.splice(dirtyTokenIndex, 0, newTokens);
    if (tokens.totalWidth() != buffer.length)
      console.error("processDirtyToken: Bad total token width: "+
		    tokens.totalWidth()+" not "+buffer.length);
    //p.end();

    addUncoloredRange([startedOffset, endedOffset]);
    
    //console.log("processed chars %d to %d", startedOffset, endedOffset);
    //console.timeEnd("lexing");    

    return (newDirtyToken && newDirtyToken.key);
  }

  function lexSomeDirty(filter, isTimeUp) {
    var newDirtyTokenKeys = [];
    
    forEach(dirtyTokenKeys, function (dirtyKey) {
      if (! tokens.containsKey(dirtyKey)) return;
      var dirtyToken = tokens.atKey(dirtyKey);
      var filterResult;
      if ((! isTimeUp()) && ((filterResult = filter(dirtyToken)))) {
	var stopAtChar;
	if ((typeof filterResult) == "object" && (typeof filterResult.stopAtChar) == "number") {
	  stopAtChar = filterResult.stopAtChar;
	}
	var tkn = processDirtyToken(dirtyToken, isTimeUp, filterResult.stopAtChar);
	if (tkn) newDirtyTokenKeys.push(tkn);
      }
      else {
	// leave the token behind
	newDirtyTokenKeys.push(dirtyKey);
      }
      
      if (tokens.totalWidth() != buffer.length)
	console.error("Bad total token width: "+tokens.totalWidth()+" not "+buffer.length);

    });
    
    dirtyTokenKeys = newDirtyTokenKeys;    
  }
  
  function lexCharRange(charRange, isTimeUp) {
    //var startTime = (new Date()).getTime();
    //function isTimeUp() { return ((new Date()).getTime() - startTime) > timeLimit; }

    if (isTimeUp()) return;
    
    lexSomeDirty(function (dirtyToken) {
      var start = tokens.offsetOfEntry(dirtyToken);
      var end = start + dirtyToken.width;
      if (end <= charRange[0]) return false;
      if (start >= charRange[1]) return false;
      //console.log("tokenStart: %d, tokenEnd: %d, visStart: %d, visEnd: %d",
      //start, end, charRange[0], charRange[1]);
      var result = {};
      if (charRange[1] < end) {
	result.stopAtChar = charRange[1];
      }
      return result;
    }, isTimeUp);

    //if (isTimeUp()) return;
    
    /*
    // highlight the visible area
    var i = uncoloredRanges.length-1;
    // iterate backwards because we change the array
    while (i >= 0) {
      var rng = uncoloredRanges[i];
      var start = rng[0], end = rng[1];
      if (start < viewRange[0]) start = viewRange[0];
      if (end > viewRange[1]) end = viewRange[1];
      if (end > start) {
	var charsRecolored = recolorFunc(start, end-start,
	  isTimeUp, getSpansForRange);
	removeUncoloredSubrange([start, start+charsRecolored], i);
      }
      if (isTimeUp()) break;
      i--;
    }*/
  }

  function tokenToString(tkn) {
    return toSource({width:tkn.width, type:tkn.type, stateBefore:tkn.stateBefore, stateAfter:tkn.stateAfter});
  }

  // Calls func(startChar, endChar) on each range of characters that needs to be colored
  // in the DOM, based on calls to getSpansForRange (which removes chars from consideration)
  // and lexCharRange (which calculates new colors and adds chars for consideration).
  // There are usually relatively few uncolored ranges, each of which may be many lines,
  // even the whole document.
  // func must return true iff any tokens are accessed through getSpansForRange during
  // the call.  func should not do new lexing.
  function forEachUncoloredRange(func, isTimeUp) {
    var i = 0;
    // uncoloredRanges will change during this function!
    // Terminates is time runs out, whole document is colored,
    // or the func "passes" on all ranges by returning false.
    while (i < uncoloredRanges.length && ! isTimeUp()) {
      var rng = uncoloredRanges[i];
      var returnVal = func(rng[0], rng[1], isTimeUp);
      if (returnVal) {
	// func did something, uncolored ranges may have changed around
	i = 0;
      }
      else {
	i++;
      }
    }
  }

  // Like forEachUncoloredRange, but "cropped" to the char range given.  For example,
  // if no "uncolored ranges" extend by a non-zero amount into the char range,
  // func will never be called.
  function forEachUncoloredSubrange(startChar, endChar, func, isTimeUp) {
    forEachUncoloredRange(function (s, e, isTimeUp2) {
      if (s < startChar) s = startChar;
      if (e > endChar) e = endChar;
      if (e > s) {
	return func(s, e, isTimeUp2);
      }
      return false;
    }, isTimeUp);
  }
  
  // This function takes note of what it's passed, and assumes that part of the
  // DOM has been taken care of (unless justPeek).
  // The "func" takes arguments tokenWidth and tokenClass, and is called on each
  // token in the range, with the widths adding up to the range size.
  function getSpansForRange(startChar, endChar, func, justPeek) {
    
    if (startChar == endChar) return;

    var startToken = tokens.atOffset(startChar);
    var startTokenStart = tokens.offsetOfEntry(startToken);
    var curOffset = startChar;
    var curToken = startToken;
    while (curOffset < endChar) {
      var spanEnd;
      if (curToken === startToken) {
	spanEnd = startTokenStart + startToken.width;
      }
      else {
	spanEnd = curOffset + curToken.width;
      }
      if (spanEnd > endChar) spanEnd = endChar;
      if (spanEnd > curOffset) {
	func(spanEnd - curOffset, tokenClasses[curToken.type]);
      }
      curOffset = spanEnd;
      curToken = tokens.next(curToken);
    }

    if (! justPeek) removeUncoloredRange([startChar, endChar]);
  }

  function markRangeUncolored(start, end) {
    addUncoloredRange([start, end]);
  }
  
  return {
    updateBuffer: updateBuffer,
    lexCharRange: lexCharRange,
    getSpansForRange: getSpansForRange,
    forEachUncoloredSubrange: forEachUncoloredSubrange,
    markRangeUncolored: markRangeUncolored
  };
}

/* ========== End Incremental Lexer ========== */

tokenProds = {js: jsTokenProducer, txt: txtTokenProducer};

function getTokenProducer(type) {
  return tokenProds[type || 'txt'] || tokenProds['txt'];
}

function getIncrementalLexer(type) {
  return makeIncrementalLexer(getTokenProducer(type));
}
function getSimpleLexer(type) {
  return makeSimpleLexer(getTokenProducer(type));
}

return {getIncrementalLexer:getIncrementalLexer, getSimpleLexer:getSimpleLexer,
	codeStringToHTML:codeStringToHTML};

})();
