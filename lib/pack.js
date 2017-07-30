/**
 * @file 资源打包
 * @author sparklewhy@gmail.com
 */

var _ = fis.util;
var htmlParser = require('./html');
var util = require('./util');
var isMatch = util.isMatch;

/**
 * 获取指定打包的文件正则
 *
 * @type {RegExp}
 */
var PKG_REGEXP = /^::(.*)$/;

/**
 * css 样式文件编码声明正则
 *
 * @type {RegExp}
 */
var CSS_CHARSET_REGEXP = /@charset\s+(?:'[^']*'|"[^"]*"|\S*);?/gi;

/**
 * 打包文件 id 计数器
 *
 * @type {number}
 */
var pkgCounter = 0;

/**
 * 创建打包的目标文件
 *
 * @inner
 * @param {Object} options 打包选项
 * @param {Context} context 打包上下文
 * @return {File}
 */
function createPackTargetFile(options, context) {
    var ns = fis.config.get('namespace');
    var connector = fis.config.get('namespaceConnector', ':');

    var packFile = options.target;
    if (!packFile) {
        fis.log.error('missing the pack target info');
        return;
    }

    var pkgId = options.packId || ((ns ? ns + connector : '') + 'p' + (pkgCounter++));
    if (context.isPackageIdExist(pkgId)) {
        return fis.log.error('duplicate package id: %s', pkgId);
    }

    var pkg = context.createFile(packFile, {useHash: true});
    var pkgPath = pkg.subpath;
    if (context.isFileExisted(pkg)) {
        pkg = context.getFileBySubPath(pkgPath);
        // fis.log.warning('there is a namesake file of package [' + pkgPath + ']');

        if (pkg.isPkgFile) {
            fis.log.debug('merge the same pack target %s', pkgPath);
            return {
                referPkg: pkg
            };
        }

        if (pkg.release === false || pkg.isPartial) {
            fis.log.warn(
                'the pack target is not released or is part of another file: %s',
                pkgPath
            );
            return;
        }

        var newPkg = context.createFile(
            pkg.subpathNoExt + '_aio' + pkg.rExt, {useHash: true}
        );
        newPkg._existedFile = pkg;
        context.addFile(newPkg);

        pkg = newPkg;
    }
    else {
        context.addFile(pkg);
    }

    pkg.isPkgFile = true;
    pkg.pkgId = pkgId;
    return pkg;
}

/**
 * 获取要预加载打包文件的页面文件
 *
 * @inner
 * @param {Object} options 打包选项
 * @param {Context} context 打包上下文
 * @return {?Array.<File>}
 */
function getPreLoadPage(options, context) {
    var preLoad = options.preLoad;
    if (!preLoad) {
        return;
    }

    if (preLoad === true && options.host) {
        preLoad = [options.host];
    }
    else {
        if (!Array.isArray(preLoad)) {
            preLoad = [preLoad];
        }

        if (_.isString(preLoad[0])) {
            preLoad = context.findFileByPattern(preLoad);
        }
    }
    return preLoad;
}

function getToMergeFileInfo(options, context, packTarget) {
    // 初始化要合并的文件
    var toMergeFiles = options.rawCombines || [];
    if (packTarget._existedFile
        && toMergeFiles.indexOf(packTarget._existedFile) === -1
    ) {
        toMergeFiles.push(packTarget._existedFile);
        options.rawCombines = toMergeFiles;
    }

    var includeFiles = options.files || [];
    var ignoreFiles = [];
    var depPackIds = [];
    includeFiles = includeFiles.map(function (item) {
        var isNegative = false;
        if (_.isString(item)) {
            isNegative = /^!/.test(item);
            if (isNegative) {
                item = item.substr(1);
            }

            if (PKG_REGEXP.test(item)) {
                var packId = RegExp.$1;
                depPackIds.indexOf(packId) === -1 && depPackIds.push(packId);
                item = function (subpath) {
                    return context.isInPkg(subpath, packId);
                };
            }
            else {
                item = _.glob(item);
            }
        }

        isNegative && ignoreFiles.push(item);
        return isNegative ? null : item;
    }).filter(function (item) {
        return item;
    });

    if (!toMergeFiles.length && !includeFiles.length) {
        return;
    }

    return {
        depPackIds: depPackIds,
        includeFiles: includeFiles,
        ignoreFiles: ignoreFiles
    };
}

/**
 * 创建打包文件项
 *
 * @param {Object} options 打包选项
 * @param {Context} context 打包上下文
 * @return {?Object}
 */
function createPackItem(options, context) {
    var packTarget = createPackTargetFile(options, context);
    if (!packTarget) {
        return;
    }

    var mergeFileInfo;
    if (packTarget.referPkg) {
        var referPkg = packTarget.referPkg;
        // 按页面合并时候，可能存在同样的异步模块要合并 或者 不同异步模块合并到相同文件
        var packItem = context.findPackItemById(referPkg.pkgId);
        var preLoadPages = getPreLoadPage(options, context) || [];
        packItem.preLoad = util.union(preLoadPages, packItem.preLoad || []);

        mergeFileInfo = getToMergeFileInfo(options, context, referPkg);
        if (mergeFileInfo) {
            packItem.depPackIds = util.union(
                packItem.depPackIds, mergeFileInfo.depPackIds
            );
            packItem.includeFiles = util.union(
                packItem.includeFiles, mergeFileInfo.includeFiles
            );
            packItem.ignoreFiles = util.union(
                packItem.ignoreFiles, mergeFileInfo.ignoreFiles
            );
            packItem.rawCombines = util.union(
                packItem.rawCombines, options.rawCombines
            );
        }
        return packItem;
    }

    mergeFileInfo = getToMergeFileInfo(options, context, packTarget);
    if (!mergeFileInfo) {
        // 没有要合并的文件，则跳过，不合并
        fis.log.info('none files merged to target: %s', options.target);
        return;
    }
    _.assign(options, mergeFileInfo);

    options.packTarget = packTarget;
    options.preLoad = getPreLoadPage(options, context);

    return options;
}

/**
 * 获取页面文件的入口模块
 *
 * @inner
 * @param {File} file 页面文件
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @return {Array}
 */
function getPageFileEntryModules(file, context, options) {
    var entry = options.entry;
    if (_.isFunction(entry)) {
        entry = entry(file.id);
    }
    else if (_.isString(entry) && entry) {
        entry = [entry];
    }
    else {
        entry = file.asyncs;
    }

    entry || (entry = []);
    if (_.isFunction(options.filterAsyncModule)) {
        entry = entry.filter(options.filterAsyncModule);
    }

    return entry.map(function (id) {
        var module = context.getFileById(id);
        if (!module) {
            fis.log.warn(
                '%s entry async module %s is not found!',
                file.subpath, module.subpath
            );
        }
        return module;
    }).filter(function (item) {
        return !!item;
    });
}

/**
 * 打包页面异步加载模块
 *
 * @inner
 * @param {File} file 页面文件
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @return {?Object}
 */
function packPageAsynModule(file, context, options) {
    if (_.isFunction(options)) {
        options = options(file.id);
    }
    if (!options) {
        return;
    }

    var entries = getPageFileEntryModules(file, context, options);
    if (entries.length) {
        // 对于异步模块多个，会作为整体一起合并
        var target = options.target;
        var defaultPkgFile = entries[0].subpath;
        if (_.isFunction(target)) {
            target = target(defaultPkgFile, file);
        }

        var preLoad = options.preLoad;
        return createPackItem({
            target: target || defaultPkgFile,
            files: options.files,
            loadOrder: options.loadOrder,
            host: file,
            rawCombines: entries,
            preLoad: preLoad === undefined ? true : preLoad,
            packDeps: true,
            packId: options.packId
        }, context);

    }
}

/**
 * 获取页面的入口样式文件
 *
 * @inner
 * @param {File} file 页面文件
 * @param {Context} context 打包上下文
 * @return {Array}
 */
function getPageEntryStyleFiles(file, context) {
    var result = [];
    file.links.forEach(function (subpath) {
        var file = context.getFileBySubPath(subpath);
        if (file && file.isCssLike) {
            result.push(file);
        }
    });
    return result;
}

/**
 * 打包页面模块声明的样式依赖文件
 *
 * @inner
 * @param {File} file 页面文件
 * @param {Context} context 打包上下文
 * @param {Object} packOpts 打包选项
 * @return {?Object}
 */
function packPageDepStyleFile(file, context, packOpts) {
    var options = packOpts.packDepStyle;
    if (_.isFunction(options)) {
        options = options(file.id);
    }
    if (!options) {
        return;
    }

    options === true && (options = {});

    var entries = getPageFileEntryModules(file, context, options);
    if (entries.length) {
        // 对于异步模块多个，会作为整体一起合并
        // 默认选择当前页面最后引用的样式文件作为合并的目标文件，如果不存在，则选择
        // 入口模块文件命名的新目标文件：<entryModule.subpathNoExt>_dep_aio.css
        var entryTargetFiles = getPageEntryStyleFiles(file, context);
        var defaultPkgFile = entryTargetFiles
            && entryTargetFiles.length
            && entryTargetFiles[entryTargetFiles.length - 1];
        defaultPkgFile = (defaultPkgFile && defaultPkgFile.subpath)
            || (entries[0].subpathNoExt + '_dep_aio.css');

        var target = options.target;
        if (_.isFunction(target)) {
            target = target(defaultPkgFile, file);
        }

        var preLoad = options.preLoad;
        var packItem = createPackItem({
            target: target || defaultPkgFile,
            files: options.files,
            loadOrder: options.loadOrder,
            host: file,
            rawCombines: entries,
            preLoad: preLoad === undefined ? true : preLoad,
            // 不处理样式的依赖合并，每个模块单独编译时候样式的依赖已经处理了
            // 但这个会有个问题，如果多个模块依赖了公共样式最后都被编译进去了
            // 会导致存在重复的样式，因此需要开发者自行去保证
            packDeps: false,
            // 打包依赖的样式非 js 模块资源文件
            packDepResource: true,
            packId: options.packId
        }, context);

        if (packItem.packTarget._existedFile) {
            var results = htmlParser.initPackStylePlaceholder(file, context, {
                styleFile: packItem.packTarget._existedFile,
                stylePlaceholder: packOpts.stylePlaceholder,
                autoInsertPlaceholder: packOpts.autoInsertPlaceholder
            });
            packItem.replacers = results || [];
        }

        return packItem;
    }
}

/**
 * 打包页面引用的脚本样式文件
 *
 * @inner
 * @param {File} file 页面文件
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @param {boolean} isScript 打包页面的资源是否是脚本文件类型，如果为 fasle，则为样式文件
 * @return {?Object}
 */
function packPageStyleScript(file, context, options, isScript) {
    var packOpt = options[isScript ? 'packJs' : 'packCss'];
    if (_.isFunction(packOpt)) {
        packOpt = packOpt(file.id);
    }
    if (!packOpt) {
        return;
    }

    var handler = isScript
        ? 'initPackScriptPlaceholder'
        : 'initPackStylePlaceholder';
    var results = htmlParser[handler](file, context, options);
    if (results.length <= 1) {
        return;
    }

    var replacers = [];
    var toCombines = results.map(function (item, index) {
        replacers[index] = item;
        return item.file;
    });
    var target = packOpt.target;
    var defaultPkgFile = file.subpathNoExt + '_aio.' + (isScript ? 'js' : 'css');

    if (_.isFunction(target)) {
        target = target(defaultPkgFile, file);
    }
    target || (target = defaultPkgFile);

    return createPackItem({
        target: target,
        packId: packOpt.packId,
        files: packOpt.files,
        preLoad: true,
        loadOrder: packOpt.loadOrder,
        host: file,
        rawCombines: toCombines,
        replacers: replacers
    }, context);
}

/**
 * 添加要合并的文件
 *
 * @inner
 * @param {Array.<File>} files 要合并的文件集合
 * @param {Array.<string>} fileIds 要合并的文件 id 列表
 * @param {function(string):File} filter 过滤要合并的文件
 */
function addMergeFile(files, fileIds, filter) {
    if (!fileIds) {
        return;
    }
    for (var i = 0, len = fileIds.length; i < len; i++) {
        var item = filter(fileIds[i]);
        if (item && files.indexOf(item) === -1) {
            files.push(item);
        }
    }
}

/**
 * 判断给定的两个后缀是否是一样的
 *
 * @inner
 * @param  {string}  a 要比较的后缀 a
 * @param  {string}  b 要比较的后缀 b
 * @return {boolean}
 */
function isSameExt(a, b) {
    var dotIndex = a.lastIndexOf('.');
    if (dotIndex !== -1) {
        a = a.substr(dotIndex + 1);
    }

    dotIndex = b.lastIndexOf('.');
    if (dotIndex !== -1) {
        b = b.substr(dotIndex + 1);
    }
    return a === b;
}

/**
 * 获取依赖的资源 id
 *
 * @inner
 * @param {File|Array.<File>} files 要获取的文件列表
 * @return {Array.<string>}
 */
function getDepResourceIds(files) {
    var result = [];
    if (!Array.isArray(files)) {
        files = [files];
    }

    var existedMap = {};
    files.forEach(function (item) {
        var depIds = item.requires || [];
        for (var i = 0, len = depIds.length; i < len; i++) {
            var id = depIds[i];
            if (!existedMap[id]) {
                result.push(id);
                existedMap[id] = 1;
            }
        }
    });
    return result;
}

/**
 * 获取 js 模块的依赖的 js 文件
 *
 * @param {Array.<File>} files js 模块资源文件
 * @param {Context} context 打包上下文
 * @return {Array}
 */
function getJSModuleDepJSFiles(files, context) {
    var result = [];
    var processItems = [].concat(files);
    while (processItems.length) {
        var item = processItems.shift();
        if (result.indexOf(item) === -1) {
            result.push(item);

            var depResIds = item.requires || [];
            for (var i = 0, len = depResIds.length; i < len; i++) {
                var file = context.getFileById(depResIds[i]);
                if (file && file.isJsLike) {
                    processItems.push(file);
                }
            }
        }
    }
    return result;
}

/**
 * 获取要合并的文件集合
 *
 * @inner
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @return {Array.<File>}
 */
function getMergeFiles(context, options) {
    var pkg = options.packTarget;
    var pkgExt = pkg.rExt;

    var mergedFileMap = {};
    var ignoreFiles = options.ignoreFiles;
    var filter = function (id) {
        if (mergedFileMap[id]) {
            return;
        }
        mergedFileMap[id] = true;

        var file = context.getFileById(id);
        if (!file) {
            fis.log.warn('find merge file %s fail', id);
        }
        else {
            var sameExt = isSameExt(file.rExt, pkgExt);
            if (!sameExt
                || isMatch(file.subpath, ignoreFiles)
            ) {
                var isSameResType = (pkg.isCssLike && file.isCssLike && pkg.isCssLike)
                    || (pkg.isJsLike && file.isJsLike && pkg.isJsLike);
                !sameExt && isSameResType
                && fis.log.warn(
                    'the file %s maybe not compiled yet cannot pack to target %s',
                    file.subpath, pkg.subpath
                );
                return;
            }
        }

        return file;
    };

    var rawCombines = options.rawCombines || [];
    var toMergeFiles = rawCombines.filter(function (item) {
        return filter(item.id);
    });
    var packDepResource = options.packDepResource;

    // 初始化要合并的文件
    if (packDepResource) {
        var jsModules = getJSModuleDepJSFiles(rawCombines, context);
        toMergeFiles = toMergeFiles.concat(getDepResourceIds(jsModules)
            .filter(filter)
            .map(function (id) {
                return context.getFileById(id);
            }));
    }

    // 去重
    var result = [];
    toMergeFiles.forEach(function (item) {
        if (result.indexOf(item) === -1) {
            result.push(item);
        }
    });
    toMergeFiles = result;

    context
        .findFileByPattern(options.includeFiles, pkgExt)
        .forEach(function (item) {
            if (filter(item.id) && toMergeFiles.indexOf(item) === -1) {
                toMergeFiles.push(item);
            }
        });

    // 添加依赖文件，并更新文件的打包信息
    var index = 0;
    var packDeps = options.packDeps;
    // var pkgId = options.packTarget.pkgId;
    while (index < toMergeFiles.length) {
        var processFile = toMergeFiles[index++];
        // context.addFilePackInfo(processFile, pkg, pkgId);

        if (packDeps) {
            addMergeFile(toMergeFiles, processFile.requires, filter);
        }
    }

    return toMergeFiles;
}

/**
 * 更新 css 文件内容 url
 *
 * @inner
 * @param {string} content 样式文件内容
 * @param {File} file 样式文件
 * @param {File} pkg 该样式文件被打包的目标文件
 * @param {Context} context 打包上下文
 * @return {string}
 */
function updateCSSContentUrl(content, file, pkg, context) {
    return fis.compile.extCss(content, function (m, comment, url, last, filter) {
        url || (url = filter);
        if (url) {
            var leftQuot = '';
            var rightQuot = '';
            var processUrl = url.replace(/^('|")([^'"]+)('|")$/,
                function (all, lquot, uri, rquot) {
                    leftQuot = lquot || '';
                    rightQuot = rquot || '';
                    return uri;
                }
            );

            if (!util.isLocalPath(processUrl)) {
                return m;
            }

            var uri = context.resolvePath(processUrl, file);
            var msg = {
                target: uri,
                file: pkg,
                ret: uri
            };

            /**
             * @event plugin:relative:fetch 获取相对路径的事件
             */
            fis.emit('plugin:relative:fetch', msg);

            m = m.replace(url, leftQuot + msg.ret + rightQuot);
        }

        return m;
    }, file);
}

function addDependenceResource(file, handler, resources) {
    (resources || []).forEach(function (resId) {
        file[handler](resId);
    });
}

/**
 * 合并文件内容
 *
 * @inner
 * @param {File} pkg 打包的目标文件
 * @param {Array.<File>} toMergeFiles 所以要合并的文件
 * @param {Context} context 打包上下文
 * @return {{content: string, has: Array.<string>}}
 */
function combineFileContent(pkg, toMergeFiles, context) {
    var content = '';
    var has = [];

    toMergeFiles.forEach(function (file) {
        has.push(file.id);

        // 添加文件打包信息
        context.addFilePackInfo(file, pkg, pkg.pkgId);

        // 把要合并的文件的依赖信息添加到打包文件里
        addDependenceResource(pkg, 'addLink', file.links);
        addDependenceResource(pkg, 'addRequire', file.requires);
        addDependenceResource(pkg, 'addAsyncRequire', file.asyncs);

        var c = file.getContent();
        if (c && file.isCssLike && file !== pkg) {
            c = updateCSSContentUrl(c, file, pkg, context);
        }

        if (c) {
            if (file.isCssLike) {
                c = c.replace(CSS_CHARSET_REGEXP, '');
            }

            /**
             * @event pack:file 触发打包事件
             */
            fis.emit('pack:file', {
                file: file,
                content: c,
                pkg: pkg
            });

            content += c + '\n';
        }
    });

    return {
        content: content,
        has: has
    };
}

exports.createPackItem = createPackItem;

/**
 * 对页面文件类型进行打包处理
 *
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 */
exports.packPage = function (context, options) {
    options.pageFiles.forEach(function (file) {
        var item = packPageAsynModule(
            file, context, options.packAsync
        );
        context.addToPackItem(item);
        context.addEntryPackItem(item);

        context.addToPackItem(
            packPageDepStyleFile(file, context, options)
        );
        context.addToPackItem(
            packPageStyleScript(file, context, options, true)
        );
        context.addToPackItem(
            packPageStyleScript(file, context, options, false)
        );
    });
};

/**
 * 初始化打包的文件
 *
 * @param {Context} context 打包上下文
 * @param {Object} packItem 打包项
 * @return {?Array.<File>}
 */
exports.initPackFiles = function (context, packItem) {
    var toMergeFiles = getMergeFiles(context, packItem);
    if (!toMergeFiles.length) {
        return;
    }

    // 按指定的打包顺序排序下
    // TODO 对于 shim 配置依赖的模块，打包时候要在前面
    toMergeFiles.sort(function (a, b) {
        return (a.packOrder || 0) - (b.packOrder || 0);
    });
    packItem.toMergeFiles = toMergeFiles;
    return toMergeFiles;
};

/**
 * 提取第三方依赖文件
 *
 * @param {Array.<Object>} packItems 打包项
 * @param {Context} context 打包上下文
 * @param {Object} packOpts 打包选项
 */
exports.extractVendorFiles = function (packItems, context, packOpts) {
    var extractVendorOpts = packOpts.extractVendor;
    var pageEntryPackItems = context.pageEntryPackItems;
    var depDirName = fis.getDepDirName();
    var depFileRegExp = new RegExp('^/' + depDirName + '/');
    var path = require('path');

    if (extractVendorOpts) {
        extractVendorOpts === true && (extractVendorOpts = {});
        pageEntryPackItems.forEach(function (item) {
            var toMergeFiles = item.toMergeFiles;
            if (!toMergeFiles || !toMergeFiles.length) {
                return;
            }

            var extractOpts = extractVendorOpts;
            if (_.isFunction(extractOpts)) {
                extractOpts = extractOpts(item.host.id);
            }
            if (!extractOpts) {
                return;
            }
            var vendorFiles = [];
            var bizFiles = [];
            for (var i = 0, len = toMergeFiles.length; i < len; i++) {
                var file = toMergeFiles[i];
                if (depFileRegExp.test(file.subpath)) {
                    vendorFiles.push(file);
                }
                else {
                    bizFiles.push(file);
                }
            }
            // 重置合并的文件
            item.toMergeFiles = bizFiles;

            if (!vendorFiles.length) {
                return;
            }

            var pathMd5 = fis.util.md5(item.host.realpath, 8);
            var defaultPkgFile = 'dep/' + path.basename(item.host.subpathNoExt) + pathMd5 + '_vendor.js';
            var target = extractOpts.target;
            if (_.isFunction(target)) {
                target = target(defaultPkgFile, item.host);
            }
            var vendorPackItem = createPackItem({
                target: target || defaultPkgFile,
                files: extractOpts.files,
                loadOrder: extractOpts.loadOrder,
                host: item.host,
                rawCombines: vendorFiles,
                preLoad: item.host,
                packDeps: true
            }, context);
            if (vendorPackItem) {
                exports.initPackFiles(context, vendorPackItem);
                context.addToPackItem(
                    vendorPackItem
                );
            }
        });
    }
};

/**
 * 打包静态资源文件
 *
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @return {Object}
 */
exports.packStaticFiles = function (context, options) {
    var toMergeFiles = options.toMergeFiles;
    if (!toMergeFiles || !toMergeFiles.length) {
        return;
    }

    // 合并文件的内容
    var pkg = options.packTarget;
    var pkgId = pkg.pkgId;
    var combineResult = combineFileContent(pkg, toMergeFiles, context);
    pkg.setContent(combineResult.content);
    context.addPackFile(pkg, pkgId, combineResult.has);

    return _.assign({}, options, {id: pkgId, pkg: pkg});
};

exports.orderPackItems = require('./pack-order');

exports.outputPackInfo = require('./pack-output');
