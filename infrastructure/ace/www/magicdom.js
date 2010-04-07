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


function makeMagicDom(rootDomNode, contentWindow){
  function nodeToString(node) {
    if (isNodeText(node)) return '"'+node.nodeValue+'"';
    else return '&lt;'+node.tagName+'&gt;';
  }
  
  var doc = rootDomNode.ownerDocument || rootDomNode.document;

  function childIndex(dnode) {
    var idx = 0;
    var n = dnode;
    while (n.previousSibling) {
      idx++;
      n = n.previousSibling;
    }
    return idx;
  }
  
  function ensureNormalized(dnode) {
    function mergePair(text1, text2) {
      var theParent = text1.parentNode;
      var newTextNode = mdom.doc.createTextNode(text1.nodeValue+""+text2.nodeValue);
      theParent.insertBefore(newTextNode, text1);
      theParent.removeChild(text1);
      theParent.removeChild(text2);
      return newTextNode;
    }

    var n = dnode;
    if (!isNodeText(n)) return;
    while (n.previousSibling && isNodeText(n.previousSibling)) {
      n = mergePair(n.previousSibling, n);
    }
    while (n.nextSibling && isNodeText(n.nextSibling)) {
      n = mergePair(n, n.nextSibling);
    }
  }
  
  function nextUniqueId() {
    // returns new unique identifier string;
    // not actually checked for uniqueness, but unique
    // wrt magicdom.
    // is document-unique to allow document.getElementById even
    // in theoretical case of multiple magicdoms per doc
    var doc = mdom.doc;
    var nextId = (getAssoc(doc, "nextId") || 1);
    setAssoc(doc, "nextId", nextId+1);
    return "magicdomid"+nextId;
  }

  var nodeProto = {
    parent: function() {
      return wrapDom(((! this.isRoot) && this.dom.parentNode) || null);
    },
    index: function() {
      return childIndex(this.dom);
    },
    equals: function (otherNode) {
      return otherNode && otherNode.dom && (this.dom == otherNode.dom);
    },
    prev: function() {
      return wrapDom(this.dom.previousSibling || null);
    },
    next: function() {
      return wrapDom(this.dom.nextSibling || null);
    },
    remove: function() {
      if (! this.isRoot) {
	var dnode = this.dom;
	var prevSib = dnode.previousSibling;
	var nextSib = dnode.nextSibling;
	var normalizeNeeded = (prevSib && isNodeText(prevSib) && nextSib && isNodeText(nextSib));
	var theParent = dnode.parentNode;
	theParent.removeChild(dnode);
	if (normalizeNeeded) {
	  ensureNormalized(prevSib);
	}
      }
    },
    addNext: function (newNode) {
      var dnode = this.dom;
      var nextSib = dnode.nextSibling;
      if (nextSib) {
	dnode.parentNode.insertBefore(newNode.dom, nextSib);
      }
      else {
	dnode.parentNode.appendChild(newNode.dom);
      }
      if (newNode.isText) ensureNormalized(newNode.dom);
    },
    addPrev: function (newNode) {
      var dnode = this.dom;
      dnode.parentNode.insertBefore(newNode.dom, dnode);
      if (newNode.isText) ensureNormalized(newNode.dom);
    },
    replaceWith: function (newNodes) { // var-args
      this.replaceWithArray(arguments);
    },
    replaceWithArray: function (newNodes) {
      var addFunc;
      if (this.next()) {
	var next = this.next();
	addFunc = function (n) { next.addPrev(n); };
      }
      else {
	var parent = this.parent();
	addFunc = function (n) { parent.appendChild(n); };
      }
      // when using "this" functions, have to keep text
      // nodes from merging inappropriately
      var tempNode = mdom.newElement("span");
      this.addNext(tempNode);
      this.remove();      
      forEach(newNodes, function (n) {
	addFunc(n);
      });
      tempNode.remove();
    },
    getProp: function (propName) {
      return getAssoc(this.dom, propName);
    },
    setProp: function (propName, value) {
      setAssoc(this.dom, propName, value);
    },
    // not consistent between browsers in how line-breaks are handled
    innerText: function() {
      var dnode = this.dom;
      if ((typeof dnode.innerText) == "string") return dnode.innerText;
      if ((typeof dnode.textContent) == "string") return dnode.textContent;
      if ((typeof dnode.nodeValue) == "string") return dnode.nodeValue;
      return "";
    },
    depth: function() {
      try { // ZZZ
	var d = 0;
	var n = this;
	while (! n.isRoot) {
	  d++;
	  n = n.parent();
	}
	return d;
      }
      catch (e) {
	parent.BAD_NODE = this.dom;
	throw e;
      }
    }
  };
  
  var textNodeProto = extend(object(nodeProto), {
    isText: true,
    text: function() {
      return this.dom.nodeValue;
    },
    eachChild: function() {},
    childCount: function() { return 0; },
    eachDescendant: function() {},
    // precondition: 0 <= start < end <= length
    wrapRange: function(start, end, newNode) {
      var origText = this.text();
      var text1 = null;
      if (start > 0) {
	text1 = mdom.newText(origText.substring(0, start));
      }
      var text2 = mdom.newText(origText.substring(start, end));
      var text3 = null;
      if (end < origText.length) {
	text3 = mdom.newText(origText.substring(end, origText.length));
      }
      newNode.appendChild(text2);
      var nodesToUse = []
      if (text1) nodesToUse.push(text1);
      nodesToUse.push(newNode);
      if (text3) nodesToUse.push(text3);
      this.replaceWithArray(nodesToUse);
      return [text1, newNode, text3];
    }
  });
  
  var elementNodeProto = extend(object(nodeProto), {
    isText: false,
    childCount: function() {
      return this.dom.childNodes.length;
    },
    child: function (i) {
      return wrapDom(this.dom.childNodes.item(i));
    },
    firstChild: function() {
      return ((this.childCount() > 0) && this.child(0)) || null;
    },
    lastChild: function() {
      return ((this.childCount() > 0) && this.child(this.childCount()-1)) || null;
    },
    appendChild: function (newNode) {
      this.dom.appendChild(newNode.dom);
      if (newNode.isText) {
	ensureNormalized(newNode.dom);
      }
    },
    prependChild: function (newNode) {
      if (this.childCount() > 0) {
	this.child(0).addPrev(newNode);
      }
      else {
	this.appendChild(newNode);
      }
    },
    eachChild: function (func) {
      for(var i=0;i<this.childCount();i++) {
	var result = func(this.child(i), i);
	if (result) break;
      }
    },
    eachDescendant: function (func) {
      this.eachChild(function (n) {
	var result = func(n);
	if (! result) n.eachDescendant(func);
      });
    },
    dumpContents: function() {
      var mnode = this, dnode = this.dom;
      if (mnode.childCount() < 1) {
	mnode.remove();
      }
      else {
	var theParent = dnode.parentNode;
	var n;
	while ((n = dnode.firstChild)) {
	  dnode.removeChild(n);
	  theParent.insertBefore(n, dnode);
	  ensureNormalized(n);
	}
	mnode.remove();
      }
    },
    uniqueId: function() {
      // not actually guaranteed to be unique, e.g. if user copy-pastes
      // nodes with ids
      var dnode = this.dom;
      if (dnode.id) return dnode.id;
      dnode.id = nextUniqueId();
      return dnode.id;
    }
  });
  
  function wrapDom(dnode) {
    if (! dnode) return dnode;
    var mnode;
    if (isNodeText(dnode)) {
      mnode = object(textNodeProto);
    }
    else {
      mnode = object(elementNodeProto);
    }
    mnode.isRoot = (dnode == rootDomNode);
    mnode.dom = dnode;
    return mnode;
  }

  var mdom = {};
  mdom.root = wrapDom(rootDomNode);
  mdom.doc = doc;
  mdom.win = contentWindow;
  mdom.byId = function (id) {
    return wrapDom(mdom.doc.getElementById(id));
  }
  mdom.newText = function (txt) {
    return wrapDom(mdom.doc.createTextNode(txt));
  }
  mdom.newElement = function (tagName) {
    return wrapDom(mdom.doc.createElement(tagName));
  }
  mdom.wrapDom = wrapDom;

  return mdom;
}
