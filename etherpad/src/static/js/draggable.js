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


function makeDraggable(jqueryNodes, eventHandler) {
  jqueryNodes.each(function() {
    var node = $(this);
    var state = {};
    var inDrag = false;
    function dragStart(evt) {
      if (inDrag) {
        return;
      }
      inDrag = true;
      if (eventHandler('dragstart', evt, state) !== false) {
        $(document).bind('mousemove', dragUpdate);
        $(document).bind('mouseup', dragEnd);
      }
      evt.preventDefault();
      return false;
    }
    function dragUpdate(evt) {
      if (! inDrag) {
        return;
      }
      eventHandler('dragupdate', evt, state);
      evt.preventDefault();
      return false;
    }
    function dragEnd(evt) {
      if (! inDrag) {
        return;
      }
      inDrag = false;
      try {
        eventHandler('dragend', evt, state);
      }
      finally {
        $(document).unbind('mousemove', dragUpdate);
        $(document).unbind('mouseup', dragEnd);
        evt.preventDefault();
      }
      return false;
    }
    node.bind('mousedown', dragStart);
  });
}