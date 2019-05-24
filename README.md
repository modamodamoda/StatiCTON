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

### Example repository

To be honest, there is much more to it than this. But until I write a proper documentation for the site templating system itself, I invite you to head over to the repo of my personal site's source to review how you could set up a build directory.
    
