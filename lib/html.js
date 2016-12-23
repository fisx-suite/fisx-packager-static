/**
 * @file 解析 html 文件
 * @author sparklewhy@gmail.com
 */

var _ = fis.util;

/**
 * 解析 html 文件要打包的脚本，并插入后续要插入的脚本占位符，如果有必要的话
 *
 * @param {File} file html 文件
 * @param {Context} context 上下文对象
 * @param {Object} opts 解析选项
 * @return {Array.<Object>}
 */
function parsePackScript(file, context, opts) {
    var content = file.getContent();
    var packScriptFiles = [];

    var hasScriptPlaceholder
        = content.indexOf(opts.scriptPlaceholder) !== -1;
    var hasRequireConfigPlaceholder
        = content.indexOf(opts.resourceConfigPlaceholder) !== -1;

    var getPlaceholder = function (isLoader) {
        if (!opts.autoInsertPlaceholder) {
            return;
        }

        // 在异步入口模块前插入 requrie.config 脚本
        if (isLoader && !hasRequireConfigPlaceholder) {
            hasRequireConfigPlaceholder = true;
            return opts.resourceConfigPlaceholder;
        }
        else if (!hasScriptPlaceholder) {
            hasScriptPlaceholder = true;
            return opts.scriptPlaceholder;
        }
    };

    content = _.parseHtmlScript(content, function (found) {
        var placeholder;
        var match = found.match;

        if (found.isScriptLink) {
            var src = found.src;
            var scriptFile = context.getFileByUrl(src, file);
            var loaderName = scriptFile
                ? scriptFile.basename
                : _.ext(src).basename;

            if (found.isLoader
                || opts.loaderScripts.indexOf(loaderName) !== -1
            ) {
                placeholder = getPlaceholder(true);
                if (placeholder) {
                    return match + placeholder;
                }
            }
            else if (scriptFile) {
                packScriptFiles.push({
                    file: scriptFile,
                    raw: match,
                    attrs: found.attrs
                });
            }
        }
        else if (found.isInlineScript) {
            // 对于内联脚本，如果指定了异步入口模块或者包含异步 require，则在前面插入脚本占位符
            if (found.isEntryScript
                || _.extractAsyncModuleIds(found.inlineContent).length) {
                placeholder = getPlaceholder();
                if (placeholder) {
                    return placeholder + match;
                }
            }
        }

        return match;
    });

    if (opts.packJs && packScriptFiles.length
        && !hasScriptPlaceholder
        && opts.autoInsertPlaceholder
    ) {
        var lastScript = packScriptFiles[packScriptFiles.length - 1].raw;
        content = content.replace(lastScript, lastScript + opts.scriptPlaceholder);
    }

    file.setContent(content);

    // set flag to avoid repeat init placeholder
    file._initScriptPlacedholder = true;

    return packScriptFiles;
}


/**
 * 解析 html 文件要打包的样式，并插入后续要插入的样式占位符，如果有必要的话
 *
 * @param {File} file html 文件
 * @param {Context} context 上下文对象
 * @param {Object} opts 解析选项
 * @return {Array.<Object>}
 */
function parsePackStyle(file, context, opts) {
    var content = file.getContent();
    var packStyleFiles = [];

    content = _.parseHtmlStyle(content, function (found) {
        var match = found.match;

        if (found.isStyleLink) {
            var styleFile = context.getFileByUrl(found.href, file);
            if (styleFile) {
                packStyleFiles.push({
                    file: styleFile,
                    raw: match,
                    attrs: found.attrs
                });
            }
        }

        return match;
    });

    if (opts.packCss && packStyleFiles.length
        && !~content.indexOf(opts.stylePlaceholder)
        && opts.autoInsertPlaceholder
    ) {
        var lastStyle = packStyleFiles[packStyleFiles.length - 1].raw;
        content = content.replace(lastStyle, lastStyle + opts.stylePlaceholder);
    }
    file.setContent(content);

    // set flag to avoid repeat init placeholder
    file._initStylePlacedholder = true;
    return packStyleFiles;
}

module.exports = exports = {

    /**
     * 初始化页面脚本样式输出的占位符
     *
     * @param {Object} file 处理页面文件对象
     * @param {Context} context 打包上下文
     * @param {Object} opts 处理选项
     */
    initPagePlaceholder: function (file, context, opts) {
        if (!opts.autoInsertPlaceholder) {
            return;
        }
        file._initScriptPlacedholder || parsePackScript(file, context, opts);
        file._initStylePlacedholder || parsePackStyle(file, context, opts);
    },

    parsePackScript: parsePackScript,

    parsePackStyle: parsePackStyle,

    /**
     * 创建 script 脚本
     *
     * @param {File} host 加载该脚本的文件
     * @param {File|Array.<File>} scripts 脚本文件
     * @param {string=} attrs 附加的 script 属性
     * @return {string}
     */
    createScriptTags: function (host, scripts, attrs) {
        if (!Array.isArray(scripts)) {
            scripts = [scripts];
        }

        attrs || (attrs = '');
        attrs && (attrs = ' ' + attrs.trim());
        var result = [];
        scripts.forEach(function (file) {
            file._md5 = undefined; // 强制清空，重新计算

            var uri = file.getUrl();
            var msg = {
                target: uri,
                file: host,
                ret: uri
            };

            /**
             * @event plugin:relative:fetch 获取相对路径的事件
             */
            fis.emit('plugin:relative:fetch', msg);

            result.push('<script src="' + msg.ret + '"' + attrs + '></script>');
        });
        return result.join('\n');
    },

    /**
     * 创建链接样式的 tag
     *
     * @param {File} host 加载该脚本的文件
     * @param {Array.<File>} styles 样式文件
     * @param {string=} attrs 附加的 link 属性
     * @return {string}
     */
    createLinkStyleTags: function (host, styles, attrs) {
        attrs || (attrs = 'rel="stylesheet"');
        attrs = ' ' + attrs.trim();
        var result = [];
        styles.forEach(function (file) {
            file._md5 = undefined; // 强制清空，重新计算

            var uri = file.getUrl();
            var msg = {
                target: uri,
                file: host,
                ret: uri
            };

            /**
             * @event plugin:relative:fetch 获取相对路径的事件
             */
            fis.emit('plugin:relative:fetch', msg);

            result.push('<link href="' + msg.ret + '"' + attrs + '>');
        });
        return result.join('\n');
    },

    /**
     * 获取默认选项
     *
     * @return {Object}
     */
    getDefaultOption: function () {
        return {
            /**
             * 是否不存在 placeholder 时候，根据规则自动添加 placeholder
             *
             * @type {boolean}
             */
            autoInsertPlaceholder: true,

            /**
             * 模块加载器文件名
             *
             * @type {Array.<string>}
             */
            loaderScripts: ['require.js', 'esl.js', 'mod.js', 'sea.js', 'system.js'],

            /**
             * 脚本占位符
             *
             * @type {string}
             */
            scriptPlaceholder: '<!--SCRIPT_PLACEHOLDER-->',

            /**
             * 样式占位符
             *
             * @type {string}
             */
            stylePlaceholder: '<!--STYLE_PLACEHOLDER-->',

            /**
             * 资源配置占位符
             *
             * @type {string}
             */
            resourceConfigPlaceholder:
                fis.config.get('placeholder.requireconfig')
                || '<!--RESOURCECONFIG_PLACEHOLDER-->'
        };
    }
};
