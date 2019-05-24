# StatiCTON
A javascript static site generator

## What is it?

StatiCTON is an easy to use static site generator, similar to Jekyll. Coming in at under 250 lines of code, it's surpringly powerful.

## How to use

### First steps: objects.yml file

The configuration format is stored in a file called `objects.yml` in the build directory. The only really 'required' variable is `base`, which is the directory to output to. 

### From the command line

You can simply run it from the commandline directly using `./index.js -d [build_dir]`, if [build_dir] is not specified, it will just take the current directory.

### As a library

If you want, you can include StatiCTON as such:

`var staticton = require('staticton');`
`var test = new staticton('./build_path');`
`test.all();`

This will build the build path.

### Using staticton as a library - continued

By default, the staticton library will write out to the specified `base` directory. However, you can also simply not have it write to a directory, by specifying 'false' as the first parameter of `.all`. For example:

`test.all(false);`

This tells staticton not to build to files, but instead write to a variable called 'output' in the class. Output is an object containing all of the rendered pages, the index being the page's relative URL. For instance:

`test.output['/index.html']`

So simple! This way, you can serve your data right from memory however you want, and even rebuild it on the fly by calling `all` again. This is useful if you have a frontend site which consits of mixed static and dynamic pages, or if you simply want to serve it straight out of the RAM.

### Templating engine

Templates have a simple format.

`{{ variable }}` displays a variable

`{% statement %}` performs a statement.

#### Example statements

`{% for x in/of y %}` same as JS `for ( let x in/of y )`
`{% foreach x as v, i %}` same as JS `x.forEach(v, i)`
`{% end/endfor/endif %}` is simply replaced with a finishing curly bracket
`{% endforeach %}` closes a foreach statement
`{% if x == y %}` `if(x == y)`, you also have `{% else %}` and `{% elseif x == y %}`

### API

The renderer class has a member called `globals` which contains variables which are accessible within templates. You can define your own, too. Built in ones includes:

`route(url)`

This generates a full URL for the relative `url`.

`where(pages, statement).pages`

This queries a pages object with the callback 'statement,' which is passed to Array.filter. This actually returns a 'query' class on which you can perform further `sort` or `where` transformations, then .pages contains the current list of available pages.

`sort(pages, statement).pages`

The same as where but passes the statement to Array.sort.

### Example repository

To be honest, there is much more to it than this. But until I write a proper documentation for the site templating system itself, I invite you to head over to the repo of my personal site's source to review how you could set up a build directory.

[Go to the repository](https://github.com/modamodamoda/GithubPagesSrc)