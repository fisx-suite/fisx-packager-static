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
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @return {{id: string, file: File}}
 */
function createPackTargetFile(context, options) {
    var ns = fis.config.get('namespace');
    var connector = fis.config.get('namespaceConnector', ':');

    var packFile = options.target;
    if (!packFile) {
        fis.log.error('missing the pack target info');
        return;
    }

    var pkgId = options.packId || ((ns ? ns + connector : '') + 'p' + (pkgCounter++));
    var pkg = context.createFile(packFile, {useHash: true});
    var pkgPath = pkg.subpath;

    if (context.isPackageIdExist(pkgId)) {
        fis.log.warning('duplication package id: %s', pkgId);
    }

    if (context.isFileExisted(pkg)) {
        pkg = context.getFileBySubPath(pkgPath);
        fis.log.warning('there is a namesake file of package [' + pkgPath + ']');

        if (pkg.isPkgFile) {
            fis.log.warn('duplicate pack target %s is ignored', pkgPath);
            return;
        }

        if (pkg.release === false || pkg.isPartial) {
            fis.log.warn(
                'the pack target is not released or is part of anthor files: %s',
                pkgPath
            );
            return;
        }

        pkg.useExistedPack = true;
        context.addFilePackInfo(pkg, pkg, pkgId);
    }

    pkg.isPkgFile = true;

    return {
        id: pkgId,
        file: pkg
    };
}

/**
 * 创建打包文件项
 *
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @return {Object}
 */
function createPackItem(context, options) {
    var packTarget = createPackTargetFile(context, options);

    // 初始化要合并的文件
    var toMergeFiles = options.rawCombines || [];
    if (packTarget.file.useExistedPack
        && toMergeFiles.indexOf(packTarget.file) === -1) {
        toMergeFiles.push(packTarget.file);
        options.rawCombines = toMergeFiles;
    }

    var includeFiles = options.files;
    var ignoreFiles = [];
    if (_.isFunction(includeFiles)) {
        includeFiles = includeFiles(toMergeFiles, options, context);
    }
    includeFiles || (includeFiles = []);

    var depPackIds = [];
    includeFiles = includeFiles.map(function (item) {
        if (_.isString(item)) {
            var isNegative = /^!/.test(item);
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

    options.depPackIds = depPackIds;
    options.includeFiles = includeFiles;
    options.ignoreFiles = ignoreFiles;
    options.packTarget = packTarget;

    return options;
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
    var asyncOpt = options.packAsync;
    if (!asyncOpt) {
        return;
    }

    var asyncs = (file.asyncs || []).map(function (id) {
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

    if (asyncs.length) {
        var target = asyncOpt.target;
        var defaultPkgFile = asyncs[0].subpath;
        if (_.isFunction(target)) {
            target = target(defaultPkgFile, file);
        }

        var preLoad = asyncOpt.load;
        return createPackItem(context, {
            target: target || defaultPkgFile,
            files: asyncOpt.files,
            loadOrder: asyncOpt.loadOrder,
            host: file,
            rawCombines: asyncs,
            load: preLoad === undefined ? true : preLoad,
            packDeps: true,
            packId: asyncOpt.packId
        });
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
    var results = htmlParser[isScript ? 'parsePackScript' : 'parsePackStyle'](
        file, context, options
    );

    if (results.length > 1) {
        var replacers = [];
        var toCombines = results.map(function (item, index) {
            replacers[index] = item;
            return item.file;
        });
        var optKey = isScript ? 'packJs' : 'packCss';
        var target = options[optKey].target;
        var defaultPkgFile = file.subpathNoExt + '_aio.' + (isScript ? 'js' : 'css');

        if (_.isFunction(target)) {
            target = target(defaultPkgFile, file);
        }
        target || (target = defaultPkgFile);

        return createPackItem(context, {
            target: target,
            packId: options.packId,
            files: options[optKey].files,
            load: true,
            loadOrder: options.loadOrder,
            host: file,
            rawCombines: toCombines,
            replacers: replacers
        });
    }
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
        item && files.push(item);
    }
}

/**
 * 获取要合并的文件集合
 *
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @return {Array.<File>}
 */
function getMergeFiles(context, options) {
    var pkg = options.packTarget.file;
    var pkgExt = pkg.rExt;

    var mergedFileMap = {};
    var ignoreFiles = options.ignoreFiles;
    var filter = function (id) {
        if (mergedFileMap[id]) {
            return;
        }
        mergedFileMap[id] = true;

        var file = context.getFileById(id);
        if (file
            && (file.rExt !== pkgExt || isMatch(file.subpath, ignoreFiles))
        ) {
            return;
        }
        return file;
    };

    // 初始化要合并的文件
    var toMergeFiles = options.rawCombines
        && options.rawCombines.filter(function (item) {
            return filter(item.id);
        })
        || [];
    context
        .findFileByPattern(options.includeFiles, pkgExt)
        .forEach(function (item) {
            if (filter(item.id)) {
                toMergeFiles.push(item);
            }
        });

    // 添加依赖文件，并更新文件的打包信息
    var index = 0;
    var packDeps = options.packDeps;
    var pkgId = options.packTarget.id;
    while (index < toMergeFiles.length) {
        var processFile = toMergeFiles[index++];
        context.addFilePackInfo(processFile, pkg, pkgId);

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
            var uri = context.resolvePath(processUrl, file);

            if (uri === processUrl) {
                return m;
            }

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
 * @return {Array}
 */
exports.packPage = function (context, options) {
    var packedFiles = [];
    options.pageFiles.forEach(function (file) {
        var result;
        result = packPageAsynModule(file, context, options);
        result && packedFiles.push(result);
        result = packPageStyleScript(file, context, options, true);
        result && packedFiles.push(result);
        result = packPageStyleScript(file, context, options, false);
        result && packedFiles.push(result);
    });

    return packedFiles;
};

/**
 * 打包静态资源文件
 *
 * @param {Context} context 打包上下文
 * @param {Object} options 打包选项
 * @return {Object}
 */
exports.packStaticFiles = function (context, options) {
    var toMergeFiles = getMergeFiles(context, options);
    if (!toMergeFiles.length) {
        return;
    }

    // 按指定的打包顺序排序下
    // TODO 对于 shim 配置依赖的模块，打包时候要在前面
    toMergeFiles.sort(function (a, b) {
        return (a.packOrder || 0) - (b.packOrder || 0);
    });

    // 合并文件的内容
    var pkg = options.packTarget.file;
    var pkgId = options.packTarget.id;
    var combineResult = combineFileContent(pkg, toMergeFiles, context);
    pkg.setContent(combineResult.content);
    context.addPackFile(pkg, pkgId, combineResult.has);

    // 初始化提前加载打包文件的页面
    var load = options.load;
    if (load) {
        if (options.host) {
            load = [options.host];
        }
        else {
            if (!Array.isArray(load)) {
                load = [load];
            }
            if (_.isString(load[0])) {
                load = context.findFileByPattern(load);
            }
        }
    }

    return {
        id: pkgId,
        pkg: pkg,
        load: load,
        host: options.host,
        isPreLoad: load && load.length,
        loadOrder: options.loadOrder,
        rawCombines: options.rawCombines,
        replacers: options.replacers
    };
};

exports.orderPackItems = require('./pack-order');

exports.outputPackInfo = require('./pack-output');
