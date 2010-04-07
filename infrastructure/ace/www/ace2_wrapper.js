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

// Exposes interface of Aaron's ace.js, including switching between plain and fancy editor.
// Currently uses Aaron's code and depends on JQuery for plain editor.
// -- David


AppjetCodeEditor = function() {
  this.browserSupportsModern = false;
  this.aceImpl = null;
  this.containerDiv = null;
  this.containerId = null;
  this.onKeyPress = null;
  this.onKeyDown = null;
  this.notifyDirty = null;
  this.isEditable = true;
};

// TODO: take editorType as a param

AppjetCodeEditor.prototype.init = function(containerId,
					   initialCode,
					   startModern,
					   done) {
  this.containerId = containerId;
  this.containerDiv = document.getElementById(containerId);

  if (startModern) {
    this.aceImplModern = new Ace2Editor();
    this.aceImpl = this.aceImplModern;
  } else {
    this.aceImplPlain = new ACEPlain();
    this.aceImpl = this.aceImplPlain;
  }
  this.aceImpl.init(containerId, initialCode, done);
};

AppjetCodeEditor.prototype.updateBottomLinks = function() {
  if (ACEPlain.prototype.isPrototypeOf(this.aceImpl)) {
    this.toggleModernLink.innerHTML = 'switch to rich text';
  } else {
    this.toggleModernLink.innerHTML = 'switch to plaintext';
  }
};

AppjetCodeEditor.prototype.toggleModernImpl = function() {
  var codeSave = this.aceImpl.exportCode();
    
  if (ACEPlain.prototype.isPrototypeOf(this.aceImpl)) {
    this.aceImpl.destroy();
    this.aceImpl = new Ace2Editor();
  } else {
    this.aceImpl.destroy();
    this.aceImpl = new ACEPlain();
  }
  var cont = this.containerDiv;
  while (cont.firstChild) {
    cont.removeChild(cont.firstChild);
  }
  this.aceImpl.init(this.containerId, codeSave, function() {} );
  
  var ace = this;
  function capitalize(str) { return str.substr(0,1).toUpperCase()+str.substr(1); }
  $.each(["onKeyPress", "onKeyDown", "notifyDirty"], function() {
      var setter = 'set'+capitalize(this);
      if (ace[this]) {
	ace.aceImpl[setter](ace[this]);
      }
    });
  this.aceImpl.setEditable(this.isEditable);
};

AppjetCodeEditor.prototype.adjustContainerSizes = function() {
  // TODO: adjust container sizes here.
};

//================================================================
// Interface to ACE
//================================================================

AppjetCodeEditor.prototype.setOnKeyPress = function(f) {
  this.onKeyPress = f;
  this.aceImpl.setOnKeyPress(this.onKeyPress);
};

AppjetCodeEditor.prototype.setOnKeyDown = function(f) {
  this.onKeyDown = f;
  this.aceImpl.setOnKeyDown(this.onKeyDown);
};

AppjetCodeEditor.prototype.setNotifyDirty = function(f) {
  this.notifyDirty = f;
  this.aceImpl.setNotifyDirty(this.notifyDirty);
};

AppjetCodeEditor.prototype.setEditable = function(x) {
  this.isEditable = x;
  this.aceImpl.setEditable(x);
};

AppjetCodeEditor.prototype.adjustSize = function() {
  this.adjustContainerSizes();
  this.aceImpl.adjustSize();
};

//------- straight pass-through functions ---------------

AppjetCodeEditor.prototype.importCode = function(rawCode) {
  this.aceImpl.importCode(rawCode);
};

AppjetCodeEditor.prototype.exportCode = function() {
  return this.aceImpl.exportCode();
};

AppjetCodeEditor.prototype.getFormattedCode = function() {
  return this.aceImpl.getFormattedCode();
};

AppjetCodeEditor.prototype.focus = function() {
  this.aceImpl.focus();
};

/* implementation of ACE with simple textarea */

ACEPlain = function() {
  this.containerDiv = null;
  this.textArea = null;
  this.onKeyPress = null;
  this.onKeyDown = null;
  this.notifyDirty = null;
};

ACEPlain.prototype.init = function(containerId, initialCode, done) {
  var container = $('#'+containerId); //document.getElementById(containerId);

  // empty container div
  container.empty();
  container.css('padding', 0);

  // create textarea
  var textArea = $('<textarea></textarea>');
  textArea.css('border', 0).
    css('margin', 0).
    css('padding', 0).
    css('background', 'transparent').
    css('color', '#000').
    attr('spellcheck', false);

  // add textarea to container
  container.append(textArea);

  // remember nodes
  this.textArea = textArea;
  this.containerDiv = container;

  // first-time size adjustments
  this.adjustSize();

  // remember keystrokes
  var ace = this;
  textArea.keydown(function(e) {
      if (ace.onKeyDown) { ace.onKeyDown(e); }
    });
  textArea.keypress(function(e) {
      if (ace.notifyDirty) { ace.notifyDirty(); }
      if (ace.onKeyPress) { ace.onKeyPress(e); }
    });

  // set initial code
  textArea.get(0).value = initialCode;
  
  // callback
  done();
};

ACEPlain.prototype.importCode = function(rawCode) {
  this.textArea.attr('value', rawCode);
};

ACEPlain.prototype.exportCode = function() {
  return this.textArea.attr('value');
};

ACEPlain.prototype.adjustSize = function() {
  this.textArea.width('100%');
  this.textArea.height(this.containerDiv.height());
};

ACEPlain.prototype.setOnKeyPress = function(f) { this.onKeyPress = f; };
ACEPlain.prototype.setOnKeyDown = function(f) { this.onKeyDown = f; };
ACEPlain.prototype.setNotifyDirty = function(f) { this.notifyDirty = f; };

ACEPlain.prototype.getFormattedCode = function() {
  return ('<pre>' + this.textArea.attr('value') + '</pre>');
};

ACEPlain.prototype.setEditable = function(editable) {
  if (editable) {
    this.textArea.removeAttr('disabled');
  } else {
    this.textArea.attr('disabled', true);
  }
};

ACEPlain.prototype.focus = function() {
  this.textArea.focus();
};

ACEPlain.prototype.destroy = function() {
  // nothing
};
