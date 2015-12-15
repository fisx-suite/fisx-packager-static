fisx package plugin
========

> A static resource pack plugin for fisx.

## How to use

The plugin is default installed by fisx.

**Notice** The `packTo` file attribute is conflict with this pack plugin, so don't use it.

### Add configure to `fis-conf.js`

```javasciprt
fis.match('::package', {
    packager: fis.plugin('static', {
       amdConfig: {
           baseUrl: '{%$host%}/asset'
       },
       inlineResourceConfig: false,
       resourceConfigFile: function (defaultConfigFile, page) {
           defaultConfigFile = defaultConfigFile.replace('/templates', '/asset');
           return defaultConfigFile;
       },
       page: {
           files: ['templates/**.tpl'],
           packAsync: true
       }
   })
});
```
 
### Options

* page - `Object`: `optional` configure the pack strategy by page file, support multi-page pack. By default, the pack module file will sync load using script element.

    * files - `Array|Function`: `optional` configure the page files to pack, by default `*.html`, the array item value can be `glob` or `RegExp`, of course you can pass a function to filter the file to process:

        ```javascript
        {
            files: function (subpath) {
                // return true if the file wanna pack
            }
        }
        ```
    * packAsync - `boolean|Object|Function`: `optional` pack the page async require module (the sync dependency modules of the async module will be packed to this async module), by default `false`. If exist multi async modules, will all be packed to one module file. The pack option see the following `bundles` options. If page files are packed differently, you can pass `Function` to custom:

        ```javascript
        {
            packAsync: {
                // the option is the same with `bundles`
            },

            // custom the different pack strategies of page files
            packAsync: function (file) {
                if (file.indexOf('templates/common/script.tpl') !== -1) {
                    return {
                        packId: 'common'
                    };
                }

                return {
                    // exclude the modules that are packed to `common` pack file
                    files: ['!::common'],
                    // filter the async module that is not to be packed.
                    filterAsyncModule: function (id) {
                        return id !== 'src/common/data.js';
                    }
                }
            }
        }
        ```

    * packCss - `boolean|Object|Function`: `optional` pack all linking style files as one file, by default `false`. The pack targe file by default is `${page_file_path_notextname}_aio.css`. The position of pack file linked is determined by the position `<!--STYLE_PLACEHOLDER-->` placeholder.

        ```javascript
        {
            target: function (defaultPackFile, pageFile) {
                return '<your custom pack target file>';
            }
        }
        ```

    * packJs - `boolean|Object|Function`: `optional` pack all linking script files as one file, by default `false`. The pack targe file by default is `${page_file_path_notextname}_aio.js`. The position of the packed file is similar to `packCss`, here using `<!--SCRIPT_PLACEHOLDER-->` placeholder.

* bundles - `Array.<Object>`: `optional` define the bundles to pack, the bundle item option:

    * files - `Array|Function`: define the files to pack using `glob` or `regexp`. Specifically, support the pack file reference syntax using `::<packId>`, when you wanna to exclude other pack files.

    * target - `string`: define the pack target file

    * load - `boolean|Array`: `optional` whether sync load the pack file, by default `false`, only support `js` and `css` pack file. You can specify which page file will sync load the packed file, by default all page files, the output position is determined by the `placeholder` position of page file. If not placeholder is found, will auto insert placeholder by some rules, see below.

        ```javascript
        {
            files: ['/dep/**.js'],
            target: 'src/dep-all.js',
            loader: 'index.html'
        }
        ```

    * loadOrder - `number`: `optional` define the sync load order, the smaller the number is, the load order has higher priorities. In addition, you can using the `packOrder` file attribute to determine the pack priority.

        ```javascript
        fis.match('src/common/css/base.css', {
            packOrder: -1
        });
        ```

    * packId - `string`: `optional` define the pack id, which can be referred by other pack items.

    * packDeps - `boolean`: `optional` whehter pack the dependence files of the packed files, by default `false`.

* outputNotPackPathMap - `boolean`: `optional` whether output the path map information of Js module files that are not packed, by default `false`

* amdConfig - `Object|Function`: `optional` custom the output module config information, the configure will be merged with the defined `package.json`. And you can rewrite the configure by passing the function.

* inlineResourceConfig - `boolean`: `optional` whether inline the `require.config` configure information, by default `false`. The inline position is determined by the placeholder `<!--RESOURCECONFIG_PLACEHOLDER-->` position in the page file.

* resourceConfigFile - `Function`: `optional` by default the `require.config` output file path is `${page_file_path_notextname}_config.js`, you can custom the output config file base on this option.

* autoInsertPlaceholder - `boolean`: whether auto insert the fllowing placeholders when not found in the page files, by default `true`.

* scriptPlaceholder - `string`: the script placeholder used to define the position to insert script, by default is `<!--SCRIPT_PLACEHOLDER-->`.

* stylePlaceholder - `string`: the style placeholder used to define the position to insert link style, by default is `<!--STYLE_PLACEHOLDER-->`.

* resourceConfigPlaceholder - `string`: the `require.config` placeholder used to define the position to  inline `require.config` information, by default is `<!--RESOURCECONFIG_PLACEHOLDER-->`.
