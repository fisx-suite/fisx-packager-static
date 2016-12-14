/**
 * @file 处理上下文
 * @author sparklewhy@gmail.com
 */

var amdHelper = require('fisx-amd');
var util = require('./util');

var SRC_REGEXP = /(^|\/)src(\/|$)/;

/**
 * 发布静态资源的目录
 *
 * @const
 * @type {string}
 */
var RELEASE_DIR = 'asset';

/**
 * 更新 url 路径
 *
 * @inner
 * @param {string} url 要更新的 url
 * @return {string}
 */
function updateUrl(url) {
    if (url && amdHelper.isLocalPath(url)) {
        return url.replace(SRC_REGEXP, '$1' + RELEASE_DIR + '$2');
    }
    return url;
}

/**
 * 创建打包上下文实例
 *
 * @param {Object} ret 静态资源表
 * @constructor
 */
function Context(ret) {
    this.ret = ret;

    // 初始化文件列表
    var fileMap = this.filePathMap = ret.src;

    // 初始化资源映射表
    var fileIdMap = this.fileIdMap = {};
    var fileUrlMap = this.fileUrlMap = {};
    var files = this.files = [];
    Object.keys(fileMap).forEach(function (subpath) {
        var file = fileMap[subpath];
        files.push(file);
        fileIdMap[file.id] = file;
        if (file.release) {
            fileUrlMap[file.getUrl()] = file;
        }
    });
    this.resIdMap = {};
    this.root = fis.project.getProjectPath();
    this.requireConfig = (fis.config.get('amd') || {}).config || {};
    this.moduleConfig = amdHelper.initModuleConfig(this.requireConfig, this.root);
    this.toPackItems = [];
}

/**
 * 获取 require config 的配置
 *
 * @param {Object} pathMap 路径 map
 * @param {Object|Function} options 自定义的选项或自定义的配置获取函数
 * @return {Object}
 */
Context.prototype.getRequireConfig = function (pathMap, options) {
    var _ = fis.util;
    var config = _.cloneDeep(this.requireConfig);
    config.paths = _.assign(config.paths || {}, pathMap);

    if (_.isFunction(options)) {
        config = options(config);
    }
    else {
        config = _.merge(config, options || {});
    }

    config.baseUrl = updateUrl(config.baseUrl);
    if (config.packages) {
        config.packages.forEach(function (item) {
            item.location = updateUrl(item.location);
        });
    }

    // config.waitSeconds = 5;
    return config;
};

/**
 * 创建文件
 *
 * @param {string} filePath 相对于项目根目录的文件路径
 * @param {string=} content 文件内容
 * @param {Object=} options 附加文件选项
 * @return {File}
 */
Context.prototype.createFile = function (filePath, content, options) {
    var file = fis.file.wrap(amdHelper.join(this.root, filePath));

    if (arguments.length === 2) {
        if (content && !fis.util.isString(content)) {
            options = content;
            content = null;
        }
    }

    content != null && file.setContent(content);
    options && Object.keys(options).forEach(function (k) {
        file[k] = options[k];
    });

    return file;
};

/**
 * 添加文件
 *
 * @param {File} file 要添加的文件
 */
Context.prototype.addFile = function (file) {
    if (!this.isFileExisted(file)) {
        var subPath = file.subpath;
        this.filePathMap[subPath] = file;
        this.fileIdMap[file.id] = file;
        this.fileUrlMap[file.getUrl()] = file;
        this.files.push(file);

        // 必须加上这句才能输出新的文件
        this.ret.pkg[subPath] = file;
    }
};

/**
 * 判断给定的文件是否已经存在
 *
 * @param {File} file 要 check 的文件
 * @return {boolean}
 */
Context.prototype.isFileExisted = function (file) {
    return !!this.getFileBySubPath(file.subpath);
};

/**
 * 计算给定的 url 相对于给定的文件的路径
 *
 * @param {string} url 要 resolve 的 url 路径
 * @param {File} file 相对的文件
 * @return {string}
 */
Context.prototype.resolvePath = function (url, file) {
    if (util.isLocalPath(url) && file) {
        url = amdHelper.resolve(amdHelper.dirname(file.url), url);
    }
    return url;
};

/**
 * 按照文件 id 获取文件
 *
 * @param {string} id 文件 id
 * @return {?File}
 */
Context.prototype.getFileById = function (id) {
    return this.fileIdMap[id];
};

/**
 * 按文件 url 获取文件
 *
 * @param {string} url 文件 url
 * @param {File=} host 引用该文件 url 的文件，可选
 * @return {?File}
 */
Context.prototype.getFileByUrl = function (url, host) {
    return this.fileUrlMap[this.resolvePath(url, host)];
};

/**
 * 通过子路径查询文件
 *
 * @param {string} subpath 文件的子路径
 * @return {?File}
 */
Context.prototype.getFileBySubPath = function (subpath) {
    return this.filePathMap[subpath];
};

/**
 * 根据路径 pattern 查找文件
 *
 * @param {Array.<string|Function|RegExp>} patterns 要查找的 patterns
 * @param {string=} extName 需要满足的后缀名
 * @return {Array.<File>}
 */
Context.prototype.findFileByPattern = function (patterns, extName) {
    return util.find(this.filePathMap, this.files, patterns, extName);
};

/**
 * 是否包 id 存在
 *
 * @param {string} pkgId 包 id
 * @return {boolean}
 */
Context.prototype.isPackageIdExist = function (pkgId) {
    return !!this.ret.map.pkg[pkgId];
};

/**
 * 添加文件的打包信息
 *
 * @param {File} file 被打包的文件
 * @param {File} pkg 打包的目标文件
 * @param {string} pkgId 打包文件 id
 */
Context.prototype.addFilePackInfo = function (file, pkg, pkgId) {
    var packTo = file.packTo;
    var pkgPath = pkg.subpath;
    if (Array.isArray(packTo) && packTo.indexOf(pkgPath) === -1) {
        packTo.push(pkgPath);
    }
    else if (packTo && packTo !== pkgPath) {
        file.packTo = [packTo, pkgPath];
    }
    else {
        file.packTo = pkgPath;
    }

    var res = this.ret.map.res[file.id];
    // 对于不存在且要发布的想输出到 map 的得增加文件属性：useMap: true
    if (!res && file.release) {
        fis.log.warning('add `useMap` attribute for file: %s', file.id);
    }
    res && (res.pkg = pkgId);
};

/**
 * 添加 打包文件
 *
 * @param {File} pkg 打包的目标文件
 * @param {string} pkgId 打包文件 id
 * @param {Array.<string>} packFileIds 打包包含的文件 id
 */
Context.prototype.addPackFile = function (pkg, pkgId, packFileIds) {
    var pkgPath = pkg.subpath;
    var ret = this.ret;
    ret.map.pkg[pkgId] = {
        uri: pkg.getUrl(),
        type: pkg.rExt.replace(/^\./, ''),
        has: packFileIds
    };
    ret.pkg[pkgPath] = pkg;

    this.addFile(pkg);
};

/**
 * 添加打包项
 *
 * @param {Object} packItem 要添加的项
 */
Context.prototype.addToPackItem = function (packItem) {
    packItem && this.toPackItems.push(packItem);
};

/**
 * 按打包目标文件 id 查找打包项
 *
 * @param {string} pkgId 查找的目标包 id
 * @return {?Object}
 */
Context.prototype.findPackItemById = function (pkgId) {
    var found;
    this.toPackItems.some(function (item) {
        var match = item.packTarget.pkgId === pkgId;
        match && (found = item);
        return match;
    });
    return found;
};

/**
 * 获取文件链接的资源非 require
 *
 * @param {File} file 要获取的文件对象
 * @param {boolean=} excludeRequires 是否排除 require 资源，可选，默认 false
 * @return {Array.<File>}
 */
Context.prototype.getLinkResources = function (file, excludeRequires) {
    var links = file.links || [];
    if (!excludeRequires) {
        return links;
    }

    var requires = file.requires || [];
    var asynRequires = file.asyncs || [];
    var result = [];

    links.forEach(function (item) {
        var id = item.substr(1);
        if (requires.indexOf(id) === -1 && asynRequires.indexOf(id) === -1) {
            item = this.getFileBySubPath(item);
            item && result.push(item);
        }
    }, this);
    return result;
};

/**
 * 获取发布资源模块 id
 *
 * @param {File} file 文件
 * @return {string}
 */
Context.prototype.getReleaseModuleId = function (file) {
    var moduleId = this.resIdMap[file.id];
    if (moduleId) {
        return moduleId;
    }

    var rawDomain = file.domain || '';
    file._md5 = undefined; // 强制清空，重新计算
    var url = file.getUrl();
    url = url.substr(rawDomain.length);
    moduleId = amdHelper.getResourceId(
        amdHelper.join(this.root, url),
        {root: this.root, baseUrl: RELEASE_DIR}
    );

    this.resIdMap[file.id] = moduleId;

    return moduleId;
};

/**
 * 获取模块 id
 *
 * @param {File} file 模块文件
 * @return {string}
 */
Context.prototype.getModuleId = function (file) {
    var id = file._modId;
    if (id) {
        return id;
    }

    var fullPath = file.realpath;
    if (file.isJsLike) {
        id = amdHelper.getModuleId(fullPath, this.moduleConfig, true);
    }
    else {
        id = amdHelper.getResourceId(fullPath, this.moduleConfig);
    }
    file._modId = id;
    return id;
};

/**
 * 获取非在给定的包的资源路径 map
 *
 * @param {Array.<File>} pkgs 包文件列表
 * @param {Object=} options 自定义选项，可选
 * @param {Function=} options.filter 要过滤输出的文件，可选
 * @return {Object}
 */
Context.prototype.getNotInPkgFilePathMap = function (pkgs, options) {
    var existedFileIdMap = {};
    pkgs.forEach(function (item) {
        var includes = this.ret.map.pkg[item.pkgId].has || [];
        for (var i = includes.length - 1; i >= 0; i--) {
            existedFileIdMap[includes[i]] = true;
        }
    }, this);

    var pathMap = {};
    var filter = (options || {}).filter;
    this.files.forEach(function (file) {
        if (existedFileIdMap[file.id] || file.isPkgFile) {
            return;
        }

        var packTo = file.packTo;
        if ((!file.isJsLike && packTo)
            || !file.release || file.isPartial
            || (filter && !filter(file))
        ) {
            // 对于 非 js 模块 且有打包的资源文件跳过，后续会直接替换为输出打包的文件的路径
            return;
        }

        var moduleId = this.getModuleId(file);
        if (packTo) {
            var isArr = Array.isArray(packTo);
            if (isArr && packTo.length > 1) {
                fis.log.warn('file %s is repeated pack to: %j', file.id, packTo);
            }
            isArr && (packTo = packTo[0]);
            // FIXME: 如果存在同路径但后缀不一样的资源文件，会导致 pathmap 有问题。。
            if (pathMap[moduleId]) {
                fis.log.warning('resource id: %s has mulitiple path map', moduleId);
            }
            pathMap[moduleId]
                = this.getReleaseModuleId(this.getFileBySubPath(packTo));
        }
        else {
            pathMap[moduleId] = this.getReleaseModuleId(file);
        }
    }, this);

    return pathMap;
};

/**
 * 获取打包文件的路径 map
 *
 * @param {Array.<File>} pkgs 打包文件
 * @return {Object}
 */
Context.prototype.getPackFilePathMap = function (pkgs) {
    var pathMap = {};
    pkgs.forEach(function (item) {
        var includes = this.ret.map.pkg[item.pkgId].has || [];
        if (item.isJsLike) {
            for (var i = includes.length - 1; i >= 0; i--) {
                var file = this.getFileById(includes[i]);
                pathMap[this.getModuleId(file)] = this.getReleaseModuleId(item);
            }
        }
        else {
            // FIXME: 如果存在同路径但后缀不一样的资源文件，会导致 pathmap 有问题。。
            // 对于其它资源的打包文件只需添加自身路径 map 即可，后续会对于所有加载资源文件路径
            // 替换成打包后的资源路径
            var moduleId = this.getModuleId(item);
            if (pathMap[moduleId]) {
                fis.log.warning('resource id: %s has mulitiple path map', moduleId);
            }
            pathMap[moduleId] = this.getReleaseModuleId(item);
        }
    }, this);
    return pathMap;
};

/**
 * 获取给定的文件的路径 map
 *
 * @param {Array.<File>} files 要获取的文件的列表
 * @return {Object}
 */
Context.prototype.getModuleFilePathMap = function (files) {
    var pathMap = {};
    files.forEach(function (item) {
        var moduleId = this.getModuleId(item);
        pathMap[moduleId] = this.getReleaseModuleId(item);
    }, this);
    return pathMap;
};

/**
 * 判断给定的文件是否在打包文件里
 *
 * @param {string} subPath 文件的子路径
 * @param {string} pkgId 文件的包 id
 * @return {boolean}
 */
Context.prototype.isInPkg = function (subPath, pkgId) {
    var file = this.getFileBySubPath(subPath);
    if (!file) {
        return false;
    }

    var pkgInfo = this.ret.map.pkg[pkgId];
    var has = pkgInfo && pkgInfo.has;
    if (has && has.indexOf(file.id) !== -1) {
        return true;
    }

    return false;
};

module.exports = exports = Context;
