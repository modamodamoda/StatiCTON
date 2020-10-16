/* Magic static site rendering thingy 
(1) Load all items into our array
(2) Render layouts
(3) ???
(4) Profit
*/

const yaml = require('js-yaml'), showdown = require('showdown'), fs = require('fs'), path = require('path'), handlebars = require('handlebars');

function requireCWD(fname) { // stole from SO to deal with middleware requires
    var fullname = fname;
    if (fname && fname.length && 
      !path.isAbsolute(fname) &&
      fname.charAt(0) !== '.') {
        fullname = path.join(process.cwd(), fname);
    }
    return require(fullname);
}

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
            let spl = data.split(/---/g); // probably should do this a better way but meh.
            if(spl.length < 3) {
                // invalid document
                throw 'Document ' + filename + ' is invalid!';
            }
            this.config = yaml.safeLoad(spl[1]);
            this.content = spl.slice(2).join("---"); // use regex instead?
        } else {
            this.content = data; // just straight data with no context
            this.hasConfig = false;
            this.config = {};
        }
        let hrefParts = href.split('/');
        hrefParts.pop();
        this.config.pathname = hrefParts.join('/'); // Have the pathname for filter purposes
        if(this.config.partial) {
            // this is a template partial
            parent.compiler.registerPartial(this.config.name, this.content);
            this.config.build = false; // don't build partials
        }
        for(let i in this.config) {
            if(this.parent.attributes[i] === undefined) this.parent.attributes[i] = {};
            if(this.parent.attributes[i][this.config[i]] === undefined) this.parent.attributes[i][this.config[i]] = [this];
            else this.parent.attributes[i][this.config[i]].push(this);
        }
        this.type = type; // Markdown or HTML
    }
    render(options = {}, children = null, first = true) {
        if(first) options = Object.assign(options, { href: this.href, page: this.config }); // defaults (need to be passed to parent)
        let s = this.parent.compiler.compile(this.content)(Object.assign(this.parent.config, options, { children: () => children }), {allowProtoMethodsByDefault: true});
        if(this.type == 'md') { // next, do markdown
            s = this.parent.showdown.makeHtml(s);
        }

        if(this.hasConfig && this.config.parent) {
            return this.parent.items[this.config.parent].render(options, s, false); // render within parent
        } else
            return s; // Just return as-is
    }
}

// -- The actual stuff
var Render = module.exports = class {
    async emitMiddleware(type, ...args) {
        for(let i in this._middleware[type]) {
            let r = this._middleware[type][i](...args); // run current function
            if(r && typeof r.then === 'function') await r.then(); // if it's a promise, wait for it to complete
        }
        return;
    }
    addHelpers() {
        this.compiler.registerHelper('route', (relative) => (this.config.urlBase ? this.config.urlBase : '') + relative);
        this.compiler.registerHelper('headTitle', (appendix) => this.config.titleBase.replace('%title', appendix));
        this.compiler.registerHelper('where', (v, smt) => {
            let q = new Query(v);
            return q.where(smt);
        });
        this.compiler.registerHelper('sort', (v, smt) => {
            let q = new Query(v);
            return q.sort(smt);
        });
    }
    constructor(dir, config = 'objects.yml', opts = {}) {
        this.dir = path.resolve(dir);
        this.config = {};
        this.items = {};
        this.attributes = {};
        this.output = {};
        this.configFile = config;
        this._middleware = { 'file': [], 'after': [] };
        this.compiler = opts.compiler || handlebars;
        this.showdown = opts.showdown || new showdown.Converter();
        this.addHelpers();
        this.macros = [];
    }
    // middleware(type, callback) adds a middleware
    middleware(type, callback) {
        if(!this._middleware[type]) this._middleware[type] = [];
        this._middleware[type].push(callback);
    }
    // loadConfig() loads the conifg
    loadConfig() {
        try {
            let configData = fs.readFileSync(this.dir + '/' + this.configFile);
            // this is the main yaml configuration
            this.config = yaml.safeLoad(configData.toString());
            if(this.config.base && this.config.base[0] != '/') {
                // if base is not fully qualified, add it to this.dir
                this.config.base = this.dir + '/' + this.config.base;
            }
            if(this.config.source && this.config.source[0] != '/') {
                this.config.source = this.dir + '/' + this.config.source;
            }
        } catch(e) {
            throw 'Error: objects file not found or is not valid YAML';
        }
        // If there are middlewares available, include them
        if(this.config.middleware) {
            for(let type in this.config.middleware) {
                for(let file of this.config.middleware[type]) {
                    this.middleware(type, file.substr(0,2) == './' ? requireCWD(file.substr(2)) : require(file)); // for globals
                }
            }
        }
    }
    // loadItems() loads the items
    async loadItems() {
        let allFiles = walkSync(this.config.source || this.dir);
        for(let i of allFiles) {
            // Process all files
            if(i.fileType == 'html' || i.fileType == 'md') {
                // this is a layout
                this.items[i.relativeName] = new Item(this, i.relativeName, fs.readFileSync(i.fileName), i.fileType);
            } else if(i.fileType != 'yml') { // ignore our yml files
                if(this._middleware['file:' + i.fileType]) {
                    // this file is handled by a middleware
                    await this.emitMiddleware('file:' + i.fileType, i.fileName, this.config.base + '/' + i.relativeName);
                }
            }
        }
        // -- Process macros
        if(this.config.macros) {
            for(let g of this.config.macros) {
                if(g.attribute) {
                    // Attribute macro
                    // Purpose: iterates all available attributes in a page, and generates a page for each
                    for(let i in this.attributes[g.attribute]) {
                        let href = g.href.replace('%value', i.toLowerCase());
                        let collection = this.attributes[g.attribute][i];
                        // Sort the collection if required
                        if(g.sortby) collection = collection.sort((a, b) => {
                            if (a.config[g.sortby] < b.config[g.sortby])
                                return g.sortorder == 'desc' ? 1 : -1;
                              if (a.config[g.sortby] > b.config[g.sortby])
                                return g.sortorder == 'desc' ? - 1 : 1;
                              return 0;
                        });
                        // Pagination stuff
                        if(g.paginate) {
                            let total = Math.ceil(collection.length / g.paginate), pagenum = 1; // total pages
                            for(let c = 0; c < collection.length; c = c + g.paginate) {
                                const newHR = href.replace('%pagenum', pagenum == 1 ? '' : pagenum);
                                this.items[newHR] = new Item(this, href.replace('%pagenum', pagenum == 1 ? '' : pagenum), '---\nparent: ' + g.layout + '\ntitle: ' + i + ' page ' + pagenum + '\n---\n', 'html');
                                this.items[newHR].config.local = collection.slice(c, c + g.paginate);
                                this.items[newHR].config.pagination = { pagenum: pagenum, total: total };
                                pagenum++;
                            }
                        } else {
                            this.items[href] = new Item(this, href, '---\nparent: ' + g.layout + '\ntitle: ' + i + '\n---\n', 'html');
                            this.items[href].config.local = collection;
                        }
                    }
                }
                for(let i of this.macros) {
                    this.macros[i](g);
                }
            }
        }
    }
    // build(write = true/false) builds the items
    // write = false means that the rendered content will simply be rendered to memory in the this.output object
    async build(write = true) {
        for(let g in this.items) {
            if(this.items[g].hasConfig && this.items[g].config.build != false) {
                // render out this page
                let dirs = this.items[g].href.split('/');
                dirs.pop();
                let page = {
                    data: this.items[g].render({ pages: this.items }),
                    config: this.items[g].config,
                    name: g };
                await this.emitMiddleware('after', page);
                if(write) {
                    console.log(' [build] Writing file ' + this.config.base + '/' + this.items[g].href + '...');
                    fs.mkdir(this.config.base + '/' + dirs.join('/'), { recursive: true }, (err) => {
                        if (err) throw err;
                        fs.writeFileSync(this.config.base + '/' + this.items[g].href, page.data);
                    });
                } else {
                    this.output[g] = page.data;
                }
            }
        }
        this.emitMiddleware('finish');
    }
    // all does everything with no effort
    async all(write = true) {
        if(!this.config.base) this.loadConfig();
        await this.loadItems();
        await this.build(write);
    }
}