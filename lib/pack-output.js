/**
 * @file 输出打包信息
 * @author sparklewhy@gmail.com
 */

var _ = fis.util;
var htmlParser = require('./html');

/**
 * 查找页面所有要立刻加载的打包静态资源，返回结构：
 * {
 *    file: file,
 *    packScripts: Array.<File>,
 *    packStyles: Array.<File>,
 *    replacers: Array.<string>  // 要替换的原始字符串
 * }
 *
 * @inner
 * @param {Array.<Object>} packedFiles 打包的文件信息
 * @return {Array.<Object>}
 */
function findHtmlPackStatics(packedFiles) {
    var pageMap = {};
    var result = [];
    var push = Array.prototype.push;
    packedFiles.forEach(function (item) {
        var loadPage = item.load || [];
        for (var i = loadPage.length - 1; i >= 0; i--) {
            var page = loadPage[i];
            var pageInfo = pageMap[page.id];
            if (!pageInfo) {
                pageInfo = pageMap[page.id] = {
                    file: page,
                    packScripts: [],
                    packStyles: [],
                    replacers: []
                };
                result.push(pageInfo);
            }

            var pkg = item.pkg;
            if (pkg.isJsLike) {
                pageInfo.packScripts.push(pkg);
            }
            else if (pkg.isCssLike) {
                pageInfo.packStyles.push(pkg);
            }

            push.apply(pageInfo.replacers, item.replacers);
        }
    });

    return result;
}

/**
 * 获取需要输出 `requrie.config` 模块配置的页面信息
 *
 * @param {Array.<Object>} packedFiles 打包的文件信息
 * @param {Object} parseOpts 解析选项
 * @param {Object} settings 打包设置选项
 * @return {Array.<Object>}
 */
function getNeedOutputRequireConfigPages(packedFiles, parseOpts, settings) {
    var pageMap = {};
    var result = [];

    var resConfPlaceholder = parseOpts.resourceConfigPlaceholder;
    packedFiles.forEach(function (item) {
        var loadPage = item.load || [];
        for (var i = loadPage.length - 1; i >= 0; i--) {
            var page = loadPage[i];
            if (page.getContent().indexOf(resConfPlaceholder) === -1) {
                continue;
            }

            var pageInfo = pageMap[page.id];
            if (!pageInfo) {
                pageInfo = pageMap[page.id] = {
                    file: page,
                    loadScripts: [], // 该页面要立刻加载的脚本
                    loadOthers: []   // 该页面要立刻加载的其它资源
                };
                result.push(pageInfo);
            }

            var pkg = item.pkg;
            if (pkg.isJsLike) {
                pageInfo.loadScripts.push(pkg);
            }
            else {
                pageInfo.loadOthers.push(pkg);
            }
        }
    });

    parseOpts.pageFiles.forEach(function (file) {
        if (pageMap[file.id]
            || file.getContent().indexOf(resConfPlaceholder) === -1
        ) {
            return;
        }
        pageMap[file.id] = 1;
        result.push({
            file: file
        });
    });

    return result;
}

/**
 * 获取没有提前加载的打包文件
 *
 * @inner
 * @param {File} page 当前页面文件
 * @param {Array.<Object>} packedFiles 所有打包文件
 * @param {Array.<File>} loadPackeFiles 提前加载的打包文件
 * @return {Array.<File>}
 */
function getNotLoadPackedFiles(page, packedFiles, loadPackeFiles) {
    var existedMap = {};
    loadPackeFiles.forEach(function (item) {
        existedMap[item.id] = true;
    });

    var notExisteds = [];
    packedFiles.forEach(function (item) {
        var pkg = item.pkg;
        var host = item.host;
        if (!existedMap[pkg.id] && (host === page || host == null)) {
            notExisteds.push(pkg);
        }
    });

    return notExisteds;
}

/**
 * 过滤输出的文件
 *
 * @inner
 * @param {File} file 要判断的文件
 * @return {boolean}
 */
function filterOutputFiles(file) {
    return file.isJsLike;
}

/**
 * 获取要输出的资源路径 map 信息
 *
 * @inner
 * @param {Array.<Object>} packedFiles 打包的文件信息
 * @param {Context} context 打包上下文
 * @param {Object} parseOpts 解析选项
 * @param {Object} settings 打包设置选项
 * @return {Array}
 */
function getOutputResourcePathMap(packedFiles, context, parseOpts, settings) {
    var pages = getNeedOutputRequireConfigPages(packedFiles, parseOpts, settings);
    var resMaps = [];
    pages.forEach(function (page) {
        var file = page.file;
        var loadScripts = page.loadScripts || [];
        var loadOthers = page.loadOthers || [];
        var notLoadPackFiles = getNotLoadPackedFiles(
            file, packedFiles,
            [].concat(loadScripts, loadOthers)
        );
        var pkgPathMap = context.getPackFilePathMap(notLoadPackFiles);

        var pathMap = pkgPathMap;
        var outputNotPackFiles = settings.outputNotPackPathMap;
        if (outputNotPackFiles) {
            var notPkgPathMap = context.getNotInPkgFilePathMap(loadScripts, {
                filter: _.isFunction(outputNotPackFiles)
                    ? outputNotPackFiles : filterOutputFiles
            });
            pathMap = _.assign({}, notPkgPathMap, pkgPathMap);
        }
        resMaps.push({
            file: file,
            paths: pathMap
        });
    });
    return resMaps;
}

/**
 * 获取所有被处理的页面文件
 *
 * @inner
 * @param {Array.<Object>} packedFiles 打包的文件信息
 * @param {Object} parseOpts 解析选项
 * @return {Array.<File>}
 */
function getAllProcessPageFiles(packedFiles, parseOpts) {
    var pageMap = {};
    var result = [];

    packedFiles.forEach(function (item) {
        var loadPage = item.load || [];
        for (var i = loadPage.length - 1; i >= 0; i--) {
            var page = loadPage[i];
            if (!pageMap[page.id]) {
                pageMap[page.id] = 1;
                result.push(page);
            }
        }
    });

    parseOpts.pageFiles.forEach(function (file) {
        if (!pageMap[file.id]) {
            pageMap[file.id] = 1;
            result.push(file);
        }
    });

    return result;
}

/**
 * 输出 require.config 信息
 *
 * @param {Array.<Object>} packedFiles 打包的文件信息
 * @param {Context} context 打包上下文
 * @param {Object} parseOpts 解析选项
 * @param {Object} settings 打包设置选项
 */
function outputRequireConfigInfo(packedFiles, context, parseOpts, settings) {
    var resMaps = getOutputResourcePathMap(packedFiles, context, parseOpts, settings);
    resMaps.forEach(function (item) {
        var page = item.file;
        var config = context.getRequireConfig(item.paths, settings.amdConfig);
        var script;

        if (settings.inlineResourceConfig) {
            script = htmlParser.createRequireConfigScript(config);
        }
        else {
            var configFile = page.subpathNoExt + '_config.js';
            if (_.isFunction(settings.configFile)) {
                configFile = settings.configFile(configFile, page);
            }
            configFile = context.createFile(
                configFile,
                htmlParser.getRequireConfigScript(config),
                {useHash: true}
            );
            if (context.isFileExisted(configFile)) {
                fis.log.error('output resource config file is exists: %s', configFile.id);
            }

            context.addFile(configFile);
            script = htmlParser.createScriptTags(page, configFile);
        }

        var content = page.getContent().replace(
            parseOpts.resourceConfigPlaceholder, script
        );
        page.setContent(content);
    });
}

/**
 * 输出打包信息
 *
 * @param {Array.<Object>} packedFiles 打包的文件信息
 * @param {Context} context 打包上下文
 * @param {Object} parseOpts 解析选项
 * @param {Object} settings 打包设置选项
 */
module.exports = exports = function (packedFiles, context, parseOpts, settings) {
    // 更新 非 amd 模块资源的合并结果信息
    var pluginUpdater = require('./plugin');
    pluginUpdater(packedFiles, context);

    // 更新 html 要加载的打包静态资源的引用
    var htmlPackStatics = findHtmlPackStatics(packedFiles);
    htmlPackStatics.forEach(function (page) {
        var file = page.file;
        var content = file.getContent();
        htmlParser.initPagePlaceholder(file, context, parseOpts);

        // 移除掉页面中被合并的 script/styles
        page.replacers.forEach(function (item) {
            content = content.replace(item.raw, '');
        });

        var scriptTags = htmlParser.createScriptTags(file, page.packScripts);
        var styleTags = htmlParser.createLinkStyleTags(file, page.packStyles);
        content = content
            .replace(parseOpts.scriptPlaceholder, scriptTags)
            .replace(parseOpts.stylePlaceholder, styleTags);
        file.setContent(content);
    });

    // 获取要输出的 config 信息并输出到对应的页面
    outputRequireConfigInfo(packedFiles, context, parseOpts, settings);

    // 移除所有页面添加的 placeholder
    var pageFiles = getAllProcessPageFiles(packedFiles, parseOpts);
    pageFiles.forEach(function (file) {
        var content = file.getContent()
            .replace(parseOpts.scriptPlaceholder, '')
            .replace(parseOpts.stylePlaceholder, '')
            .replace(parseOpts.resourceConfigPlaceholder, '');
        file.setContent(content);
    });
};
