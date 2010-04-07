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

//blogcontrol

import("jsutils.*");
import("atomfeed");
import("funhtml.*");

import("etherpad.globals.*");
import("etherpad.utils.*");
import("etherpad.quotas");

//----------------------------------------------------------------
// bloghelpers
//----------------------------------------------------------------
bloghelpers = {};
bloghelpers.disqusDeveloper = function() {
  if (isProduction()) {
    return '';
  }
  return [
    '<script type="text/javascript">',
    '  var disqus_developer = 1;',
    '</script>'
  ].join('\n');
};

bloghelpers.feedburnerUrl = function() {
  var name = isProduction() ? "TheEtherPadBlog" : "TheEtherPadBlogDev";
  return "http://feeds.feedburner.com/"+name;
};

bloghelpers.feedLink = function() {
  return [
    '<link rel="alternate"',
    ' title="EtherPad Blog Feed"',
    ' href="', bloghelpers.feedburnerUrl(), '"',
    ' type="application/rss+xml" />'
  ].join('');
};

bloghelpers.dfmt = function(d) {
  return d.toString().split(' ').slice(0,3).join(' ');
};

bloghelpers.feedbuttonHtml = function() {
  var aProps = {
    href: bloghelpers.feedburnerUrl(),
    rel: "alternate",
    type: "application/rss+xml"
  };

  return SPAN(A(aProps, 
    IMG({src: "http://www.feedburner.com/fb/images/pub/feed-icon32x32.png",
	 alt: "EtherPad Blog Feed",
	 style: "vertical-align:middle; border:0;"}))).toHTML();
};

bloghelpers.getMaxUsersPerPad = function() {
  return quotas.getMaxSimultaneousPadEditors()
};

//----------------------------------------------------------------
// posts "database"
//----------------------------------------------------------------

function _wrapPost(p) {
  var wp = {};
  keys(p).forEach(function(k) { wp[k] = p[k]; });
  wp.url = function() {
    return "http://"+request.host+"/ep/blog/posts/"+p.id;
  };
  wp.renderContent = function() {
    return renderTemplateAsString("blog/posts/"+p.id+".ejs",
      {post: wp, bloghelpers: bloghelpers});
  };
  return wp;
}

function _addPost(id, title, author, published, updated) {
  if (!appjet.cache.blogDB) {
    appjet.cache.blogDB = {
      posts: [],
      postMap: {}
    };
  }
  var p = {id: id, title: title, author: author, published: published, updated: updated};
  appjet.cache.blogDB.posts.push(p);
  appjet.cache.blogDB.postMap[p.id] = p;
}

function _getPostById(id) {
  var p = appjet.cache.blogDB.postMap[id];
  if (!p) { return null; }
  return _wrapPost(p);
}

function _getAllPosts() {
  return [];
}

function _sortBlogDB() {
  appjet.cache.blogDB.posts.sort(function(a,b) { return cmp(b.published, a.published); });
}

//----------------------------------------------------------------
// Posts
//----------------------------------------------------------------

function _initBlogDB() {
	return;
}

function reloadBlogDb() {
  delete appjet.cache.blogDB;
  _initBlogDB();
}

function onStartup() {
  reloadBlogDb();
}

//----------------------------------------------------------------
// onRequest
//----------------------------------------------------------------
function onRequest(name) {
  // nothing yet.
}

//----------------------------------------------------------------
// main
//----------------------------------------------------------------
function render_main() {
  renderFramed('blog/blog_main_body.ejs', 
	       {posts: _getAllPosts(), bloghelpers: bloghelpers});
}

//----------------------------------------------------------------
// render_feed
//----------------------------------------------------------------
function render_feed() {
  var lastModified = new Date();  // TODO: most recent of all entries modified

  var entries = [];
  _getAllPosts().forEach(function(post) {
    entries.push({
      title: post.title,
      author: post.author,
      published: post.published,
      updated: post.updated,
      href: post.url(),
      content: post.renderContent()
    });
  });
  
  response.setContentType("application/atom+xml; charset=utf-8");
    
  response.write(atomfeed.renderFeed(
    "The EtherPad Blog", new Date(), entries,
    "http://"+request.host+"/ep/blog/"));
}

//----------------------------------------------------------------
// render_post
//----------------------------------------------------------------
function render_post(name) {
  var p = _getPostById(name);
  if (!p) {
    return false;
  }
  renderFramed('blog/blog_post_body.ejs', {
    post: p, bloghelpers: bloghelpers,
    posts: _getAllPosts()
  });
  return true;
}

//----------------------------------------------------------------
// render_new_from_etherpad()
//----------------------------------------------------------------

function render_new_from_etherpad() {
  return "";
}

