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

package net.appjet.oui;

import org.mozilla.javascript.{Context,Scriptable,ScriptableObject};
import org.json.{JSONStringer,JSONObject,JSONArray};

object FastJSON {
  def stringify(rhinoObj: Scriptable): String = {
    return FastJSONStringify.stringify(rhinoObj);
  }
  def parse(exctx: ExecutionContext, source: String): Scriptable = {
    return (new FastJSONParser(exctx)).parse(source);
  }
}

//----------------------------------------------------------------
// FastJSONStringify
//----------------------------------------------------------------
object FastJSONStringify {

  def stringify(rhinoObj: Scriptable): String = {
    val stringer = new JSONStringer();
    stringerizeScriptable(stringer, rhinoObj);
    return stringer.toString();
  }

  private def stringerize(s: JSONStringer, v: Object) {
    if (v == Context.getUndefinedValue) {
      return;
    }
    v match {
      case (o:Scriptable) => stringerizeScriptable(s, o);
      case (o:Number) => {
        val d = o.doubleValue;
        if (d.toLong.toDouble == d) {
          s.value(d.toLong);
        }
        else {
          s.value(o);
        }
      }
      case o => s.value(o);
    }
  }

  private def stringerizeScriptable(stringer: JSONStringer, rhinoObj: Scriptable) {
    if (rhinoObj.getClassName() == "Array") {
      stringerizeArray(stringer, rhinoObj);
    } else {
      stringerizeObj(stringer, rhinoObj);
    }
  }

  private def stringerizeObj(stringer: JSONStringer, rhinoObj: Scriptable) {
    stringer.`object`();

    for (id <- rhinoObj.getIds()) {
      val k = id.toString();
      var v:Object = null;
      id match {
        case (s:String) => { v = rhinoObj.get(s, rhinoObj); }
        case (n:Number) => { v = rhinoObj.get(n.intValue, rhinoObj); }
        case _ => {}
      }
      
      if (v != null && v != Scriptable.NOT_FOUND && v != Context.getUndefinedValue) {
        stringer.key(k);
        stringerize(stringer, v);
      }
    }

    stringer.endObject();
  }

  private def stringerizeArray(stringer: JSONStringer, rhinoArray: Scriptable) {
    stringer.`array`();

    val ids:Array[Object] = rhinoArray.getIds();
    var x = 0;
    for (i <- 0 until ids.length) {
      // we ignore string keys on js arrays.  crockford's "offical"
      // json library does this as well.
      if (ids(i).isInstanceOf[Number]) {
        val id:Int = ids(i).asInstanceOf[Number].intValue;
        while (x < id) {
          stringer.value(null);
          x += 1;
        }
        val v:Object = rhinoArray.get(id, rhinoArray);
        stringerize(stringer, v);
        x += 1;
      }
    }

    stringer.endArray();
  }
}

//----------------------------------------------------------------
// FastJSONParse
//----------------------------------------------------------------
class FastJSONParser(val ctx:ExecutionContext) {

  def parse(source: String): Scriptable = {
    if (source(0) == '[') {
      jsonToRhino(new JSONArray(source)).asInstanceOf[Scriptable];
    } else {
      jsonToRhino(new JSONObject(source)).asInstanceOf[Scriptable];
    }
  }

  private def newObj(): Scriptable = {
    Context.getCurrentContext().newObject(ctx.runner.globalScope);
  }

  private def newArray(): Scriptable = {
    Context.getCurrentContext().newArray(ctx.runner.globalScope, 0);
  }
  
  private def jsonToRhino(json: Object): Object = {
    json match {
      case (o:JSONArray) => jsonArrayToRhino(o);
      case (o:JSONObject) => jsonObjectToRhino(o);
      case o if (o == JSONObject.NULL) => null;
      case o => o;
    }
  }

  private def jsonArrayToRhino(json: JSONArray): Scriptable = {
    val o:Scriptable = newArray();
    for (i <- 0 until json.length()) {
      o.put(i, o, jsonToRhino(json.get(i)));
    }
    return o;
  }

  private def jsonObjectToRhino(json: JSONObject): Scriptable = {
    val o:Scriptable = newObj();
    val names:Array[String] = JSONObject.getNames(json);
    if (names != null) {
      for (n <- names) {
        val i = try { Some(n.toInt); } catch { case (e:NumberFormatException) => None };
        if (i.isDefined) {
          o.put(i.get, o, jsonToRhino(json.get(n)));
        }
        else {
          o.put(n, o, jsonToRhino(json.get(n)));
        }
      }
    }
    return o;
  }

}


