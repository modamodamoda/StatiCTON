/* Magic static site rendering thingy 
(1) Load all items into our array
(2) Render layouts
(3) ???
(4) Profit
*/

var yaml = require('js-yaml'), showdown = require('showdown'), fs = require('fs');
var converter = new showdown.Converter();

// -- Walk --

var walkSync = function(rootDir, dir, filelist) {
    if(dir === undefined) dir = rootDir;
    var fs = fs || require('fs'),
        files = fs.readdirSync(dir);
    filelist = filelist || [];
    files.forEach(function(file) {
      if (fs.statSync(dir + '/' + file).isDirectory()) {
        filelist = walkSync(rootDir, dir + '/' + file, filelist);
      }
      else {
        let fn = dir + '/' + file;
        let spl = fn.split('.');
        let d = fn.split('/');
        filelist.push({fileName: fn, relativeName: fn.substr(rootDir.length), fileType: spl.pop(), localName: d.pop()});
      }
    });
    return filelist;
  };

// -- Templater class -- 

class Template {
    static compile(html) {
        /* Temple Engine */
        
        var renders = [
            [/^\s*for\s+([^\s]+)\s+in\s+([^$]+)$/im, 'for(let $1 in $2) {'],
            [/^\s*for\s+([^\s]+)\s+of\s+([^$]+)$/im, 'for(let $1 of $2) {'],
            [/^\s*foreach\s+([^\s]+)\s+as\s+([^$]+)$/im, '$1.forEach( ( $2 ) => {'],
            [/^\s*endforeach\s+$/im, '} );'],
            [/^\s*for\s+([^\s]+)\s+\-\>\s+(.+)$/im, 'for($1 = 0; $1 < $2; $1++) {'],
            [/^\s*for\s+([^\s]+)\s+\=\s+([^\s]+)\s+\-\>\s+(.+)$/im, 'for($1 = $2; $1 <= $3; $1++) {'],
            [/^\s*if\s+(.+)$/im, 'if($1) {'],
            [/^\s*elseif\s+(.+)$/im, '} else if ($1) {'],
            [/^\s*else\s*$/im, '} else {'],
            [/^\s*while\s+(.+)$/im, 'while($1) {'],
            [/^\s*unless\s+(.+)$/im, 'if(!($1)) {'],
            [/^\s*route\s+(.+)$/im, 'route($1)'],
            [/^\s*(end|endfor|endif)\s*$/,'}'],
            [/^\s*d\!(.+)\s*$/, '$1'], // dummy for preventing html entities
        ];
        
        var re = /{({|%)(.*?)(}|%)}/g, reExp = /(^( )?(if|for|else|switch|case|break|{|}))(.*)?/g, reExp2 = /^(.*?)({)( )?$/g, cursor = 0, match;
        var code = 'var r=[];\n; var _rebind = this; for(var i in this) { if(/^[A-Za-z0-9_]+$/.test(i)) { if(typeof this[i] === "function") { eval("var " + i + " = function() { return _rebind." + i + ".apply(_rebind, arguments); }; "); } else eval("var " + i + " = this." + i); } }\n'; // This makes me feel so dirty.
        var add = function(line, js, type) {
            let found = 0;
            if(js && type == '%') {
                for(var i = 0; i < renders.length; i++) {
                    if(line.match(renders[i][0])) 
                    {
                        line = line.replace(renders[i][0], renders[i][1]);
                        found = 1;
                    }
                }
            }
            js? (code += type != '{' && (line.match(reExp) || line.match(reExp2)) ? line + '\n' : found == 1 ? 'r.push(' + line + ');\n' : 'r.push(' + line + ');\n' ) :
                (code += line != '' ? 'r.push("' + line.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '");\n' : '');
            return add;
        }
        while(match = re.exec(html)) {
            add(html.slice(cursor, match.index))(match[2], true, match[1]);
            cursor = match.index + match[0].length;
        }
        add(html.substr(cursor, html.length - cursor));
        code += 'return r.join("");';
        return new Function(code.replace(/[\r\t\n]/g, ''));
        
    }
}
// -- Query class --
class Query {
    constructor(pages) {
        this.pages = Object.values(pages);
    }
    where(smt) {
        this.pages = this.pages.filter( smt )
        return this;
    }
    sort(smt) {
        this.pages = this.pages.sort(smt);
        return this;
    }
}
// -- Item Class --
class Item {
    constructor(parent, href, data, type) {
        this.parent = parent;
        if(href.substr(-3) == '.md') {
            href = href.substr(0, href.length - 3) + '.html'; // this is a .md file, let's make it a .html file
        }
        this.href = href;
        data = data.toString();
        if(data.substr(0, 3) == '---') {
            // has a configuration
            this.hasConfig = true;
            let spl = data.split(/---/g, 3); // probably should do this a better way but meh.
            if(spl.length < 3) {
                // invalid document
                throw 'Document ' + filename + ' is invalid!';
            }
            this.config = yaml.safeLoad(spl[1]);
            this.content = spl[2];
        } else {
            this.content = data; // just straight data with no context
            this.hasConfig = false;
            this.config = {};
        }
        let hrefParts = href.split('/');
        hrefParts.pop();
        this.config.pathname = hrefParts.join('/'); // Have the pathname for filter purposes
        for(let i in this.config) {
            if(this.parent.attributes[i] === undefined) this.parent.attributes[i] = {};
            if(this.parent.attributes[i][this.config[i]] === undefined) this.parent.attributes[i][this.config[i]] = [this];
            else this.parent.attributes[i][this.config[i]].push(this);
        }
        this.type = type; // Markdown or HTML
        if(this.type == 'md') { // render content from markdown
            this.content = converter.makeHtml(this.content);
        }
    }
    render(options = {}, children = null, first = true) {
        if(first) options = Object.assign(options, { href: this.href, page: this.config }); // defaults (need to be passed to parent)

        let s = Template.compile(this.content).apply(Object.assign(this.parent.config, options, { children: children }));
        if(this.hasConfig && this.config.parent) {
            return this.parent.items[this.config.parent].render(options, s, false); // render within parent
        } else
            return s; // Just return as-is
    }
}
// -- The actual stuff
var Render = module.exports = class {
    constructor(dir) {
        this.dir = dir;
        this.config = {};
        this.items = {};
        this.attributes = {};
        this.output = {};
        this.globals = {
            route: (relative) => {
                let base = (this.config.urlBase ? this.config.urlBase : '') + relative;
                let parts = base.split('/');
                let baseName = parts.pop();
                if(baseName == 'index.html') { 
                    base = parts.join('/') + '/'; // this is the index.html route
                }
                return base;
            },
            headTitle: (appendix) => {
                return this.config.titleBase.replace('%title', appendix);
            },
            where: (v, smt) => {
                let q = new Query(v);
                return q.where(smt);
            },
            sort: (v, smt) => {
                let q = new Query(v);
                return q.sort(smt);
            }
        };
        this.macros = [];
    }
    // loadConfig() loads the conifg
    loadConfig() {
        try {
            let configData = fs.readFileSync(this.dir + '/objects.yml');
            // this is the main yaml configuration
            this.config = yaml.safeLoad(configData.toString());
        } catch(e) {
            throw 'Error: objects file not found or is not valid YAML';
        }
    }
    // loadItems() loads the items
    loadItems() {
        let allFiles = walkSync(this.dir);
        for(let i of allFiles) {
            // Process all files
            if(i.fileType == 'html' || i.fileType == 'md') {
                // this is a layout
                this.items[i.relativeName] = new Item(this, i.relativeName, fs.readFileSync(i.fileName), i.fileType);
            }
        }
        // -- Process macros
        for(let g of this.config.macros) {
            if(g.attribute) {
                // Attribute macro
                // Purpose: iterates all available attributes in a page, and generates a page for each
                for(let i in this.attributes[g.attribute]) {
                    let href = g.href.replace('%value', i.toLowerCase());
                    this.items[href] = new Item(this, href, '---\nparent: ' + g.layout + '\ntitle: ' + i + '\n---\n', 'html');
                    this.items[href].config.local = this.attributes[g.attribute][i];
                }
            }
            for(let i of this.macros) {
                this.macros[i](g);
            }
        }
    }
    // build(write = true/false) builds the items
    // write = false means that the rendered content will simply be rendered to memory in the this.output object
    build(write = true) {
        for(let g in this.items) {
            if(this.items[g].hasConfig && this.items[g].config.build != false) {
                // render out this page
                let dirs = this.items[g].href.split('/');
                dirs.pop();
                if(write) {
                    fs.mkdir(this.config.base + '/' + dirs.join('/'), { recursive: true }, (err) => {
                        if (err) throw err;
                    });
                    fs.writeFileSync(this.config.base + '/' + this.items[g].href, this.items[g].render(Object.assign( { pages: this.items }, this.globals)));
                } else {
                    this.output[g] = this.items[g].render(Object.assign( { pages: this.items }, this.globals));
                }
            }
        }
    }
    // all does everything with no effort
    all(write = true) {
        this.loadConfig();
        this.loadItems();
        this.build(write);
    }
}

// Now for command line stuff
if (require.main === module) {
    let pth = process.argv.pop();
    let opt = process.argv.pop();
    let buildDir;
    if(opt == '-d') {
        buildDir = pth;
    } else {
        buildDir = '.';
    }
    new Render(buildDir).all();
}