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

import("blob");

jimport("java.awt.image.BufferedImage");
jimport("org.apache.sanselan.Sanselan");
jimport("org.apache.sanselan.ImageFormat");

if (java.lang.System.getProperty("java.awt.headless") == null) {
  // If the system property isn't set either way, then default to "headless" mode,
  // so that we don't start calling the window manager when the AWT classes
  // are loaded.  For example, on OS X the java process is given a Dock icon
  // when we create our first BufferedImage.
  java.lang.System.setProperty("java.awt.headless", "true");
}

/**
 * Encodes the given pixel data into an image blob, ready to be served to
 * the client.  Pixels are specified as 32-bit ints in the format AARRGGBB,
 * and the order is across rows first, then down columns.  If useTransparency
 * is true, then all pixels should have an alpha channel as their
 * most-significant byte, with 0xff being fully opaque.  If useTransparency
 * is false, all pixels are fully opaque and the high byte is ignored.
 * Supported formats: GIF.
 * <p>
 * For example, to create a GIF image consisting of a green pixel followed
 * by a transparent pixel to the right of it, use:
 * imageBlobFromPixels(2, 1, [0xff00ff00, 0x00000000], true, "gif")
 */

function pixelsToImageBlob(width, height, pixelArrayARGB, useTransparency, format) {
  var image = _makeBufferedImage(width, height);
  var array = _makePixelArray(width, height);
  var alphaMask = (useTransparency ? 0x00000000 : 0xff000000);

  for(var i=0; i<array.length; i++) {
    // bitwise operations cause a JS number to become a signed 32-bit int
    array[i] = (pixelArrayARGB[i] | alphaMask);
  }

  _setImagePixels(image, array);

  if (format.toLowerCase() == "gif") {
    return _bufferedImage2gifBlob(image);
  }
  return null;
}

/**
 * Creates a blob of image data in a format readable by a web browser
 * that consists of a solid, opaque color and has the given width
 * and height.  The sixHexDigits must be a number, such as
 * 0x12fda3, or a string, such as "12fda3".
 */
function solidColorImageBlob(width, height, sixHexDigits) {
  var image = _makeBufferedImage(width, height);
  var array = _makePixelArray(width, height);

  var pixel = 0xffffff;
  if ((typeof sixHexDigits) == "number") {
    pixel = sixHexDigits;
  }
  else if ((typeof sixHexDigits) == "string") {
    pixel = Number("0x"+sixHexDigits);
  }

  // bitwise operations cause a JS number to become a signed 32-bit int
  pixel = ((pixel & 0xffffff) | 0xff000000);
  
  java.util.Arrays.fill(array, pixel);
  _setImagePixels(image, array);
  
  return _bufferedImage2gifBlob(image);
}

function _makeBufferedImage(width, height) {
  return new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);  
}

function _makePixelArray(width, height) {
  return java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE,
					     width*height);
}

function _setImagePixels(image, array) {
  var width = image.getWidth();
  var height = image.getHeight();

  image.setRGB(0, 0, width, height, array, 0, width);
}

function _bufferedImage2gifBlob(image) {
  // Use the Apache Sanselan image library because it nails transparent GIFs.
  var bytes = Sanselan.writeImageToBytes(image, ImageFormat.IMAGE_FORMAT_GIF, null);
  return blob.byteArrayToBlob("image/gif", bytes);
}
